import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit } from '@/lib/settings'

// 获取阅读文章列表
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const limit = await checkDailyLimit(user.id)
  if (limit.exceeded) {
    return NextResponse.json(
      { error: `今日练习已达上限（${limit.limitMin}分钟），明天再来吧`, usedMin: limit.usedMin, limitMin: limit.limitMin },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage') || user.stage
  const articleId = searchParams.get('id')

  if (articleId) {
    // 获取单篇
    const idNum = Number(articleId)
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: '无效的文章ID' }, { status: 400 })
    }
    const article = await db.readingArticle.findUnique({ where: { id: idNum } })
    if (!article) return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    return NextResponse.json({ article })
  }

  // 列表
  const articles = await db.readingArticle.findMany({
    where: { stage },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, title: true, category: true, wordCount: true, difficulty: true },
  })

  // 用户已练习状态（阅读已退出 FSRS，改用打字记录统计练习次数）
  const practiced = await db.typingRecord.groupBy({
    by: ['cardId'],
    where: { userId: user.id, module: 'article', cardId: { not: null } },
    _count: { cardId: true },
  })
  const practicedMap = new Map(practiced.map(p => [p.cardId, p._count.cardId]))

  return NextResponse.json({
    articles: articles.map(a => ({
      ...a,
      practiced: practicedMap.has(String(a.id)),
      reps: practicedMap.get(String(a.id)) || 0,
    })),
    stage,
  })
}
