import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit } from '@/lib/settings'

// 获取听力文章列表或单篇
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
    const idNum = Number(articleId)
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: '无效的文章ID' }, { status: 400 })
    }
    const article = await db.listeningArticle.findUnique({ where: { id: idNum } })
    if (!article) return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    return NextResponse.json({ article })
  }

  const articles = await db.listeningArticle.findMany({
    where: { stage },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, title: true, category: true, wordCount: true, difficulty: true },
  })

  return NextResponse.json({ articles, stage })
}
