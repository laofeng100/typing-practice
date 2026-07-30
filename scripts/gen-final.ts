import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = x.lastIndexOf('}'); try { return s>=0 ? JSON.parse(x.slice(s,e+1)) : null } catch { return null } }

// 获取当前最大ID
const maxId = await db.listeningArticle.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
let id = (maxId?.id || 0) + 1
console.log('起始ID:', id)

const juniorTodo = [
  {c:'新闻播报',t:'Environmental Protection'},{c:'新闻播报',t:'Science Competition'},{c:'新闻播报',t:'Community Volunteer Service'},
  {c:'科普知识',t:'How Volcanoes Form'},{c:'科普知识',t:'The Water Cycle'},
  {c:'文化介绍',t:'Chinese Spring Festival'},{c:'文化介绍',t:'Western Table Manners'},{c:'文化介绍',t:'Greetings Around the World'},
  {c:'诗歌朗诵',t:'Friendship'},{c:'诗歌朗诵',t:'Dreams'},{c:'诗歌朗诵',t:'Autumn'},{c:'诗歌朗诵',t:'The Sea'},
]
const seniorTodo = [
  {c:'日常对话',t:'At the Restaurant'},{c:'日常对话',t:'Hotel Reservation'},{c:'日常对话',t:'Job Interview'},{c:'日常对话',t:'At the Airport'},
  {c:'日常对话',t:'Discussing a Movie'},{c:'日常对话',t:'Planning a Trip'},{c:'日常对话',t:'At the Bank'},{c:'日常对话',t:'Future Careers'},
  {c:'故事讲述',t:'A Forest Adventure'},{c:'故事讲述',t:'The Old Lighthouse'},{c:'故事讲述',t:'A Letter from the Past'},{c:'故事讲述',t:'The Marathon Runner'},
  {c:'故事讲述',t:'The Robot and the Boy'},{c:'故事讲述',t:'A Storm at Sea'},
  {c:'新闻播报',t:'Climate Change Conference'},{c:'新闻播报',t:'New Technology Exhibition'},{c:'新闻播报',t:'University Exam Results'},{c:'新闻播报',t:'Environmental Campaign'},
  {c:'科普知识',t:'Artificial Intelligence'},{c:'科普知识',t:'Gene Editing'},{c:'科普知识',t:'Renewable Energy'},{c:'科普知识',t:'Space Exploration'},{c:'科普知识',t:'The Human Brain'},
  {c:'文化介绍',t:'Traditional Chinese Opera'},{c:'文化介绍',t:'Western Festivals'},{c:'文化介绍',t:'Tea Culture'},{c:'文化介绍',t:'The Silk Road'},
  {c:'诗歌朗诵',t:'The Road Not Taken'},{c:'诗歌朗诵',t:'I Have a Dream'},{c:'诗歌朗诵',t:'Youth'},
]

const zai = await ZAI.create()

async function gen(stage: string, items: {c:string,t:string}[], diff: string, wc: string, qc: number, opts: number) {
  for (const a of items) {
    const exists = await db.listeningArticle.findFirst({ where: { stage, title: { contains: a.t } } })
    if (exists) { console.log(stage + ' ' + a.t + ' skip'); continue }
    console.log(stage + ' ' + a.t)
    try {
      const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate '+stage+' English listening article. Topic:'+a.t+'. '+wc+' words. '+qc+' questions '+opts+' options. JSON only:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":['+Array(opts).fill(0).map((_,i)=>'"'+String.fromCharCode(65+i)+'. "').join(',')+'],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
      const o = extractJson(r.choices[0].message.content)
      if (o && o.title && o.content) {
        const cnt = await db.listeningArticle.count({ where: { stage } })
        await db.listeningArticle.create({ data: { id: id++, stage, order: cnt+1, title: o.title, category: a.c, content: o.content, contentZh: o.contentZh||'', wordCount: o.wordCount||0, questions: JSON.stringify(o.questions||[]), vocabulary: JSON.stringify(o.vocabulary||[]), difficulty: diff } })
        console.log('  ok: ' + o.title)
      }
    } catch(e) { console.log('  err') }
  }
}

await gen('初中', juniorTodo, 'A2', '100-180', 4, 4)
await gen('高中', seniorTodo, 'B1', '150-250', 5, 4)

console.log('\n最终:')
const byStage = await db.listeningArticle.groupBy({by:['stage'], _count:true, orderBy:{stage:'asc'}})
for (const g of byStage) console.log(g.stage + ': ' + g._count + '篇')
console.log('总计:', await db.listeningArticle.count(), '篇')
await db.$disconnect()
