import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function extractJsonArr(text: string): any[] {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('['), e = t.lastIndexOf(']')
  if (s === -1 || e === -1) return []
  try { return JSON.parse(t.slice(s, e+1)) } catch { return [] }
}
function extractJsonObj(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e+1)) } catch { return null }
}

async function genSentences(zai: any, n: number) {
  const prompt = `生成${n}条高中英语训练句子，难度B1-C1，12-25词，内容涉及学术/社会/科技/思辨。句型覆盖：虚拟语气、独立主格、强调句、倒装句、非谓语、定语从句、名词性从句。每条含en,zh,grammarPoint,grammarExplain。严格JSON数组：[{"en":"","zh":"","grammarPoint":"","grammarExplain":""}]`
  const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
  return extractJsonArr(r.choices?.[0]?.message?.content || '')
}

async function genArticle(zai: any, category: string, topic: string) {
  const prompt = `生成高中英语阅读短文。主题：${category}-${topic}。难度B1-C1，250-400词。配5道选择题(4选项,含解析)。严格JSON：{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[{"en":"","zh":""}],"grammarPoints":[]}`
  const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
  return extractJsonObj(r.choices?.[0]?.message?.content || '')
}

const zai = await ZAI.create()

// 1. 补充高中句子到150
const existingSent = await db.sentence.count({ where: { stage: '高中' } })
console.log(`高中句子现有${existingSent}条，目标150`)
if (existingSent < 150) {
  const need = 150 - existingSent
  console.log(`生成${need}条...`)
  const arr = await genSentences(zai, need)
  let id = 301 + existingSent
  let order = 1 + existingSent
  for (const s of arr) {
    if (!s.en) continue
    await db.sentence.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, en:String(s.en).trim(), zh:String(s.zh||'').trim(), grammarPoint:String(s.grammarPoint||'').trim(), grammarExplain:String(s.grammarExplain||'').trim(), difficulty:'B2' } })
    id++; order++
  }
  console.log(`句子补充完成，共${order-1}条`)
}

// 2. 补充高中短文到25
const existingArt = await db.readingArticle.count({ where: { stage: '高中' } })
console.log(`高中短文现有${existingArt}篇，目标25`)
if (existingArt < 25) {
  const topics = [
    { category: '传统文化', topic: '京剧' },
    { category: '传统文化', topic: '书法' },
    { category: '科技前沿', topic: '量子计算' },
    { category: '科技前沿', topic: '新能源汽车' },
    { category: '生态文明', topic: '生物多样性保护' },
    { category: '生态文明', topic: '减少塑料使用' },
    { category: '劳动教育', topic: '校园种植' },
    { category: '劳动教育', topic: '手工制作' },
    { category: '思辨表达', topic: '合作与竞争' },
    { category: '思辨表达', topic: '成功的定义' },
    { category: '多模态', topic: '图书馆借阅指南' },
    { category: '多模态', topic: '运动统计数据' },
    { category: '科技前沿', topic: '5G技术' },
    { category: '传统文化', topic: '中国茶文化' },
    { category: '生态文明', topic: '植树造林' },
    { category: '思辨表达', topic: '课外活动价值' },
    { category: '劳动教育', topic: '家务劳动' },
    { category: '多模态', topic: '科技馆参观手册' },
    { category: '传统文化', topic: '丝绸之路' },
  ]
  let id = 51 + existingArt
  let order = 1 + existingArt
  for (const { category, topic } of topics) {
    if (order > 25) break
    console.log(`  [${category}] ${topic}...`)
    try {
      const a = await genArticle(zai, category, topic)
      if (a && a.title && a.content) {
        await db.readingArticle.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, title:String(a.title).trim(), category, content:String(a.content).trim(), contentZh:String(a.contentZh||'').trim(), wordCount:Number(a.wordCount)||0, questions:JSON.stringify(a.questions||[]), vocabulary:JSON.stringify(a.vocabulary||[]), grammarPoints:JSON.stringify(a.grammarPoints||[]), difficulty:'B1' } })
        console.log(`    ✅ ${a.title}`)
        id++; order++
      }
    } catch (e: any) { console.log('    失败:', e.message) }
  }
  console.log(`短文补充完成，共${order-1}篇`)
}

const sc = await db.sentence.groupBy({by:['stage'],_count:true})
const ac = await db.readingArticle.groupBy({by:['stage'],_count:true})
console.log('句子:', JSON.stringify(sc))
console.log('短文:', JSON.stringify(ac))
await db.$disconnect()
