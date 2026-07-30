# AGENTS.md - AI 协作速查

> 每次开局先读这份 + `worklog.md`（当前状态/待办），即可进入工作。

## 项目一句话

键英双修打字练习系统：Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite + ts-fsrs（FSRS V6），两个孩子的家庭项目，免密登录，TTS 走外部代理服务器（详见 `docs/tts-server-api.md`）。模块：键盘基础 / 英语单词・句子・阅读・听力 / 古诗词背诵（非打字）。

## 文档地图

| 文件 | 内容 |
|---|---|
| `worklog.md` | **当前阶段、里程碑、遗留待办（先读这个）** |
| `README.md` | 功能模块、资源库、项目结构 |
| `CODE_MAP.md`（`docs/`） | **代码结构说明**：按文件/函数粒度梳理全部手写源码 |
| `ISSUE_TRACKER.md` | 全部 BUG 修复档案（C/M/L 分级 + T 系列追加）+ 延后项 |
| `DEPLOY.md` | Docker 部署运维 |
| `docs/tts-server-api.md` | 外部 TTS 服务接口参考 |

## 常用命令

```bash
bun run dev              # 开发（端口 3000，日志 tee 到 dev.log）
bun run build            # 生产构建（含 standalone 拷贝）
bun run start            # 生产运行（standalone，日志 tee 到 server.log）
node node_modules/typescript/bin/tsc --noEmit  # 类型检查（改代码后必跑；src/ 零错误，scripts/ 下 5 个历史 `e is unknown` 豁免）
bun run lint             # eslint
bun run db:push          # prisma schema 推送（schema 变更后部署必跑）

# 回归测试（需先起 dev 并指定测试库）
DATABASE_URL="file:/tmp/opencode/typtest/test.db" bun run dev &
bun scripts/test-seed-batch1.ts && bun scripts/test-batch1.ts   # batch1~4 同理

# 听力 TTS 缓存预热（新增/修改听力文章后必跑，幂等）
bun run scripts/prewarm-listening-tts.ts
```

## Git（2026-07-29 初始化）

```bash
git log --oneline        # 查看提交历史
git status               # 检查当前改动
git diff                 # 查看未暂存的改动
```

## FSRS 与学科规则

1. **FSRS 仅覆盖三类 cardType：word / sentence / chinese**（session 建卡白名单 `FSRS_CARD_TYPES`）；article/listening 已退出 FSRS，只写 TypingRecord 不建卡，阅读练习统计改用打字记录（groupBy/distinct cardId），勿恢复建卡
2. **古诗词与单词是两个独立学科**，通过 cardType 隔离，队列查询互不干扰
3. **古诗词模块 = 纯背诵自评**（四档 rating 1-4，零击键 totalKeys:0 + 显式 rating），不受 WPM 门控；打字功能已删除，禁止加回
4. session 零击键守卫：无击键记录必须带合法显式 rating 才更新卡；新卡封顶 Hard 仅限自动评级，显式自评不降权
5. enableFuzz 已开启；错题本/专项/古诗词队列按实时可提取性（liveR）升序排序；fsrsMaxInterval 读取时 clamp ≤ 3650

## 家长管控（服务端闭环）

- verify-pin 成功后签发 HMAC token cookie（`typing_parent_pin`，15 分钟，httpOnly），见 `src/lib/auth.ts`
- settings 受保护键（`PARENT_PROTECTED_KEYS`）与 data/reset 均在服务端验 token，未验证 403；前端保存时剔除受保护键仅是体验层，不可依赖
- 数据重置保留家长管控设置键（`PARENT_KEEP_KEYS`），防止清除数据绕过管控
- PIN 与 token 比较均用 timingSafeEqual 常量时间比较

## 硬性约定

1. **零新增 npm 依赖**（历史阶段约束，延续）；优先用现有库与 `src/lib` 工具
2. **改完必跑 `bunx tsc --noEmit`**，零错误才算完成
3. **TTS_SERVER_URL / TTS_TOKEN 仅 env 可配**，用户不可写；token 不下发前端（音频走 `/api/tts/audio` 代理）
4. **`English_Playful_Child` 音色在 TTS 服务器上 500，禁用**（dialogue.ts 已移除，勿加回）
5. API 契约变更需同步更新 README 结构说明
6. 页面零硬编码教学数据，全部入库
7. 错误响应用通用文案，不回显 `e.message`

## 环境

- 本地开发：bun 进程跑 3000 端口；Docker 容器名 `typing-practice`（compose 一键部署，见 DEPLOY.md）
- 数据库：`prisma/db/custom.db`（SQLite，不入库 git）
- 固定账号：弟弟 18990341688 / 姐姐 18011289973（免密）
