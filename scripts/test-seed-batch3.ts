/** 第三批（安全）测试种子：仅需 2 个用户 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:/tmp/opencode/typtest/test3.db' } } })

async function main() {
  await db.fsrsReview.deleteMany()
  await db.fsrsCard.deleteMany()
  await db.typingRecord.deleteMany()
  await db.typingSession.deleteMany()
  await db.dailyStat.deleteMany()
  await db.userProgress.deleteMany()
  await db.userSetting.deleteMany()
  await db.user.deleteMany()

  const u1 = await db.user.create({ data: { phone: '13900000001', name: '安全一', stage: '小学' } })
  const u2 = await db.user.create({ data: { phone: '13900000002', name: '安全二', stage: '小学' } })
  console.log('seed3 ok', { u1: u1.id, u2: u2.id })
}

main().finally(() => db.$disconnect())
export {}
