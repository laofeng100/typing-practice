/**
 * 修复 v2 导入时的卡片迁移失败
 *
 * 问题：import-vocab.ts 的 CSV 解析正则假设所有字段带引号，实际 pos 字段（如 phr.）不带，
 * 导致 legacyMap 为空，29 张 word 卡被误删。
 *
 * 修复：
 * 1. 用引号感知的 CSV 解析读取 word_legacy.csv（id → en 映射）
 * 2. TypingRecord 中 word 卡 cardId 数字 → head_word
 * 3. 按 TypingRecord 重建 FsrsCard（state 按最近评级：≥3 → Review，<3 → Learning；due=now 立即可复习）
 *
 * 用法: DATABASE_URL="file:./db/custom.db" node scripts/fix-word-cards.ts
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const db = new PrismaClient()
const LEGACY_CSV = path.resolve(process.cwd(), 'upload/backup-v2/word_legacy.csv')

// 引号感知 CSV 行解析（sqlite3 .mode csv 导出格式：含逗号/引号字段带引号，内部引号 "" 转义）
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function normalizeWord(en: string): string {
  return en.trim().toLowerCase().replace(/[()=,]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  // 1. 解析旧词表 id → en
  const legacyMap = new Map<number, string>()
  const lines = readFileSync(LEGACY_CSV, 'utf-8').split('\n')
  lines.shift() // 表头
  let parsed = 0
  for (const line of lines) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    if (cols.length >= 6 && /^\d+$/.test(cols[0].trim())) {
      legacyMap.set(Number(cols[0].trim()), cols[1].trim())
      parsed++
    }
  }
  console.log(`CSV 解析: ${parsed} 行（期望 6890）`)
  if (parsed < 6000) throw new Error('CSV 解析异常，中止')

  // 2. en/head_word → head_word 映射
  const dictByEn = new Map<string, string>()
  for (const w of await db.wordDict.findMany({ select: { id: true, en: true } })) {
    const n = normalizeWord(w.en)
    if (!dictByEn.has(n)) dictByEn.set(n, w.id)
    if (!dictByEn.has(w.id)) dictByEn.set(w.id, w.id)
  }
  const resolveHead = (oldCardId: string): string | null => {
    const n = Number(oldCardId)
    if (!Number.isInteger(n)) return null
    const en = legacyMap.get(n)
    if (!en) return null
    return dictByEn.get(normalizeWord(en)) || null
  }

  // 3. TypingRecord 迁移
  const recs = await db.typingRecord.findMany({ where: { cardType: 'word' }, select: { id: true, cardId: true } })
  let recMigrated = 0, recSkipped = 0
  for (const r of recs) {
    const head = resolveHead(String(r.cardId))
    if (head && head !== r.cardId) {
      await db.typingRecord.update({ where: { id: r.id }, data: { cardId: head } })
      recMigrated++
    } else if (!head) recSkipped++
  }
  console.log(`TypingRecord: ${recMigrated} 更新, ${recSkipped} 无映射跳过`)

  // 4. 按 TypingRecord 重建 FsrsCard（按 head_word 聚合）
  const grouped = new Map<string, { count: number; lapses: number; errors: number; lastRating: number; lastAt: Date; userId: string }>()
  const wordRecs = await db.typingRecord.findMany({
    where: { cardType: 'word' },
    orderBy: { createdAt: 'asc' },
    select: { cardId: true, rating: true, errorKeys: true, createdAt: true, userId: true },
  })
  for (const r of wordRecs) {
    const key = String(r.cardId)
    const g = grouped.get(key) || { count: 0, lapses: 0, errors: 0, lastRating: 0, lastAt: r.createdAt, userId: r.userId }
    g.count++
    if (r.rating === 1) g.lapses++
    g.errors += Number(r.errorKeys || 0)
    g.lastRating = r.rating ?? g.lastRating
    g.lastAt = r.createdAt
    grouped.set(key, g)
  }

  let created = 0
  for (const [cardId, g] of grouped) {
    if (!/^[a-z0-9 ]+$/.test(cardId)) continue // 只处理已迁移为 head_word 的
    const state = g.lastRating >= 3 ? 2 : 1 // Review / Learning
    await db.fsrsCard.upsert({
      where: { userId_cardType_cardId: { userId: g.userId, cardType: 'word', cardId } },
      update: {},
      create: {
        userId: g.userId,
        cardType: 'word',
        cardId,
        state,
        reps: g.count,
        lapses: g.lapses,
        totalTyping: g.count,
        totalErrors: g.errors,
        due: new Date(), // 立即可复习
        lastReview: g.lastAt,
      },
    })
    created++
  }
  console.log(`FsrsCard 重建: ${created} 张`)

  const total = await db.fsrsCard.count({ where: { cardType: 'word' } })
  console.log(`✅ 修复完成，word 卡总数: ${total}`)
}

main()
  .catch(e => { console.error('修复失败:', e); process.exit(1) })
  .finally(() => db.$disconnect())
