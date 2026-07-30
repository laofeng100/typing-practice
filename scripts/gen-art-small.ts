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

const topics = [
  { category: '科技前沿', topic: '人工智能AI' },
  { category: '传统文化', topic: '春节' },
  { category: '生态文明', topic: '碳中和' },
  { category: '思辨表达', topic: '读书的意义' },
  { category: '多模态', topic: '城市空气质量数据解读' },
]

console.log('生成高中短文5篇...')
const zai = await ZAI.create()
const existing = await db.readingArticle.count({ where: { stage: '高中' } })
let id = 51 + existing
let order = 1 + existing
for (const { category, topic } of topics) {
  console.log(`  [${category}] ${topic}...`)
  const prompt = `生成高中英语阅读短文。主题：${category}-${topic}。难度B1-C1，250-400词。配5道选择题(4选项,含解析)。严格JSON：{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[{"en":"","zh":""}],"grammarPoints":[]}`
  try {
    const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
    const o = extractJson(r.choices?.[0]?.message?.content || '')
    if (o && o.title && o.content) {
      await db.readingArticle.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, title:String(o.title).trim(), category, content:String(o.content).trim(), contentZh:String(o.contentZh||'').trim(), wordCount:Number(o.wordCount)||0, questions:JSON.stringify(o.questions||[]), vocabulary:JSON.stringify(o.vocabulary||[]), grammarPoints:JSON.stringify(o.grammarPoints||[]), difficulty:'B1' } })
      console.log(`    ✅ ${o.title}`)
      id++; order++
    }
  } catch (e: any) { console.log('    失败:', e.message) }
}
console.log('完成')
await db.$disconnect()
