import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = x.lastIndexOf('}'); return s>=0 ? JSON.parse(x.slice(s,e+1)) : null }
const todo = [
  {s:'高中',c:'日常对话',t:'At the Restaurant',d:'B1'},
  {s:'高中',c:'日常对话',t:'Hotel Reservation',d:'B1'},
  {s:'高中',c:'日常对话',t:'Job Interview',d:'B1'},
  {s:'高中',c:'日常对话',t:'At the Airport',d:'B1'},
  {s:'高中',c:'日常对话',t:'Discussing a Movie',d:'B1'},
  {s:'高中',c:'日常对话',t:'Planning a Trip',d:'B1'},
  {s:'高中',c:'日常对话',t:'At the Bank',d:'B1'},
  {s:'高中',c:'日常对话',t:'Future Careers',d:'B1'},
  {s:'高中',c:'故事讲述',t:'A Forest Adventure',d:'B1'},
  {s:'高中',c:'故事讲述',t:'The Old Lighthouse',d:'B1'},
  {s:'高中',c:'故事讲述',t:'A Letter from the Past',d:'B1'},
  {s:'高中',c:'故事讲述',t:'The Marathon Runner',d:'B1'},
  {s:'高中',c:'故事讲述',t:'The Robot and the Boy',d:'B1'},
  {s:'高中',c:'故事讲述',t:'A Storm at Sea',d:'B1'},
  {s:'高中',c:'新闻播报',t:'Climate Change Conference',d:'B1'},
  {s:'高中',c:'新闻播报',t:'New Technology Exhibition',d:'B1'},
  {s:'高中',c:'新闻播报',t:'University Exam Results',d:'B1'},
  {s:'高中',c:'新闻播报',t:'Environmental Campaign',d:'B1'},
  {s:'高中',c:'科普知识',t:'Artificial Intelligence',d:'B1'},
  {s:'高中',c:'科普知识',t:'Gene Editing',d:'B1'},
  {s:'高中',c:'科普知识',t:'Renewable Energy',d:'B1'},
  {s:'高中',c:'科普知识',t:'Space Exploration',d:'B1'},
  {s:'高中',c:'科普知识',t:'The Human Brain',d:'B1'},
  {s:'高中',c:'文化介绍',t:'Traditional Chinese Opera',d:'B1'},
  {s:'高中',c:'文化介绍',t:'Western Festivals',d:'B1'},
  {s:'高中',c:'文化介绍',t:'Tea Culture',d:'B1'},
  {s:'高中',c:'文化介绍',t:'The Silk Road',d:'B1'},
  {s:'高中',c:'诗歌朗诵',t:'The Road Not Taken',d:'B1'},
  {s:'高中',c:'诗歌朗诵',t:'I Have a Dream',d:'B1'},
  {s:'高中',c:'诗歌朗诵',t:'Youth',d:'B1'},
]
const zai = await ZAI.create()
let id = 4000
for (const a of todo) {
  console.log(a.s+' '+a.t)
  try {
    const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate '+a.s+' English listening article. Topic:'+a.t+'. 150-250 words. 5 questions 4 options. JSON:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
    const o = extractJson(r.choices[0].message.content)
    if (o && o.title) { const cnt = await db.listeningArticle.count({where:{stage:a.s}}); await db.listeningArticle.create({data:{id:id++,stage:a.s,order:cnt+1,title:o.title,category:a.c,content:o.content,contentZh:o.contentZh||'',wordCount:o.wordCount||150,questions:JSON.stringify(o.questions||[]),vocabulary:JSON.stringify(o.vocabulary||[]),difficulty:a.d}}); console.log('  ok: '+o.title) }
  } catch(e){console.log('  err')}
}
console.log('done: '+await db.listeningArticle.count())
await db.$disconnect()
