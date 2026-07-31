import { NextResponse } from 'next/server'
import { getCurrentUser, verifyParentPinToken } from '@/lib/auth'
import { getRawSettings } from '@/lib/settings'
import { db } from '@/lib/db'

/**
 * 清除当前用户的个人数据（不影响基础教学数据和其他用户）
 *
 * 清除内容：
 * - TypingRecord（打字记录）
 * - TypingSession（练习会话）
 * - FsrsReview（FSRS复习日志）
 * - FsrsCard（FSRS记忆卡片）
 * - UserProgress（关卡进度）
 * - DailyStat（每日统计）
 * - Assessment（评估记录）
 * - UserSetting（个性化设置，家长管控项除外）
 * - 重置用户学段为小学
 *
 * 保留内容：
 * - 家长管控设置（parentPin及限额/门槛等，避免重置后管控失效）
 * - WordDict（词典词条）
 * - GrammarPattern（语法句式）
 * - GrammarSystem（语法体系）
 * - Sentence（训练句子）
 * - ReadingArticle（阅读短文）
 * - User（账号本身）
 */

// 家长管控相关设置键：重置时保留，防止孩子通过清除数据绕过管控
const PARENT_KEEP_KEYS = [
  'parentPin', 'dailyLimitMin', 'singleLimitMin',
  'wpmUnlockThreshold', 'accuracyUnlockThreshold',
  'examCramMode', 'examCramIntensity',
]

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 已设家长 PIN 时，数据重置需先通过 verify-pin 获取服务端令牌
  const rawSettings = await getRawSettings(user.id)
  if (rawSettings.parentPin && !(await verifyParentPinToken(user.id))) {
    return NextResponse.json({ error: '需先验证家长密码才能清除数据' }, { status: 403 })
  }

  try {
    // 按外键依赖顺序删除（子表先删），与学段重置放在同一事务中
    const [
      typingRecord,
      typingSession,
      fsrsReview,
      fsrsCard,
      userProgress,
      dailyStat,
      assessment,
      userSetting,
    ] = await db.$transaction([
      db.typingRecord.deleteMany({ where: { userId: user.id } }),
      db.typingSession.deleteMany({ where: { userId: user.id } }),
      db.fsrsReview.deleteMany({ where: { userId: user.id } }),
      db.fsrsCard.deleteMany({ where: { userId: user.id } }),
      db.userProgress.deleteMany({ where: { userId: user.id } }),
      db.dailyStat.deleteMany({ where: { userId: user.id } }),
      db.assessment.deleteMany({ where: { userId: user.id } }),
      db.userSetting.deleteMany({ where: { userId: user.id, key: { notIn: PARENT_KEEP_KEYS } } }),
      // 重置用户学段为小学 + 教材回默认（人教版三年级上册）（放最后）
      db.user.update({
        where: { id: user.id },
        data: { stage: '小学', grade: '小升初', bookId: 'PEPXiaoXue3_1' },
      }),
    ])

    // 验证基础教学数据完好
    const preserved = {
      word: await db.wordDict.count(),
      grammarPattern: await db.grammarPattern.count(),
      grammarSystem: await db.grammarSystem.count(),
      sentence: await db.sentence.count(),
      readingArticle: await db.readingArticle.count(),
    }

    return NextResponse.json({
      success: true,
      deleted: {
        typingRecord: typingRecord.count,
        typingSession: typingSession.count,
        fsrsReview: fsrsReview.count,
        fsrsCard: fsrsCard.count,
        userProgress: userProgress.count,
        dailyStat: dailyStat.count,
        assessment: assessment.count,
        userSetting: userSetting.count,
      },
      preserved,
      user: { name: user.name, stage: '小学', grade: '小升初' },
    })
  } catch {
    return NextResponse.json({ error: '清除失败，请重试' }, { status: 500 })
  }
}
