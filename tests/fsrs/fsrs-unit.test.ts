/**
 * FSRS 集成单元测试（vitest）
 * 直接 import src/lib/fsrs.ts 源码，验证封装后的调度行为：
 * 1. rateTyping 评级阈值矩阵（与前端正确判定 acc>=80 对齐）
 * 2. schedule 首学评级直进 Review（learning_steps 无卡死）
 * 3. 连续 Good 间隔指数增长
 * 4. 遗忘（Again）惩罚
 * 5. R 存储 = 复习前旧卡实时 R
 */
import { describe, it, expect } from 'vitest'
import { schedule, rateTyping, createNewCard, Rating } from '../../src/lib/fsrs'

describe('rateTyping 评级阈值', () => {
  it('准确率 <60% → Again（遗忘）', () => {
    expect(rateTyping(0.55, 40)).toBe(Rating.Again)
  })

  it('准确率 60~80%：打字快也封顶 Hard（未达"记住"标准）', () => {
    expect(rateTyping(0.7, 60, 0, 30)).toBe(Rating.Hard)
    expect(rateTyping(0.75, 100, 0, 30)).toBe(Rating.Hard) // wpm 爆表也不升 Good
  })

  it('准确率 ≥80%：正常按分数评级', () => {
    expect(rateTyping(0.85, 30, 0, 30)).toBe(Rating.Good)
    expect(rateTyping(0.95, 30, 0, 30)).toBe(Rating.Easy) // 快
    expect(rateTyping(0.95, 5, 0, 30)).toBe(Rating.Good) // 龟速不升 Easy
    expect(rateTyping(0.82, 30, 0, 30)).toBe(Rating.Good)
  })
})

describe('schedule 首学调度（learning_steps=[] 修复）', () => {
  it('首学 Hard 直进 Review（state=2），按天排期', () => {
    const now = new Date('2026-08-01T10:00:00')
    const card = schedule(createNewCard(), Rating.Hard, 0, now)
    expect(card.state).toBe(2) // 不卡 Learning
    expect(card.due.getTime()).toBeGreaterThan(now.getTime())
    const gapDays = (card.due.getTime() - now.getTime()) / 86400000
    expect(gapDays).toBeGreaterThanOrEqual(1) // 按天粒度
    expect(card.stability).toBeGreaterThan(1)
  })

  it('首学 Easy 间隔更长', () => {
    const now = new Date('2026-08-01T10:00:00')
    const hard = schedule(createNewCard(), Rating.Hard, 0, now)
    const easy = schedule(createNewCard(), Rating.Easy, 0, now)
    expect(easy.due.getTime() - now.getTime()).toBeGreaterThan(hard.due.getTime() - now.getTime())
  })
})

describe('连续 Good 间隔指数增长（学习闭环核心）', () => {
  it('间隔序列严格递增且 ≥1 天（无卡死）', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    let card = schedule(createNewCard(), Rating.Hard, 0, new Date(t0))
    const gaps: number[] = []

    // 模拟 5 次按期复习（每次在 due 当天 Good）
    let t = new Date(t0)
    for (let i = 0; i < 5; i++) {
      t = new Date(card.due)
      card = schedule(card, Rating.Good, 0, new Date(t))
      gaps.push((card.due.getTime() - t.getTime()) / 86400000)
    }

    // 间隔序列：[约1, 约5, 约20, ...] 指数增长
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1])
    }
    expect(gaps[0]).toBeGreaterThanOrEqual(1)
    expect(gaps[gaps.length - 1]).toBeGreaterThan(10)
  })
})

describe('遗忘（Again）惩罚', () => {
  it('Again 后 S 崩落、lapses+1、短期内复考', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    let card = schedule(createNewCard(), Rating.Hard, 0, new Date(t0))
    const stableBefore = card.stability

    // 在到期日遗忘
    const t = new Date(card.due)
    card = schedule(card, Rating.Again, 0, new Date(t))
    expect(card.lapses).toBe(1)
    expect(card.stability).toBeLessThan(stableBefore * 0.3) // S 崩落到 30% 以下
    const gap = (card.due.getTime() - t.getTime()) / 86400000
    expect(gap).toBeLessThanOrEqual(1) // 1 天内复考
  })
})

describe('R 存储：复习前旧卡实时可提取性', () => {
  it('复习提交保存的是评级前旧卡的 R（而非恒 1.0）', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    // 首学 Hard，S≈1.3，due≈1 天后
    let card = schedule(createNewCard(), Rating.Hard, 0, new Date(t0))

    // 到期时复习：此刻旧卡已衰减 1 天，R 应 < 1
    const reviewAt = new Date(card.due)
    card = schedule(card, Rating.Good, 0, new Date(reviewAt))
    expect(card.retrievability).toBeGreaterThan(0)
    expect(card.retrievability).toBeLessThan(1) // 不是恒 1.0
  })

  it('间隔越长、复习前 R 越低', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    let card = schedule(createNewCard(), Rating.Hard, 0, new Date(t0))
    // 复习 2 轮后 S 增大，间隔变长
    card = schedule(card, Rating.Good, 0, new Date(card.due))
    const longGap = (card.due.getTime() - card.lastReview!.getTime()) / 86400000
    // 到期时 R ≈ 0.9（目标保留率）→ 存储的 R 接近 0.9 而非 1.0
    card = schedule(card, Rating.Good, 0, new Date(card.due))
    expect(longGap).toBeGreaterThan(2)
    expect(card.retrievability).toBeGreaterThan(0.5)
    expect(card.retrievability).toBeLessThan(1)
  })
})

describe('考前突击与自定义参数（盲区补齐）', () => {
  it('突击保留率 0.95 的间隔短于默认 0.9（压实现期记忆）', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    const base = createNewCard()
    const g90 = schedule(base, Rating.Good, 0, new Date(t0), 0.9)
    const g95 = schedule(base, Rating.Good, 0, new Date(t0), 0.95)
    const gap90 = (g90.due.getTime() - t0.getTime()) / 86400000
    const gap95 = (g95.due.getTime() - t0.getTime()) / 86400000
    expect(gap95).toBeGreaterThan(0)
    expect(gap95).toBeLessThan(gap90)
  })

  it('自定义低保留率 0.8 的间隔更长（FSRS 数学：retention 越低允许衰减越多，间隔越长；0.95 < 0.9 < 0.8）', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    const base = createNewCard()
    const g80 = schedule(base, Rating.Good, 0, new Date(t0), 0.8)
    const g90 = schedule(base, Rating.Good, 0, new Date(t0), 0.9)
    const g95 = schedule(base, Rating.Good, 0, new Date(t0), 0.95)
    const gap80 = g80.due.getTime() - t0.getTime()
    const gap90 = g90.due.getTime() - t0.getTime()
    const gap95 = g95.due.getTime() - t0.getTime()
    expect(gap80).toBeGreaterThan(gap90)
    expect(gap90).toBeGreaterThan(gap95)
  })

  it('fsrsMaxInterval=60 封顶生效（长间隔不超 60 天，且非卡死）', () => {
    const t0 = new Date('2026-08-01T10:00:00')
    let card = schedule(createNewCard(), Rating.Good, 0, new Date(t0), 0.9, 60)
    // 连续 12 次按期 Good：默认 365 下间隔会指数增长到数百天，应被 60 天封顶截断
    for (let i = 0; i < 12; i++) {
      const t = new Date(card.due)
      card = schedule(card, Rating.Good, 0, new Date(t), 0.9, 60)
    }
    const lastGap = (card.due.getTime() - card.lastReview!.getTime()) / 86400000
    expect(lastGap).toBeLessThanOrEqual(60.5) // maximum_interval 截断 + fuzz 容差
    expect(lastGap).toBeGreaterThan(30) // 已增长到接近 cap（非调度卡死）
  })
})
