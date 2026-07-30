# 中小学 + 全龄段英语词库 - 结构化数据

**数据源**: kajweb/dict (有道背单词) GitHub 公开词库 — **完整 81 本**
**生成时间**: 2026-07-28
**版本**: v1.3
**规模**: 81 本词书 / 152,965 word-book 对 / 23,882 unique 词 / 199,699 释义 / 252,056 例句 / 909,106 短语

---

## 目录结构

```
output/
├── vocab.db              # SQLite 数据库 (~317 MB) - 主交付物
├── csv/                  # 平面 CSV, 10 张表 (~210 MB)
│   ├── books.csv                 词书元信息
│   ├── words.csv                 单词主表 (152K 行)
│   ├── book_words.csv            词书-单词关系
│   ├── meanings.csv              释义 (199K 行)
│   ├── sentences.csv             例句 (252K 行)
│   ├── phrases.csv               短语 (909K 行)
│   ├── synonyms.csv              同近义词 (552K 行)
│   ├── related_words.csv         同根词 (542K 行)
│   ├── word_summary.csv          全局词视图 (23K 行, AI 推荐)
│   └── word_tags.csv             学段/考试标签 (23K 行, AI 推荐)
├── normalized/           # 标准化 JSON, 按词书分文件 (81 个文件)
├── DATA_CARD.md          # AI 友好的数据卡 (给其他 AI 看的)
└── README.md             # 本文件
```

---

## SQLite Schema

### 11 张表 (无视图, 全部物化)

| 表 | 行数 | 用途 | 主键 |
|----|------|------|------|
| `books` | 81 | 词书元信息 | book_id |
| `words` | 152,965 | 单词主表 (per book) | word_id |
| `book_words` | 152,965 | 词书-单词关系 (多对多) | (book_id, word_id) |
| `meanings` | 199,699 | 释义 | id |
| `sentences` | 252,056 | 例句 | id |
| `phrases` | 909,106 | 短语 | id |
| `synonyms` | 552,290 | 同近义词 | id |
| `related_words` | 542,525 | 同根词 | id |
| **`word_summary`** ⭐ | 23,882 | **全局词视图** (记忆系统首选) | head_word |
| **`word_tags`** ⭐ | 23,882 | **学段/考试标签** (选词首选) | head_word |
| `word_full` | 152,965 | 单本词书完整信息 (教材同步) | word_id |
| `db_meta` | - | 数据库元信息 | key |

---

## 三种典型查询模式

### 场景 1: 闪卡复习 (推荐用 `word_summary`)

```sql
-- 查 "cancel" 的全局信息 (最常用的查法)
SELECT * FROM word_summary WHERE head_word = 'cancel';

-- 模糊搜索
SELECT head_word, display, us_phone, stages
FROM word_summary WHERE head_word LIKE 'apple%' LIMIT 10;

-- 拉一个单词的跨词书所有释义 (聚合)
SELECT m.pos, m.tran_cn, COUNT(*) AS cnt
FROM meanings m JOIN words w ON m.word_id = w.word_id
WHERE w.head_word = 'cancel'
GROUP BY m.pos, m.tran_cn ORDER BY cnt DESC;

-- 拿一个单词的所有例句
SELECT s.en, s.cn FROM sentences s
JOIN words w ON s.word_id = w.word_id
WHERE w.head_word = 'cancel' ORDER BY s.ord LIMIT 10;

-- 拿一个单词的所有短语
SELECT p.phrase, p.cn FROM phrases p
JOIN words w ON p.word_id = w.word_id
WHERE w.head_word = 'cancel' ORDER BY p.ord LIMIT 20;

-- 拿一个单词的音频 URL
-- word='cancel' 美音: https://dict.youdao.com/dictvoice?audio=cancel&type=2
-- word='cancel' 英音: https://dict.youdao.com/dictvoice?audio=cancel&type=1
```

### 场景 2: 教材同步 (推荐用 `word_full` 或 `word_tags`)

```sql
-- 查人教版高中必修 1 的所有词 (按 word_rank 排序)
SELECT head_word, head_word_display, us_phone, uk_phone, memory_method
FROM word_full WHERE book_id = 'PEPGaoZhong_1' ORDER BY word_rank;

-- 找所有小学词 (用 word_tags)
SELECT ws.head_word, ws.display, ws.us_phone, ws.book_count
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_primary = 1 ORDER BY ws.book_count DESC;

-- 找所有高考必备词
SELECT ws.head_word, ws.display, ws.us_phone
FROM word_tags wt JOIN word_summary ws ON wt.head_word = ws.head_word
WHERE wt.is_gaokao = 1;

-- 找所有四级词 (用 word_summary.stages)
SELECT head_word, display, us_phone FROM word_summary
WHERE stages LIKE '%cet4%' ORDER BY head_word;

-- 查 "cancel" 在哪些词书出现
SELECT b.title, b.version, b.stage FROM book_words bw
JOIN books b ON bw.book_id = b.book_id
JOIN words w ON bw.word_id = w.word_id
WHERE w.head_word = 'cancel';
```

### 场景 3: 详细数据 (查 word_id 拿到所有关联)

```sql
-- 给定 word_id, 拉全部数据
SELECT * FROM meanings       WHERE word_id = ?;
SELECT * FROM sentences      WHERE word_id = ?;
SELECT * FROM phrases        WHERE word_id = ?;
SELECT * FROM synonyms       WHERE word_id = ?;
SELECT * FROM related_words  WHERE word_id = ?;
```

---

## 词书清单 (81 本, 14 大类)

### 中小学教材 (47 本)

| 学段 | 数量 | 词书 |
|------|------|------|
| 小学 (primary) | 8 | 人教版三上/三下/四上/四下/五上/五下/六上/六下 |
| 初中 (middle) | 14 | 人教版 7-9 年级 (5) + 外研社版 7-9 年级 (6) + 通用初中 (3, 含中考必备) |
| 高中 (high) | 25 | 人教版必修 1-5 + 选修 6-11 (11) + 北师版必修+选修 (11) + 通用高中 (3, 含高考必备) |

### 大学/出国考试 (34 本)

| 类别 | 数量 | 词书 |
|------|------|------|
| CET4 | 5 | 真题核心词 (乱序/正序) + 全词汇 (有道/新东方) |
| CET6 | 4 | 同上 |
| 考研 (kaoyan) | 4 | 必考词 + 全词汇 |
| 雅思 (ielts) | 3 | 雅思词汇 (有道/新东方) |
| 托福 (toefl) | 2 | TOEFL 词汇 (有道/新东方) |
| GRE | 2 | GRE 词汇 (有道/新东方) |
| SAT | 2 | SAT 词汇 (有道/新东方) |
| GMAT | 3 | GMAT 词汇 (有道/新东方/乱序) |
| 专四 (level4) | 4 | 专四真题高频词 + 核心词汇 (有道/新东方) |
| 专八 (level8) | 3 | 专八真题高频词 + 核心词汇 (有道/新东方) |
| 商务英语 (BEC) | 2 | BEC 词汇 (有道/新东方) |

---

## 学段/考试分布

| stage | 词书 | word-book 对 | unique 词 |
|-------|------|-------------|----------|
| primary (小学) | 8 | 849 | 819 |
| middle (初中) | 14 | 9,090 | 3,119 |
| high (高中) | 25 | 16,840 | 6,555 |
| cet4 | 5 | 12,409 | 4,544 |
| cet6 | 4 | 6,879 | 3,992 |
| kaoyan (考研) | 4 | 10,941 | 5,047 |
| ielts (雅思) | 3 | 10,429 | 5,275 |
| toefl (托福) | 2 | 13,476 | 10,367 |
| gre | 2 | 13,714 | 9,984 |
| sat | 2 | 8,887 | 4,464 |
| gmat | 3 | 9,555 | 3,312 |
| bec (商务) | 2 | 5,578 | 2,825 |
| level4 (专四) | 4 | 9,240 | 4,340 |
| level8 (专八) | 3 | 25,078 | 12,410 |
| **合计** | **81** | **152,965** | **23,882** |

> **注**: "word-book 对" = 单词在多少 (book, word) 组合中出现 (同一词在多本词书重复收录); "unique 词" = 跨词书去重后的实际单词数。

---

## 音标覆盖

| 维度 | 数字 | 说明 |
|------|------|------|
| words 表 (单本词书) 美音 | 90.0% | 19,528 / 21,696 (中小学 47 本) |
| word_summary unique 词有美音 | **93.4%** | 22,310 / 23,882 (含 fuzzy 补) |
| fuzzy 补全的词 | 1,730 | 来源: 同词在其他词书的音标 |
| 仍无音标的词 | 1,572 | 主要是人名/专名/短语 |

**fuzzy 补全策略**: 对于无音标的纯单词, 用同一词在不同词书里的音标(模糊匹配)补全, 在 `word_summary.phonetic_source` 字段标记为 `fuzzy:<source_word>`, `word_tags.is_phonetic_filled=1`。

---

## 字段约定

- `head_word` 全部小写, 作为跨词书的主键
- `head_word_display` 保留原始大小写, 用于展示
- `word_id` 格式: `<book_id>_<rank>`, 例: `PEPGaoZhong_1_1` — **per (book, word) 唯一**
- `us_phone` / `uk_phone` 美式/英式音标
- `us_speech` / `uk_speech` 有道发音 API 参数, 拼成 URL:
  ```
  https://dict.youdao.com/dictvoice?audio=<word>&type=<1|2>
  ```
  (1=英音, 2=美音)
- `memory_method` 记忆方法/口诀, 部分词书(人教版小学/通用词书)有
- `star` 新东方词书的星标(1-5)
- `pos` 词性: n. v. vt. vi. adj. adv. prep. conj. art. pron. int. num.
- `tran_cn` 中文释义; `tran_other` 英文释义

---

## 转换/处理脚本 (在 `scripts/` 目录)

- `convert.py` — 主转换: 原始 JSON → 标准化 → CSV → SQLite
- `enrich.py` — 后处理: 物化 word_summary + word_tags + fuzzy 补音标
- `export_csv.py` — 从 SQLite 导出 CSV
- `postprocess.py` — 旧版 (已被 enrich.py 替代)

---

## 文档分层

| 文件 | 读者 | 内容 |
|------|------|------|
| `README.md` | **人** | 完整使用说明, schema, 查询示例 |
| `DATA_CARD.md` | **AI** | 快速上手卡, AI 看这个就能用 |

> **重要**: 拿给其他 AI 助手时, **优先发 DATA_CARD.md** (5 分钟上手) 而非本 README (20 分钟)。

---

## 版权说明

数据来源于公开仓库 kajweb/dict, 原数据由"有道词典/有道背单词"整理并开源。
本仓库仅做格式标准化 + 学段/考试标签派生 + fuzzy 音标补全, 版权归原作者所有。

---

## 用途建议

这个数据库适合直接用于:
1. **FSRS 闪卡系统** — 拿 word_summary + meanings + sentences 生成卡片
2. **教材同步** — 拿 word_full + books 做"人教版高中必修1"等子词表
3. **学段/考试选词** — 用 word_tags (is_primary/is_middle/is_high/is_cet4 等)
4. **词典 App** — 用 meanings + sentences + phrases + synonyms 做完整词典
5. **词频/难度分析** — 用 book_count 字段做权重
6. **跨词书聚合查询** — 用 word_summary.stages 字段判断单词属于哪些考试/学段
