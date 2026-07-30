import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = t.lastIndexOf('}'); try { return s>=0 ? JSON.parse(x.slice(s,e+1)) : null } catch { return null } }

const todo = [
  {c:'科普知识',t:'The Human Brain'},
  {c:'文化介绍',t:'Traditional Chinese Opera'},
  {c:'文化介绍',t:'Western Festivals'},
  {c:'文化介绍',t:'Tea Culture'},
  {c:'文化介绍',t:'The Silk Road'},
  {c:'诗歌朗诵',t:'The Road Not Taken'},
  {c:'诗歌朗诵',t:'I Have a Dream'},
  {c:'诗歌朗诵',t:'Youth'},
]

const zai = await ZAI.create()
const maxId = await db.listeningArticle.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
let id = (maxId?.id || 0) + 1
console.log('待生成', todo.length, '篇，起始ID:', id)

for (let i = 0; i < todo.length; i++) {
  const a = todo[i]
  const exists = await db.listeningArticle.findFirst({ where: { stage: '高中', title: { contains: a.t } } })
  if (exists) { console.log('[' + (i+1) + '] ' + a.t + ' skip'); continue }
  console.log('[' + (i+1) + '/' + todo.length + '] ' + a.t)
  try {
    const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate high school English listening article. Topic:'+a.t+'. 150-250 words. 5 questions 4 options each. JSON only:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A. ","B. ","C. ","D. "],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
    const o = extractJson(r.choices[0].message.content)
    if (o && o.title && o.content) {
      const cnt = await db.listeningArticle.count({ where: { stage: '高中' } })
      await db.listeningArticle.create({ data: { id: id++, stage: '高中', order: cnt+1, title: o.title, category: a.c, content: o.content, contentZh: o.contentZh||'', wordCount: o.wordCount||0, questions: JSON.stringify(o.questions||[]), vocabulary: JSON.stringify(o.vocabulary||[]), difficulty: 'B1' } })
      console.log('  ok: ' + o.title)
    } else { console.log('  parse fail') }
  } catch(e) { console.log('  err: ' + (e.message||'').slice(0,80)) }
}

console.log('\n高中: ' + await db.listeningArticle.count({where:{stage:'高中'}}) + '篇')
const r = await db.listeningArticle.groupBy({by:['stage'],_count:true, orderBy:{stage:'asc'}})
for(const g of r) console.log(g.stage+': '+g._count+'篇')
console.log('总计: ' + await db.listeningArticle.count() + '篇')
await db.$disconnect()
