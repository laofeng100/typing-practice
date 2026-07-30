/** 第四批测试种子 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:/tmp/opencode/typtest/test4.db' } } })

async function main() {
  await db.fsrsReview.deleteMany()
  await db.fsrsCard.deleteMany()
  await db.typingRecord.deleteMany()
  await db.typingSession.deleteMany()
  await db.dailyStat.deleteMany()
  await db.userProgress.deleteMany()
  await db.userSetting.deleteMany()
  await db.word.deleteMany()
  await db.user.deleteMany()

  const u1 = await db.user.create({ data: { phone: '13700000001', name: '健壮一', stage: '小学' } })
  const u2 = await db.user.create({ data: { phone: '13700000002', name: '健壮二', stage: '小学' } })
  const u3 = await db.user.create({ data: { phone: '13700000003', name: '健壮三', stage: '小学' } }) // 无会话（first_login 测试）

  await db.word.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, en: `pword${i + 1}`, zh: `词${i + 1}`, pos: 'n.', stage: '小学', difficulty: 'A1',
    })),
  })

  // u1/u2 各一张相同参数的复习卡（L-4 对比测试：不同 retention → 不同 due）
  const cardData = (userId: string) => ({
    userId, cardType: 'word', cardId: '1',
    stability: 5, difficulty: 5, retrievability: 0.9, due: new Date(),
    lastReview: new Date(), reps: 3, lapses: 0, state: 2,
  })
  await db.fsrsCard.create({ data: cardData(u1.id) })
  await db.fsrsCard.create({ data: cardData(u2.id) })

  // L-20: 脏 errorKeysList 记录（JSON.parse 容错测试）
  await db.typingRecord.create({
    data: {
      userId: u1.id, module: 'word', targetText: 'x', totalKeys: 10, errorKeys: 2,
      accuracy: 80, wpm: 20, isCorrect: true, errorKeysList: '{invalid json',
    },
  })

  // u1 一个会话（first_login=true 对比）
  await db.typingSession.create({
    data: { userId: u1.id, module: 'word', durationMs: 60000, totalKeys: 100, correctKeys: 95, wpm: 30, accuracy: 95, endedAt: new Date() },
  })

  console.log('seed4 ok', { u1: u1.id, u2: u2.id, u3: u3.id })
}

main().finally(() => db.$disconnect())
export {}
