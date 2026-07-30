import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit } from '@/lib/settings'

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
  const moduleName = searchParams.get('module')

  const where: any = { userId: user.id }
  if (moduleName) where.module = moduleName

  const progress = await db.userProgress.findMany({
    where,
    orderBy: { level: 'asc' },
  })

  // 计算最大已解锁关卡
  let maxUnlocked = 1
  for (const p of progress) {
    if (p.status === 'active' || p.status === 'completed') {
      if (p.level > maxUnlocked) maxUnlocked = p.level
    }
  }
  // 如果第1关已完成，第2关应解锁
  const lvl1 = progress.find(p => p.level === 1)
  if (!lvl1) maxUnlocked = 1
  else if (lvl1.status === 'completed') maxUnlocked = Math.max(maxUnlocked, 2)

  return NextResponse.json({ progress, maxUnlocked })
}
