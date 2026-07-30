# 中小学英语词库数据卡 (AI 友好版)

> 本文档专为 AI 助手阅读。读完本文，你应能不打开 schema 文件，直接使用本数据库完成 90% 的常见任务。

---

## TL;DR

- **数据源**: **kajweb/dict** (有道背单词) GitHub 公开仓库 (https://github.com/kajweb/dict) — **完整 81 本全部导入**
- **覆盖范围**: 中国小学 / 初中 / 高中 / CET4 / CET6 / 考研 / 雅思 / 托福 / GRE / SAT / GMAT / BEC / 专四 / 专八, **14 大类**
- **规模**: 81 本词书 / 152,965 词条(单词×词书) / 23,882 unique 单词 / 199,699 释义 / 252,056 例句 / 909,106 短语
- **存储格式**: SQLite 3 (单文件 `vocab.db`, ~317 MB)
- **生产用途**: 闪卡 / 教材同步 / 词典 / 词频分析 / 全龄段英语学习
- **不适合**: 实时翻译、英文写作辅助、跨语言对齐

### 数据完整性

> ✅ **kajweb/dict 全部 81 本词书已完整导入** (中小学 47 本 + 大学/出国考试 34 本)
> ⚠️ 其他 GitHub 词典项目 (如 `skywind3000/ECDICT`、`LinXueyuanStdio/DictionaryData`、`openetymology/OpenEtymology`) **仅在调研阶段讨论过, 未实际下载或导入本数据库**。如需使用, 需单独获取并整合。

### 学段分布 (按 books.stage 聚合)

| 学段 | 词书 | 收录数 |
|------|------|-------|
| 小学 (primary) | 8 | 849 |
| 初中 (middle, 含中考必备) | 14 | 9,090 |
| 高中 (high, 含高考必备) | 25 | 16,840 |
| CET4 | 5 | 12,409 |
| CET6 | 4 | 6,879 |
| 考研 (kaoyan) | 4 | 10,941 |
| 雅思 (ielts) | 3 | 10,429 |
| 托福 (toefl) | 2 | 13,476 |
| GRE | 2 | 13,714 |
| GMAT | 3 | 9,555 |
| SAT | 2 | 8,887 |
| 专四 (level4) | 4 | 9,240 |
| 专八 (level8) | 3 | 25,078 |
| BEC | 2 | 5,578 |

> **注**: 同一词可在多本词书出现, 上面"收录数"按 (book, word) 累加; 真实 unique 词只有 23,882 个。

### 音标覆盖

| 维度 | 数字 | 说明 |
|------|------|------|
| words 表 (单本词书) 美音 | 90.0% | 19,528 / 21,696 (中小学 47 本) |
| word_summary unique 词有美音 | **93.4%** | 22,310 / 23,882 (含 fuzzy 补) |
| fuzzy 补全的词 | 1,730 | 来源: 同词在其他词书的音标 |
| 仍无音标的词 | 1,572 | 主要是人名/专名/短语, 不需要音标 |

---

## 一、数据库结构 (一眼看懂)

### 1.1 全景图

```
                    ┌──────────┐
                    │  books   │  81 本词书
                    └─────┬────┘
                          │ book_id
                          │
                    ┌─────▼────┐
                    │  words   │  152,965 行 (单词 × 词书)
                    └─────┬────┘
                           │ word_id
       ┌───────────┬───────┼───────┬───────────┐
       │           │       │       │           │
   ┌───▼──┐   ┌───▼──┐ ┌──▼──┐ ┌──▼───┐  ┌────▼────┐
   │mean. │   │sent. │ │phr. │ │syno. │  │rel_word │
   └──────┘   └──────┘ └─────┘ └──────┘  └─────────┘
   199,699   252,056   909,106  552,290   542,525
```

### 1.2 物化表/视图层

| 表/视图 | 用途 | 用法 |
|---------|------|------|
| `books` | 词书元信息 (81 本, stage 区分学段) | `SELECT * FROM books` |
| `words` | 单词主表(per book), 152,965 行 | `SELECT * FROM words WHERE book_id='PEPGaoZhong_1'` |
| `meanings` | 释义, 199,699 行 | `SELECT * FROM meanings WHERE word_id=?` |
| `sentences` | 例句, 252,056 行 | `SELECT * FROM sentences WHERE word_id=?` |
| `phrases` | 短语, 909,106 行 | `SELECT * FROM phrases WHERE word_id=?` |
| `synonyms` | 同近义词 | `SELECT * FROM synonyms WHERE word_id=?` |
| `related_words` | 同根词 | `SELECT * FROM related_words WHERE word_id=?` |
| `book_words` | 词书-单词关系 | `SELECT * FROM book_words` |
| **`word_summary`** ⭐ | **全局词视图, 23,882 unique 词** (推荐用于闪卡) | `SELECT * FROM word_summary WHERE head_word='cancel'` |
| **`word_tags`** ⭐ | **学段/考试标签表** (推荐用于选词) | `SELECT * FROM word_tags WHERE is_primary=1` |
| `word_full` | 单本词书完整信息 (教材同步用) | `SELECT * FROM word_full WHERE book_id='PEPGaoZhong_1'` |
| `db_meta` | 数据库元信息 | - |

---

## 二、核心表详细定义

### 2.1 `books` (词书元信息, 81 行)

```sql
CREATE TABLE books (
    book_id   TEXT PRIMARY KEY,    -- 例: 'PEPGaoZhong_1', 'CET4_3'
    title     TEXT NOT NULL,       -- 例: '人教版高中英语-必修1'
    publisher TEXT,                -- '人教版' / '有道词典' / '新东方' / '有道考神' / '北师版' / '外研社版'
    stage     TEXT,                -- 见下表, 14 种值
    grade     INTEGER,             -- 3-12, 0 表示通用
    term      INTEGER,             -- 学期 1/2, 0 表示通用
    version   TEXT,                -- '人教版' / '北师版' / '外研社版' / '有道' / '新东方'
    word_count INTEGER             -- 该词书收录的单词数
);
```

**stage 取值**: `primary` / `middle` / `high` / `cet4` / `cet6` / `kaoyan` / `ielts` / `toefl` / `gre` / `gmat` / `sat` / `bec` / `level4` / `level8`

**book_id 命名规则**:
- `PEPXiaoXue<年级>_<学期>` 例: `PEPXiaoXue3_1` (三年级上册)
- `PEPChuZhong<年级>_<学期>` 例: `PEPChuZhong7_2` (七年级下册)
- `PEPGaoZhong_<编号>` 例: `PEPGaoZhong_1` (必修1) ~ `PEPGaoZhong_11` (选修11)
- `BeiShiGaoZhong_<编号>` 例: `BeiShiGaoZhong_3` (北师版必修3)
- `WaiYanSheChuZhong_<编号>` 例: `WaiYanSheChuZhong_1` (外研社七上)
- `ChuZhong_2/luan_2/3` 通用初中词书
- `GaoZhong_2/luan_2/3` 通用高中词书
- `CET4_1/2/3/luan_1/luan_2` 四级
- `CET6_1/2/3/luan_1` 六级
- `KaoYan_1/2/3/luan_1` 考研
- `IELTS_2/3/luan_2` 雅思
- `TOEFL_2/3` 托福
- `GRE_2/3`, `SAT_2/3`, `GMAT_2/3/luan_2` 等
- `Level4_1/2/luan_1/luan_2` 专四
- `Level8_1/2/luan_2` 专八
- `BEC_2/3` 商务英语

### 2.2 `words` (单词主表, 152,965 行)

**注意**: `word_id` 是 **per (book, word)** 唯一的，不是全局唯一的单词 id。同一个 "cancel" 在 5 本词书里就有 5 个 word_id。

```sql
CREATE TABLE words (
    word_id           TEXT PRIMARY KEY,   -- 例: 'PEPGaoZhong_1_5'
    head_word         TEXT NOT NULL,      -- 小写主键, 例: 'cancel'
    head_word_display TEXT NOT NULL,      -- 原大小写显示, 例: 'Cancel'
    book_id           TEXT NOT NULL,      -- 外键 books
    word_rank         INTEGER,            -- 在该词书中的序号 (1, 2, 3, ...)
    us_phone          TEXT,               -- 美式音标, 例: "'kænsl"
    uk_phone          TEXT,               -- 英式音标, 例: "'kæns(ə)l"
    us_speech         TEXT,               -- 有道音频API参数(美)
    uk_speech         TEXT,               -- 有道音频API参数(英)
    memory_method     TEXT,               -- 记忆口诀
    star              TEXT                -- 新东方星标(1-5)
);
```

**音标约定**:
- 前缀 `'` 表示重音符号
- `ə` 为 schwa
- `ɚ` / `ɝ` 是美式 r 化元音
- `ɪ` / `ʊ` 短元音
- 极少数情况音标为空 (主要是 OCR 错误词, 已在 word_summary 用 fuzzy 补全)

**音频 URL 拼装** (有道公开 API):
```python
def audio_url(word, accent='us'):
    type_id = 2 if accent == 'us' else 1
    return f"https://dict.youdao.com/dictvoice?audio={word}&type={type_id}"
```

**head_word vs head_word_display**:
- `head_word` 全部小写, 跨词书归一化用
- `head_word_display` 保留原大小写 (Cancel / APPLE / iPhone)

### 2.3 `word_summary` ⭐ 全局词视图 (23,882 行)

**目的**: 给定一个单词 (head_word), 拿到跨所有词书聚合后的"最佳"信息。

```sql
CREATE TABLE word_summary (
    head_word TEXT PRIMARY KEY,       -- 小写, 主键
    display TEXT,                     -- 显示名
    us_phone TEXT,                    -- 优先取任何有音标的版本
    uk_phone TEXT,
    memory_method TEXT,
    book_count INTEGER,               -- 出现在多少本词书
    stages TEXT,                      -- 出现在哪些学段, 例: 'middle,high,ielts,toefl'
    book_titles TEXT,                 -- 出现在哪些词书 (用 , 分隔)
    phonetic_source TEXT              -- 'origin' (原始) 或 'fuzzy:<source>' (模糊匹配补)
);
```

**示例** (`head_word = 'cancel'`):
```
cancel | cancel | 'kænsl | 'kæns(ə)l | 患了癌症... | 5 | middle,high | 初中英语词汇,...
```

**音标策略**: 优先取任何有音标的版本(不论人教/有道/新东方), 保证最大覆盖率。
**Fuzzy 补全**: 对于无音标的纯单词, 用同一词在不同词书里的音标(模糊匹配)补全, 标记为 `fuzzy:<source_word>`。

### 2.4 `word_tags` ⭐ 学段/考试标签 (23,882 行)

```sql
CREATE TABLE word_tags (
    head_word TEXT PRIMARY KEY,
    is_primary INTEGER,         -- 小学
    is_middle INTEGER,          -- 初中
    is_high INTEGER,            -- 高中
    is_zhongkao INTEGER,        -- 中考必备
    is_gaokao INTEGER,          -- 高考必备
    primary_books TEXT,         -- 出现在哪些小学词书
    middle_books TEXT,
    high_books TEXT,
    is_phonetic_filled INTEGER, -- 音标是否 fuzzy 补过
    phonetic_source TEXT
);
```

**注意**: 其他考试标签(cet4/cet6/ielts/toefl 等)用 word_summary.stages 字段判断, 如:
```sql
SELECT * FROM word_tags wt
JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE ws.stages LIKE '%cet4%'  -- 找所有四级词
```

### 2.5 `meanings` (释义, 199,699 行)

```sql
CREATE TABLE meanings (
    id         INTEGER PRIMARY KEY,
    word_id    TEXT,
    pos        TEXT,            -- n./v./vt./vi./adj./adv./prep./conj./art./pron./int./num.
    tran_cn    TEXT,            -- 中文释义
    desc_cn    TEXT,
    tran_other TEXT,            -- 英文释义
    desc_other TEXT,
    ord        INTEGER
);
```

### 2.6 `sentences` (例句, 252,056 行)

```sql
CREATE TABLE sentences (id INTEGER PRIMARY KEY, word_id TEXT, en TEXT, cn TEXT, ord INTEGER);
```

### 2.7 `phrases` (短语, 909,106 行)

```sql
CREATE TABLE phrases (id INTEGER PRIMARY KEY, word_id TEXT, phrase TEXT, cn TEXT, ord INTEGER);
```

**注意**: 部分短语是单词衍生 (cancel button), 部分是教材中的固定搭配。

### 2.8 `synonyms` (同近义词, 552,290 行)

```sql
CREATE TABLE synonyms (id INTEGER PRIMARY KEY, word_id TEXT, pos TEXT, word TEXT, tran_cn TEXT);
```

### 2.9 `related_words` (同根词, 542,525 行)

```sql
CREATE TABLE related_words (id INTEGER PRIMARY KEY, word_id TEXT, pos TEXT, word TEXT, tran_cn TEXT);
```

**synonyms vs related_words 区别**:
- `synonyms`: 同义/近义, 词性相同, 可互换
- `related_words`: 同根词, 词性可能不同, 由同一词根派生

### 2.10 `book_words` (词书-单词关系, 152,965 行)

```sql
CREATE TABLE book_words (book_id TEXT, word_id TEXT, word_rank INTEGER, PRIMARY KEY (book_id, word_id));
```

### 2.11 `word_full` (单本词书完整信息, 152,965 行)

```sql
CREATE TABLE word_full (
    word_id, head_word, head_word_display, book_id,
    book_title, version, stage, grade, term,  -- 来自 books
    us_phone, uk_phone, us_speech, uk_speech, memory_method, star, word_rank,
    meaning_n, sentence_n, phrase_n, synonym_n, rel_n  -- 计数
);
```

---

## 三、典型查询模式 (复制即用)

### 3.1 闪卡场景

```sql
-- Q1: 给定一个单词, 拿全部信息
SELECT * FROM word_summary WHERE head_word = 'cancel';

-- Q2: 模糊查词
SELECT head_word, display, us_phone, stages
FROM word_summary WHERE head_word LIKE 'app%' LIMIT 10;

-- Q3: 给定单词拿所有跨词书释义
-- (跨词书聚合释义在 word_tags 里没有, 用 word_summary.stages 关联 + 多个 meanings)
SELECT m.pos, m.tran_cn, COUNT(*) as cnt
FROM meanings m JOIN words w ON m.word_id = w.word_id
WHERE w.head_word = 'cancel'
GROUP BY m.pos, m.tran_cn
ORDER BY cnt DESC;

-- Q4: 给定单词拿所有例句
SELECT s.en, s.cn
FROM sentences s JOIN words w ON s.word_id = w.word_id
WHERE w.head_word = 'cancel' ORDER BY s.ord LIMIT 10;

-- Q5: 给定单词拿所有短语
SELECT p.phrase, p.cn
FROM phrases p JOIN words w ON p.word_id = w.word_id
WHERE w.head_word = 'cancel' ORDER BY p.ord LIMIT 20;

-- Q6: 拿一个单词的音频 URL
-- word: 'cancel', accent: 'us' -> https://dict.youdao.com/dictvoice?audio=cancel&type=2
```

### 3.2 教材同步 / 选词场景

```sql
-- Q7: 拿人教版高中必修 1 的所有词 (按 word_rank 排序)
SELECT head_word, head_word_display, us_phone, uk_phone, memory_method
FROM word_full WHERE book_id = 'PEPGaoZhong_1' ORDER BY word_rank;

-- Q8: 拿"七年级人教版"的所有词
SELECT DISTINCT w.head_word, w.head_word_display, w.us_phone
FROM word_full w
WHERE w.stage = 'middle' AND w.grade = 7 AND w.version = '人教版'
ORDER BY w.head_word;

-- Q9: 找所有小学词 (用 word_tags)
SELECT ws.head_word, ws.display, ws.us_phone, ws.book_count
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_primary = 1
ORDER BY ws.book_count DESC;

-- Q10: 找所有高考必备词
SELECT ws.head_word, ws.display, ws.us_phone
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_gaokao = 1;

-- Q11: 找所有四级词
SELECT ws.head_word, ws.display, ws.us_phone
FROM word_summary ws
WHERE ws.stages LIKE '%cet4%'
ORDER BY ws.head_word;
```

### 3.3 学习产品场景

```sql
-- Q12: 按词频/常用度排序的初中词汇
SELECT ws.head_word, ws.display, ws.us_phone, ws.book_count
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_middle = 1
ORDER BY ws.book_count DESC LIMIT 100;

-- Q13: 有记忆口诀的词 (适合小学生)
SELECT ws.head_word, ws.display, ws.memory_method
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_primary = 1 AND ws.memory_method != ''
LIMIT 50;

-- Q14: 多义词 (meaning 数量 > 3)
SELECT w.head_word, COUNT(DISTINCT m.id) AS meaning_count
FROM words w JOIN meanings m ON w.word_id = m.word_id
GROUP BY w.head_word
HAVING meaning_count >= 3
ORDER BY meaning_count DESC LIMIT 20;

-- Q15: 短语丰富的词
SELECT w.head_word, COUNT(p.id) AS phrase_count
FROM words w JOIN phrases p ON w.word_id = p.word_id
GROUP BY w.head_word ORDER BY phrase_count DESC LIMIT 20;
```

### 3.4 词典查询场景

```sql
-- Q16: 完整词典条目 (聚合多个版本)
SELECT
    ws.head_word, ws.display, ws.us_phone, ws.uk_phone,
    ws.memory_method, ws.stages, ws.book_titles,
    m.pos, m.tran_cn, m.tran_other,
    (SELECT COUNT(*) FROM sentences WHERE word_id IN
        (SELECT word_id FROM words WHERE head_word=ws.head_word)) AS sent_n,
    (SELECT COUNT(*) FROM phrases WHERE word_id IN
        (SELECT word_id FROM words WHERE head_word=ws.head_word)) AS phrase_n
FROM word_summary ws
LEFT JOIN words w ON ws.head_word = w.head_word
LEFT JOIN meanings m ON m.word_id = w.word_id
WHERE ws.head_word = 'cancel'
ORDER BY w.book_id, m.ord;
```

---

## 四、关键约定与陷阱

### 4.1 主键约定

- `words.word_id` 是 **per (book, word)** 唯一, 不是单词全局唯一
- `word_summary.head_word` / `word_tags.head_word` 才是 **单词全局唯一** (小写)
- 跨词书查"同一个词"请用 `head_word`, 不要用 `word_id`

### 4.2 大小写

- `head_word` 一律小写, 用于匹配
- `head_word_display` 保留原大小写, 用于展示

### 4.3 一词多义

- 一个 word_id 通常 1-3 个 meaning (按 pos 区分)
- 跨词书后, 同一 head_word 可能有 5-10 个释义
- **做闪卡**: 建议按 (head_word, pos) 拆成多张卡
- **做查词**: 聚合后展示全部

### 4.4 短语和单词混存

- 部分"单词"其实是短语 (a bit of, above all)
- 部分其实是 OCR 错词 (2ussian, agro-scientifc, ajustment) — **已用 fuzzy 补全 1,730 个**
- **如果做闪卡**: 建议过一道过滤, 把 OCR 错词和长短语剔除

### 4.5 音标缺失情况 (已处理)

| 情况 | 数量 | 状态 |
|------|------|------|
| 普通单词 | ~5,860 (unique) | ✅ 100% 有音标 |
| 短语 (a bit of) | ~1,198 | 不需要音标 |
| 人名/专名 (Annie) | ~258 | 不需要音标 |
| OCR 错词 (已 fuzzy 补) | 1,730 | ✅ 已补全, 标记 phonetic_source='fuzzy:xxx' |
| 仍无音标 | 1,572 | 主要是名字/短语 |

### 4.6 阶段 vs 版本 vs 年级

- `stage`: 14 种值, 决定大方向
- `grade`: 年级 (3-12, 0=通用)
- `version`: 教材版本 (人教版 / 北师版 / 外研社版 / 有道 / 新东方)

---

## 五、不在数据中的内容 (使用前先了解)

| 缺失项 | 影响 | 替代方案 |
|--------|------|---------|
| 单词拼写音频文件本体 | 闪卡无音频 | 拼 URL 调有道 API (见 2.2) |
| 真实图片 (教材配图) | 闪卡无图 | 自行配; 暂未内置 |
| 词根词缀系统性标注 | 词根学习弱 | 可用 `related_words` 部分替代 |
| CEFR 难度分级 | 分层难 | 用"出现词书数"做近似 |
| 历年中高考真题例句 | - | 用 sentences (来自有道) 替代 |
| 拼写错误检测 | - | 1,730 个 fuzzy 补的词可能不准, 生产时建议复核 |

---

## 六、典型业务场景与推荐用法

| 场景 | 推荐查询 | 关键表 |
|------|---------|--------|
| 闪卡复习 | `word_summary` + `meanings` + `sentences` | 表 |
| 教材同步 (人教版小学) | `word_full` WHERE version='人教版' AND stage='primary' | 表 |
| 单词详情页 | `word_summary` + 多个子表 join | 表 |
| 词频排序 (高频优先学) | `ORDER BY book_count DESC` | word_summary |
| 短语学习 | `phrases` + `words` JOIN | 表 |
| 跨版本对比 (人教 vs 北师) | 按 book_id 分组 | 表 |
| 单词反查 (按释义找词) | `meanings.tran_cn LIKE '%关键词%'` | 表 |
| 学习统计 (按学段) | `word_tags.is_primary/is_middle/is_high` | 表 |
| 考试选词 | `word_summary.stages LIKE '%cet4%'` | word_summary |

---

## 七、API 等价物 (如需暴露成 API)

```python
# FastAPI 示例
@app.get("/word/{word}")
def get_word(word: str):
    word = word.lower()
    summary = db.execute("SELECT * FROM word_summary WHERE head_word=?", (word,)).fetchone()
    if not summary:
        raise HTTPException(404)
    # 跨词书聚合释义
    meanings = db.execute("""
        SELECT m.pos, m.tran_cn, COUNT(*) as cnt
        FROM meanings m JOIN words w ON m.word_id = w.word_id
        WHERE w.head_word = ? GROUP BY m.pos, m.tran_cn ORDER BY cnt DESC
    """, (word,)).fetchall()
    sentences = db.execute("""
        SELECT s.en, s.cn FROM sentences s JOIN words w ON s.word_id=w.word_id
        WHERE w.head_word=? ORDER BY s.ord LIMIT 5
    """, (word,)).fetchall()
    phrases = db.execute("""
        SELECT p.phrase, p.cn FROM phrases p JOIN words w ON p.word_id=w.word_id
        WHERE w.head_word=? ORDER BY p.ord LIMIT 10
    """, (word,)).fetchall()
    return {
        "word": summary,
        "meanings": meanings,
        "sentences": sentences,
        "phrases": phrases,
        "audio_us": f"https://dict.youdao.com/dictvoice?audio={word}&type=2",
        "audio_uk": f"https://dict.youdao.com/dictvoice?audio={word}&type=1",
    }

@app.get("/books")
def get_books(stage: str = None):
    sql = "SELECT * FROM books"
    if stage:
        sql += " WHERE stage = ?"
        return db.execute(sql, (stage,)).fetchall()
    return db.execute(sql).fetchall()
```

---

## 八、版本与变更

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-28 | 初版, 45 本词书 |
| 1.1 | 2026-07-28 | 修音标视图优先级, 普通单词 100% 覆盖 |
| 1.2 | 2026-07-28 | 补中考必备 / 高考必备 2 本, 共 47 本 |
| **1.3** | **2026-07-28** | **扩展到全 81 本 (中小学 47 + 考试类 34), 加 word_tags 标签表, fuzzy 补 1,730 个 OCR 错词音标** |

---

## 九、给 AI 的最终提示

1. **首选 `word_summary`**: 做闪卡/查词用, 别直接查 `words` 表
2. **主键**: 全局查词用 `head_word` (小写), 单本查词用 `word_id`
3. **选词用 `word_tags`**: 按学段/考试类型筛词
4. **跨词书释义**: 用 GROUP BY 聚合 (查 Q3 模式)
5. **音频 URL**: 按 2.2 节规则拼有道 URL, 不要存音频文件
6. **音标可信度**: `phonetic_source='fuzzy:xxx'` 的可能不准, 重要产品建议复核
7. **数据规模**: 317 MB, 全量装内存需谨慎; 索引齐全, 单查询 < 50ms

---

*本文档是给 AI 看的"快速上手卡"。如需完整 schema 定义, 见 `README.md`; 如需原始数据, 见 CSV 文件。*
