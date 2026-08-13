import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// 学段顺序（与 Book.stage 对应）
const STAGE_ORDER = ['primary', 'middle', 'high']
// Book.stage（英文）→ User.stage（中文）映射：手动切换教材时同步用户学段
const STAGE_MAP: Record<string, string> = { primary: '小学', middle: '初中', high: '高中' }

// 教材排序 key：学段 → 年级（0=通用词表排最后）→ 学期 → 版本
export function bookSortKey(b: { stage: string; grade: number | null; term: number | null; version: string | null }) {
  const grade = b.grade && b.grade > 0 ? b.grade : 99
  return `${STAGE_ORDER.indexOf(b.stage)}_${String(grade).padStart(2, '0')}_${b.term ?? 0}_${b.version ?? ''}`
}

// 词书列表 + 每本已学进度 + 当前教材
// GET /api/books → { books: [{ id, title, version, stage, grade, term, wordCount, learned }], currentBookId }
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const books = await db.book.findMany()
  const bookIds = books.map(b => b.id)

  // 禁止 N+1：一次拉取全部 BookWord 与已学卡，内存算交集
  const [bookWords, learnedCards] = await Promise.all([
    db.bookWord.findMany({ where: { bookId: { in: bookIds } }, select: { bookId: true, wordId: true } }),
    db.fsrsCard.findMany({ where: { userId: user.id, cardType: 'word', state: { gt: 0 } }, select: { cardId: true } }),
  ])
  const wordCountByBook = new Map<string, number>()
  for (const bw of bookWords) wordCountByBook.set(bw.bookId, (wordCountByBook.get(bw.bookId) || 0) + 1)
  const learnedSet = new Set(learnedCards.map(c => c.cardId))
  const learnedByBook = new Map<string, number>()
  for (const bw of bookWords) {
    if (learnedSet.has(bw.wordId)) learnedByBook.set(bw.bookId, (learnedByBook.get(bw.bookId) || 0) + 1)
  }

  const sorted = books
    .sort((a, b) => bookSortKey(a).localeCompare(bookSortKey(b)))
    .map(b => ({
      id: b.id,
      title: b.title,
      version: b.version,
      stage: b.stage,
      grade: b.grade,
      term: b.term,
      wordCount: wordCountByBook.get(b.id) || 0,
      learned: learnedByBook.get(b.id) || 0,
    }))

  // currentBookId 兜底：user.bookId 异常时返回第一本
  let currentBookId = user.bookId
  if (!books.some(b => b.id === currentBookId)) currentBookId = sorted[0]?.id || ''

  return NextResponse.json({ books: sorted, currentBookId })
}

// 切换当前教材
// PATCH /api/books { bookId } → { ok: true, bookId }
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const bookId = body?.bookId
  if (typeof bookId !== 'string' || !bookId) {
    return NextResponse.json({ error: '参数非法' }, { status: 400 })
  }
  const book = await db.book.findUnique({ where: { id: bookId } })
  if (!book) return NextResponse.json({ error: '词书不存在' }, { status: 404 })

  // 切换教材时同步用户学段（仪表盘展示与阅读/听力默认学段依赖 user.stage）
  await db.user.update({ where: { id: user.id }, data: { bookId, stage: STAGE_MAP[book.stage] || user.stage } })
  return NextResponse.json({ ok: true, bookId })
}
