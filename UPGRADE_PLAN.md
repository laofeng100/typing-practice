# 键英双修 · 词典数据升级开发计划（V2）

> 本文档是**第一轮开发任务的唯一执行依据**。执行者（初级模型）必须严格按阶段顺序、按文件路径、按规格实现，不得自行变更架构、字段名、接口协议。遇到本文档未覆盖的情况，先停下记录问题，不要自由发挥。
>
> 环境命令速查：
> - 类型检查：`node node_modules/typescript/bin/tsc --noEmit`（勿用 `bunx tsc`）
> - 数据库同步：`bunx prisma db push`（SQLite 无迁移，直接同步）
> - Prisma Client 生成：`bunx prisma generate`（改 schema 后必跑）
> - 导入脚本运行：`bun run scripts/import-vocab.ts`
> - 本机 SQLite 查看：`sqlite3 prisma/db/custom.db "SQL"`（注意：SQL 中字符串条件必须用**双引号**包裹，如 `WHERE stage="小学"`，否则报 `no such column`）
> - 数据源库：`dict/output/vocab.db`（只读，禁止修改）

---

## 0. 项目背景

键英双修是一款面向小学/初中生（目前 2 个孩子：弟弟、姐姐）的全栈学习应用，含单词、句子、阅读、听力、键盘练习五大英语模块。技术栈：Next.js 16 App Router + Prisma 6 + SQLite + ts-fsrs 5.4.1（FSRS-6 间隔重复算法）+ Tailwind + shadcn/ui。部署：Docker（bun standalone）+ Caddy。仓库：github.com/laofeng100/typing-practice（vocab.db 走 Git LFS）。

**本次升级目标**：
1. 用有道开源词典数据（`dict/output/vocab.db`）替换现有 6,890 词手工词库，词量扩充至 7,572 词并附带音标/例句/短语/近义词/相关词/记忆法
2. 支持"选择教材、年级"学习：孩子选人教版三年级上册，就按该教材词表+词序学习
3. FSRS-6 算法适配新词表（算法核心零改动，只改"词从哪来、按什么顺序进"）
4. 单词发音改为有道真人音频优先、系统 TTS 自动回退
5. **完全删除古诗词背诵模块**（chinese），集中力量优化英语学习
6. 设置中心同步瘦身（删中文语音配置，不新增有道配置项）

---

## 1. 深度分析结论（已核实的事实，勿重新调查）

### 1.1 vocab.db 表结构（11 张表）

| 表 | 行数 | 作用 | 本次是否导入 |
|---|---|---|---|
| books | 81 | 词书元数据（book_id 主键/版本/学段/年级/册/词数） | ✅ 仅 47 本小初高 |
| book_words | — | 词↔书关联 + 教材内词序 word_rank | ✅ |
| words | 152,965 | 一书一词条（同词多书多行） | ✅ 用于关联 |
| word_summary | 23,882 | 按 head_word 去重聚合（音标/记忆法/book_count） | ✅ 词条主数据源 |
| word_tags | 23,882 | 学段标签（is_primary/is_middle/is_high/is_zhongkao/is_gaokao） | ✅ |
| word_full | — | 冗余宽表 | ❌ 弃用 |
| meanings | 199,699 | 释义（pos/tran_cn/ord） | ✅ |
| sentences | 252,056 | 例句（en/cn/ord） | ✅ 小初高子集 56,898 条 |
| phrases | 909,106 | 短语搭配（phrase/cn/ord） | ✅ 小初高子集 240,643 条 |
| synonyms | 552,290 | 近义词（pos/word/tran_cn） | ✅ 小初高子集 106,401 条 |
| related_words | 542,525 | 相关词（pos/word/tran_cn） | ✅ 小初高子集 98,135 条 |

**关键结论**：
- 短语/近义词/相关词**确实分年级**：它们挂在 `word_id` 上，而 `word_id` 关联具体词书（`words.book_id → books.stage/grade/term`）。如人教版 3 上 `pencil` 的短语有 `pencil case 文具盒`、`pencil box 铅笔盒`。
- 同一 head_word 出现在多本书（如 `apple` 在 14 本书里），导入时必须**按 head_word 去重合并**。
- 47 本小初高词书去重后 **7,572 词**（小学 819 / 初中 3,119 / 高中 6,555，跨学段有重叠）。
- 人教版 3 上词序样例：`ruler(1) pencil(2) eraser(3) crayon(4) bag(5) pen(6) pencil box(7) book(8)` —— 教材词序即教学顺序，用于 FSRS 新词排序。
- 音标字段 `us_speech` 实际是**有道音频参数**，格式 `pharmacy&type=2`（美音）/`pharmacy&type=1`（英音），完整 URL 为 `https://dict.youdao.com/dictvoice?audio={word}&type=2`。**不需要存 URL，导入时只存 head_word，前端直接拼 URL**。
- 小学学段**只有人教版 8 本**（3 上~6 下，每册 64~156 词）；初中人教 5 本 + 外研社 6 本 + 通用 3 本；高中人教 11 本 + 北师 11 本 + 通用 3 本。

### 1.2 现有代码事实（勿改的边界）

- FSRS 卡片 `FsrsCard.cardId` 是 String，天然兼容新词表 `head_word` 主键；`session/route.ts` 的 FSRS 提交链路**不需要动**。
- `src/lib/fsrs.ts` 算法核心（21 权重/调度/评级）**一行不改**。
- 存量学习数据极少：FsrsCard 49 张（word 29 + sentence 20）、chinese 卡 **0 张**、TypingRecord 56 条 → 数据迁移零风险。
- 当前 `User.stage` 为中文（小学/初中/高中），`User.grade` 是摆设（值恒为"小升初"）。本次**保留 stage 不动**（句子/阅读/听力模块仍用），新增 `bookId` 字段。
- 设置中心目前**没有**"有道音频链接"设置项，无需删除；只有 TTS 服务器配置（env 级）与英语/中文音色配置。本次删中文配置、不加有道配置（自动切换）。

---

## 2. 总体架构决策（必须遵守）

1. **旧 `Word` 表替换为新 `WordDict` 表**（以 head_word 为主键）。旧表先建新表导完数据，最后删旧表。
2. **教材维度用 `Book` + `BookWord` 表**：一词多书天然支持；FSRS 卡以 head_word 去重，跨教材复用（apple 在 3 上学会，4 下出现仍是同一张卡）。
3. **学段晋级改为"教材推进"**：当前教材全部学完 → 自动切同版本下一册（如 3 上 → 3 下）；同一学段内按 grade/term 升序；升段时跨版本取第一本（如小学最后一册 6 下学完 → 初中人教版 7 上）。若同版本无下一本，停留在最后一本并提示"词书已学完"。
4. **复习队列跨教材**：所有已学到期卡照常复习（liveR 升序），不受教材切换影响。
5. **新词排序用 `word_rank`**（教材词序），不再用 CEFR difficulty。
6. **音频策略**：单词发音前端自动切换——有道 dictvoice 优先（免费真人发音），播放失败/超时回退 TTS synthesize。其他模块（句子/阅读/听力）维持纯 TTS。
7. **chinese 全链路删除**：前端组件/API/模型/设置键/成就/统计/脚本，一处不留。

---

## 3. 阶段 0：清理旧数据（先做，为导入腾位置）

### 0.1 导出并删除旧 Word 表数据（保留映射供迁移）

旧表数据导出存档（防呆），然后确认无引用后删除。

```bash
mkdir -p upload/backup-v2
sqlite3 prisma/db/custom.db ".mode csv" ".headers on" \
  "SELECT id, en, zh, pos, stage, difficulty FROM Word" > upload/backup-v2/word_legacy.csv
wc -l upload/backup-v2/word_legacy.csv   # 期望 6891（含表头）
```

### 0.2 删除古诗词数据

```bash
sqlite3 prisma/db/custom.db "DELETE FROM ChineseText;"   # 期望 115 行删除
# 确认 chinese 卡片为 0（应为 0，无需操作）
sqlite3 prisma/db/custom.db "SELECT count(*) FROM FsrsCard WHERE cardType='chinese';"
```

### 0.3 删除古诗词相关脚本

删除以下文件（若存在）：
- `scripts/seed-chinese.ts`
- `scripts/seed-chinese-full.ts`
- `scripts/import-data.ts`（若内容仅含 chinese 导入则删；否则保留并注释 chinese 段——由执行者检查内容后决定）

**验收**：`ls scripts/` 无 chinese 相关脚本；`sqlite3 prisma/db/custom.db "SELECT count(*) FROM ChineseText;"` 返回 0。

---

## 4. 阶段 1：建表（prisma/schema.prisma）

在 `prisma/schema.prisma` 中：

### 1.1 删除模型

- 删除 `Word` 模型（40-53 行的 `model Word` 整块）
- 删除 `ChineseText` 模型（122-142 行整块）

### 1.2 新增模型（放在原 Word 模型位置附近，注释格式与现有代码一致，中文注释）

```prisma
// ==================== 词典数据（有道开源词库导入） ====================

// 词书（教材/词表）
model Book {
  id        String  @id          // book_id，如 PEPXiaoXue3_1
  title     String               // 人教版小学英语-三年级上册
  version   String?              // 人教版/外研社版/北师版/新东方/有道
  stage     String               // primary/middle/high
  grade     Int?                 // 3~12
  term      Int?                 // 1/2
  wordCount Int?                 // 词条数
  words     BookWord[]

  @@index([stage, version])
}

// 词书-词关联（教材内词序即教学顺序）
model BookWord {
  bookId   String
  wordId   String   // head_word
  wordRank Int?
  book     Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  word     WordDict @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@id([bookId, wordId])
  @@index([wordId])
}

// 单词主表（按 head_word 去重）
model WordDict {
  id           String  @id    // head_word 小写，如 about
  en           String         // 原大小写
  zh           String         // 主释义（多个词义用 ；连接）
  pos          String         // 主词性
  usPhone      String?        // 美音音标
  ukPhone      String?        // 英音音标
  memoryMethod String?        // 记忆法
  isPrimary    Boolean        // 学段标签（word_tags）
  isMiddle     Boolean
  isHigh       Boolean
  isZhongkao   Boolean
  isGaokao     Boolean
  bookCount    Int            // 出现词书数
  examples     WordExample[]
  phrases      WordPhrase[]
  synonyms     WordSynonym[]
  related      WordRelated[]
  books        BookWord[]

  @@index([isPrimary, isMiddle, isHigh])
}

// 例句（每词取 1~3 条）
model WordExample {
  id     Int    @id @default(autoincrement())
  wordId String
  en     String
  cn     String
  ord    Int
  word   WordDict @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([wordId])
}

// 短语搭配（每词取前 5 条）
model WordPhrase {
  id     Int    @id @default(autoincrement())
  wordId String
  phrase String
  cn     String
  ord    Int
  word   WordDict @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([wordId])
}

// 近义词
model WordSynonym {
  id     Int    @id @default(autoincrement())
  wordId String
  pos    String?
  word   String
  tranCn String?
  word2  WordDict @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([wordId])
}

// 相关词
model WordRelated {
  id     Int    @id @default(autoincrement())
  wordId String
  pos    String?
  word   String
  tranCn String?
  word2  WordDict @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([wordId])
}
```

### 1.3 修改 User 模型

在 `model User` 的 `grade` 字段后新增：

```prisma
  bookId    String   @default("PEPXiaoXue3_1") // 当前学习教材（人教版小学三年级上册）
```

### 1.4 同步数据库

```bash
bunx prisma db push
bunx prisma generate
```

**验收**：`sqlite3 prisma/db/custom.db ".tables"` 出现 `Book`、`BookWord`、`WordDict`、`WordExample`、`WordPhrase`、`WordSynonym`、`WordRelated`，且无 `Word`、`ChineseText`（0.1 步导出后 db:push 会删除旧表；若旧表仍存在，手动 `DROP TABLE Word; DROP TABLE ChineseText;`）。`User` 表有 `bookId` 列，默认 `PEPXiaoXue3_1`。

> ⚠️ 陷阱：db:push 删除旧表前如担心数据，先完成 0.1 导出。**先建新表，最后确认无误后再删旧表**（即本节删模型步骤可延后到阶段 2 验收后执行，顺序：先加新模型 push → 导数据 → 验证 → 再删旧模型 push）。

---

## 5. 阶段 2：导入数据与验证

### 2.1 编写导入脚本 `scripts/import-vocab.ts`

**脚本语言**：TypeScript，用 bun 运行。读取源库用 `bun:sqlite`（bun 内置，无需装依赖）：

```ts
import { Database } from 'bun:sqlite'
import { PrismaClient } from '@prisma/client'

const src = new Database('dict/output/vocab.db', { readonly: true })
const db = new PrismaClient()
```

**导入步骤（严格按序）**：

1. **books**：`SELECT book_id, title, version, stage, grade, term, word_count FROM books WHERE stage IN ('primary','middle','high')` → upsert Book。共 47 行。
2. **词条主体**：以 `word_summary` 为骨架，只保留出现在小初高词书中的 head_word：
   ```sql
   SELECT DISTINCT w.head_word
   FROM words w JOIN books b ON w.book_id = b.book_id
   WHERE b.stage IN ('primary','middle','high')
   ```
   对每个 head_word，从 `word_summary` 取 `us_phone/uk_phone/memory_method/display/book_count`；从 `word_tags` 取 5 个布尔标签（值为 1 则 true）；从 `words` 表任取一条非空 `zh` 的主释义来源：
   - 释义：`SELECT pos, tran_cn FROM meanings m JOIN words w ON m.word_id=w.word_id WHERE w.head_word=? AND m.tran_cn IS NOT NULL AND m.tran_cn != '' GROUP BY pos, tran_cn ORDER BY m.ord LIMIT 8` → 主释义 zh = 各 tran_cn 用 `；` 连接；pos = 第一个非空 pos。
   - 学段标签优先用 word_tags（is_primary 等）；若 head_word 在 word_tags 缺失（理论不发生），回退用 book 关联判定：出现于 stage=primary 的书 → isPrimary=true，依此类推。
3. **book_words**：`SELECT book_id, word_id, word_rank FROM book_words bw JOIN words w ON bw.word_id=w.word_id WHERE bw.book_id IN (小初高47本)` → BookWord（wordId 用 w.head_word 而不是 word_id！注意 word_id 格式为 `书ID_序号`，必须 join words 表取 head_word）。
4. **examples**：按 head_word 聚合取 ord 最小的 3 条：
   ```sql
   SELECT w.head_word, s.en, s.cn, s.ord
   FROM sentences s JOIN words w ON s.word_id = w.word_id
   WHERE w.head_word IN (词表) AND s.en IS NOT NULL AND s.en != ''
   ```
   组内按 ord 排序取前 3，WordExample.ord 用 0/1/2。
5. **phrases**：同上聚合，每词取 ord 前 5（短语表量大，240,643 条全导太多，限每词 5 条）。
6. **synonyms**：每词全量（一般每词 <15 条），`pos/word/tran_cn` 字段照搬。
7. **related_words**：同 synonyms。
8. **迁移旧学习数据**（关键！）：
   - 从 `upload/backup-v2/word_legacy.csv`（0.1 步）读取旧 id→en 映射；或从旧库直接查（若旧表已删则读 csv）。
   - 旧 en 规范化：`trim().toLowerCase().replace(/[()=,]/g, ' ').replace(/\s+/g, ' ').trim()`，与新 head_word 精确匹配。
   - `FsrsCard` 中 `cardType='word'` 的卡：cardId 匹配成功 → 更新 `cardId = head_word`；匹配失败（如 `bike (=bicycle)` 这类复合词）→ 删除该卡及其 FsrsReview。
   - `TypingRecord` 中 `cardType='word'` 的卡：同样更新 cardId；失败的不动（历史记录不删）。
   - 最后删除孤儿卡：`FsrsCard` 中 cardType='word' 且 cardId 仍是纯数字的（防漏网）。
9. **统计输出**：脚本结束时打印各表导入行数与耗时。

**性能要求**：导入用批量 upsert（`createMany` 或事务分批，每批 500 条）；全程预计 <2 分钟。禁止逐词 await 单条插入（7,572 词 × 多条内容会慢 10 倍+）。

### 2.2 运行与验证

```bash
bun run scripts/import-vocab.ts
```

**验收 SQL（期望值对照）**：

```bash
sqlite3 prisma/db/custom.db "
SELECT 'books', count(*) FROM Book
UNION ALL SELECT 'bookwords', count(*) FROM BookWord
UNION ALL SELECT 'words', count(*) FROM WordDict
UNION ALL SELECT 'examples', count(*) FROM WordExample
UNION ALL SELECT 'phrases', count(*) FROM WordPhrase
UNION ALL SELECT 'synonyms', count(*) FROM WordSynonym
UNION ALL SELECT 'related', count(*) FROM WordRelated;
"
```

| 表 | 期望范围 |
|---|---|
| Book | 47 |
| BookWord | 约 9,900（47 本书词条数之和，见 books.word_count 总和） |
| WordDict | 7,572 |
| WordExample | 约 1.5 万~2.2 万（7,572 词 × 平均 2-3 条） |
| WordPhrase | 约 2.5 万~4 万（每词 ≤5 条） |
| WordSynonym | ≥ 7,572（有近义词的词） |
| WordRelated | ≥ 7,572 |

抽查：
```bash
sqlite3 prisma/db/custom.db "SELECT id, en, usPhone, zh FROM WordDict WHERE id='about';"
# 期望：about | about | 音标非空 | 释义含"关于"
sqlite3 prisma/db/custom.db "SELECT wordId, wordRank FROM BookWord WHERE bookId='PEPXiaoXue3_1' ORDER BY wordRank LIMIT 8;"
# 期望：ruler/1, pencil/2, eraser/3, crayon/4, bag/5, pen/6, pencil box/7, book/8
sqlite3 prisma/db/custom.db "SELECT count(*) FROM FsrsCard WHERE cardType='word' AND cardId NOT GLOB '*[0-9]*';"
# 期望：迁移后 word 卡全部为 head_word（非纯数字），数量与迁移前一致或更少（删掉的孤儿）
```

### 2.3 旧表清理收尾

确认 2.2 验收通过后：在 schema.prisma 删除旧 `Word`、`ChineseText` 模型 → `bunx prisma db push` → `bunx prisma generate`。再次确认 `Word`、`ChineseText` 表已消失。

**本阶段完成标准**：验收 SQL 全部通过；旧表已删；fsrsCard word 卡已迁移为 head_word。

---

## 6. 阶段 3：FSRS-V6 适配（服务端逻辑）

### 3.1 新增 `src/app/api/books/route.ts`

作用：词书列表 + 进度 + 选择当前教材。GET 返回：

```json
{
  "books": [ { "id": "PEPXiaoXue3_1", "title": "...", "version": "人教版",
               "stage": "primary", "grade": 3, "term": 1, "wordCount": 64,
               "learned": 10 } ],
  "currentBookId": "PEPXiaoXue3_1"
}
```

- `learned`：当前用户 fsrsCard(cardType='word', state>0) 中 cardId ∈ 该教材词集的计数。**禁止 N+1**：先 `db.bookWord.findMany({ where: { bookId: { in: bookIds } }, select: { wordId: true, bookId: true } })` 建内存 Map，再 `db.fsrsCard.findMany({ where: { userId, cardType: 'word', state: { gt: 0 } }, select: { cardId: true } })` 在内存算交集。
- 按 stage（primary→middle→high）、grade、term 排序返回。
- `currentBookId` 取 `user.bookId`，若该值不在 books 中（数据异常）则返回第一本。

PATCH（body `{ bookId }`）：校验 bookId 存在于 Book 表 → `db.user.update({ data: { bookId } })` → 返回更新结果。

### 3.2 重写 `src/app/api/word/route.ts` 的取词逻辑

**只改新词部分与统计部分，复习部分（37-54 行）与提交链路不动。**

- 删除 `STAGE_ORDER` 常量（第 8 行），改为从 Book 表推导顺序。
- **新词候选**（替换 83-150 行）：
  ```ts
  const currentBook = await db.book.findUnique({ where: { id: user.bookId } })
  const candidates = await db.wordDict.findMany({
    where: { books: { some: { bookId: currentBook.id } } },
    select: { id: true, en: true, zh: true, pos: true, usPhone: true, ukPhone: true, memoryMethod: true,
              examples: { take: 3, orderBy: { ord: 'asc' } },
              phrases: { take: 5, orderBy: { ord: 'asc' } },
              synonyms: true, related: true,
              books: { where: { bookId: currentBook.id }, select: { wordRank: true } } },
  })
  // 按 wordRank 排序（无 rank 的排最后），内存过滤已学
  ```
  **注意**：Prisma SQLite 不支持嵌套过滤后的 orderBy，必须在内存按 `books[0].wordRank` 排序。candidateBatch 改为 `Math.min(settings.wordBatchSize * 5, 300)`，翻页逻辑（129-140 行 while 循环）保留但条件改为 `books.some bookId` + skip/take。
- **晋级逻辑**（替换 98-126 行）：当前教材剩余未学数 = 0 时：
  1. 查同 version、同 stage、grade/term 升序的下一本 → 有则 `user.bookId = 下一本`，`stageUpgraded=true`，取新教材候选。
  2. 无同版本下一本 → 跨学段：查下一 stage 的第一本（排序规则同 books API）→ 更新 bookId。
  3. 无下一本（高中最后一本）→ 停留，`stageUpgraded=false`，新词为空。
- **统计**（替换 182-195 行）：
  - `currentStageTotal` → `currentBookTotal`（当前教材词条数，用 `db.bookWord.count({ where: { bookId } })` 或 Book.wordCount）
  - `currentStageLearned` → 内存交集（该教材词集 ∩ 已学卡）
  - `totalWordsCurrent` → 当前及之前所有教材的**去重词总数**（可选：用 `db.wordDict.count()` 近似，仅展示用）
  - `currentStage` → 响应中新增 `currentBook: { id, title, version, grade, term }`；保留 `currentStage`（映射：primary→小学、middle→初中、high→高中，供前端兼容显示）
- 复习词详情查询（152-180 行）：`db.word` → `db.wordDict`，`dueIds` 不再 parseInt，直接 `where: { id: { in: dueIds } }`（dueIds 已是字符串数组）；返回字段补 `usPhone/ukPhone/memoryMethod/examples/phrases/synonyms/related`（复习时也能看音标例句）。
- 新词/复习词响应字段：每个词对象含 `id, en, zh, pos, usPhone, ukPhone, memoryMethod, examples, phrases, synonyms, related, wordRank`（保持 snake→camel 与前端约定）。

### 3.3 修改 `src/app/api/mistakes/route.ts`

- 第 42 行：`db.word.findMany` → `db.wordDict.findMany`，`select` 补 `usPhone: true`。
- `idsOf('word')` 逻辑：若内部对 word 类型做 `parseInt`，改为直接取字符串 cardId（查实后修改）。

### 3.4 修改 `src/app/api/practice/focused/route.ts`

- 第 82 行：`where: { stage: user.stage }` → 改为**当前教材**：`where: { books: { some: { bookId: user.bookId } } }`，select 补 `en, zh, pos, usPhone`。
- 第 114 行：`db.word` → `db.wordDict`；`weakIds` 若 parseInt 则改为字符串。

### 3.5 修改 `src/lib/achievements.ts`

- 第 49 行 `chineseDone` 统计删除；`computeAchievements` 返回值中删除 `chineseDone` 字段。
- 删除 `cn_5`（诗书少年）、`cn_20`（国学达人）两个成就（140-143 行）。
- `wordLearned` 等基于 fsrsCard.count 的逻辑不变（cardType 仍是 'word'）。

### 3.6 修改 `src/app/api/stats/achievements/route.ts`

- 第 49 行附近：删除 `chineseDone: metrics.chineseDone` 传参。

### 3.7 修改 `src/app/api/stats/report/route.ts`

- 第 29 行：`cardType: { in: ['word', 'sentence', 'chinese'] }` → `['word', 'sentence']`。

### 3.8 修改 `src/app/api/dashboard/route.ts`

- 第 41 行：`FSRS_TYPES = ['word', 'sentence', 'chinese']` → `['word', 'sentence']`。
- dashboard 响应可加 `currentBookTitle`（`db.book.findUnique(user.bookId)`），供首页展示（可选，若加则前端同步）。

### 3.9 修改 `src/app/api/session/route.ts`

- 第 20 行：`VALID_MODULES` 删除 `'chinese'`。
- 第 23 行：`FSRS_CARD_TYPES` 改为 `['word', 'sentence']`。
- 第 65 行附近 `finalScene` 默认 `'chinese'` → `'word'`（tts/synthesize 第 65 行，`const finalScene = scene || (isChinese ? 'chinese' : 'word')` 中的 `'chinese'` 改 `'word'`；isChinese 分支保留——阅读/听力模块无中文，但代码健壮性保留）。

**FSRS 算法核心（lib/fsrs.ts）零改动**。`session/route.ts` 的 `updateFsrsCard` 零改动。

---

## 7. 阶段 4：页面新增/修改/优化

### 7.1 `src/components/practice/word-module.tsx`

**接口调整**：`WordItem` 接口（16-28 行）扩展：
```ts
usPhone?: string; ukPhone?: string; memoryMethod?: string
examples?: { en: string; cn: string }[]
phrases?: { phrase: string; cn: string }[]
synonyms?: { word: string; tranCn?: string }[]
related?: { word: string; tranCn?: string }[]
```

**A. 词书选择器（选择页顶部新增，在"学段晋级提示"之前）**：
- 加载：`fetch('/api/books')`，按 stage 分组渲染（小学/初中/高中 三个 section）。
- 每个 section：标题 + 该学段教材横向滚动卡片列表；卡片显示 `书名（3上）· 64词 · 已学10`；当前教材高亮边框 + "学习中" 徽章。
- 点击其他教材：`PATCH /api/books { bookId }` → 成功后刷新列表 + `onProgress?.()`；提示 toast "已切换到 xxx"。切换不打断已学卡片（复习队列照常）。
- 教材切换后 `stats` 重新拉取（进入选择页时 loadQueue 不自动触发，选择页首次渲染 `fetch('/api/word?mode=mixed')` 拉 stats——沿用现有模式即可，确认 stats 在切书后刷新）。

**B. 练习词卡增强（470-504 行区域）**：
- 中文释义下方加音标行（美音优先）：`/<span className="font-mono text-sm text-muted-foreground">{usPhone || ukPhone}</span>/`，无音标不显示。
- 新词（isNewWord）时若 `memoryMethod` 存在，释义区下方显示：`📝 {memoryMethod}`（text-xs text-amber-600）。
- 完成后（input 与 en 完全相等时）在词卡底部追加折叠面板（默认展开）：
  - 例句区：`examples.slice(0,2)` 每条一行 `en`（font-mono）+ `cn`（text-muted-foreground）
  - 短语区：`phrases` 前 3 条，Badge 样式平铺
  - 近义词/相关词：合并一行 `同：word1 / word2`（有 tranCn 则 tooltip 或括号显示）
- **注意**：折叠面板增加词卡高度，确保不遮挡输入框——面板放在输入框**下方**。

**C. 进度统计（299-348 行）**：
- "学段"字样改为教材名：`{stats.currentBook?.title || user.stage}学段` → 直接用 `currentBook.title` 截断显示（如"人教版小学英语-三年级上册"→"三年级上册"？**不做截断**，用完整 title，小字号）。
- 进度条标题同改。
- 晋级提示文案（289-297 行）：改为 `🎉 已学完「{上一本title}」！自动进入「{新title}」`；最后一本时显示 `已学完全部词书`。

**D. 结果页错词列表（685-693 行）**：加音标 `<span className="text-xs text-muted-foreground font-mono">{r.usPhone}</span>`（newResult 对象 165-179 行补 `usPhone: currentWord.usPhone`）。

**E. 学段说明卡（413-424 行）**：改为展示当前教材信息 + "共 47 本词书可选" 引导文字，指向 A 的词书选择器。

### 7.2 `src/components/app/settings-panel.tsx`

- 删除"中文语音配置"整个区块（622-635 行附近，含 cnVoiceId/cnSpeed/cnVol/cnPitch/停顿时长 5 项输入）。
- "英语语音配置"区块保留。
- TTS 服务器说明文字（571 行附近）保留。
- 若设置面板有"学段"展示（688 行附近 `user.stage`），旁边补充当前教材名（`user.bookId` 需由父级传下或从 dashboard 数据取——检查 `SettingsPanel` props，若有 `user` 则后端 User 已含 bookId）。

### 7.3 `src/components/app/dashboard.tsx`（若展示 chinese 相关内容）

- 检查 dashboard 是否展示古诗词统计/入口，有则删除；无则不动。

---

## 8. 阶段 5：完全删除古诗词背诵（chinese）

按以下清单**逐文件**删除/修改（grep 验证无残留引用后再继续）：

| 文件 | 操作 |
|---|---|
| `src/components/practice/chinese-module.tsx` | 整文件删除 |
| `src/app/api/chinese/route.ts` | 整文件删除（含空目录） |
| `src/components/app/app-shell.tsx` | ① 删 import ChineseModule；② NAV_ITEMS 删 chinese 项（48 行）；③ MODULE_GROUPS 删 '中文练习'；④ renderView 删 case 'chinese'（174-175 行）；⑤ mistakes onPractice 回调删 chinese 分支（221 行），注释同步更新（218 行文案"单词/句子/古诗词"→"单词/句子"）；⑥ 若 '中文练习' 组删空后无残留引用，Languages 图标 import 若不再使用一并删除 |
| `src/lib/settings.ts` | 删除 DEFAULT_SETTINGS 中 cn 系列 6 键（cnVoiceId/cnSpeed/cnVol/cnPitch/cnPauseDouHao/cnPauseJuHao/cnPauseDunHao——共 7 键）；getRawSettings 中对应 7 行读取删除 |
| `src/lib/achievements.ts` | 见 3.5 |
| `src/app/api/stats/achievements/route.ts` | 见 3.6 |
| `src/app/api/stats/report/route.ts` | 见 3.7（其中 chinese 卡过滤） |
| `src/app/api/dashboard/route.ts` | 见 3.8 |
| `src/app/api/session/route.ts` | 见 3.9 |
| `src/app/api/data/reset/route.ts` | 第 82 行 `chineseText: await db.chineseText.count()` 删除（preserved 对象中） |
| `src/components/practice/mistake-book.tsx` | 检查 chinese 类型映射（type 映射表/卡片类型过滤），删除 chinese 分支 |
| `src/components/practice/focused-practice.tsx` | grep 'chinese'，有则删 |
| `src/components/practice/listening-module.tsx` / `reading-module.tsx` | grep 'chinese'，有则删（预期无） |
| `prisma/schema.prisma` | ChineseText 模型（已在 1.1 删除） |
| `scripts/seed-chinese*.ts` | 已在 0.3 删除 |

**残留检查（必须全部为 0）**：
```bash
grep -rn "chinese" src/ --include="*.ts" --include="*.tsx" -i | grep -v "// " | grep -v "ListeningArticle" || echo "无残留"
grep -rn "ChineseText\|ChineseModule\|/api/chinese" src/ scripts/ || echo "无残留"
```
（`listening`/`reading` 模块的 contentZh 等与 chinese 无关，允许出现；最终以人工确认输出为准。）

---

## 9. 阶段 6：音频自动切换（有道 dictvoice → TTS 回退）

### 9.1 修改 `src/components/practice/tts-player.tsx`

**新增能力**：`useTTS().speak(text, lang, options)` 的 options 增加 `source?: 'auto' | 'tts'`，默认 `'tts'`（老行为不变，保证句子/阅读/听力零影响）。

`source === 'auto'` 且 `lang === 'en'` 时：
1. 构造有道 URL：`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`（type=2 美音；type=1 英音——先统一美音）。
2. `const audio = new Audio(url)`；绑定 `onerror` → 调用内部 `playViaTts(text, lang, options)`（即原有 synthesize 链路）。
3. 加**超时兜底**：`setTimeout(8s)` 内若未触发 `onloadeddata` 且未 error → 手动回退 TTS（`audio.pause(); audio.src=''` 后走 TTS）。
4. `onended/onpause` 等状态管理沿用现有实现（playing 状态、audioRef 清理）。
5. **缓存**：现有 `cacheRef` 只缓存 synthesize 返回 URL；有道 URL 天然可缓存（浏览器 HTTP 缓存），无需额外处理。
6. TTSButton 组件（同文件）若接受 options 则透传；`word-module.tsx` 中所有单词播放点传 `{ scene: 'word', source: 'auto' }`：
   - 自动播放（104 行 `tts.speak(currentWord.en, 'en', { scene: 'word' })`）
   - TTSButton（488 行）
   - 空格快捷键（120 行）、播放按钮（568 行）

### 9.2 服务端零改动

- 有道音频直连浏览器播放（媒体元素无需 CORS），**不需要**新增代理 API。
- `/api/tts/synthesize`、`/api/tts/audio` 保持现状（回退链路复用）。
- `.env` 无需新增配置。

**验收**：
- 单词发音：网络正常时约 <1s 出音（有道真人发音），开发者工具 Network 可见 `dict.youdao.com/dictvoice` 请求。
- 断网/该词有道无音频（如超长短语）时：自动回退 TTS，`/api/tts/synthesize` 请求出现，播放正常。
- 句子/阅读/听力模块发音行为与升级前完全一致（纯 TTS）。

---

## 10. 阶段 7：设置中心优化收尾

- 确认 7.2 已删中文语音配置。
- **不新增**"有道音频链接"配置项（需求 7 条明确：自动切换，不单独设置）。
- 检查设置面板其它文案是否提及古诗词（"古诗文停顿更长"注释在 settings.ts 已随 cn 键删除；settings-panel 内文案 grep '古诗' 清理）。
- `settings-panel.tsx` 若读取 cn 键（更新面板函数 update('cnVoiceId', ...) 等），全部删除；提交保存逻辑若含 cn 键一并清理。

---

## 11. 阶段 8：集成测试与打磨

### 11.1 静态检查

```bash
node node_modules/typescript/bin/tsc --noEmit
# 允许失败项：仅 scripts/ 目录下历史遗留 5 个 "e is unknown" 错误（AGENTS.md 已豁免）
# 新增错误必须为 0
```

### 11.2 构建

```bash
bun run build   # Next.js production build 必须通过
```

### 11.3 手工功能测试清单（bun run dev 逐项过）

| # | 场景 | 步骤 | 期望 |
|---|---|---|---|
| 1 | 登录 | 两个账号各登录 | 正常进入概览 |
| 2 | 单词-选择页 | 进入单词练习 | 显示词书选择器；当前教材高亮"人教版小学英语-三年级上册"；进度统计正常（totalWords 7,572 级） |
| 3 | 切换教材 | 点击"外研社版初中英语-七年级上册" | toast 成功；进度刷新；再次进入仍是该教材 |
| 4 | 学习新词 | 学习新词模式 | 出词顺序符合 wordRank（ruler→pencil→eraser…）；词卡显示音标/记忆法；完成后显示例句/短语 |
| 5 | 单词发音 | 点发音按钮 | 有道音频播放；Network 有 dictvoice 请求 |
| 6 | 发音回退 | 断网后点发音 | 自动走 TTS 合成并播放 |
| 7 | 复习 | 复习旧词 | 已学卡正常出现；词卡含音标；评级提交成功 |
| 8 | 错词再战 | 故意打错若干词 | 结果页错词列表含音标；再战按钮正常 |
| 9 | 错题本 | 错题本页 | 无 chinese 类型条目；点击单词条目进入专项练习 |
| 10 | 专项练习 | 单词专项 | 取词来自当前教材；音标显示 |
| 11 | 成就 | 成就页 | 无"诗书少年/国学达人"；单词/句子成就正常 |
| 12 | 学习报告 | 报告页 | 无中文类别；图表正常 |
| 13 | 设置中心 | 设置页 | 无中文语音配置；英语配置正常保存 |
| 14 | 数据重置 | 设置→清除数据 | 成功；用户 bookId 重置为 PEPXiaoXue3_1（reset 路由 71 行 `data: { stage: '小学', grade: '小升初' }` 需追加 `bookId: 'PEPXiaoXue3_1'`——**重要：reset/route.ts 也要改**） |
| 15 | 导航 | 侧边栏/移动端底部栏 | 无"古诗词背诵"入口；无"中文练习"分组 |

### 11.4 数据一致性专项

- `FsrsCard` 无 cardType='chinese' 残留：`SELECT count(*) FROM FsrsCard WHERE cardType='chinese';` = 0
- `TypingRecord` 无 module='chinese' 残留：`SELECT count(*) FROM TypingRecord WHERE module='chinese';` = 0（升级前为 0，确认即可）
- 用户 bookId 有效：`SELECT name, bookId FROM User;` 两行均为合法 book_id

### 11.5 打磨项

- 词书选择器在移动端宽度下的换行/滚动表现（卡片横向滚动 scroll-thin）。
- 词卡增强后 100% 进度条与输入框的布局无错位（重点检查有例句/短语时）。
- 音标为空词的展示兜底（不渲染空 `//`）。
- 全词提示/错误复习流程不因新增面板受影响（回归 136-148 行逻辑）。

---

## 12. Git 提交规范

- 每完成一个阶段提交一次，commit message 前缀：`v2: 阶段N 描述`（如 `v2: 阶段2 导入词典数据`）。
- 提交前跑 `node node_modules/typescript/bin/tsc --noEmit`。
- 禁止 `git push --force`；禁止改动 `.env`、`dict/output/vocab.db`（LFS 大文件）。
- 数据库文件 `prisma/db/custom.db` 已在 .gitignore（`*.db`），导入后**不会**进 git；部署时在服务器上运行一次导入脚本即可（Dockerfile 不动，部署流程见 DEPLOY.md）。

## 13. 已知陷阱（执行者必读）

1. **SQLite 字符串条件必须双引号**：`WHERE stage="小学"`，否则 `no such column`。
2. **Prisma SQLite 不支持 `notIn` 大数组**（参数上限），已有代码用"查已学 ID + 内存过滤"模式，新代码沿用。
3. **`book_words.word_id` 不是 head_word**：是 `书ID_序号` 格式，导入 BookWord 时必须 join words 表转 head_word。
4. **同词多书**：apple 在 14 本书 → WordDict 只 1 行；BookWord 14 行。导入按 head_word upsert 时注意去重。
5. **词条含短语**：head_word 可能是 `pencil box`、`do morning exercise` 等多词短语，`encodeURIComponent` 后有道音频 URL 仍有效，TTS 回退按整串合成。
6. **prisma db push 删表不可逆**：0.1 导出备份先行；1.4 与 2.3 的顺序不可颠倒（先建新表导数据，后删旧表）。
7. **fsrsCard 迁移必须做**：漏做会导致 word 卡查词查不到（parseInt 数字查 head_word 主键返回空），复习队列空转。
8. **books API 进度统计禁止 N+1**：一次拉全部 BookWord + 一次拉全部已学卡，内存算交集。
9. **tts-player 回退必须带超时**：仅 onerror 不够，有道对部分词可能 hang 住（不发 error 也不加载），8s 超时兜底。
10. **reset/route.ts 要重置 bookId**（见 11.3 #14），漏改会导致清除数据后教材悬空。

## 14. 完成定义（Definition of Done）

- [ ] 11.1 tsc 通过（仅 scripts 豁免项）
- [ ] 11.2 production build 通过
- [ ] 11.3 15 项手工测试全部通过
- [ ] 11.4 数据一致性 SQL 全部为期望值
- [ ] 阶段 2 验收 SQL 数字与期望范围一致
- [ ] `grep -rn "chinese" src/` 无残留（除注释豁免项）
- [ ] 每个阶段一次 git commit，message 符合 12 节规范
