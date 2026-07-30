import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function extractJsonObj(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e+1)) } catch { return null }
}

const topics = [
  { category: '传统文化', topic: '京剧' },
  { category: '科技前沿', topic: '5G技术' },
  { category: '生态文明', topic: '生物多样性保护' },
  { category: '思辨表达', topic: '合作与竞争' },
]

const zai = await ZAI.create()
const existing = await db.readingArticle.count({ where: { stage: '高中' } })
console.log(`现有${existing}篇，生成${topics.length}篇...`)
let id = 51 + existing
let order = 1 + existing
for (const { category, topic } of topics) {
  console.log(`  [${category}] ${topic}...`)
  const prompt = `生成高中英语阅读短文。主题：${category}-${topic}。难度B1-C1，250-400词。配5道选择题(4选项,含解析)。严格JSON：{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[{"en":"","zh":""}],"grammarPoints":[]}`
  try {
    const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
    const a = extractJsonObj(r.choices?.[0]?.message?.content || '')
    if (a && a.title && a.content) {
      await db.readingArticle.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, title:String(a.title).trim(), category, content:String(a.content).trim(), contentZh:String(a.contentZh||'').trim(), wordCount:Number(a.wordCount)||0, questions:JSON.stringify(a.questions||[]), vocabulary:JSON.stringify(a.vocabulary||[]), grammarPoints:JSON.stringify(a.grammarPoints||[]), difficulty:'B1' } })
      console.log(`    ✅ ${a.title}`)
      id++; order++
    }
  } catch (e: any) { console.log('    失败:', e.message) }
}
console.log(`完成，共${order-1}篇`)
await db.$disconnect()
