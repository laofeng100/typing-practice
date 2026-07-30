/** 第二批测试种子：复现 C-8/M-3/M-5/M-6/M-13 场景 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:/tmp/opencode/typtest/test2.db' } } })

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

  const u1 = await db.user.create({ data: { phone: '13800000001', name: '测试一', stage: '小学' } })
  const u2 = await db.user.create({ data: { phone: '13800000002', name: '测试二', stage: '小学' } })
  const u3 = await db.user.create({ data: { phone: '13800000003', name: '测试三', stage: '小学' } })
  const u4 = await db.user.create({ data: { phone: '13800000004', name: '测试四', stage: '小学' } })

  // 小学 100 词
  await db.word.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, en: `pword${i + 1}`, zh: `词${i + 1}`, pos: 'n.', stage: '小学', difficulty: 'A1',
    })),
  })

  // C-8: u1 两个 60s/wpm30 会话；u2 一个 600s/wpm80 会话
  await db.typingSession.createMany({
    data: [
      { userId: u1.id, module: 'word', durationMs: 60000, totalKeys: 100, correctKeys: 95, wpm: 30, accuracy: 95, endedAt: new Date() },
      { userId: u1.id, module: 'word', durationMs: 60000, totalKeys: 100, correctKeys: 95, wpm: 30, accuracy: 95, endedAt: new Date() },
      { userId: u2.id, module: 'word', durationMs: 600000, totalKeys: 5000, correctKeys: 4900, wpm: 80, accuracy: 98, endedAt: new Date() },
    ],
  })

  // M-13: u3 键盘 6 关全部 completed，但 bestWpm=10 < 40 阈值
  await db.userProgress.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      userId: u3.id, module: 'keyboard', level: i + 1, status: 'completed',
      bestWpm: 10, bestAccuracy: 96, stars: 1, attempts: 1, completedAt: new Date(),
    })),
  })

  // M-5: u1 一张到期复习卡，lastReview=10天前, stability=1 → R 应 < 1（库中恒存 1.0）
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000)
  await db.fsrsCard.create({
    data: {
      userId: u1.id, cardType: 'word', cardId: '1',
      stability: 1, difficulty: 5, retrievability: 1, due: new Date(Date.now() - 86400000),
      lastReview: tenDaysAgo, reps: 2, lapses: 0, state: 2,
    },
  })

  // M-3: u1 一张高难度单词卡（专项练习 words 来源），需返回 cardState
  await db.fsrsCard.create({
    data: {
      userId: u1.id, cardType: 'word', cardId: '2',
      stability: 0.5, difficulty: 7, retrievability: 0.5, due: new Date(),
      lastReview: new Date(), reps: 3, lapses: 1, state: 3, totalErrors: 5, totalTyping: 5,
    },
  })

  // M-6: u4 今日已练 20 分钟 > 15 分钟上限
  await db.dailyStat.create({
    data: { userId: u4.id, date: localDateStr(), totalMs: 20 * 60000 },
  })

  console.log('seed2 ok')
}

main().finally(() => db.$disconnect())
export {}
