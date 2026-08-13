# 问题跟踪表 - 键英双修打字练习系统

> 2026-07-22 全量代码审查 + 2026-07-24 追加修复
> 所有问题均已逐行核对源码确认真实存在（标注 file:line 与证据代码）
> 状态标记：⬜ 未修复 / 🔧 修复中 / ✅ 已修复

## 2026-07-24 追加修复

### T-1 ✅ 听力「日常对话」TTS 合成超时（504），其他类别正常
> 已修复（2026-07-24）：① article 场景超时 30s→90s（synthesize/route.ts）；② 移除服务器端持续 500 的坏音色 `English_Playful_Child`，child/kid/boy/girl 改映射 `English_Graceful_Lady`（lib/dialogue.ts）；③ 对话分段改全并行合成+按序播放（listening-module.tsx）；④ 新增 `scripts/prewarm-listening-tts.ts` 预热 95 篇 225 个任务全部入永久缓存。
- **根因**（直连 TTS 服务器实测）：日常对话被 `parseDialogue` 拆成多段（最多 11 段）逐段合成并轮换 4 种对话音色，分段×音色全是新缓存键 → 首次播放全部 cache miss；实测英文 cache-miss 单段合成 18~35s+，`English_Graceful_Lady` >35s 超过 App 30s AbortController → 504；`English_Playful_Child` 服务器端持续 500。其他类别整篇一次合成且早已入永久缓存（cache hit 毫秒级），故正常。
- **遗留（TTS 服务器侧，非本项目）**：修复 `English_Playful_Child` 500；排查英文 cache-miss 合成慢。新增听力文章后需重跑预热脚本。

---

### T-2 ✅ FSRS 调度全面修复（learning_steps 卡死 / 库存 R / 错题本门槛 / 积压计数 / 评级阈值）
> 已修复（2026-07-28，`d4015a2`），并有全自动测试体系持续守护：vitest 单元 + 90 天模拟 6 项硬指标（`npm run test:all`）。
- **learning_steps 首学卡死**：ts-fsrs 默认 `["1m","10m"]` 让首学卡停留 Learning 状态分钟级排期，永远无法进入 Review → 置空 `learning_steps: []`，首学 Hard 直进 Review（state=2）按天调度
- **遗忘后无法及时复学**：`relearning_steps: []` 时 Again 后按崩落 S 排期，大 S 卡要数天才能复考 → 恢复 `['10m']` 重学窗口，Again 后 10 分钟可当天复学，跨天复习步进走完自动转 Review
- **库存 R**：retrievability 恒 1.0 且永不刷新 → 改为实时计算（错题本/专项/古诗词队列按 liveR 升序排序）
- **错题本收录门槛**：难度门槛已移除，改为 lapses≥1 或 totalErrors≥2；首学 Hard 单次错误不收录
- **积压计数**：复习积压时新词停发逻辑修复；**评级阈值矩阵**：acc<60%→Again、<80%→Hard、score≥0.92→Easy、≥0.72→Good

---

### T-3 ✅ 交付级深度审查修复（构建绕过 / 专项错题门槛不一致 / 错题置顶失效 / 键盘通关客户端可控 / 学段失步）
> 已修复（2026-08-01，交付级 review），验证：tsc 零错误 + E2E 10/10 + vitest 9/9 + 90 天模拟 allPass。
- **构建绕过类型检查（P0）**：`next.config.ts` 曾设 `typescript.ignoreBuildErrors: true`，生产构建不检查类型，掩盖错误 → 已移除，构建与 tsc 同门拦截
- **专项练习错题门槛与错题本不一致（P1）**：`practice/focused/route.ts` words/sentences 仍含 `difficulty≥5`，首学评 Hard（难度即 5.11）的卡全量混入专项队列，与 mistakes 已修复的门槛（lapses≥1 || totalErrors≥2）冲突 → 两处已对齐
- **错题本「立即攻克」word 置顶失效（P1）**：focused 的 focusId 强制 `Number.isInteger(Number(...))` 解析，word 卡 cardId 为 head_word 字符串（如 "about"）恒为 NaN → focusId 恒 null → 改为原始字符串透传，类型链（app-shell/mistake-book/focused-practice）同步放宽为 `number | string`
- **专项 keys 模式全量拉记录（P1）**：`typingRecord.findMany` 无时间窗/无 take，随练习量增长查询无上限 → 加 90 天窗口（与 stats/keys 一致）
- **键盘通关客户端可控（P1）**：session/route 曾信任客户端传 `passWpm/passAccuracy` 与 `level` 判定通关（篡改可直达通关）→ 改为服务端 `KEYBOARD_LEVELS` 常量判定（level 须 1-6 整数），stars 也由服务端计算
- **学段晋级不同步 user.stage（P1）**：word 换书晋级/sentence 晋级均不更新 user.stage（仅 reset 会写）→ 仪表盘学段展示与阅读/听力默认学段永久停留在小学 → 三处（word 晋级/sentence 晋级/books 手动切换）均已同步中文学段
- **P2 顺手修复**：dashboard `newCards` 死指标（state=0 恒 0）改为今日新学词数；word/route 新词卡状态 N+1 改批量 `findMany cardId IN`；auth 签名比较改 hex 解码；schema 过时注释修正；删除死代码 `src/lib/store.ts` + zustand 依赖
- **遗留（P2 已知权衡，暂不改）**：due 时间点漂移（按天调度不按日界对齐）；首次设置家长 PIN 无验证空窗（孩子可抢先设 PIN，DEPLOY 已提示家长首登即设）；sentence 模块无积压防护公式；库存 retrievability 存复习前旧 R（有单测固化语义，展示层均用实时计算）

---

## FSRS V6 闭环评估

闭环主链路**完整**：建卡（session/route.ts:141-154）→ `schedule()` 调度（fsrs.ts:148）→ 到期取卡（word/route.ts:29-38，`state>0 & due<=now`）→ 前端回传 cardState → 自动评级 `rateTyping()` → 更新卡片 + 写 FsrsReview 日志。新卡首评后 state>0，可正确再入复习队列。

但闭环存在 **6 个断点/缺陷**：
1. 新词/新句供给会在首批候选学完后断供（C-1/C-3），复习端正常但新学端停摆；
2. 初中→高中晋级被 take:2000 截断堵死（C-2）；
3. 阅读/听力以 0 击键提交被自动评级为 Again，卡片被惩罚性 lapse（M-1）；
4. retrievability 字段恒为 1.0 且永不刷新（M-5）；
5. fsrsRetention/fsrsMaxInterval 用户设置不生效（L-6）；
6. 错题本遇到 listening 卡片直接 500（C-9）。

---

## 🔴 Critical（9）

### C-1 ✅ 单词新词队列断供：首批候选全学完后永远返回空
> 已修复（2026-07-22）：移除 while 循环的 `&& newWordRows.length > 0` 条件，分页在候选耗尽前持续进行。冒烟测试验证通过（scripts/test-batch1.ts）。
- **位置**：`src/app/api/word/route.ts:61,110`
- **证据**：`candidateBatch = min(wordBatchSize*5, 200)`（默认 50），候选查询无 skip 恒取学段前 50 词；`while (newWordRows.length < settings.wordBatchSize && newWordRows.length > 0 && ...)` —— 当首批 50 词全部已学时 `newWordRows.length === 0`，分页循环条件 `length > 0` 为 false **直接跳过**，即使学段内还有数千词未学也返回 `newWords: []`。
- **影响**：用户学完每个学段最简单的前 50 个词后，新词学习永久停摆。
- **修复**：去掉 `&& newWordRows.length > 0`（循环内已有 `if (more.length === 0) break` 兜底）。

### C-2 ✅ 初中→高中晋级被 take:2000 截断堵死
> 已修复（2026-07-22）：晋级统计改为全量 ID 内存交集（复用 learnedWordIds），:155 的 take:5000 同步移除。2100 词全学场景冒烟测试验证晋级成功。
- **位置**：`src/app/api/word/route.ts:82`
- **证据**：晋级判定 `currentStageLearned >= currentStageTotal` 中，已学统计的 ID 集合 `db.word.findMany({ where: { stage }, select: { id: true }, take: 2000 })` 只取前 2000 个 ID；初中共 2,317 词，`currentStageLearned` 上限 2000 < 2317，**永远无法晋级高中**。同文件 :155 `take: 5000` 为同类隐患（高中 3,511 词，暂不触发）。
- **修复**：去掉 take 上限，或改用内存交集统计（复用已有 `learnedWordIds`）。

### C-3 ✅ 句子队列同类断供 bug
> 已修复（2026-07-22）：同 C-1 移除 `&& sentences.length > 0`。冒烟测试验证通过。
- **位置**：`src/app/api/sentence/route.ts:80`
- **证据**：`while (sentences.length < limit && sentences.length > 0 && offset < 5000)` —— 与 C-1 相同：候选批 50 句全已学、晋级判定不通过时，分页被跳过，返回空队列（每学段 150 句，学完前 50 句即触发）。
- **修复**：同 C-1。

### C-4 ✅ 会话 Cookie 为未签名明文 userId，可伪造任意身份（IDOR）
> 已修复（2026-07-22 第三批）：Cookie 改为 `{userId}.{HMAC-SHA256签名}`（node:crypto 零新依赖），timingSafeEqual 服务端验签，伪造/明文/挪用签名均 401；补 `secure`（生产）属性；SESSION_SECRET 走 env，缺省时随机生成并告警。冒烟测试 5 项验证通过。
- **位置**：`src/lib/auth.ts:10-15,27`
- **证据**：`cookieStore.set(SESSION_COOKIE, userId, {...})`，`getCurrentUser()` 直接信任 Cookie 值查库。userId 由 `/api/auth` 响应和 `/api/users` 公开返回，篡改 Cookie 即可读写/重置（`/api/data/reset`）任意用户数据。
- **修复**：改用签名 session token（jose JWT / iron-session）或随机 sessionId 服务端校验；Cookie 加 `secure: true`。

### C-5 ✅ 免密登录 + 公开用户列表 = 任何人可登录任何账号
> 已修复（2026-07-22 第三批）：/api/users 不再返回 phone；登录页改用 userId 登录（phone 兼容保留）；失败统一文案 `登录失败，请重试`（不再泄露账号是否存在）；每 IP 每分钟 10 次失败限流 → 429（仅失败计数）。冒烟测试 4 项验证通过。
> 备注：免密点击登录的产品形态未变（家庭场景），真正的账号级防护（PIN/验证码）为可选后续项。
- **位置**：`src/app/api/users/route.ts:5-11`、`src/app/api/auth/route.ts`
- **证据**：users 接口无鉴权返回全部用户 phone；auth 仅凭 phone 登录，无密码/验证码/限流，且对不存在的 phone 返回 404「账号不存在」（可枚举）。
- **修复**：users 不返回 phone 或脱敏；登录加验证码/口令 + IP 限流 + 统一错误文案。

### C-6 ✅ TTS token 多处泄漏给客户端
> 已修复（2026-07-22 第三批）：① 新增 `/api/tts/audio` 服务端代理（登录校验 + 路径白名单：须 `/` 开头、不含 `..`/`://`），synthesize 改返回代理 URL，token 不再接触前端；② settings GET/PUT 响应 ttsToken 掩码 `••••••••`；③ 硬编码生产 token/IP 从 settings.ts、.env.example 清除（改为 env 占位符）。grep 扫描 src/ 无凭证残留。**运维待办：TTS token 已在源码历史中暴露，需在 TTS 服务器侧轮换。**
> 残留说明：token 仍存在于上游请求 URL query（TTS 服务器日志可见，服务端内部）；.next 构建缓存可能含旧 token（重新构建即清除）。
- **位置**：`src/app/api/tts/synthesize/route.ts:115`、`src/app/api/settings/route.ts:9-11`、`src/lib/settings.ts:34-35`、`.env.example:10-11`
- **证据**：① `audioUrl = ...?token=${encodeURIComponent(settings.ttsToken)}` 拼进 URL 返回前端（与同文件 :11 注释「token不暴露给前端」矛盾）；② settings GET 返回含 `ttsToken` 全量设置；③ 默认 token `<TTS_TOKEN_REDACTED>` 与服务器 IP 硬编码在源码和 .env.example。
- **修复**：音频走服务端代理转发；settings GET 抹除 token 字段；默认凭证移到仅服务端 env 并轮换 token。

### C-7 ✅ settings PUT 允许自定义 ttsServerUrl → SSRF + 共享 token 外泄
> 已修复（2026-07-22 第三批）：ttsServerUrl/ttsToken 仅从 `TTS_SERVER_URL/TTS_TOKEN` env 读取（忽略 DB 与用户输入），SETTINGS_SCHEMA 移除两键（PUT 忽略不报错，保持 M-7b 回归兼容），设置面板改只读提示。冒烟验证：恶意 PUT 不生效。
- **位置**：`src/app/api/settings/route.ts:27` + `src/app/api/tts/synthesize/route.ts:61-72`、`src/app/api/tts/meta/route.ts:15-16`
- **证据**：任意登录用户可写 `ttsServerUrl`/`ttsToken`；后端随后向该 URL 发请求并附带 `Authorization: Bearer <token>`，指向攻击者服务器即可窃取默认共享 token，亦可探测内网。
- **修复**：ttsServerUrl/ttsToken 仅服务端 env 可配，或对 URL 做白名单校验。

### C-8 ✅ 成就接口三处聚合缺 userId 过滤，跨用户数据混合
> 已修复（2026-07-22 第二批）：三处 aggregate 加 `where: { userId: user.id }`。双用户隔离冒烟测试验证通过。
- **位置**：`src/app/api/stats/achievements/route.ts:11,15,33`
- **证据**：`db.typingSession.aggregate({ _sum: { durationMs: true } })`、`_sum: { totalKeys, correctKeys }`、`_max: { wpm }` 均无 `where: { userId }`。总时长/总击键/最佳 WPM 统计的是全站数据，成就 `time_60/300/600`、`wpm_30/50/80` 会被其他用户练习解锁。
- **修复**：三处加 `where: { userId: user.id }`。

### C-9 ✅ 错题本 listening 卡片被静默丢弃
> **修正**（2026-07-22 冒烟测试实证）：原判"500"不成立——item 为 null 时 push 被跳过，接口返回 200，但 listening 错题被**静默丢弃**（功能性缺陷）。
> 已修复：mistakes/route.ts 增加 listening 分组与 ListeningArticle 查询；mistake-book.tsx 增加听力 Tab 与渲染分支；顺带修复 L-16（MistakeItem 补 wordCount 字段）。冒烟测试验证通过。
- **位置**：`src/app/api/mistakes/route.ts:25-30,45`
- **证据**：`grouped` 仅初始化 `word/sentence/article/chinese` 四个键；听力模块提交会创建 `cardType: 'listening'` 的 FsrsCard（listening-module.tsx:156），且因 M-1 其 lapses≥1 必然命中错题筛选（:14-18），随后 `grouped['listening'].push(...)` → TypeError，整个错题本接口 500。
- **修复**：grouped 增加 listening 键（mistake-book.tsx 同步加 Tab），或过滤不支持的 cardType。

---

## 🟠 Major（13）

### M-1 ✅ 阅读/听力零击键记录被评级 Again，FSRS 卡片被惩罚性 lapse
> 已修复（2026-07-22）：① 前端 reading/listening 按测验正确率显式传 rating（≥90→4, ≥70→3, ≥50→2, 否则→1）和 score；② 后端 session 路由增加守卫——零击键记录无合法显式 rating 时跳过 FSRS 更新；③ 顺带完成 L-6（非法 rating 回退自动评级，不再 500）。冒烟测试验证：无 rating 不建卡，rating=4 正常入复习流程。
- **位置**：`src/components/practice/reading-module.tsx:95-104`、`listening-module.tsx:155-164` + `src/app/api/session/route.ts:67-73` + `src/lib/fsrs.ts:182`
- **证据**：两模块提交 `totalKeys: 0, correctKeys: 0` 且带 cardType/cardId → 后端 `rAcc=0` → `rateTyping(0,0,...)` 因 `accuracy < 0.6` 返回 `Rating.Again` → 每读一篇文章/听一次听力就记一次**遗忘**并重置稳定性；前端算好的测验正确率（reading:81 / listening:142）从未提交。
- **修复**：按测验正确率显式传 `rating`（1-4）和 `score`；或不带 cardType/cardId 跳过 FSRS。

### M-2 ✅ 四个打字模块完成判定无守卫：窗口期内重复记录/跳项/双重提交
> 已修复（2026-07-22）：keyboard/word/sentence/focused 四模块统一加 `advancingRef`（完成判定一次性触发，前进时复位）+ `submittingRef`（finish* 函数幂等），并在 loadQueue/loadData/resetExercise 等入口复位。tsc 通过；前端交互守卫无法 HTTP 冒烟，以代码复审+tsc 验证。
- **位置**：`keyboard-module.tsx:93`、`word-module.tsx:119`、`sentence-module.tsx:76`、`focused-practice.tsx:82`
- **证据**：`if (v.length >= target.length)` 每次 onChange 都进完成分支，输入清空/前进由 500-1200ms `setTimeout` 延迟执行；窗口期内任何额外按键都会再次执行整块逻辑 → 重复 push result、`setIdx(prev => prev + 1)` 执行两次**跳过一个练习项**、末项时 `finish*` 双重触发（finishLevel/finishPractice 无 `if (submitting) return` 早退）→ 双重 POST、同一 cardId 两次 FSRS 更新。
- **修复**：加 `advancingRef` 守卫（首次完成置位、前进时清除），finish* 入口加提交中早退。

### M-3 ✅ 专项练习 module 名 'words'/'sentences' 后端不识别，每日统计静默丢失
> 已修复（2026-07-22 第二批）：前端映射为单数 module 名；focused API words/sentences 分支返回 cardState；前端 records 透传 cardState，新词/复习词拆分恢复正确。
- **位置**：`src/components/practice/focused-practice.tsx:138` vs `src/app/api/session/route.ts:109-118,213-221`
- **证据**：`module: type === 'keys' ? 'keyboard' : type` 提交 `'words' | 'sentences'`；后端只匹配 `'word'/'sentence'`，导致 wordNew/wordReview/wordCorrect、sentenceDone 均不计入 DailyStat，新词/复习词拆分逻辑也不执行（FSRS 更新正常，纯统计丢失）。
- **修复**：映射为单数 `'word'/'sentence'`，并按记录传 `cardState`。

### M-4 ✅ 中文模块 50% 阈值 + 只按已输入前缀算准确率，可刷高评级
> 已修复（2026-07-22 第二批）：覆盖率阈值提至 95%（含完成按钮 disabled 口径统一）；准确率分母改为全文长度（未输入计为错误）；补报 errorKeys 错字数组；加 submittingRef 防重复提交。
- **位置**：`src/components/practice/chinese-module.tsx:79-89`
- **证据**：`input.length < content.length * 0.5` 即可提交；`accuracy = correctKeys / input.length` —— 只完美输入前半篇即得 accuracy=100，后端 `rateTyping` 给出高评级，FSRS 与统计系统性虚高。
- **修复**：要求 ≥95% 覆盖；分母改用 `target.length`（未输入字符计为错误）。

### M-5 ✅ FsrsCard.retrievability 恒存 1.0 且永不刷新
> 已修复（2026-07-22 第二批）：word 路由复习词详情改用 `calculateRetrievability()` 实时计算，不再下发库存陈旧值（10 天前复习卡 R<0.99 冒烟验证）。schema 默认值矛盾暂未动（列保留，不再被信任）。
- **位置**：`src/lib/fsrs.ts:160-166`
- **证据**：`schedule()` 末尾 `calculateRetrievability(fromFsrsCard(newCard, 0), now)` —— 此时 `lastReview === now`，elapsedDays=0，`forgetting_curve(0, S) = 1`。此后无任何代码重算该字段，word/route.ts:142 原样下发。另外 schema 默认 `@default(1)` 与 `createNewCard()` 返回 0 矛盾。
- **修复**：读取时现算 `calculateRetrievability(card, new Date())`，或废弃该列。

### M-6 ✅ 每日时长限制在「提交时」才检查：练完被拒、FSRS 数据全丢
> 已修复（2026-07-22 第二批）：限制前移到练习开始——6 个内容 GET（word/sentence/article/listening/chinese/focused）超限返回 403；session POST 不再拒绝，响应附带 dailyLimit 状态；6 个前端模块统一 403 处理；键盘模块经 app-shell 传入今日用量在开始处拦截。check-then-act 竞态与取整漏洞仍未根治（见 L-21 杂项）。
- **位置**：`src/app/api/session/route.ts:28-37` + `word-module.tsx:199-201`
- **证据**：练习过程中超限，提交时返回 403，前端仅 toast，整段练习的 FSRS 评级被丢弃。且存在 check-then-act 竞态（settings.ts:146-155）与 `Math.floor` 取整漏洞（14 分 59 秒仍算 14 分钟）。
- **修复**：限制应在校验「开始练习」时执行；提交侧只做告警或截断。

### M-7 ✅ 设置值无类型/范围校验，NaN 使每日限额与解锁阈值永久失效
> 已修复（2026-07-22 第二批）：PUT 改为 29 键 zod schema 逐字段校验，任一非法整体 400 不落库（原子），未知 key 忽略。冒烟验证：'abc'/99999 被拒且不生效，合法值正常保存。
- **位置**：`src/app/api/settings/route.ts:32-35` + `src/lib/settings.ts:65`
- **证据**：`String(value)` 直接存库；`map.dailyLimitMin ? Number(...) : ...` —— 存 `"abc"` 时真值 → `Number("abc")=NaN` → `usedMin >= NaN` 恒 false → **每日时限失效**；`wpmUnlockThreshold=NaN` → `advancedUnlocked` 恒 false。
- **修复**：PUT 用 zod 按字段校验类型与范围，拒绝非法值。

### M-8 ✅ 所有「今日」日期用 UTC，UTC+8 用户统计错位
> 已修复（2026-07-22 第二批）：新建 `src/lib/datetime.ts` 的 `localDateStr()`，替换后端 9 处 + 前端 dashboard 趋势桶键（含审查发现的 startedAt UTC 前缀比较不一致，两侧统一为本地日期）；docker-compose 与 .env.example 配置 TZ=Asia/Shanghai；grep 确认 src/ 无残留 UTC 日期切片。
- **位置**：`session/route.ts:28`、`dashboard/route.ts:11`、`settings.ts:135`、`stats/report/route.ts:47,83`、`stats/achievements/route.ts:53`、`stats/keys/route.ts:56`、前端 `dashboard.tsx:40`
- **证据**：统一使用 `new Date().toISOString().slice(0,10)`（UTC 日）。早 8 点前练习计入「昨天」：每日限额提前重置、连续打卡断档、7 天趋势/热力图日期错位（dashboard.tsx:40-45 桶键 UTC、标签本地，进一步不一致）。
- **修复**：前后端统一本地时区日期串（如 `toLocaleDateString('sv')`）。

### M-9 ✅ 四个统计组件对 401/错误响应直接崩溃（白屏）
> 已修复（2026-07-23 第四批）：四组件统一 `r.ok ? r.json() : null` + 空值守卫，401 落入既有空态/加载态。tsc + 逐文件 401 渲染路径复审验证。
- **位置**：`key-heatmap.tsx:49-50→76`、`mistake-book.tsx:40-41→54`、`achievements.tsx:33→53`、`study-report.tsx:33→60`
- **证据**：均 `.then(r => r.json())` 无 `r.ok` 检查；401 返回 `{error:'未登录'}` 为真值通过空态守卫（如 `data.totalAllKeys === 0` 对 undefined 为 false），随后访问嵌套字段（`data.keyStats`/`data.stats.totalMistakes`/`cumulativeGrowth.length`）抛 TypeError。
- **修复**：统一 `r.ok ? r.json() : null`，null 走错误/登出处理。

### M-10 ✅ login-screen 在 useState 初始化器中发请求（渲染期副作用）
> 已修复（2026-07-23 第四批）：移入 useEffect。
- **位置**：`src/components/app/login-screen.tsx:27-32`
- **证据**：`useState(() => { fetch('/api/users')... })` 在渲染期执行，StrictMode 下双发，组件未提交也会执行；失败时静默空列表。
- **修复**：改为 `useEffect(() => {...}, [])` 并加错误提示。

### M-11 ✅ updateFsrsCard 读-改-写竞态 + 唯一约束 500 + POST 无事务/无 try-catch
> 已修复（2026-07-23 第四批）：卡片读-改-写 + 复习日志包进单个 `$transaction`，upsert 消除并发 create 冲突；POST 整体 try/catch 返回通用 500。同卡连续提交冒烟验证通过。
- **位置**：`src/app/api/session/route.ts:66-103,136-200`
- **证据**：`findUnique → schedule → update` 非原子，并发提交同一卡片丢更新；卡片不存在时并发双 `create` 触发 `@@unique([userId,cardType,cardId])` 冲突 → 整个 POST 500（路由无任何 try/catch），留下「会话已建、部分记录已写」的脏数据。
- **修复**：`upsert` + `$transaction` 包裹记录循环与卡片更新；POST 加全局错误处理。

### M-12 ✅ 热路径 N+1 查询
> 已修复（2026-07-23 第四批）：word 复习详情、mistakes（5 类型）、focused words/sentences、sentence review 全部改为「收集 ID → findMany in → Map join」，字段/顺序/enrichment 逐项核对等价，batch1/2 回归验证。
- **位置**：`word/route.ts:124-129,134-147`（每词一次 findUnique）、`mistakes/route.ts:32-58`（最多 100 次串行）、`practice/focused/route.ts:88-92,108-111`、`sentence/route.ts:33-36`、`session/route.ts:66-103`（每记录 4-5 次往返）
- **修复**：`findMany({ where: { id: { in: ids } } })` 批量取回内存 join；记录写入用 `createMany`/`$transaction`。

### M-13 ✅ advancedUnlocked 与设计/文档不符：键盘通关路径被忽略
> 已修复（2026-07-22 第二批）：`advancedUnlocked = keyboardUnlocked || wpmQualified`。6 关通关低 WPM 用户冒烟验证解锁成功。
- **位置**：`src/app/api/dashboard/route.ts:35-37`
- **证据**：注释与 README 均为「键盘 6 关完成 OR WPM≥40」，代码 `const advancedUnlocked = wpmQualified`，`keyboardUnlocked` 算而未用。
- **修复**：`const advancedUnlocked = keyboardUnlocked || wpmQualified`。

---

## 🟡 Minor（21）

| ID | 状态 | 问题 | 位置 |
|----|------|------|------|
| L-1 | ✅ | `.env` 未在 .dockerignore 排除且含开发机路径（已修：.dockerignore 加 .env；DATABASE_URL 改相对路径 file:./db/custom.db） | `.dockerignore`、`.env:1` |
| L-2 | ✅ | Prisma `log: ['query']` 无条件开启（已修：生产 ['error']，开发 ['query']） | `src/lib/db.ts:10` |
| L-3 | ✅ | data/reset 非事务（已修：8 个 deleteMany + user.update 包进 $transaction 数组，响应结构不变） | `src/app/api/data/reset/route.ts` |
| L-4 | ✅ | fsrsRetention/fsrsMaxInterval 设置无效（已修：fsrs.ts 实例缓存按参数键控，session 调度传入用户设置，0.8 vs 0.97 due 差 ~40 天验证） | `src/lib/fsrs.ts`、`session/route.ts` |
| L-5 | ✅ | calculateInterval 旧公式死代码 + 注释错误（已修：删除死函数、注释更正、顺带修正 ts-fsrs snake_case 参数名消除 2 个存量 tsc 错误） | `src/lib/fsrs.ts` |
| L-6 | ✅ | 客户端 `rating` 未校验范围（已随第一批 M-1 修复：非法 rating 回退自动评级） | `src/app/api/session/route.ts:70-72` |
| L-16 | ✅ | mistake-book wordCount 类型错误（已随第一批 C-9 修复） | `mistake-book.tsx` |
| L-7 | 📌 by-design | errorKeysList 记录「目标字符」——经裁决维持现状：薄弱键分析关注"哪些字符易打错"，当前语义满足；tracker 标注不改 | `word-module.tsx:127` 等 |
| L-8 | ✅ | 阅读/听力硬编码 60s + listening 无统计分支（已修：DailyStat 加 listeningDone 列；前端实测真实时长替代 60000） | `reading-module.tsx`、`listening-module.tsx`、`session/route.ts` |
| L-9 | ✅ | 键盘第 7 关越界崩溃（已修：setCurrentLevel 钳制 ≤ KEYBOARD_LEVELS.length） | `keyboard-module.tsx:53` |
| L-10 | ✅ | TTS 播放竞态双音频叠播（已修：seqRef 序号守卫 + cacheRef 缓存 + 删 currentUrlRef） | `tts-player.tsx` |
| L-11 | ✅ | 新词自动播放 effect 每次渲染触发（已修：依赖改稳定的 tts.speak，两处 effect） | `word-module.tsx` |
| L-12 | ✅ | listening useState 当 ref + 音频泄漏（已修：useRef + loadArticle 停音频 + 卸载清理） | `listening-module.tsx` |
| L-13 | ✅ | store.ts 死代码（已删除整个文件） | `src/lib/store.ts` |
| L-14 | ✅ | 切视图重复拉 dashboard + 500 误登出（已修：mount-only 拉取 + 仅 401 登出，其他错误 toast） | `app-shell.tsx:97-111` |
| L-15 | ✅ | 会话恢复双重请求（已修：新增 GET /api/auth，page.tsx 改用它） | `api/auth/route.ts`、`page.tsx` |
| L-17 | ✅ | UTC 解析标签差一天（已修：4 处改 `new Date(day + 'T00:00:00')` 本地解析） | `study-report.tsx`、`key-heatmap.tsx` |
| L-18 | ✅ | tts/meta 无超时（已修：30s AbortController + 通用错误文案） | `tts/meta/route.ts` |
| L-19 | ✅ | TTS 无配额限制（已修：每用户 30 次/分钟内存限流 → 429，上游调用前检查） | `tts/synthesize/route.ts` |
| L-20 | ✅ | JSON.parse 无容错（已修：try/catch + Array.isArray 双重防护 ×3 处） | `stats/keys`、`stats/report`、`practice/focused` |
| L-21 | 🔶 部分修复 | 已修：500 回显 e.message（auth/data-reset/meta/synthesize/session 全部改通用文案）、first_login 按会话数判定、删无效 distinct、delta 徽标条件、中文 errorKeys（随 M-4 已补）。**延后**：热力图 per-key accuracy 估算启发式、中文 WPM 语义（5字符=1词）、FsrsReview 审计快照（需 schema 变更）、每日限额 check-then-act 竞态与取整 | 多处 |

---

## 修复优先级建议

1. **第一批（功能阻断）**：C-1、C-2、C-3、C-9、M-1、M-2 —— 直接影响学习主流程
   > ✅ 已于 2026-07-22 全部修复并冒烟验证（16/16 通过，测试脚本：scripts/test-seed-batch1.ts + scripts/test-batch1.ts，需以 `DATABASE_URL="file:/tmp/opencode/typtest/test.db" bun run dev` 启动后运行 `bun scripts/test-batch1.ts`）
2. **第二批（数据正确性）**：C-8、M-3、M-4、M-5、M-6、M-7、M-8、M-13
   > ✅ 已于 2026-07-22 全部修复。batch2 冒烟 25/25 通过（scripts/test-seed-batch2.ts + scripts/test-batch2.ts，test2.db），batch1 回归 16/16 通过。
3. **第三批（安全加固）**：C-4、C-5、C-6、C-7（家庭内部使用可按需降级）
   > ✅ 已于 2026-07-22 全部修复。batch3 冒烟 17/17（scripts/test-seed-batch3.ts + scripts/test-batch3.ts，test3.db + 安全 env），batch1 16/16、batch2 28/28 回归通过。**部署待办：① 生产环境配置 SESSION_SECRET（openssl rand -hex 32）与 TTS_SERVER_URL/TTS_TOKEN；② 轮换已暴露的 TTS token。**
4. **第四批（健壮性/体验）**：M-9 ~ M-12、全部 Minor
   > ✅ 已于 2026-07-23 全部修复。batch4 冒烟 13/13（scripts/test-seed-batch4.ts + scripts/test-batch4.ts，test4.db），batch1 16/16、batch2 28/28、batch3 21/21 回归通过。含 schema 变更（DailyStat.listeningDone），**部署需执行 `prisma db push`**。L-7 裁决 by-design，L-21 四项延后（见上表）。
