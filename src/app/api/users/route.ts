import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 获取固定账号信息（不含手机号等敏感字段，用于登录页展示）
export async function GET() {
  const users = await db.user.findMany({
    select: { id: true, name: true, nickname: true, avatar: true, stage: true, grade: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ users })
}
