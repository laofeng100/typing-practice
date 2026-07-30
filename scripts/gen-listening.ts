/**
 * 听力文章生成脚本
 * 为三个学段各生成30篇听力文章，共90篇
 * 用法: bun run scripts/gen-listening.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const STAGE_CFG = [
  { stage: '小学', startId: 1, difficulty: 'A1', wordRange: [50, 100], qCount: 3 },
  { stage: '初中', startId: 31, difficulty: 'A2', wordRange: [100, 180], qCount: 4 },
  { stage: '高中', startId: 61, difficulty: 'B1', wordRange: [150, 250], qCount: 5 },
]

// 每学段30篇的类别分布
const CATEGORY_PLAN = [
  { category: '日常对话', count: 8, topics: ['在学校', '购物', '问路', '打电话', '看病', '餐厅点餐', '邀请朋友', '讨论周末计划'] },
  { category: '故事讲述', count: 7, topics: ['一个勇敢的男孩', '丢失的猫', '神奇的画笔', '森林冒险', '聪明的乌龟', '友谊的力量', '雨天的惊喜'] },
  { category: '新闻播报', count: 4, topics: ['学校运动会', '环保活动', '科技比赛', '社区志愿服务'] },
  { category: '科普知识', count: 5, topics: ['为什么天空是蓝色的', '蜜蜂的舞蹈', '火山是如何形成的', '电脑的工作原理', '植物的光合作用'] },
  { category: '文化介绍', count: 3, topics: ['中国春节', '英语国家的餐桌礼仪', '世界各地的问候方式'] },
  { category: '诗歌朗诵', count: 3, topics: ['春天', '友谊', '梦想'] },
]

function extractJson(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e + 1)) } catch { return null }
}

async function genArticle(stage: string, category: string, topic: string, wordRange: number[], qCount: number, difficulty: string, zai: any) {
  const prompt = `你是成都市顶级英语教师。请生成一篇${stage}英语听力文章，用于听力理解练习。

【主题】${category} - ${topic}
【难度】${difficulty}（适合${stage}学生）
【篇幅】${wordRange[0]}-${wordRange[1]}词
【要求】
1. 内容积极向上，适合听力练习（语速适中，词汇难度匹配学段）
2. 适合TTS朗读（避免过多特殊符号、缩写）
3. 配套${qCount}道听力理解选择题，考查主旨/细节/推理/词义
4. 每题${qCount === 3 ? 3 : 4}个选项，答案唯一，附简短解析

严格按JSON格式输出（不要markdown代码块）：
{"title":"英文标题","content":"英文正文（适合朗读）","contentZh":"中文翻译","wordCount":词数,"questions":[{"q":"题干（英文）","options":["A. 选项","B. 选项","C. 选项"],"answer":0,"explain":"解析（中文）"}],"vocabulary":[{"en":"单词","zh":"释义"}]}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'disabled' },
      })
      const obj = extractJson(r.choices?.[0]?.message?.content || '')
      if (obj && obj.title && obj.content && obj.questions) return obj
      console.log(`    [重试 ${attempt+1}] 解析失败`)
    } catch (e: any) {
      console.log(`    [错误 ${attempt+1}] ${e.message}`)
    }
  }
  return null
}

async function main() {
  console.log('🎧 开始生成听力文章...')
  const zai = await ZAI.create()

  for (const cfg of STAGE_CFG) {
    console.log(`\n📝 生成 ${cfg.stage} 听力文章 (目标30篇)...`)
    let id = cfg.startId
    let order = 1

    for (const plan of CATEGORY_PLAN) {
      const topics = plan.topics.slice(0, plan.count)
      for (const topic of topics) {
        console.log(`  [${plan.category}] ${topic}...`)
        const art = await genArticle(cfg.stage, plan.category, topic, cfg.wordRange, cfg.qCount, cfg.difficulty, zai)
        if (!art) {
          console.log(`    ❌ 生成失败，跳过`)
          continue
        }
        await db.listeningArticle.upsert({
          where: { id },
          update: {},
          create: {
            id,
            stage: cfg.stage,
            order,
            title: String(art.title).trim(),
            category: plan.category,
            content: String(art.content).trim(),
            contentZh: String(art.contentZh || '').trim(),
            wordCount: Number(art.wordCount) || String(art.content).split(/\s+/).length,
            questions: JSON.stringify(art.questions || []),
            vocabulary: JSON.stringify(art.vocabulary || []),
            difficulty: cfg.difficulty,
          },
        })
        console.log(`    ✅ ${art.title} (${String(art.content).split(/\s+/).length}词)`)
        id++
        order++
      }
    }
    console.log(`  ✅ ${cfg.stage} 共生成 ${order - 1} 篇`)
  }

  const counts = await db.listeningArticle.groupBy({ by: ['stage'], _count: true })
  console.log('\n📊 生成结果:')
  for (const c of counts) console.log(`  ${c.stage}: ${c._count} 篇`)
  console.log(`  总计: ${await db.listeningArticle.count()} 篇`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
