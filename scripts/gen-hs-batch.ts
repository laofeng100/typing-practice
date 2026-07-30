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

const zai = await ZAI.create()
const existing = await db.sentence.count({ where: { stage: '高中' } })
console.log(`现有${existing}条，生成30条...`)
const prompt = `生成30条高中英语训练句子，难度B1-C1，12-25词。句型：虚拟语气/独立主格/强调句/倒装/非谓语/定语从句。每条含en,zh,grammarPoint,grammarExplain。JSON数组：[{"en":"","zh":"","grammarPoint":"","grammarExplain":""}]`
const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
const arr = extractJsonArr(r.choices?.[0]?.message?.content || [])
console.log(`获得${arr.length}条`)
let id = 301 + existing
let order = 1 + existing
for (const s of arr) {
  if (!s.en) continue
  await db.sentence.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, en:String(s.en).trim(), zh:String(s.zh||'').trim(), grammarPoint:String(s.grammarPoint||'').trim(), grammarExplain:String(s.grammarExplain||'').trim(), difficulty:'B2' } })
  id++; order++
}
console.log(`完成，共${order-1}条`)
await db.$disconnect()
