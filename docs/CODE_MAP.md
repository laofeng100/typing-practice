# 代码结构说明 (CODE_MAP)

> 本文档按文件/函数粒度梳理项目全部手写源码。`docs/tts-server-api.md` 介绍外部 TTS 服务；`src/components/ui/**` 为 shadcn New York 风格通用组件（~50 个文件），本文不展开。
>
> 工程统计：手写代码 ~15,620 行 / 106 TS/TSX 文件 + 422 行 schema + 313 行 CSS。

---

## 0. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器 (Next.js 16 App Router, RSC + Client Components)    │
└───────────────┬──────────────────────────────┬───────────────┘
                │ fetch /api/*                  │ Audio(src)
                ▼                               ▼
┌───────────────────────────────┐   ┌────────────────────────────┐
│ src/app/api/** (20+ route.ts) │   │ src/app/api/tts/audio      │
│ - session/word/sentence/...   │   │ 代理 /static/tts/...       │
│ - dashboard/stats/...         │   └──────────┬─────────────────┘
│ - tts/synthesize (限流 30/m)  │              │
└───────────────┬───────────────┘              │ Bearer token
                │ Prisma                       ▼
                ▼                   ┌────────────────────────────┐
┌───────────────────────────────┐   │ 外部 TTS 服务器             │
│ SQLite (prisma/custom.db)     │   │ http://139.155.115.250     │
│ 15 张表 (见 §1)               │   │ /api/v1/tts/{synthesize,   │
└───────────────────────────────┘   │  meta} + /static/tts/...   │
                                    └────────────────────────────┘

src/lib/ 是唯一可被 api 与 components 双向 import 的"内核"层：
  fsrs (算法) + settings (配置) + auth (会话) + dialogue (听力解析)
  + typing (键位+计算) + achievements (成就) + db (Prisma 单例)
  + datetime (本地日期) + utils (cn)
```

**典型数据流**（单词复习为例）：
```
word-module.tsx ──GET──▶ /api/word?mode=review
                            │
                            ├─▶ fsrsCard.findMany (到期)
                            ├─▶ lib/fsrs.calculateRetrievability (实时 R)
                            └─▶ 排序取前 wordReviewBatchSize 条
◀──{words: [...]}──┘
用户打字 ──POST──▶ /api/session {module:'word', records:[...]}
                            │
                            ├─▶ lib/fsrs.rateTyping (自动评级)
                            ├─▶ lib/fsrs.schedule (FSRS-6 repeat)
                            ├─▶ upsert FsrsCard + insert FsrsReview (事务)
                            └─▶ upsert DailyStat (按 module 分发)
◀──{newAchievements}──┘
```

---

## 1. 数据模型 `prisma/schema.prisma` (21 个模型)

| 表 | 关键字段 | 备注 |
|---|---|---|
| `User` | phone (unique) / role / stage / grade / bookId | 2 个固定账号（弟弟/姐姐） |
| `Book` | id=book_id / version / stage / grade / term / wordCount | 47 本小初高词书（v2 词典升级） |
| `BookWord` | bookId+wordId (unique) / wordRank | 词↔书关联 + 教材内词序（FSRS 新词供给顺序） |
| `WordDict` | id=head_word / en / zh / pos / usPhone / ukPhone / memoryMethod / isPrimary~isGaokao / bookCount | 7,572 词（有道词典，跨学段去重） |
| `WordExample` | wordId / en / cn / ord | 例句（每词 3 条，16,339） |
| `WordPhrase` | wordId / phrase / cn / ord | 全量短语（42,752） |
| `WordSynonym` | wordId / pos / word / tranCn / ord | 近义词（22,313） |
| `WordRelated` | wordId / pos / word / tranCn / ord | 相关词（15,957） |
| `GrammarPattern` | stage / grade / term / category / name / structure / example | 语法句式（121） |
| `GrammarSystem` | majorCat / itemName / content | 语法体系（94） |
| `Sentence` | stage / order / en / zh / grammarPoint / grammarExplain / sourcePatternId | 450 句 |
| `ReadingArticle` | stage / order / title / content / contentZh / questions (JSON) / vocabulary / grammarPoints | 75 篇 |
| `ListeningArticle` | stage / order / title / category (6 类) / wordCount / difficulty / content / questions | 95 篇 |
| `FsrsCard` | userId+cardType+cardId (unique) / state / stability / difficulty / due / lapses / reps / lastReview / retrievability / totalErrors / totalTyping | 学习卡核心，**cardType 仅 word/sentence**（FSRS_CARD_TYPES 白名单） |
| `FsrsReview` | userId+cardType+cardId / rating (1-4) / responseMs / accuracy / errorCount | 复习日志 |
| `TypingSession` | module / subModule / durationMs / score / stars / status / endedAt | 一次练习 |
| `TypingRecord` | sessionId / cardType / cardId / targetText / inputText / errorKeysList (JSON) / rating / isCorrect | 单卡记录 |
| `UserProgress` | userId+module+level (unique) / status / bestWpm / bestAccuracy / stars / attempts | 关卡进度 |
| `Assessment` | userId / type / score / details | 评估 |
| `DailyStat` | date (YYYY-MM-DD)+userId (unique) / totalMs / totalKeys / correctKeys / keyboardMs / wordNew / wordReview / wordCorrect / sentenceDone / articleDone / listeningDone / avgWpm / avgAccuracy | 每日聚合 |
| `UserSetting` | userId+key (unique) / value | 设置 KV |

- 所有 `userId` 字段均 `onDelete: Cascade`；`WordDict.id` 为 head_word 小写，FSRS 卡 `cardId` 直接存 head_word
- 古诗词模块（ChineseText/chinese API/组件）已于 v2 阶段5 **全链路删除**，schema 无对应表，勿恢复

---

## 2. 核心库 `src/lib/` (900 行)

### 2.1 `lib/db.ts` (12)
- **导出**：`db` (PrismaClient 单例)
- **逻辑**：`globalThis.__db` 缓存防止 dev 热重载创建多实例；非生产环境 `log: ['query','warn','error']`

### 2.2 `lib/auth.ts` (97)
- **导出**：`SESSION_COOKIE`、`getCurrentUser`、`getCurrentUserOrNull`、`setCurrentUser`、`clearCurrentUser`
- **常量**：`SESSION_COOKIE = 'typing_user_id'`
- **函数**：
  - `sign(userId)`: HMAC-SHA256 用 `process.env.SESSION_SECRET`（缺省时 `crypto.randomBytes` 生成临时密钥，重启失效）
  - `getCurrentUser()`: 读 cookie → 切 `.` → `timingSafeEqual` 验签 → `db.user.findUnique`；失败返回 `null`
  - `setCurrentUser(userId)`: 写 `{userId}.{sig}` cookie，30 天有效期；`httpOnly + sameSite=lax + secure(仅生产)`
  - `getCurrentUserOrNull()`: 永不 throw 的版本
- **约定**：免密设计（家庭场景），无密码字段；phone 字段 API 层必剥离

### 2.3 `lib/settings.ts` (145)
- **导出**：`DEFAULT_SETTINGS`、`Settings`、`getRawSettings`、`getSettings`、`setSetting`、`getOrCreateDailyStat`、`checkDailyLimit`
- **常量** `DEFAULT_SETTINGS`（28 字段）：
  - 时长：`dailyLimitMin=15` / `singleLimitMin=30`
  - 解锁：`wpmUnlockThreshold=40` / `accuracyUnlockThreshold=90`
  - FSRS：`fsrsRetention=0.9` / `fsrsMaxInterval=365`
  - 单词：`wordBatchSize=10` / `wordReviewBatchSize=20`
  - 突击：`examCramMode=false` / `examCramIntensity=50`
  - 家长：`parentPin=''`
  - 界面：`showKeyboard=true` / `showFingerGuide=true` / `soundFeedback=false` / `fontSize='medium'`
  - TTS：`ttsServerUrl/ttsToken` 走 env（永远不读 DB）；英文音色 7 项（`enVoiceId='English_PassionateWarrior'` + 语速/音量/音调 + 3 停顿）；中文 TTS 已随古诗词模块下线（`lang='cn'` 复用英文配置，无 cn 设置键）
- **函数**：
  - `getRawSettings(userId)`: 读 DB KV → 合并默认值 → 强制用 env 覆盖 TTS 服务器/token
  - `getSettings(userId)`: 调 `getRawSettings` → 若 `examCramMode=true` 临时放大 `wordBatchSize × (1 + intensity/100 × 2)` 等（**不持久化**，每次请求现算）
  - `setSetting(userId, key, value)`: upsert 单项
  - `getOrCreateDailyStat(userId, dateStr?)`: 当日统计 upsert（date 用 `localDateStr()`）
  - `checkDailyLimit(userId)`: `usedMin = floor(totalMs / 60000)` 与 `dailyLimitMin×60000ms` 对比（不再按模块加权）

### 2.4 `lib/fsrs.ts` (210)
- **导出**：`DEFAULT_PARAMS`、`getFsrs`、`FsrsCardState` (interface)、`RatingType`、`StateType`、`createNewCard`、`calculateRetrievability`、`schedule`、`rateTyping`、`getDueCards`、`getRetentionRate`、`Rating`、`State` (re-export from ts-fsrs)
- **常量** `DEFAULT_PARAMS.w`: 21 元素 FSRS-6 权重数组
- **函数**：
  - `getFsrs(retention?, maxInterval?)`: 按 `r:m` 键内存缓存 FSRS 实例
  - `createNewCard()`: ts-fsrs `createEmptyCard()` → FsrsCardState
  - `toFsrsCard(state)` / `fromFsrsCard(card, retrievability)`: DB ↔ ts-fsrs 互转
  - `calculateRetrievability(card, now)`: 调 ts-fsrs `forgetting_curve`；`state=0` 或 `!lastReview` 或 `stability≤0` 返回 0；其余按 R(t) = (1 + 因子×elapsed/stability)^(-1/因子) 实时算
  - `schedule(card, rating, responseMs, now, retention?, maxInterval?)`: 调 `fsrs.repeat()` 按 rating 取新状态；复习时 R 用 `createEmptyCard` 再 `forgetting_curve`
  - `rateTyping(accuracy, wpm, responseMs, targetWpm?)`: 自动评级——
    - `accuracy<0.6` → `Again`
    - `score = acc×0.8 + min(wpm/targetWpm,1.2)×0.2`
    - `score≥0.92 → Easy` / `≥0.72 → Good` / 其余 → `Hard`
  - `getDueCards(cards, now)`: `state>0 && due≤now` 计数
  - `getRetentionRate(cards, now)`: 活跃卡片平均 R

### 2.5 `lib/dialogue.ts` (88)
- **导出**：`DialogueSegment` (interface)、`parseDialogue`、`voiceForSpeaker`、`dialogueSpeakers`
- **常量**：
  - `DIALOGUE_VOICES` = `['English_Graceful_Lady','English_Trustworth_Man','English_PassionateWarrior','English_expressive_narrator']`（4 个英语音色循环；`English_Playful_Child` 在 TTS 服务器 500，已移除）
  - `NAME_VOICE_MAP`: ~35 个常用名/角色→音色（mom/mother/mum→Graceful_Lady；child/kid/boy/girl→Graceful_Lady；teacher/waitress/doctor/librarian/hostess/receptionist/candidate/lily/sarah/mary/amy/lucy/kate/anna/emma→Graceful_Lady；dad/father/tom/jack/mike/peter/ben/sam/interviewer/john/alex→Trustworth_Man；shopkeeper/waiter/narrator→expressive_narrator）
- **函数**：
  - `parseDialogue(content)`: 正则 `(?:^|[\s.!?"'])([A-Z][a-zA-Z]{1,15}):\s*` 提取角色；要求 ≥2 段、≥2 个不同角色、标签覆盖 ≥60% 文本，否则返回 `null`
  - `voiceForSpeaker(speakers, speaker)`: 先查 `NAME_VOICE_MAP`（`toLowerCase()`）；否则 `speakers.indexOf % 4` 循环
  - `dialogueSpeakers(segments)`: 去重保序

### 2.6 `lib/typing.ts` (188)
- **导出**：`calcWpm`、`calcAccuracy`、`CharCompare` (interface)、`compareTexts`、`getErrorChars`、`KEY_TO_FINGER`、`FINGER_NAMES`、`KEYBOARD_ROWS`、`HOME_ROW`、`KEYBOARD_LEVELS`
- **常量**：
  - `KEY_TO_FINGER`: QWERTY 30 键+空格 → 9 类手指映射（5字符键：1→L-pinky, q→L-pinky, a→L-pinky, z→L-pinky, 等）
  - `KEYBOARD_ROWS`: 4 行布局（数字 + QWERTY + ASDF + ZXCV）
  - `HOME_ROW`: `['a','s','d','f','j','k','l',';']`
  - `KEYBOARD_LEVELS`: 6 关数组——基准(10wpm/95% acc, 5 practice) / 上排(15/92) / 下排(18/90) / 数字(20/88) / 符号(22/88) / 综合(25/90)
- **函数**：
  - `calcWpm(correctChars, durationMs)`: `round((correct/5)/(durationMs/60000))`
  - `calcAccuracy(correct, total)`: `toFixed(1)` 百分比
  - `compareTexts(target, input)`: 逐字符比对，支持 surrogate pairs（`[...target]`）；返回 `CharCompare[]`，含 `correct/wrong/next/wrongKeyIndex`
  - `getErrorChars(target, input)`: 错误字符数组

### 2.7 `lib/achievements.ts` (144)
- **导出**：`Achievement` (interface)、`computeAchievements`
- **函数** `computeAchievements(userId)`:
  - 聚合：会话总时长、FSRS 各 cardType 已学卡数（state>0）、键盘完成关数、最佳 WPM、最近 30 天活跃天数、连续打卡天数
  - 返回 27 条成就，每条 `{id,name,desc,icon,tier 1-4,unlocked,progress,target,category}`
  - 7 类：打卡(5)、键盘(6)、单词(4)、句子(2)、阅读(2)、中文(2)、时长(3)

### 2.8 `lib/datetime.ts` (10)
- **导出**：`localDateStr(d?)`: 返回 `YYYY-MM-DD`（依赖容器 `TZ=Asia/Shanghai`）

### 2.9 `lib/utils.ts` (6)
- **导出**：`cn`: clsx + tailwind-merge

---

## 3. API 路由 `src/app/api/` (2,076 行)

### 3.1 `api/route.ts` (4)
- `GET` → `{message:"Hello, world!"}` (调试用)

### 3.2 `api/auth/route.ts` (63)
- **POST**: 接受 `{userId}` 或 `{phone}`；按 IP 内存桶限流 20/分钟（>20 → 429）；调 `setCurrentUser`；返回 user 剥 `phone`；统一错误文案
- **GET**: 返回当前 user 剥 `phone`
- **DELETE**: 动态 import `clearCurrentUser`（避免 Edge runtime 问题）

### 3.3 `api/users/route.ts` (11)
- **GET**: 返回所有固定账号（`id,name,nickname,avatar,stage,grade`，**不含 phone**）用于登录页

### 3.4 `api/session/route.ts` (337) ⭐核心
- **POST** 通用练习提交
- **入参**: `{module, subModule, durationMs, totalKeys, correctKeys, totalChars, records[], level?, score?, stars?}`
- **流程**:
  1. 解析 `records`，每条 `{cardType,cardId,targetText,inputText,durationMs,totalKeys,correctKeys,errorKeys,rating,hintCount,cardState}`
  2. 计算 WPM / accuracy（`Math.max(1,durationMs/60000)` 防除零）
  3. 教研降权：`cardState=0`（新卡）rating 封顶 Hard(≤2)；`hintCount>0` 同理
  4. 考前突击：`retention=0.95`
  5. `updateFsrsCard(record, retention, maxInterval)`: 事务内 读 → `schedule` → upsert FsrsCard → insert FsrsReview
  6. `updateDailyStat(module, fields)`: 按 module 分发 — `keyboard→keyboardMs` / `wordNew/wordReview/wordCorrect` / `sentenceDone` / `articleDone` / `listeningDone`；重算 `avgWpm` / `avgAccuracy`（注：DailyStat.chineseDone 字段保留但无写入路径）
  7. 键盘关卡模式：通关阈值取**服务端常量 `KEYBOARD_LEVELS`**（level 须为 1-6 整数，passWpm/passAccuracy/stars 由服务端按关卡配置计算，不信任客户端传值）；通过则解锁 `level+1`（创建或激活）
  8. 前后对比 `computeAchievements`，diff 出新解锁返回
- **校验**: rating 范围 1-4（非法回退自动评级）

### 3.5 `api/word/route.ts` (255) ⭐核心
- **GET**: 返回今日单词练习队列
- **查询参数**: `mode=new|review|mixed`（学段由 user.bookId 决定）
- **复习流程**:
  - `fsrsCard.findMany({cardType:'word', due ≤ now+7天(突击)/now, state>0})` 取 `wordReviewBatchSize×3`
  - 内存 `calculateRetrievability` 实时 R，排序取前 `wordReviewBatchSize`
  - 批量 `findMany id IN` 防 N+1
  - 已学 ID 用 `select: {cardId: true}` 节省带宽
- **新词流程**:
  - 积压防护公式 — `dueCount > wordReviewBatchSize×5 → 0` / `>×3 → batchSize/2` / 否则 `batchSize`
  - 候选 = 当前教材 BookWord 词序（内存过滤已学），新词卡状态**批量 `findMany cardId IN`**（非逐词 findUnique）
  - 当前教材全部学完自动晋级：`user.update({bookId: 下一册, stage: 同步中文学段})`，同版本下一册 → 跨学段第一本 → 末本停留
- **返回**: `{mode, newWords, reviewWords, currentStage, stageUpgraded, currentBook, stats{totalLearned,totalWords,dueCount,backlog,currentStageProgress}}`

### 3.6 `api/sentence/route.ts` (128)
- **GET**: 句子队列
- **逻辑**: 与 word 类似 — `mode='review'` 跨学段取 FSRS 到期，按 liveR 排序；`mode='practice'` 取当前学段新句，学段学完自动晋级
- **晋级**: 学段学完时同步 `user.update({stage})`（与单词模块一致，保持仪表盘/阅读/听力默认学段同步）
- **差异**: `limit=10`（不可配）；`candidateBatch = limit×5 ≤ 100`；`offset` 上限 5000；无积压防护公式（新句供给不受复习债影响）

### 3.7 `api/listening/route.ts` (40)
- **GET**: `?id` 返回单篇（含 content/questions/vocabulary/grammarPoints JSON）；否则按学段返回列表（id/order/title/category/wordCount/difficulty）
- 无读写，只查 `listeningArticle`

### 3.8 `api/article/route.ts` (57)
- **GET**: 阅读文章列表 — 已退出 FSRS，用 `TypingRecord.groupBy(cardId)` 标记 `practiced`(是否做过) / `reps`(次数)；`?id` 返回单篇

### 3.9 ~~api/chinese/route.ts~~（v2 阶段5 已全链路删除，勿恢复）

### 3.10 `api/dashboard/route.ts` (99)
- **GET**: 仪表盘聚合
- **字段**: `user / settings / todayStat / keyboardProgress / keyboardUnlocked / advancedUnlocked / bestWpm / bestAccuracy / dueCards / newCards / wordProgress / recentSessions / streak / currentBookTitle`
- **`newCards`**: 今日新学词数（`todayStat.wordNew`；原先按 state=0 统计恒为 0）
- **解锁判定**: `keyboardUnlocked = 6关全 completed` 或 `bestWpm ≥ wpmUnlockThreshold && bestAccuracy ≥ accuracyUnlockThreshold`
- **streak**: 今天未练不算断签（cursor 退 1 天开始）

### 3.11 `api/mistakes/route.ts` (86)
- **GET**: 错题本
- **筛选**: `OR: lapses≥1 || totalErrors≥2`（不用 difficulty 门槛——首学评 Hard 难度即达 5.11 会误收全部首学 Hard 卡）
- **分组**: `grouped{word/sentence}` + `stats`（每类总数/总错误数）
- **批量 join**: 用 `id IN [...]` 一次性取资源数据

### 3.12 `api/progress/route.ts` (42)
- **GET**: 关卡进度列表
- **`maxUnlocked`**: 已通关最高 level + 1（强制解锁下一关，即使记录缺失）

### 3.13 `api/practice/focused/route.ts` (154)
- **GET**: `?type=keys|words|sentences`；`focusId` 按原始字符串透传（word 卡 cardId 为 head_word，sentence 为数字 id 字符串），命中卡置顶
  - **keys**: 聚合近 90 天 `TypingRecord.errorKeysList` 统计错误键（与 stats/keys 同窗口），生成 3 类训练 — 单键强化 / 双键交替 / 含薄弱键的常见单词综合
  - **words**: 错题单词（门槛与错题本一致：`lapses≥1 || totalErrors≥2`，取 15 条）
  - **sentences**: 错题句子（同门槛，10 条）

### 3.14 `api/data/reset/route.ts` (101)
- **POST**: 清除当前用户数据
- **删除范围**（事务内 deleteMany）: `FsrsCard / FsrsReview / TypingSession / TypingRecord / UserProgress / Assessment / DailyStat / UserSetting`
- **重置**: `user.update({stage:'小学', grade:'小升初', bookId:'PEPXiaoXue3_1'})`
- **返回**: `{success, deleted: {...counts 8 类业务表}, preserved}`（preserved = 家长管控键保留；教学数据表本身不删）

### 3.15 `api/settings/route.ts` (89) ⭐核心
- **GET**: 返回 `{settings, effectiveSettings}`（含 `parentPin` 掩码 `••••`、`ttsToken` 掩码 `••••••••`）
- **PUT**: 用 zod schema 校验 22 个可写键（`fsrsRetention: 0.7-0.99`、`dailyLimitMin: 5-120`、`intensity: 0-100` 等范围限制）；未知 key 忽略；整体失败返回 `details`；调 `setSetting` 写入
- **白名单**: PUT 永远忽略 `ttsServerUrl/ttsToken`（仅 env 可配，ISSUE_TRACKER C-7）

### 3.16 `api/settings/verify-pin/route.ts` (31)
- **POST**: 校验 `parentPin`（按 userId 限流 10/分钟）；返回 `{ok: true/false}`

### 3.17 `api/stats/achievements/route.ts` (59)
- **GET**: 成就墙数据 + 统计 + 词汇累计成长曲线
- **曲线**: `FsrsReview` 按 reviewedAt 升序全量拉取，内存跨天去重 `cardId`（每词只在首次复习当天计入）后按天累计

### 3.18 `api/stats/keys/route.ts` (76)
- **GET**: 键位热力图数据
- **逻辑**: 聚合 `errorKeysList` JSON（按 `key → count`），估算每键错误率（用全局错误率推算 `total = count / globalAcc`）；按 module 分组；近 30 天每日 stats

### 3.19 `api/stats/report/route.ts` (148)
- **GET**: `?range=week|month|all` 学习报告
- **字段**: 模块分布 / 每日趋势 / 薄弱键 Top10 / FSRS 状态（按 cardType 分组的 due/stability/lapses）/ 个性化建议数组（基于 `avgWpm/accuracy/cardsByType.due` 等）/ 上期对比（计算前 N 天的 prev）

### 3.20 `api/tts/synthesize/route.ts` (135) ⭐核心
- **POST**: TTS 代理
- **限流**: 每用户内存桶 30/分钟（>30 → 429）
- **流程**:
  1. `getRawSettings(userId)` 读配置
  2. 按 `lang=en|cn` 选取 `voiceId / speed / vol / pitch / pause_dou_hao / ju_hao / dun_hao`
  3. 超时：`scene='article' → 90s` / 否则 30s（AbrotController + fetch）
  4. 中文可走 `TTS_MODEL` HD 模型；英文明确 `model=undefined`（HD 慢 10 倍+ 超时）
  5. 调 TTS 服务器 `/api/v1/tts/synthesize` → 返回 `audioUrl=/api/tts/audio?u=...`（token 不下发前端）

### 3.21 `api/tts/audio/route.ts` (49) ⭐核心
- **GET**: 音频代理
- **强制**: 登录校验 + `u` 参数必须以 `/` 开头且不含 `..` 或 `://`（防开放代理 SSRF）
- **超时**: 30s
- **缓存**: `Cache-Control: private, max-age=86400`（浏览器侧缓存）
- **拼接**: `${ttsServerUrl}${u}?token=...` + `Authorization: Bearer` 双重传 token

### 3.22 `api/tts/meta/route.ts` (37)
- **GET**: 代理 TTS 服务器 `/api/v1/tts/meta`（voices/models/languages/subtitle_types/speed_range），供音色选择器下拉

---

## 4. 应用层 `src/app/` + `src/components/app/` (2,071 行，含 CSS)

### 4.1 `app/layout.tsx` (43)
- **导出**: `metadata` (title/description)、`RootLayout`
- **关键**: Geist + Geist_Mono 字体；`<Providers>` + `<Toaster />`；`lang="en" suppressHydrationWarning`

### 4.2 `app/providers.tsx` (11)
- **导出**: `Providers`
- **配置**: `next-themes` `attribute="class" defaultTheme="light" enableSystem`

### 4.3 `app/page.tsx` (39)
- **状态机**: `checking` → `GET /api/auth` 恢复 → `user==null` 渲染 `<LoginScreen>` → 否则 `<AppShell user={...} />`
- 失败兜底：401/网络错误渲染 skeleton 等待

### 4.4 `app/globals.css` (313)
- **结构**: `@import "tailwindcss"` + `@theme inline` + `:root`/`.dark` + 组件样式 + 动画
- **OKLCH 调色板**:
  - `--primary: oklch(0.65 0.18 55)` (温暖琥珀橙)
  - `--accent: oklch(0.55 0.15 145)` (森林绿)
  - success / warning / info / destructive / muted / border / input / ring
  - 浅深双套
- **打字样式**: `.typing-char`（4 类状态 / 当前光标闪烁）/ `.vk-key`（虚拟键盘按键）/ `.scroll-thin`（细滚动条）
- **动画**: `pulse-soft`（缓脉冲）/ `shake-x` / `shake-once` / `caret-blink`（光标闪烁）
- **数字**: `tnum` 等宽数字对齐

### 4.5 `components/app/login-screen.tsx` (206)
- **职责**: 卡片式选择固定账号
- **流程**: `fetch('/api/users')` → `localStorage.last_login_uid` 排序置顶 → `POST /api/auth {userId}` → 写入 last_login_uid → `onLoggedIn(user)`
- **UI**: 头像（boy→👦/girl→👧）+ 名字 + 学段 + "上次登录" 徽章 + ArrowRight + 三大功能卡（键盘/单词/阅读）

### 4.6 `components/app/app-shell.tsx` (350) ⭐核心
- **职责**: 登录后主框架（路由 + 侧栏导航 + 顶栏 + 移动端底部 Tab）
- **状态**: `view: 13 种`（12 case + default）、`dashData`、`mobileOpen`、`focusedInit`
- **常量**:
  - `NAV_ITEMS`: 12 项分 5 组（主要/打字基础/英语练习/学习统计/系统）
  - `MOBILE_TABS`: 5 个底部固定 Tab（概览/键盘/单词/句子/我的）
  - `MODULE_GROUPS`: 5 个组配置
- **`NavList` 子组件**: 按组渲染，侧栏 Tooltip 显示锁定原因
- **锁定**: `item.module && item.module !== 'keyboard' && !advancedUnlocked` → 禁用 + Tooltip
- **`loadDashboard()`**: 拉 `/api/dashboard`；401 自动登出（其它错误只 toast）
- **`renderView()`**: switch 渲染 13 种 view，传 props (user/settings/onProgress/advancedUnlocked)
- **顶栏**: 今日时长环（RingProgress）+ 待复习徽章（animate-pulse-soft）+ 头像 + 退出菜单
- **动效**: framer-motion `layoutId` 实现移动指示条 spring 动画
- **移动端**: 底部 5 Tab 固定栏（`lg:hidden`）+ Sheet 抽屉

### 4.7 `components/app/dashboard.tsx` (370) ⭐核心
- **职责**: 仪表盘（今日任务卡 + 4 统计卡 + 学习路径 + 键盘关卡 + 7 天趋势柱状图）
- **常量**: `ENCOURAGEMENTS`（5 句鼓励语，按年内日序轮换）/ `pathNodes`（5 节点：keyboard→word→sentence→reading→listening）
- **`timeGreeting()`**: 早/午/晚问候
- **`primaryAction`**: 自动决策 — 键盘未通关→键盘 / 有 dueCards→单词复习 / 否则→单词新学
- **组件**: `StatCard` / `TrendTooltip` 内部
- **图表**: recharts `BarChart`（昨天到今天 7 天，深色当天高亮 + 自定义 Tooltip）
- **键盘进度**: `KEYBOARD_LEVELS` 关卡条 + 星级

### 4.8 `components/app/settings-panel.tsx` (740) ⭐核心
- **职责**: 设置中心（多分区 + 家长管控门）
- **状态**: `s`（原始输入）/ `effective`（运行时生效，含突击动态放大）/ `parentUnlocked` / `newPin`
- **`DEFAULTS`**: 与 `lib/settings DEFAULT_SETTINGS` 镜像（前端回退用）
- **`ParentGate`**: 已设 PIN 时锁定时长/解锁/突击区；PIN 错提示；最多 6 位数字
- **`handleSave`**: 把掩码 `••••` 字段剔除再 PUT；用响应回填
- **`handleSetPin`**: 首次设置 PIN（PUT parentPin）
- **`handleClearData`**: POST `/api/data/reset` + AlertDialog 二次确认（红色破坏性）
- **6 个区段**:
  1. 家长管控门（PIN 设置/修改）
  2. 时长控制（dailyLimitMin / singleLimitMin）
  3. 解锁门槛（wpmUnlockThreshold / accuracyUnlockThreshold）
  4. FSRS（retention / maxInterval）
  5. 单词练习（含考前突击滑动条 intensity 0-100，显示「生效值」`×(1+i/100×2)`）
  6. 界面（next-themes 三态切换 / showKeyboard / showFingerGuide / soundFeedback / fontSize）
  7. TTS（英文音色/语速/音量/音调/停顿；服务器 env 配置提示为只读 Card，音色选择器调 `/api/tts/meta`；中文 TTS 已随古诗词下线）
  8. 账号信息 + 数据管理

---

## 5. 练习组件 `src/components/practice/` (5,122 行)

### 5.1 `keyboard-module.tsx` (469)
- **状态机**: `select → practice → result`
- **`currentLevel`**: 默认 1，mount 时拉 `/api/progress` 取 `maxUnlocked`
- **关卡卡**: 锁定（idx>0 && currentLevel≤idx）/ 当前 / 已通关 三态视觉
- **练习**: 5 条 `exercise` 串行打；累计 WPM/accuracy（已完成 + 当前）；`onChange` 算错误键
- **完成**: POST `/api/session`（含 `level/passWpm/passAccuracy/stars`）
- **星级**: passed 时 `wpm≥passWpm×1.5 → 3星` / `×1.2 → 2星` / 否则 1
- **解锁**: 通过则 `level+1` 创建/激活
- **庆祝**: `Confetti` 仅 3 星触发
- **拦截**: `todayUsedMin >= dailyLimitMin` 时 toast 拦截进入

### 5.2 `word-module.tsx` (982) ⭐核心
- **状态机**: `select → practice → result`
- **三模式**: new（新词）/ review（复习）/ mixed（混合）
- **三种 UI 形态**:
  - 新词：直接照打（显示完整词 + 「新词学习 N 字符」）
  - 复习：点号遮蔽 + 提示字母（H 键）
  - 输入后：`TypingDisplay` 对比 + `VirtualKeyboard` 高亮下一键
- **`wrongReview` 状态**: 打错（accuracy<80%）→ 不前进，回车 / "继续 →" 或改对后前进（避免错误态污染 FSRS）
- **`hintCount`**: H 键累加 → 上报后端 → 封顶 Hard
- **新词自动 TTS**: 加载时 `useTTS().speak(word)`
- **完成上报**: `Rate = accuracy≥80% ? correct : wrong`；`cardState` 区分新/复习 → `dailyStat.wordNew/wordReview`
- **错词 rematch**: "再战错词" 按钮（趁热打铁）
- **`loadQueue(mode)`**: fetch `/api/word?mode=...`（403 → toast 拦截）

### 5.3 `sentence-module.tsx` (492)
- **状态机**: `select → practice → result`
- **学段卡**: 小学/初中/高中
- **模式**: `practice`（学新句）/ `review`（FSRS 到期）
- **三段流程**: 中文翻译 + 语法点 + 难度徽章 → TypingDisplay 目标句 → 输入框
- **`wrongReview`** 同 word-module
- **完成**: 折叠面板显示「语法讲解」（`grammarExplain` 字段）
- **阈值**: isCorrect ≥ 85%（比 word 高，因句子更长）
- **错句 rematch**

### 5.4 `reading-module.tsx` (425)
- **状态机**: `list → reading → result`
- **列表**: 文章 + 已练习状态（来自 fsrsCard join）
- **阅读页**: 英文原文（`leading-[1.75]`）+ 核心词汇（点击展开释义浮层）+ 选择题
- **提交**: 按正确率映射 FSRS rating — `≥90→4` / `≥70→3` / `≥50→2` / →1（**显式 rating**，无打字数据必须）
- **POST**: `{module:'article', totalKeys:0, records:[{cardType:'article', rating, ...}]}`
- **题目解析**: 展开 `q.explain`

### 5.5 `listening-module.tsx` (521) ⭐核心
- **状态机**: `list → listening → result`
- **加载**: 文章 + 启动计时（`startTimeRef`）
- **`playAudio()`** ⭐TTS 核心:
  1. `parseDialogue(current.content)` 拆段
  2. 若有角色标签：**全部分段并行合成** + 按序播放（防串行累计超时；每段包 `{data}|{err}` 防 unhandledrejection）
  3. 每段 `voiceForSpeaker(speakers, seg.speaker)` 选音色
  4. 若无对话 → 整段单次合成
  5. `playSeqRef` 序列号守卫：新播放打断旧的
  6. `new Audio(url)` 显式对象，play/pause/ended/error 回调
- **状态**: `audioLoading/audioPlaying/audioError/playedOnce/playCount/currentSpeaker`
- **答题**: FSRS rating 同 reading（按正确率映射）
- **强制**: 必须先播放（`playedOnce`）才能提交

### 5.6 ~~chinese-module.tsx~~（v2 阶段5 已全链路删除，勿恢复）

### 5.7 `focused-practice.tsx` (465)
- **三入口**: keys/words/sentences → `/api/practice/focused?type=...`
- **keys 模式**: 错误键→单键强化 / 双键交替 / 含薄弱键的单词综合
- **words/sentences**: 复用错题本数据（`lapses≥1 || totalErrors≥2`）
- **上报**: `module=keyboard|word|sentence`、`subModule=focused-${type}`、`cardType/cardId` 携带
- **`initialType`/`initialId` props**: 支持从 mistake-book 直接跳入（word 卡 id 为 head_word 字符串，`focusId` 原样透传置顶）

### 5.8 `achievements.tsx` (253)
- **导出**: `Achievements`、`AchievementGrid`（内部）
- **快照对比**: `localStorage.ach_unlocked` vs 当前 → diff 新解锁 → toast 庆祝
- **7 Tab**: 全部/打卡/键盘/单词/句子/阅读/时长
- **4 档 tier**: amber/sky/purple/rose + 灰度锁定
- **词汇曲线**: 内嵌 SVG 面积+折线
- **hover**: progress/target 覆盖层

### 5.9 `key-heatmap.tsx` (354)
- **导出**: `KeyHeatmap`
- **5 档颜色**: ≥95 绿 / 88-94 青柠 / 80-87 琥珀 / 70-79 橙 / <70 红
- **徽章**: 顶角显示错误次数
- **指法分布**: 9 类手指错误数横向 bar
- **14 天柱状图**: 按日聚合击键量
- **模块统计卡**: 每模块总键数/错误数/准确率
- **手指圆点**: 各键配左蓝右黄拇指灰

### 5.10 `mistake-book.tsx` (195)
- **导出**: `MistakeBook`、`MistakeList`（内部）
- **4 Tab**: word/sentence/article/listening
- **每条**: 难度色带 + 错误率 + 复习次数 + "立即攻克" 按钮（callback `onPractice(type,id)` → app-shell 跳转 focused-practice）

### 5.11 `study-report.tsx` (384)
- **导出**: `StudyReport`
- **`range`**: week/month/all
- **4 核心指标卡**: 总时长/总键数/平均 WPM/平均准确率（含 delta 显示 vs 上期）
- **进步对比卡**: 上一周期 vs 当前
- **每日柱状图**: 7/30/N 天
- **模块分布**: 饼图
- **薄弱键 Top10**
- **FSRS 状态**: 学习/已巩固/待复习
- **个性化建议**: Lightbulb/Target/TrendingUp/Flame/Zap 图标轮换

### 5.12 `typing-components.tsx` (164)
- **导出**: `VirtualKeyboard`、`TypingDisplay`
- **`VirtualKeyboard`**: 基于 `KEYBOARD_ROWS` 4 行 + 空格；`getKeyClass(k)` 算高亮/错误/下一键 ring/finger color；`renderFingerDot` 下一键左上角指色点
- **`TypingDisplay`**: 字符对比，4 类样式（正确绿/错误红/当前蓝/未输入灰）；空格 `␣`/nbsp 区分；`shakeLatestError` 触发最近错误抖动

### 5.13 `practice-hud.tsx` (59)
- **导出**: `PracticeHUD`、`RollingNumber`
- **顶部 sticky 条**: WPM/准确率/进度
- **数字滚动**: framer-motion popLayout

### 5.14 `tts-player.tsx` (283) ⭐核心
- **导出**: `useTTS`（hook）、`TTSButton`（组件）
- **`useTTS()`**: 返回 `{speak, stop, loading, playing, error}`
  - **缓存**: 内存 `cacheRef` 键 = `${lang}|${scene}|${text}|${voiceId}|${speed}` → 同请求秒回
  - **守卫**: `seqRef` 序号守卫，新请求取代旧请求（防止竞态双音频叠播）
  - **fetch**: POST `/api/tts/synthesize` → 创建 `new Audio(url)` → play
  - **音频事件**: `onplay/onpause/onended/onerror` 同步状态
- **`TTSButton`**: 4 态 SVG 图标（play/pause/spinner/alert）；自定义 inline button（不依赖 `ui/button`，便于 size 控制）

### 5.15 `confetti.tsx` (48)
- **导出**: `Confetti`
- **20 颗粒**从中心向四周扩散的 framer-motion 动画；颜色循环 4 个 CSS 变量

### 5.16 `star-reveal.tsx` (28)
- **导出**: `StarReveal`
- **3 颗星**按延迟 0.15s 弹出（spring），已获得 vs 未获得样式区分

---

## 6. 通用工具 `src/hooks/` (212 行)

### 6.1 `hooks/use-toast.ts` (194)
- **导出**: `useToast`、`toast`、`reducer`、`actionTypes`
- **常量**: `TOAST_LIMIT=1`、`TOAST_REMOVE_DELAY=1000000`
- **调度**: `add/dismiss/remove` 通过 `setTimeout` 队列；监听器数组

### 6.2 `hooks/use-mobile.ts` (19)
- **导出**: `useIsMobile`
- **断点**: `matchMedia '(max-width: 767px)'`

---

## 7. UI 组件库 `src/components/ui/` (~50 文件)

shadcn New York 风格通用组件，纯样板，本文不展开。
文件列表：`accordion / alert-dialog / alert / aspect-ratio / avatar / badge / breadcrumb / button / calendar / card / carousel / chart / checkbox / collapsible / command / context-menu / count-up / dialog / drawer / dropdown-menu / empty-state / form / hover-card / input-otp / input / label / menubar / navigation-menu / pagination / popover / progress / radio-group / resizable / ring-progress / scroll-area / select / separator / sheet / sidebar / skeleton / slider / sonner / switch / table / tabs / textarea / toast / toaster / toggle-group / toggle / tooltip`

---

## 8. 关键约定与流程

### 8.1 类型检查
- `next.config.ts: typescript.ignoreBuildErrors = true`（仅 build 时宽松；**改代码后必须 `bunx tsc --noEmit` 零错误**）

### 8.2 认证
- Cookie 名 `typing_user_id`，值 `{userId}.{HMAC-SHA256 签名}`
- 缺 `SESSION_SECRET` env 时自动生成临时密钥（重启失效，**生产必须配置**）
- 免密 + IP 登录限流 20/分钟
- 任何 user 返回 API 必剥离 `phone`

### 8.3 TTS
- 服务器地址 + token **仅 env 可配**（用户不可写）
- `/api/tts/synthesize`: 每用户 30/分钟；`scene='article'` 90s 超时，否则 30s；中文可用 HD 模型
- `/api/tts/audio`: 登录校验 + `u` 参数强制 `/` 开头、不含 `..`/`://`、30s 超时、token 通过 query+bearer 双重传
- `English_Playful_Child` 在 TTS 服务器 500，禁用
- 听力对话分段：**全并行合成 + 按序播放**（防串行累计超时）

### 8.4 错误响应
- 通用文案，不回显 `e.message`（避免泄露实现细节）

### 8.5 教学数据
- 页面零硬编码，全部入库（7,572 词 / 42,752 短语 / 450 句 / 75 阅读 / 95 听力 / 121 句式 / 94 体系 + 近义/相关词）

### 8.6 教研降权（session/route.ts）
- `cardState=0`（新卡）rating 封顶 Hard（≤2）
- `hintCount>0` rating 封顶 Hard
- 考前突击 `retention=0.95`

### 8.7 wrongReview 模式（所有打字模块）
- 打错不立即前进，避免错误态污染 FSRS 调度
- 用户改对或回车/"继续 →" 才前进
- 阈值：word 80%（UI 判对，word-module.tsx:238）、sentence 85%

### 8.8 锁定/解锁
- `keyboard` 模块始终可访问
- 其它模块需 `advancedUnlocked=true`：`6关全 completed` 或 `bestWpm ≥ 40 && bestAccuracy ≥ 90`

### 8.9 考前突击（settings.ts）
- `examCramMode=true` 时 `getSettings` 动态放大：
  - `wordBatchSize × (1 + intensity/100 × 2)`（intensity=50 → ×2）
  - 复习 due 上限放宽到 `now + 7天`
  - session retention=0.95
- **不持久化**，每次请求现算

### 8.10 关键请求流（用户一天首次练习）
```
打开 App
└─ GET /api/auth → 恢复会话
   └─ GET /api/dashboard → 今日卡 + 解锁状态 + 7天趋势
      └─ AppShell 渲染 13 种 view

进入单词复习
└─ GET /api/word?mode=review
   ├─ 查 FsrsCard (due≤now, state>0)
   ├─ 实时 calculateRetrievability 排序
   └─ 返回 top wordReviewBatchSize

打 5 个单词
└─ POST /api/session {module:'word', records:[...]}
   ├─ rateTyping 自动评级
   ├─ schedule FSRS-6 repeat (事务)
   ├─ upsert DailyStat (wordNew/wordReview/wordCorrect)
   └─ computeAchievements diff → 新解锁 toast

新词自动 TTS 朗读
└─ useTTS().speak(word) → POST /api/tts/synthesize
   ├─ 服务器端 fetches TTS 服务器 → 返回 audio_url
   └─ new Audio(url).play() → 用户听到
```

### 8.11 文件操作指南
- **新增设置字段**: DEFAULT_SETTINGS + settings/route.ts zod schema + settings-panel.tsx UI（3 处同步）
- **新增学习模块**: lib/types + api/*/route.ts + practice/*-module.tsx + app-shell 渲染（4 处）
- **新增成就**: lib/achievements.ts computeAchievements + UI（已支持 27 个模板）
- **新增听力文章**: 写入 DB 后 `bun run scripts/prewarm-listening-tts.ts` 预热 TTS 缓存
- **全链路回归**: `npm run test:all`（详见 §9，取代旧 test-batch* 手动回归）

---

## 9. 自动化测试体系

> 全自动全链路测试，正式库 `custom.db` 零接触。编排入口 `scripts/test/run-all.sh`，一键命令 `npm run test:all`。

### 9.1 三层隔离
1. **独立测试库** `prisma/db/e2e.db`：`scripts/test/setup-e2e.ts` 只读复制正式库基础表（WordDict/Book/BookWord/WordPhrase/WordExample/WordSynonym/WordRelated/Sentence/GrammarPattern/GrammarSystem/ReadingArticle/ListeningArticle/User），清空业务表（TypingRecord/TypingSession/FsrsCard/FsrsReview/DailyStat/UserProgress/UserSetting/Assessment），插入固定测试账号 e2e-didi/e2e-jiejie
2. **独立服务**：`PORT=3100` + `DATABASE_URL=file:./db/e2e.db` + `E2E=1`（next.config.ts 据此用 `.next-e2e` 构建目录，规避 `.next/dev` 锁互斥）
3. **正式库保护**：setup-e2e 对 custom.db 仅只读（WAL checkpoint + copyFileSync）；路径防呆仅允许 `custom.db → e2e.db`；业务表清空后硬校验必须为 0

### 9.2 测试文件
- `tests/e2e/01~10-*.spec.ts`：Playwright 流程测试，**数字前缀强制执行顺序**（文件名序），workers=1 串行（SQLite 写串行）；global-setup 用 e2e-didi 登录存 storageState；helpers.ts 提供 sqlite 直查（query/exec 带 busy retry）与 ensureAdvancedUnlocked（直写键盘进度解锁高级模块）
- `tests/fsrs/fsrs-unit.test.ts`：vitest 单元测试（rateTyping 阈值矩阵 / 首学 Hard 直进 Review / learning_steps 无卡死 / R 存储）
- `scripts/test/fsrs-simulate.mjs`：90 天**内存模拟**（ts-fsrs 官方实现 + 项目同款参数与 schedule 封装，不调 API），6 项硬指标 a-f 全 PASS 才算过

### 9.3 常见坑（测试维护时注意）
- Prisma SQLite DateTime 存 integer 毫秒；exec 直写 due 必须用毫秒 number，ISO text 与 integer 比较恒不匹配 → 复习队列永远为空
- `/api/dashboard` GET 也会 upsert 今日 DailyStat → 重置类断言必须限定 userId
- 首学评级封顶 Hard（cardState=0 且非显式 rating）→ FsrsReview 首学也写流水，计数断言用 before+N
- 新词 UI 队列排序依赖 wordRank，不稳定 → 数据构造类测试优先走 API 提交

### 9.4 构建红线（交付级）
- `next.config.ts` 已移除 `ignoreBuildErrors`：`next build` 会做全量类型检查，与 `tsc --noEmit` 同门拦截类型错误
- 改完代码必跑 `node node_modules/typescript/bin/tsc --noEmit` 零错误；改 FSRS 相关需重跑 `npm run test:fsrs`（vitest + 90 天模拟）