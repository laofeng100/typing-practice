import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function extractJson(text: string): any[] {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('['), e = t.lastIndexOf(']')
  if (s === -1 || e === -1) return []
  try { return JSON.parse(t.slice(s, e+1)) } catch { return [] }
}

async function gen(n: number, stage: string, zai: any) {
  const prompt = `生成${n}条${stage}英语训练句子，难度B1-C1，12-25词，内容涉及学术/社会/科技/思辨。每条含en,zh,grammarPoint,grammarExplain。严格JSON数组：[{"en":"","zh":"","grammarPoint":"","grammarExplain":""}]`
  const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
  return extractJson(r.choices?.[0]?.message?.content || '')
}

console.log('生成高中句子30条...')
const zai = await ZAI.create()
const arr = await gen(30, '高中', zai)
console.log(`获得${arr.length}条`)
// 查询现有高中句子数
const existing = await db.sentence.count({ where: { stage: '高中' } })
let id = 301 + existing
for (const s of arr.slice(0, 30)) {
  if (!s.en) continue
  await db.sentence.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order:id-300, en:String(s.en).trim(), zh:String(s.zh||'').trim(), grammarPoint:String(s.grammarPoint||'').trim(), grammarExplain:String(s.grammarExplain||'').trim(), difficulty:'B2' } })
  id++
}
console.log(`写入完成，高中共${existing + arr.length}条`)
await db.$disconnect()
