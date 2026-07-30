// 仅生成高中句子
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const patterns = ['复杂从句嵌套','虚拟语气','独立主格结构','强调句','省略句','非谓语综合','倒装句','it用法','as用法','情态动词表推测','情态动词表责备','主语从句','表语从句','同位语从句','让步状语从句','方式状语从句']

function extractJson(text: string): any[] {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const start = t.indexOf('['), end = t.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  try { return JSON.parse(t.slice(start, end + 1)) } catch { return [] }
}

async function genBatch(n: number, zai: any): Promise<any[]> {
  const prompt = `你是成都市顶级高中英语教师。请生成${n}条高中阶段英语训练句子，用于打字练习+语法学习。
要求：难度B1-C1，句子长度12-25词，内容涉及学术表达、社会议题、文学引用、科技前沿、思辨论述。句型覆盖：${patterns.join('、')}。英文语法正确地道有高级感；中文翻译准确典雅。语法讲解1-2句。严格JSON数组格式输出（不要markdown）：
[{"en":"英文句子","zh":"中文翻译","grammarPoint":"语法点名称","grammarExplain":"语法讲解"}]`
  for (let i = 0; i < 3; i++) {
    try {
      const r = await zai.chat.completions.create({ messages: [{role:'user',content:prompt}], thinking:{type:'disabled'} })
      const arr = extractJson(r.choices?.[0]?.message?.content || '')
      if (arr.length > 0) return arr
    } catch (e: any) { console.log('  err:', e.message) }
  }
  return []
}

console.log('📝 生成高中句子...')
const zai = await ZAI.create()
const all: any[] = []
for (let b = 0; b < 5; b++) {
  console.log(`  批次 ${b+1}/5...`)
  const arr = await genBatch(30, zai)
  all.push(...arr)
  console.log(`    +${arr.length}, 累计${all.length}`)
}
const seen = new Set<string>()
const unique = all.filter(s => { if (!s.en) return false; const k = String(s.en).toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 150)

// 补充
let supp = 0
while (unique.length < 150 && supp < 3) {
  console.log(`  补充 ${150-unique.length}...`)
  const more = await genBatch(150-unique.length, zai)
  for (const s of more) { if (unique.length>=150) break; const k=String(s.en).toLowerCase().trim(); if(!seen.has(k)&&s.en){seen.add(k);unique.push(s)} }
  supp++
}

console.log(`写入 ${unique.length} 条...`)
for (let i = 0; i < unique.length; i++) {
  const s = unique[i]
  await db.sentence.upsert({ where: { id: 301+i }, update: {}, create: { id:301+i, stage:'高中', order:i+1, en:String(s.en).trim(), zh:String(s.zh).trim(), grammarPoint:String(s.grammarPoint||'').trim(), grammarExplain:String(s.grammarExplain||'').trim(), difficulty:'B2' } })
}
console.log('✅ 完成')
const c = await db.sentence.groupBy({by:['stage'],_count:true})
console.log(JSON.stringify(c))
await db.$disconnect()
