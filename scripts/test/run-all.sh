#!/usr/bin/env bash
# 全自动全链路测试编排（npm run test:all）
# 流程：杀旧 3100 → 初始化 e2e.db → 起测试服务 → 预热 → Playwright E2E → vitest FSRS 单元 → 90 天模拟 → 摘要 → 清理
# 隔离性：测试库 prisma/db/e2e.db（基础表来自正式库复制 + 业务表清空），服务端口 3100，正式库 custom.db 零接触
# 用法: bash scripts/test/run-all.sh [all|e2e]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT=3100
LOG_DIR="test-results"
# 服务日志放项目根：Playwright 启动时会清空 test-results/，放里面会导致日志丢失
SERVER_LOG=".e2e-server.log"
SUMMARY="$LOG_DIR/summary.txt"
MODE="${1:-all}"

mkdir -p "$LOG_DIR"
: > "$SUMMARY"

PASS=0
FAIL=0
check() { # $1=name $2=exit_code
  if [ "$2" -eq 0 ]; then PASS=$((PASS + 1)); echo "PASS  $1" | tee -a "$SUMMARY"
  else FAIL=$((FAIL + 1)); echo "FAIL  $1" | tee -a "$SUMMARY"; fi
}

# ---------- 1. 清理旧测试服务（仅匹配本项目 3100 进程） ----------
echo "==> 清理旧测试服务 (:$PORT)"
pkill -f "next dev -p $PORT" 2>/dev/null || true
pkill -f "next-server.*$PORT" 2>/dev/null || true
sleep 1

if [ "$MODE" = "all" ] || [ "$MODE" = "e2e" ]; then
  # ---------- 2. 初始化 e2e.db ----------
  echo "==> 初始化 e2e.db（复制正式库基础表 + 清空业务表）"
  if node scripts/test/setup-e2e.ts; then
    check "setup-e2e 初始化测试库" 0
  else
    check "setup-e2e 初始化测试库" 1
  fi

  # ---------- 3. 启动独立测试服务 ----------
  echo "==> 启动测试服务 :$PORT"
  DATABASE_URL="file:./db/e2e.db" PORT=$PORT E2E=1 node node_modules/next/dist/bin/next dev -p $PORT > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  trap "kill $SERVER_PID 2>/dev/null || true; pkill -f 'next-server.*$PORT' 2>/dev/null || true" EXIT

  # ---------- 4. 等待就绪 + 预热（触发 dev 编译，避免测试首屏超时） ----------
  echo "==> 等待服务就绪并预热"
  READY=0
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://localhost:$PORT/"; then READY=1; break; fi
    sleep 2
  done
  if [ "$READY" != "1" ]; then
    echo "服务启动超时，日志尾部："
    tail -40 "$SERVER_LOG"
    exit 1
  fi
  # 预热核心 API（未登录返回 401 即可，目的仅为触发编译）
  curl -sf -o /dev/null "http://localhost:$PORT/api/progress" || true
  curl -sf -o /dev/null "http://localhost:$PORT/api/dashboard" || true
  curl -sf -o /dev/null "http://localhost:$PORT/api/word?mode=mixed" || true
  sleep 2

  # ---------- 5. Playwright 流程测试（10 个 spec 串行） ----------
  echo "==> Playwright 流程测试（10 specs）"
  npx playwright test --reporter=list 2>&1 | tee "$LOG_DIR/playwright.out"
  check "playwright E2E 10 个流程" "${PIPESTATUS[0]}"
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "fsrs" ]; then
  # ---------- 6. FSRS 单元测试（vitest） ----------
  echo "==> vitest FSRS 单元测试"
  node node_modules/vitest/vitest.mjs run 2>&1 | tee "$LOG_DIR/vitest.out"
  check "vitest FSRS 单元测试" "${PIPESTATUS[0]}"

  # ---------- 7. 90 天模拟评估 ----------
  echo "==> 90 天 FSRS 模拟评估"
  if node scripts/test/fsrs-simulate.mjs 90 10 > "$LOG_DIR/fsrs-simulate.json" 2>&1; then
    check "fsrs 90 天模拟评估" 0
  else
    check "fsrs 90 天模拟评估" 1
  fi
  cat "$LOG_DIR/fsrs-simulate.json" | tee -a "$SUMMARY"
fi

# ---------- 8. 摘要 ----------
echo ""
echo "================================"
echo "测试摘要: PASS=$PASS FAIL=$FAIL"
echo "详细: $LOG_DIR/playwright.out / vitest.out / fsrs-simulate.json"
echo "================================"

exit "$FAIL"
