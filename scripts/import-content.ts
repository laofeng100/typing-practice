/**
 * V2 内容表重导脚本（修复首次导入聚合不完整问题）
 *
 * 问题：首次导入时同词多书聚合逻辑有缺陷，pencil 只剩 1 条短语、about 只剩 1 条例句。
 * 修复：按 head_word 聚合 + 内容去重（每词 3 例句 / 5 短语 / ≤20 近义词 / ≤20 相关词），
 *       清空 4 张内容表后重新导入。
 *
 * 用法: node scripts/import-content.ts
 */
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'dict/output/vocab.db')
const src = new DatabaseSync(SRC, { readOnly: true })
const db = new PrismaClient()

function q<T = any>(sql: string, ...params: any[]): T[] {
  return src.prepare(sql).all(...params) as T[]
}

async function main() {
  const t0 = Date.now()

  // 1. head_word 集合（已有 WordDict）
  const heads = await db.wordDict.findMany({ select: { id: true } })
  const headSet = new Set<string>(heads.map(h => h.id))
  console.log('head words:', headSet.size)

  // 2. 清空内容表
  await db.wordExample.deleteMany()
  await db.wordPhrase.deleteMany()
  await db.wordSynonym.deleteMany()
  await db.wordRelated.deleteMany()
  console.log('已清空 4 张内容表')

  // 3. 例句（每词 ord 前 3，同词多书按 en 去重）
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

  // 4. 短语（每词 ord 前 5，同词多书按 phrase 去重）
  const phRows = q<any>(`SELECT w.head_word, p.phrase, p.cn, p.ord FROM phrases p JOIN words w ON p.word_id=w.word_id WHERE p.phrase IS NOT NULL AND p.phrase != '' ORDER BY w.head_word, p.ord`)
  const phByWord = new Map<string, { phrase: string; cn: string; ord: number }[]>()
  for (const p of phRows) {
    if (!headSet.has(p.head_word)) continue
    let list = phByWord.get(p.head_word)
    if (!list) { list = []; phByWord.set(p.head_word, list) }
    if (list.length < 5 && !list.some(x => x.phrase === p.phrase)) list.push({ phrase: p.phrase, cn: p.cn ?? '', ord: list.length })
  }
  let phCount = 0
  for (const [wordId, list] of phByWord) {
    await db.wordPhrase.createMany({ data: list.map(x => ({ wordId, phrase: x.phrase, cn: x.cn, ord: x.ord })) })
    phCount += list.length
  }
  console.log('WordPhrase:', phCount)

  // 5. 近义词 / 相关词（每词全量 ≤20，按 word 去重）
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

  console.log(`\n✅ 内容重导完成，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log({ examples: exCount, phrases: phCount, synonyms: syCount, related: rlCount })
}

main()
  .catch(e => { console.error('重导失败:', e); process.exit(1) })
  .finally(async () => { await db.$disconnect(); src.close() })
