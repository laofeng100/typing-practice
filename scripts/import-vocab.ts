/**
 * V2 词典数据导入脚本
 * 从 dict/output/vocab.db（有道开源词典）导入小初高 47 本书的数据到项目库
 * 用法: node scripts/import-vocab.ts  （本机无 bun，用 node 26 内置 node:sqlite）
 *
 * 导入内容：
 * - Book（47 本小初高词书）
 * - WordDict（7,572 去重词：音标/记忆法/学段标签/主释义）
 * - BookWord（词↔书关联 + 教材内词序）
 * - WordExample（每词 3 条）/ WordPhrase（全量导入，同词多书去重后约 4.3 万条）
 * - WordSynonym / WordRelated（每词全量）
 * - 迁移存量学习数据：FsrsCard/TypingRecord 中 word 卡的 cardId 数字 → head_word
 */
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'dict/output/vocab.db')
const LEGACY_CSV = path.resolve(process.cwd(), 'upload/backup-v2/word_legacy.csv')
const STAGES = ['primary', 'middle', 'high']

const src = new DatabaseSync(SRC, { readOnly: true })
const db = new PrismaClient()

function q<T = any>(sql: string, ...params: any[]): T[] {
  return src.prepare(sql).all(...params) as T[]
}

// 旧 en → head_word 规范化：小写、去括号/等号/逗号、压缩空格
function normalizeWord(en: string): string {
  return en.trim().toLowerCase().replace(/[()=,]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  const t0 = Date.now()

  // ===== 1. books =====
  const books = q<any>(`SELECT book_id, title, version, stage, grade, term, word_count FROM books WHERE stage IN (?,?,?)`, ...STAGES)
  console.log('books:', books.length)
  for (let i = 0; i < books.length; i += 200) {
    const batch = books.slice(i, i + 200)
    await db.book.createMany({
      data: batch.map(b => ({
        id: b.book_id,
        title: b.title,
        version: b.version ?? null,
        stage: b.stage,
        grade: b.grade ?? null,
        term: b.term ?? null,
        wordCount: b.word_count ?? null,
      })),
    })
  }

  // ===== 2. 词表主体：小初高词书中的 head_word 集合 =====
  const headRows = q<any>(`SELECT DISTINCT w.head_word FROM words w JOIN books b ON w.book_id=b.book_id WHERE b.stage IN (?,?,?)`, ...STAGES)
  console.log('distinct head_words:', headRows.length)
  const headSet = new Set<string>(headRows.map(r => r.head_word))

  // word_summary 聚合信息
  const summaryMap = new Map<string, any>()
  for (const s of q<any>('SELECT head_word, display, us_phone, uk_phone, memory_method, book_count FROM word_summary')) {
    if (headSet.has(s.head_word)) summaryMap.set(s.head_word, s)
  }
  // word_tags 学段标签
  const tagsMap = new Map<string, any>()
  for (const t of q<any>('SELECT head_word, is_primary, is_middle, is_high, is_zhongkao, is_gaokao FROM word_tags')) {
    if (headSet.has(t.head_word)) tagsMap.set(t.head_word, t)
  }
  // meanings 释义（按 head_word 聚合）
  const meaningRows = q<any>(`SELECT w.head_word, m.pos, m.tran_cn, m.ord FROM meanings m JOIN words w ON m.word_id=w.word_id WHERE m.tran_cn IS NOT NULL AND m.tran_cn != '' ORDER BY m.ord`)
  const meaningMap = new Map<string, { pos: string; zh: string }>()
  for (const m of meaningRows) {
    if (!headSet.has(m.head_word)) continue
    let entry = meaningMap.get(m.head_word)
    if (!entry) { entry = { pos: '', zh: '' }; meaningMap.set(m.head_word, entry) }
    if (!entry.pos && m.pos) entry.pos = m.pos
    const tran = String(m.tran_cn).trim()
    if (tran && !entry.zh.includes(tran)) entry.zh += (entry.zh ? '；' : '') + tran
    if (entry.zh.length > 500) break // 释义过长截断
  }

  // 组装 WordDict
  const wordDictData = [...headSet].map(head => {
    const s = summaryMap.get(head)
    const t = tagsMap.get(head)
    const m = meaningMap.get(head)
    return {
      id: head,
      en: s?.display || head,
      zh: m?.zh || '',
      pos: m?.pos || '',
      usPhone: s?.us_phone || null,
      ukPhone: s?.uk_phone || null,
      memoryMethod: s?.memory_method || null,
      isPrimary: t ? t.is_primary === 1 : false,
      isMiddle: t ? t.is_middle === 1 : false,
      isHigh: t ? t.is_high === 1 : false,
      isZhongkao: t ? t.is_zhongkao === 1 : false,
      isGaokao: t ? t.is_gaokao === 1 : false,
      bookCount: s?.book_count ?? 0,
    }
  })
  console.log('WordDict:', wordDictData.length)
  for (let i = 0; i < wordDictData.length; i += 500) {
    await db.wordDict.createMany({ data: wordDictData.slice(i, i + 500) })
  }

  // ===== 3. BookWord（词↔书关联，word_id 必须 join words 转 head_word） =====
  const bwRows = q<any>(`SELECT bw.book_id, w.head_word, bw.word_rank FROM book_words bw JOIN words w ON bw.word_id=w.word_id JOIN books b ON bw.book_id=b.book_id WHERE b.stage IN (?,?,?)`, ...STAGES)
  console.log('BookWord:', bwRows.length)
  for (let i = 0; i < bwRows.length; i += 500) {
    await db.bookWord.createMany({
      data: bwRows.slice(i, i + 500).map(r => ({ bookId: r.book_id, wordId: r.head_word, wordRank: r.word_rank ?? null })),
    })
  }

  // ===== 4. 例句（每词 ord 前 3，同词多书按 en 去重） =====
  const exRows = q<any>(`SELECT w.head_word, s.en, s.cn, s.ord FROM sentences s JOIN words w ON s.word_id=w.word_id WHERE s.en IS NOT NULL AND s.en != '' ORDER BY w.head_word, s.ord`)
  const exByWord = new Map<string, { en: string; cn: string; ord: number }[]>()
  for (const e of exRows) {
    if (!headSet.has(e.head_word)) continue
    let list = exByWord.get(e.head_word)
    if (!list) { list = []; exByWord.set(e.head_word, list) }
    if (list.length < 3 && !list.some(x => x.en === e.en)) list.push({ en: e.en, cn: e.cn ?? '', ord: list.length })
  }
  let exCount = 0
  for (const [wordId, list] of exByWord) {
    await db.wordExample.createMany({ data: list.map(x => ({ wordId, en: x.en, cn: x.cn, ord: x.ord })) })
    exCount += list.length
  }
  console.log('WordExample:', exCount)

  // ===== 5. 短语（全量导入：同词多书按 phrase 去重，不设数量上限） =====
  const phRows = q<any>(`SELECT w.head_word, p.phrase, p.cn, p.ord FROM phrases p JOIN words w ON p.word_id=w.word_id WHERE p.phrase IS NOT NULL AND p.phrase != '' ORDER BY w.head_word, p.ord`)
  const phByWord = new Map<string, { phrase: string; cn: string; ord: number }[]>()
  for (const p of phRows) {
    if (!headSet.has(p.head_word)) continue
    let list = phByWord.get(p.head_word)
    if (!list) { list = []; phByWord.set(p.head_word, list) }
    if (!list.some(x => x.phrase === p.phrase)) list.push({ phrase: p.phrase, cn: p.cn ?? '', ord: list.length })
  }
  let phCount = 0
  for (const [wordId, list] of phByWord) {
    await db.wordPhrase.createMany({ data: list.map(x => ({ wordId, phrase: x.phrase, cn: x.cn, ord: x.ord })) })
    phCount += list.length
  }
  console.log('WordPhrase:', phCount)

  // ===== 6. 近义词 / 相关词（每词全量，按 word 去重） =====
  const syRows = q<any>(`SELECT w.head_word, s.pos, s.word, s.tran_cn FROM synonyms s JOIN words w ON s.word_id=w.word_id WHERE s.word IS NOT NULL AND s.word != ''`)
  const syMap = new Map<string, any[]>()
  for (const s of syRows) {
    if (!headSet.has(s.head_word)) continue
    let list = syMap.get(s.head_word)
    if (!list) { list = []; syMap.set(s.head_word, list) }
    if (list.length < 20 && !list.some(x => x.word === s.word)) list.push({ pos: s.pos ?? null, word: s.word, tranCn: s.tran_cn ?? null })
  }
  let syCount = 0
  for (const [wordId, list] of syMap) {
    await db.wordSynonym.createMany({ data: list.map(x => ({ wordId, ...x })) })
    syCount += list.length
  }
  console.log('WordSynonym:', syCount)

  const rlRows = q<any>(`SELECT w.head_word, r.pos, r.word, r.tran_cn FROM related_words r JOIN words w ON r.word_id=w.word_id WHERE r.word IS NOT NULL AND r.word != ''`)
  const rlMap = new Map<string, any[]>()
  for (const r of rlRows) {
    if (!headSet.has(r.head_word)) continue
    let list = rlMap.get(r.head_word)
    if (!list) { list = []; rlMap.set(r.head_word, list) }
    if (list.length < 20 && !list.some(x => x.word === r.word)) list.push({ pos: r.pos ?? null, word: r.word, tranCn: r.tran_cn ?? null })
  }
  let rlCount = 0
  for (const [wordId, list] of rlMap) {
    await db.wordRelated.createMany({ data: list.map(x => ({ wordId, ...x })) })
    rlCount += list.length
  }
  console.log('WordRelated:', rlCount)

  // ===== 7. 迁移存量学习数据：FsrsCard / TypingRecord word 卡 cardId 数字 → head_word =====
  // 旧词表 id → en 映射（从 CSV 备份读取，旧表可能已删）
  const legacyMap = new Map<number, string>()
  const csv = readFileSync(LEGACY_CSV, 'utf-8').split('\n')
  csv.shift() // 表头
  for (const line of csv) {
    const m = line.match(/^(\d+),"(.*)","(.*)","(.*)","(.*)","(.*)"$/)
    if (m) legacyMap.set(Number(m[1]), m[2])
  }
  // en → head_word（新词表）
  const dictByEn = new Map<string, string>()
  for (const w of await db.wordDict.findMany({ select: { id: true, en: true } })) {
    const n = normalizeWord(w.en)
    if (!dictByEn.has(n)) dictByEn.set(n, w.id)
    if (!dictByEn.has(w.id)) dictByEn.set(w.id, w.id)
  }
  const resolveHead = (oldCardId: string): string | null => {
    const n = Number(oldCardId)
    if (!Number.isInteger(n)) return null // 已是非数字，跳过
    const en = legacyMap.get(n)
    if (!en) return null
    return dictByEn.get(normalizeWord(en)) || null
  }

  // FsrsCard 迁移
  const wordCards = await db.fsrsCard.findMany({ where: { cardType: 'word' } })
  let migratedCards = 0, deletedCards = 0
  for (const c of wordCards) {
    const head = resolveHead(c.cardId)
    if (head && head !== c.cardId) {
      await db.fsrsCard.update({ where: { id: c.id }, data: { cardId: head } })
      migratedCards++
    } else if (!head) {
      await db.fsrsReview.deleteMany({ where: { cardId: c.cardId, cardType: 'word' } })
      await db.fsrsCard.delete({ where: { id: c.id } })
      deletedCards++
    }
  }
  console.log(`FsrsCard 迁移: ${migratedCards} 更新, ${deletedCards} 删除(无映射)`)

  // TypingRecord 迁移（word 类型，仅更新有映射的；无映射保留原样）
  const wordRecords = await db.typingRecord.findMany({ where: { cardType: 'word' }, select: { id: true, cardId: true } })
  let recMigrated = 0
  for (const r of wordRecords) {
    const head = resolveHead(String(r.cardId))
    if (head && head !== r.cardId) {
      await db.typingRecord.update({ where: { id: r.id }, data: { cardId: head } })
      recMigrated++
    }
  }
  console.log(`TypingRecord 迁移: ${recMigrated} 更新`)

  console.log(`\n✅ 导入完成，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log({ books: books.length, words: wordDictData.length, bookWords: bwRows.length, examples: exCount, phrases: phCount, synonyms: syCount, related: rlCount })
}

main()
  .catch(e => { console.error('导入失败:', e); process.exit(1) })
  .finally(async () => { await db.$disconnect(); src.close() })
