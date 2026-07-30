import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function extractJson(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e+1)) } catch { return null }
}

const articles = [
  { stage: '小学', category: '日常对话', topic: '购物', diff: 'A1' },
  { stage: '小学', category: '日常对话', topic: '问路', diff: 'A1' },
  { stage: '小学', category: '故事讲述', topic: '一个勇敢的男孩', diff: 'A1' },
  { stage: '小学', category: '科普知识', topic: '为什么天空是蓝色的', diff: 'A1' },
  { stage: '小学', category: '文化介绍', topic: '中国春节', diff: 'A1' },
  { stage: '初中', category: '日常对话', topic: '打电话', diff: 'A2' },
  { stage: '初中', category: '故事讲述', topic: '丢失的猫', diff: 'A2' },
  { stage: '初中', category: '新闻播报', topic: '学校运动会', diff: 'A2' },
  { stage: '初中', category: '科普知识', topic: '蜜蜂的舞蹈', diff: 'A2' },
  { stage: '初中', category: '诗歌朗诵', topic: '友谊', diff: 'A2' },
  { stage: '高中', category: '日常对话', topic: '餐厅点餐', diff: 'B1' },
  { stage: '高中', category: '故事讲述', topic: '森林冒险', diff: 'B1' },
  { stage: '高中', category: '新闻播报', topic: '环保活动', diff: 'B1' },
  { stage: '高中', category: '科普知识', topic: '火山是如何形成的', diff: 'B1' },
  { stage: '高中', category: '文化介绍', topic: '英语国家的餐桌礼仪', diff: 'B1' },
]

const zai = await ZAI.create()
const existing = await db.listeningArticle.count()
let id = existing + 1

for (const a of articles) {
  const wc = a.stage === '小学' ? '50-100' : a.stage === '初中' ? '100-180' : '150-250'
  const qc = a.stage === '小学' ? 3 : a.stage === '初中' ? 4 : 5
  const opts = a.stage === '小学' ? 3 : 4
  console.log('[' + a.stage + '·' + a.category + '] ' + a.topic + '...')
  const prompt = 'Generate a ' + a.stage + ' English listening article. Topic: ' + a.category + ' - ' + a.topic + '. Difficulty: ' + a.diff + '. Word count: ' + wc + '. Include ' + qc + ' multiple choice questions with ' + opts + ' options each. Strict JSON only: {"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A. ","B. ","C. "],"answer":0,"explain":""}],"vocabulary":[]}'
  try {
    const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
    const obj = extractJson(r.choices[0].message.content)
    if (obj && obj.title && obj.content) {
      const stageCount = await db.listeningArticle.count({ where: { stage: a.stage } })
      await db.listeningArticle.upsert({ where:{id}, update:{}, create:{ id, stage: a.stage, order: stageCount+1, title: obj.title, category: a.category, content: obj.content, contentZh: obj.contentZh||'', wordCount: obj.wordCount||0, questions: JSON.stringify(obj.questions||[]), vocabulary: JSON.stringify(obj.vocabulary||[]), difficulty: a.diff } })
      console.log('  ✅ ' + obj.title)
      id++
    }
  } catch(e:any) { console.log('  err:', e.message) }
}
console.log('完成，共' + await db.listeningArticle.count() + '篇')
await db.$disconnect()
