/**
 * 全量短语导入脚本（学生需求：小初高 47 本词书所有短语全部导入）
 *
 * 背景：
 * - 有道开源词典 phrases 表按 word_id（词书维度）存储，同一 head_word 在多本词书
 *   有多个 word_id 记录，原始行数 673,134；按 (head_word, phrase) 去重后真实规模 42,752
 * - 原导入（import-vocab.ts）每词最多 5 条；本脚本去掉该限制，导入去重后的全部短语
 *
 * 幂等：清空 WordPhrase 后全量重建（ord 按源库语义顺序编号）
 * 用法：node node_modules/.bin/tsx scripts/import-phrases-full.ts（或 node --experimental-strip-types）
 */
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import { statSync } from 'node:fs'

const SRC = path.resolve(process.cwd(), 'dict/output/vocab.db')

const src = new DatabaseSync(SRC, { readOnly: true })
const db = new PrismaClient()

const BATCH = 5000

async function main() {
  // 1. 目标词集合：en → WordDict.id
  const targetWords = await db.wordDict.findMany({ select: { id: true, en: true } })
  const headSet = new Set(targetWords.map(w => w.en))
  const idByEn = new Map(targetWords.map(w => [w.en, w.id]))
  console.log('target words:', targetWords.length)

  // 2. 读源库短语：按 head_word + 源库 ord（语义排序）聚合，词内去重
  const rows = src
    .prepare(
      `SELECT w.head_word, p.phrase, p.cn, p.ord FROM phrases p JOIN words w ON p.word_id=w.word_id
       WHERE p.phrase IS NOT NULL AND p.phrase != '' ORDER BY w.head_word, p.ord`
    )
    .all() as { head_word: string; phrase: string; cn: string | null; ord: number }[]

  const byWord = new Map<string, { phrase: string; cn: string }[]>()
  for (const r of rows) {
    if (!headSet.has(r.head_word)) continue
    let list = byWord.get(r.head_word)
    if (!list) { list = []; byWord.set(r.head_word, list) }
    if (!list.some(x => x.phrase === r.phrase)) list.push({ phrase: r.phrase, cn: r.cn ?? '' })
  }
  console.log('words with phrases:', byWord.size)

  // 3. 平铺为 (wordId, phrase, cn, ord) 行
  const all: { wordId: string; phrase: string; cn: string; ord: number }[] = []
  for (const [en, list] of byWord) {
    const wordId = idByEn.get(en)
    if (!wordId) continue
    list.forEach((x, i) => all.push({ wordId, phrase: x.phrase, cn: x.cn, ord: i }))
  }
  console.log('total phrase rows:', all.length)

  // 4. 清空旧表，分批重建
  const before = await db.wordPhrase.count()
  await db.wordPhrase.deleteMany({})
  let inserted = 0
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH)
    await db.wordPhrase.createMany({ data: chunk })
    inserted += chunk.length
    console.log(`batch: ${inserted}/${all.length}`)
  }
  console.log('done:', { before, after: inserted, dbSizeMB: Math.round(statSync(path.resolve(process.cwd(), 'prisma/db/custom.db')).size / 1048576) })
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect(); src.close() })
