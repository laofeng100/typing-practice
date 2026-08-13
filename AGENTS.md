# AGENTS.md - AI 协作速查

> 每次开局先读这份 + `worklog.md`（当前状态/待办），即可进入工作。

## 项目一句话

键英双修打字练习系统：Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite + ts-fsrs（FSRS V6），两个孩子的家庭项目，免密登录，TTS 走外部代理服务器（详见 `docs/tts-server-api.md`）。模块：键盘基础 / 英语单词・句子・阅读・听力（古诗词模块已于 v2 阶段5 全链路删除，勿恢复）。

## 文档地图

| 文件 | 内容 |
|---|---|
| `worklog.md` | **当前阶段、里程碑、遗留待办（先读这个）** |
| `README.md` | 功能模块、资源库、项目结构、自动化测试 |
| `CODE_MAP.md`（`docs/`） | **代码结构说明**：按文件/函数粒度梳理全部手写源码 |
| `ISSUE_TRACKER.md` | 全部 BUG 修复档案（C/M/L 分级 + T 系列追加）+ 延后项 |
| `DEPLOY.md` | Docker 部署运维 |
| `docs/tts-server-api.md` | 外部 TTS 服务接口参考 |
| `tests/` + `scripts/test/` | 全链路自动化测试（见下「自动化测试体系」） |

## 常用命令

```bash
bun run dev              # 开发（端口 3000，日志 tee 到 dev.log）
bun run build            # 生产构建（含 standalone 拷贝）
bun run start            # 生产运行（standalone，日志 tee 到 server.log）
node node_modules/typescript/bin/tsc --noEmit  # 类型检查（改代码后必跑；src/ 零错误，scripts/ 下 5 个历史 `e is unknown` 豁免）
bun run lint             # eslint
bun run db:push          # prisma schema 推送（schema 变更后部署必跑）

# 全链路自动化测试（正式库零接触，详见「自动化测试体系」）
npm run test:all         # 一键：初始化 e2e.db → 起 3100 测试服务 → E2E 12 流程 → vitest → 90 天模拟 → 摘要
npm run test:e2e         # 仅 Playwright 流程测试
npm run test:fsrs        # 仅 FSRS 单元 + 90 天模拟
npm run test:setup       # 仅重建测试库 e2e.db

# 听力 TTS 缓存预热（新增/修改听力文章后必跑，幂等）
bun run scripts/prewarm-listening-tts.ts
```

## 里程碑（2026-07 末 ~ 08 初）

| 时间 | 里程碑 | 提交 |
|---|---|---|
| 07-22~25 | v2 词典升级：有道词典数据替换旧词库（47 书 / 7,572 词 / 短语 42,752 / 例句 / 近义词 / 相关词），教材选择学习；古诗词模块全链路删除（`88d633a`） | `91d5381`~`cde3526` |
| 07-28 | FSRS 调度全面修复：learning_steps 卡死 / 库存 R / 错题本门槛（lapses≥1 或 totalErrors≥2）/ 积压计数 / 评级阈值；relearning_steps 恢复 10m 重学窗口（Again 后当天可复学） | `d4015a2` |
| 07-28 | 性能优化：统计聚合与取词链路（热力图 90 天 / 报告 SQL 聚合 / 按需取详情 / 连击不截断） | `e74973f` |
| 07-31 | **全自动全链路测试体系**：`npm run test:all` 一键（E2E 10 流程 + vitest 单元 + 90 天 FSRS 模拟），正式库零接触 | `b9bf193` |
| 08-01 | 正式库清理 + setup-e2e 防呆加固（路径校验 / 清空硬校验） | `dbbf12a` |
| 08-01 | 交付级深度审查：移除构建绕过（ignoreBuildErrors）、focused 错题门槛与错题本对齐、错题「立即攻克」word 置顶修复、专项 keys 加 90 天窗口、键盘通关服务端化（KEYBOARD_LEVELS 常量）、学段晋级同步 user.stage、newCards 死指标修复、store/zustand 死代码清理、Docker 部署完善（Caddy HTTPS/sqlite3 热备份/全路径 db:push） | 见 git log |

## 自动化测试体系（三层隔离）

1. **独立测试库** `prisma/db/e2e.db`：从正式库 `custom.db` **只读复制**基础表（词库/教材/短语/句子/语法/阅读/听力/账号），业务表（练习数据）清空，插入固定测试账号 e2e-didi / e2e-jiejie
2. **独立服务**：`PORT=3100` + `DATABASE_URL=file:./db/e2e.db` + `E2E=1`（next 用独立 `.next-e2e` 构建目录，规避 `.next/dev` 锁互斥）
3. **正式库保护（不可破坏）**：setup-e2e 对 custom.db 仅只读（WAL checkpoint + 文件复制）；路径防呆仅允许 `custom.db → e2e.db`；清空后硬校验业务表必须为 0。正式库基础数据（WordDict/Book/BookWord/WordPhrase/WordExample/WordSynonym/WordRelated/Sentence/GrammarPattern/GrammarSystem/ReadingArticle/ListeningArticle/User）**禁止清理**；业务表清理需用户明确要求并人工确认

测试文件：`tests/e2e/01~12-*.spec.ts`（数字前缀强制顺序，串行 workers=1；11 突击模式 / 12 FSRS 细节盲区）、`tests/fsrs/fsrs-unit.test.ts`（12 用例：含突击保留率/自定义参数/maxInterval 封顶）、`scripts/test/fsrs-simulate.mjs`（90 天模拟，6 项硬指标）、`playwright.config.ts`、`vitest.config.ts`。

## Git（2026-07-29 初始化）

```bash
git log --oneline        # 查看提交历史
git status               # 检查当前改动
git diff                 # 查看未暂存的改动
```

## FSRS 与学科规则

1. **FSRS 仅覆盖两类 cardType：word / sentence**（session 建卡白名单 `FSRS_CARD_TYPES`，代码证据 session/route.ts:23）；article/listening 已退出 FSRS，只写 TypingRecord 不建卡，阅读练习统计改用打字记录（groupBy/distinct cardId），勿恢复建卡
2. session 零击键守卫：无击键记录必须带合法显式 rating 才更新卡；新卡封顶 Hard 仅限自动评级，显式自评不降权
3. enableFuzz 已开启；错题本/专项队列按实时可提取性（liveR）升序排序；fsrsMaxInterval 读取时 clamp ≤ 3650
4. **遗忘恢复**：relearning_steps=['10m']——Again 的卡 10 分钟后可当天复学，跨天复习步进走完自动转 Review 按天排期（勿改回空数组，会致大 S 卡数天无法复考）

## 家长管控（服务端闭环）

- verify-pin 成功后签发 HMAC token cookie（`typing_parent_pin`，15 分钟，httpOnly），见 `src/lib/auth.ts`
- settings 受保护键（`PARENT_PROTECTED_KEYS`）与 data/reset 均在服务端验 token，未验证 403；前端保存时剔除受保护键仅是体验层，不可依赖
- 数据重置保留家长管控设置键（`PARENT_KEEP_KEYS`），防止清除数据绕过管控
- PIN 与 token 比较均用 timingSafeEqual 常量时间比较

## 硬性约定

1. **零新增生产依赖**（历史阶段约束延续）；devDependencies 允许测试工具（@playwright/test / vitest 已入 bun.lock），优先用现有库与 `src/lib` 工具；死依赖死代码定期清理（zustand/store.ts 已于 08-01 移除）
2. **改完必跑 `bunx tsc --noEmit`**，零错误才算完成；`next.config.ts` 已移除 `ignoreBuildErrors`，`next build` 同门拦截类型错误
3. **键盘关卡通关阈值以服务端常量 `KEYBOARD_LEVELS` 为准**（session/route.ts），客户端传的 passWpm/passAccuracy/stars 不参与解锁判定；错题门槛统一 `lapses≥1 || totalErrors≥2`（mistakes 与 focused 两处一致，勿用 difficulty 门槛）
4. **TTS_SERVER_URL / TTS_TOKEN 仅 env 可配**，用户不可写；token 不下发前端（音频走 `/api/tts/audio` 代理）
5. **`English_Playful_Child` 音色在 TTS 服务器上 500，禁用**（dialogue.ts 已移除，勿加回）
6. API 契约变更需同步更新 README 结构说明
7. 页面零硬编码教学数据，全部入库
8. 错误响应用通用文案，不回显 `e.message`
9. 学段晋级必须同步 `user.stage`（word/sentence 晋级与 books 切换教材三处），否则仪表盘与阅读/听力默认学段失步

## 环境

- 本地开发：bun 进程跑 3000 端口；Docker 容器名 `typing-practice`（compose 一键部署，见 DEPLOY.md）
- 数据库：`prisma/db/custom.db`（SQLite 正式库，不入库 git）；`prisma/db/e2e.db`（测试库，每次测试重建，不入库 git）。注意本机 `.env` 的 DATABASE_URL 为服务器路径，实际本机库在 `prisma/db/`
- 固定账号：弟弟 18990341688 / 姐姐 18011289973（免密）
