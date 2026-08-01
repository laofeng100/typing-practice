/**
 * E2E 公共工具：常量、API 登录、sqlite 直查（测试库 e2e.db）
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { request as pwRequest, expect, type Page } from '@playwright/test'

export const E2E_BASE_URL = 'http://localhost:3100'
export const AUTH_STATE_PATH = 'test-results/auth-state.json'
// setup-e2e.ts 保证存在的固定测试账号（正式库无账号时插入；有则复用现有账号）
export const LOGIN_USER_ID = 'e2e-didi'

// 测试库路径（相对项目根目录；playwright 进程 cwd 始终为项目根）
const E2E_DB_PATH = path.join(process.cwd(), 'prisma', 'db', 'e2e.db')

/** 直接用 API 登录（返回带 cookie 的 request context，用于绕过 UI 的接口级验证） */
export async function apiLogin(userId: string = LOGIN_USER_ID) {
  const ctx = await pwRequest.newContext({ baseURL: E2E_BASE_URL })
  const res = await ctx.post('/api/auth', { data: { userId } })
  expect(res.ok(), `API 登录失败: ${res.status()}`).toBeTruthy()
  return ctx
}

/** sqlite 直查测试库（只读查询；SQLite WAL 下与 next dev 并发安全） */
export function query(sql: string, params: any[] = []): any[] {
  const db = new DatabaseSync(E2E_DB_PATH, { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as any[]
  } finally {
    db.close()
  }
}

/** sqlite 直写测试库（带 busy retry，避免与 next dev 写锁冲突） */
export function exec(sql: string, params: any[] = []): void {
  let lastErr: unknown
  for (let i = 0; i < 8; i++) {
    try {
      const db = new DatabaseSync(E2E_DB_PATH)
      try {
        db.exec('PRAGMA busy_timeout = 3000;')
        db.prepare(sql).run(...params)
      } finally {
        db.close()
      }
      return
    } catch (e) {
      lastErr = e
      // 等待 300ms 后重试（写锁通常毫秒级释放）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    }
  }
  throw lastErr
}

/** 轮询直到条件满足（expect.poll 的封装，带错误信息） */
export async function waitFor(desc: string, fn: () => Promise<boolean>, timeoutMs = 15_000) {
  await expect.poll(fn, { timeout: timeoutMs, message: desc }).toBe(true)
}

/**
 * 确保高级练习（单词/句子/阅读/听力）已解锁。
 * 解锁条件（api/dashboard）：键盘 6 关全通 或 bestWpm/Accuracy 达标。
 * keyboard.spec 通关后自然满足；本函数作为防御：若前置流程失败导致未解锁，
 * 直写一条达标的 keyboard 进度（wpmQualified 路径）解锁，避免连锁失败。
 */
export async function ensureAdvancedUnlocked(page: Page) {
  const res = await page.request.get('/api/dashboard')
  if (!res.ok()) return
  const data = await res.json()
  if (data.advancedUnlocked) return
  const now = new Date().toISOString()
  exec(
    `INSERT OR IGNORE INTO UserProgress (id, userId, module, level, status, bestWpm, bestAccuracy, stars, attempts, completedAt, updatedAt)
     VALUES (?, ?, 'keyboard', 1, 'completed', 45, 95, 3, 1, ?, ?)`,
    ['e2e-unlock-1', LOGIN_USER_ID, now, now]
  )
}
