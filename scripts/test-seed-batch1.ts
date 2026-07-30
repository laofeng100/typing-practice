/**
 * 第一批修复的测试种子数据（仅用于测试 DB）
 * 场景设计精准复现 ISSUE_TRACKER 第一批 bug：
 * - user1(小学): 120词, 前50已学 → 复现 C-1 新词断供
 * - user2(初中): 2100词全部已学 → 复现 C-2 晋级截断(take:2000)
 * - user1: 150句, 前50已学 → 复现 C-3 句子断供
 * - user1: listening 卡片 lapses>=1 → 复现 C-9 错题本500
 * - user1: 高中词 100 个（晋级后取词用）
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:/tmp/opencode/typtest/test.db' } } })

async function main() {
  // 清理
  await db.fsrsReview.deleteMany()
  await db.fsrsCard.deleteMany()
  await db.typingRecord.deleteMany()
  await db.typingSession.deleteMany()
  await db.dailyStat.deleteMany()
  await db.userProgress.deleteMany()
  await db.userSetting.deleteMany()
  await db.word.deleteMany()
  await db.sentence.deleteMany()
  await db.readingArticle.deleteMany()
  await db.listeningArticle.deleteMany()
  await db.user.deleteMany()

  const user1 = await db.user.create({ data: { phone: '13800000001', name: '测试一', stage: '小学' } })
  const user2 = await db.user.create({ data: { phone: '13800000002', name: '测试二', stage: '初中' } })

  // 小学 120 词 (id 1-120)
  await db.word.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      id: i + 1, en: `pword${i + 1}`, zh: `词${i + 1}`, pos: 'n.', stage: '小学', difficulty: 'A1',
    })),
  })
  // 高中 100 词 (id 9001-9100)
  await db.word.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      id: 9001 + i, en: `hword${i + 1}`, zh: `词${i + 1}`, pos: 'n.', stage: '高中', difficulty: 'B1',
    })),
  })
  // 初中 2100 词 (id 3001-5100)
  await db.word.createMany({
    data: Array.from({ length: 2100 }, (_, i) => ({
      id: 3001 + i, en: `jword${i + 1}`, zh: `词${i + 1}`, pos: 'n.', stage: '初中', difficulty: 'A2',
    })),
  })

  // user1: 小学前 50 词已学 (state=2, due 未来)
  const future = new Date(Date.now() + 30 * 86400000)
  await db.fsrsCard.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({
      userId: user1.id, cardType: 'word', cardId: String(i + 1),
      stability: 10, difficulty: 5, retrievability: 1, due: future,
      lastReview: new Date(), reps: 3, lapses: 0, state: 2,
    })),
  })
  // user2: 初中 2100 词全部已学
  await db.fsrsCard.createMany({
    data: Array.from({ length: 2100 }, (_, i) => ({
      userId: user2.id, cardType: 'word', cardId: String(3001 + i),
      stability: 10, difficulty: 5, retrievability: 1, due: future,
      lastReview: new Date(), reps: 3, lapses: 0, state: 2,
    })),
  })

  // 小学 150 句 (id 1-150)，user1 前 50 句已学
  await db.sentence.createMany({
    data: Array.from({ length: 150 }, (_, i) => ({
      id: i + 1, stage: '小学', order: i + 1, en: `Sentence number ${i + 1}.`, zh: `句子${i + 1}`,
      grammarPoint: '一般现在时', grammarExplain: '讲解', difficulty: 'A1',
    })),
  })
  await db.fsrsCard.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({
      userId: user1.id, cardType: 'sentence', cardId: String(i + 1),
      stability: 10, difficulty: 5, retrievability: 1, due: future,
      lastReview: new Date(), reps: 3, lapses: 0, state: 2,
    })),
  })

  // 阅读文章 1 篇 + 听力文章 1 篇（M-1 提交用）
  await db.readingArticle.create({
    data: { id: 1, stage: '小学', order: 1, title: 'Test Article', category: '科技前沿', content: 'Hello world.', contentZh: '你好', wordCount: 2, questions: '[]', vocabulary: '[]', grammarPoints: '[]', difficulty: 'A1' },
  })
  await db.listeningArticle.create({
    data: { id: 1, stage: '小学', order: 1, title: 'Test Listening', category: '日常对话', content: 'Hi there.', wordCount: 2, questions: '[]', difficulty: 'A1' },
  })

  // C-9: user1 一张 listening 卡片，lapses>=1 命中错题筛选
  await db.fsrsCard.create({
    data: {
      userId: user1.id, cardType: 'listening', cardId: '1',
      stability: 0.5, difficulty: 6, retrievability: 0.5, due: new Date(),
      lastReview: new Date(), reps: 2, lapses: 1, state: 3,
    },
  })

  console.log('seed ok', { user1: user1.id, user2: user2.id })
}

main().finally(() => db.$disconnect())
export {}
