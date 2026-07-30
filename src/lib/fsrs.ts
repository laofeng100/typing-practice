/**
 * FSRS V6 算法 - 基于官方 ts-fsrs 包
 *
 * 使用开源包 ts-fsrs（https://github.com/open-spaced-repetition/ts-fsrs）
 * 这是 FSRS 官方维护的 TypeScript 实现，支持 FSRS-6 算法。
 *
 * 本文件是对 ts-fsrs 的封装，适配打字练习场景：
 * - 根据打字准确率和WPM自动评级
 * - 与数据库 FsrsCard 模型互转
 */

import {
  FSRS,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type RecordLogItem,
  generatorParameters,
} from 'ts-fsrs'

// FSRS-6 默认参数（21个权重）
// 来源：ts-fsrs 官方默认值，基于 FSRS-6.0 规范
export const DEFAULT_PARAMS = {
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
    1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ],
  requestRetention: 0.9,
  maximumInterval: 365,
  enableFuzz: true,
}

// FSRS 实例缓存：按 (retention, maxInterval) 键控，支持用户自定义参数
const fsrsCache = new Map<string, FSRS>()
export function getFsrs(retention?: number, maxInterval?: number): FSRS {
  const r = retention ?? DEFAULT_PARAMS.requestRetention
  const m = maxInterval ?? DEFAULT_PARAMS.maximumInterval
  const key = `${r}:${m}`
  let inst = fsrsCache.get(key)
  if (!inst) {
    inst = new FSRS(generatorParameters({
      w: DEFAULT_PARAMS.w,
      request_retention: r,
      maximum_interval: m,
      enable_fuzz: DEFAULT_PARAMS.enableFuzz,
    }))
    fsrsCache.set(key, inst)
  }
  return inst
}

/**
 * 与数据库 FsrsCard 模型兼容的状态接口
 */
export interface FsrsCardState {
  stability: number
  difficulty: number
  retrievability: number
  due: Date
  lastReview: Date | null
  reps: number
  lapses: number
  state: number // 0=New 1=Learning 2=Review 3=Relearning
}

export type RatingType = Rating // 1=Again 2=Hard 3=Good 4=Easy
export type StateType = State // 0=New 1=Learning 2=Review 3=Relearning

/**
 * 初始化新卡片状态
 */
export function createNewCard(): FsrsCardState {
  const card = createEmptyCard()
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: 0,
    due: card.due,
    lastReview: null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  }
}

/**
 * 将数据库状态转换为 ts-fsrs Card
 */
function toFsrsCard(state: FsrsCardState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0, // 由 repeat 内部计算
    scheduled_days: 0,
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: 0, // 简化：不跟踪学习步骤
    state: state.state as State,
    last_review: state.lastReview || undefined,
  }
}

/**
 * 将 ts-fsrs Card 转换回数据库状态
 */
function fromFsrsCard(card: Card, retrievability: number): FsrsCardState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability,
    due: card.due,
    lastReview: card.last_review || null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  }
}

/**
 * 计算可提取性 (Retrievability)
 * R 由 ts-fsrs forgetting_curve 计算（FSRS-6 幂律衰减）
 */
export function calculateRetrievability(card: FsrsCardState, now: Date = new Date()): number {
  if (card.state === 0) return 0 // 新卡，未知
  if (!card.lastReview) return 0
  if (card.stability <= 0) return 0

  const elapsedDays = (now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24)
  const fsrsInstance = getFsrs()
  const r = fsrsInstance.forgetting_curve(elapsedDays, card.stability)
  return Math.max(0, Math.min(1, r))
}

/**
 * 核心调度函数：根据评级更新卡片状态
 * 使用 ts-fsrs 官方算法
 */
export function schedule(
  card: FsrsCardState,
  rating: Rating,
  responseMs: number = 0,
  now: Date = new Date(),
  retention?: number,
  maxInterval?: number
): FsrsCardState {
  const fsrsInstance = getFsrs(retention, maxInterval)
  const tsCard = toFsrsCard(card)
  const result = fsrsInstance.repeat(tsCard, now)
  const resultItem: RecordLogItem = result[rating]
  const newCard = resultItem.card

  // 计算复习时刻的可提取性（应接近1.0）
  const retrievability = calculateRetrievability(
    fromFsrsCard(newCard, 0),
    now
  )

  return fromFsrsCard(newCard, retrievability)
}

/**
 * 根据打字表现自动评级
 * 教研口径：Again=遗忘（仅看准确率）；打字慢是动作技能问题，不判 lapse；
 * Easy 才要求速度（熟练度证据），其余档位主要由准确率决定
 * @param accuracy 准确率 0-1
 * @param wpm 每分钟字数
 * @param responseMs 响应时间（毫秒）
 * @param targetWpm 目标速度（可选，默认30）
 */
export function rateTyping(accuracy: number, wpm: number, responseMs: number = 0, targetWpm?: number): Rating {
  const accScore = Math.max(0, Math.min(1, accuracy))
  const wpmNorm = targetWpm ? Math.min(1, wpm / targetWpm) : Math.min(1, wpm / 30)
  const score = accScore * 0.8 + wpmNorm * 0.2

  // 准确率低于60%直接判为遗忘
  if (accuracy < 0.6) return Rating.Again
  if (score >= 0.92) return Rating.Easy
  if (score >= 0.72) return Rating.Good
  return Rating.Hard
}

/**
 * 获取待复习卡片数
 */
export function getDueCards(cards: FsrsCardState[], now: Date = new Date()): number {
  return cards.filter(c => c.due <= now).length
}

/**
 * 计算记忆保留率（所有卡片的平均可提取性）
 */
export function getRetentionRate(cards: FsrsCardState[], now: Date = new Date()): number {
  if (cards.length === 0) return 0
  const activeCards = cards.filter(c => c.state > 0)
  if (activeCards.length === 0) return 0
  const totalR = activeCards.reduce((sum, c) => sum + calculateRetrievability(c, now), 0)
  return totalR / activeCards.length
}

// 导出 Rating 和 State 枚举供外部使用
export { Rating, State }
