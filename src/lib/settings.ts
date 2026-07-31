/**
 * 用户设置工具
 *
 * 分为两层：
 * 1. getRawSettings: 读取用户保存的原始设置（不含考前突击调整）
 * 2. getSettings: 返回运行时生效的设置（含考前突击动态调整）
 *
 * 保存时（setSetting）只保存原始值，不保存调整后的值。
 * 考前突击调整在运行时（API调用）动态计算，不持久化。
 */
import { db } from './db'
import { localDateStr } from './datetime'

export const DEFAULT_SETTINGS = {
  // 打字练习参数
  dailyLimitMin: 15,
  singleLimitMin: 30,
  wpmUnlockThreshold: 40,
  accuracyUnlockThreshold: 90,
  // FSRS参数
  fsrsRetention: 0.9,
  fsrsMaxInterval: 365,
  // 单词练习
  wordBatchSize: 10,
  wordReviewBatchSize: 20,
  // 考前突击模式
  examCramMode: false,
  examCramIntensity: 50,
  // 家长管控密码（空=未设置；设置后时长/解锁/突击区域需验证才能编辑）
  parentPin: '',
  // 界面
  showKeyboard: true,
  showFingerGuide: true,
  soundFeedback: false,
  fontSize: 'medium',
  // TTS语音配置（仅服务端 env 配置，用户不可写）
  ttsServerUrl: process.env.TTS_SERVER_URL || '',
  ttsToken: process.env.TTS_TOKEN || '',
  // 英语语音配置
  enVoiceId: 'English_PassionateWarrior',   // 英语音色
  enSpeed: 1.0,                              // 英语语速 0.5-2.0
  enVol: 1.0,                                // 英语音量 0-10
  enPitch: 0,                                // 英语音调 -12~12
  enPauseDouHao: 200,                        // 逗号停顿ms
  enPauseJuHao: 350,                         // 句号停顿ms
  enPauseDunHao: 250,                        // 顿号停顿ms
}

export type Settings = typeof DEFAULT_SETTINGS

/**
 * 读取用户保存的原始设置（不含考前突击调整）
 */
export async function getRawSettings(userId: string): Promise<Settings> {
  const rows = await db.userSetting.findMany({ where: { userId } })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  return {
    dailyLimitMin: map.dailyLimitMin ? Number(map.dailyLimitMin) : DEFAULT_SETTINGS.dailyLimitMin,
    singleLimitMin: map.singleLimitMin ? Number(map.singleLimitMin) : DEFAULT_SETTINGS.singleLimitMin,
    wpmUnlockThreshold: map.wpmUnlockThreshold ? Number(map.wpmUnlockThreshold) : DEFAULT_SETTINGS.wpmUnlockThreshold,
    accuracyUnlockThreshold: map.accuracyUnlockThreshold ? Number(map.accuracyUnlockThreshold) : DEFAULT_SETTINGS.accuracyUnlockThreshold,
    fsrsRetention: map.fsrsRetention ? Number(map.fsrsRetention) : DEFAULT_SETTINGS.fsrsRetention,
    // 读取时 clamp 到 3650 天：防存量超大值（如 36500）导致间隔调度失真
    fsrsMaxInterval: Math.min(map.fsrsMaxInterval ? Number(map.fsrsMaxInterval) : DEFAULT_SETTINGS.fsrsMaxInterval, 3650),
    wordBatchSize: map.wordBatchSize ? Number(map.wordBatchSize) : DEFAULT_SETTINGS.wordBatchSize,
    wordReviewBatchSize: map.wordReviewBatchSize ? Number(map.wordReviewBatchSize) : DEFAULT_SETTINGS.wordReviewBatchSize,
    examCramMode: map.examCramMode ? map.examCramMode === 'true' : DEFAULT_SETTINGS.examCramMode,
    examCramIntensity: map.examCramIntensity ? Number(map.examCramIntensity) : DEFAULT_SETTINGS.examCramIntensity,
    parentPin: map.parentPin ?? DEFAULT_SETTINGS.parentPin,
    showKeyboard: map.showKeyboard ? map.showKeyboard === 'true' : DEFAULT_SETTINGS.showKeyboard,
    showFingerGuide: map.showFingerGuide ? map.showFingerGuide === 'true' : DEFAULT_SETTINGS.showFingerGuide,
    soundFeedback: map.soundFeedback ? map.soundFeedback === 'true' : DEFAULT_SETTINGS.soundFeedback,
    fontSize: map.fontSize || DEFAULT_SETTINGS.fontSize,
    // TTS配置（仅服务端 env 配置，忽略 DB 中的用户值）
    ttsServerUrl: process.env.TTS_SERVER_URL || '',
    ttsToken: process.env.TTS_TOKEN || '',
    enVoiceId: map.enVoiceId || DEFAULT_SETTINGS.enVoiceId,
    enSpeed: map.enSpeed ? Number(map.enSpeed) : DEFAULT_SETTINGS.enSpeed,
    enVol: map.enVol ? Number(map.enVol) : DEFAULT_SETTINGS.enVol,
    enPitch: map.enPitch ? Number(map.enPitch) : DEFAULT_SETTINGS.enPitch,
    enPauseDouHao: map.enPauseDouHao ? Number(map.enPauseDouHao) : DEFAULT_SETTINGS.enPauseDouHao,
    enPauseJuHao: map.enPauseJuHao ? Number(map.enPauseJuHao) : DEFAULT_SETTINGS.enPauseJuHao,
    enPauseDunHao: map.enPauseDunHao ? Number(map.enPauseDunHao) : DEFAULT_SETTINGS.enPauseDunHao,
  }
}

/**
 * 获取运行时生效的设置（含考前突击动态调整）
 * 注意：此函数返回的值不用于保存，只用于运行时计算
 */
export async function getSettings(userId: string): Promise<Settings> {
  const raw = await getRawSettings(userId)

  // 考前突击模式：动态调整参数（不持久化）
  if (raw.examCramMode) {
    const intensity = raw.examCramIntensity / 100 // 0-1
    return {
      ...raw,
      wordBatchSize: Math.round(raw.wordBatchSize * (1 + intensity * 2)),
      wordReviewBatchSize: Math.round(raw.wordReviewBatchSize * (1 + intensity * 1.5)),
      dailyLimitMin: Math.round(raw.dailyLimitMin * (1 + intensity * 0.5)),
    }
  }

  return raw
}

/**
 * 保存单个设置项（只保存原始值）
 */
export async function setSetting(userId: string, key: keyof Settings, value: string) {
  await db.userSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  })
}

/**
 * 获取或创建每日统计
 */
export async function getOrCreateDailyStat(userId: string, dateStr?: string) {
  const date = dateStr || localDateStr()
  return db.dailyStat.upsert({
    where: { userId_date: { userId, date } },
    update: {},
    create: { userId, date },
  })
}

/**
 * 检查今日是否超时
 */
export async function checkDailyLimit(userId: string): Promise<{ exceeded: boolean; usedMin: number; limitMin: number }> {
  const settings = await getSettings(userId)
  const stat = await getOrCreateDailyStat(userId)
  const usedMin = Math.floor(stat.totalMs / 60000)
  return {
    exceeded: usedMin >= settings.dailyLimitMin,
    usedMin,
    limitMin: settings.dailyLimitMin,
  }
}
