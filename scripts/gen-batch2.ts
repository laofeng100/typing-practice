import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = x.lastIndexOf('}'); return s>=0 ? JSON.parse(x.slice(s,e+1)) : null }

const todo = [
  // 小学还需9篇(当前21)
  {s:'小学',c:'故事讲述',t:'The Clever Turtle',d:'A1'},
  {s:'小学',c:'新闻播报',t:'School Sports Day',d:'A1'},
  {s:'小学',c:'新闻播报',t:'Tree Planting',d:'A1'},
  {s:'小学',c:'科普知识',t:'How Bees Dance',d:'A1'},
  {s:'小学',c:'科普知识',t:'How Computers Work',d:'A1'},
  {s:'小学',c:'文化介绍',t:'Table Manners',d:'A1'},
  {s:'小学',c:'诗歌朗诵',t:'Spring',d:'A1'},
  {s:'小学',c:'诗歌朗诵',t:'My Dream',d:'A1'},
  {s:'小学',c:'故事讲述',t:'A Magic Paintbrush',d:'A1'},
]
const zai = await ZAI.create()
let id = 2000 + Math.floor(Math.random()*1000)
for (const a of todo) {
  const wc = '50-100', qc = 3, opts = 3
  console.log(a.s + ' ' + a.t)
  try {
    const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate '+a.s+' English listening. Topic:'+a.t+'. '+wc+' words. '+qc+' questions '+opts+' options. JSON:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C."],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
    const o = extractJson(r.choices[0].message.content)
    if (o && o.title) {
      const cnt = await db.listeningArticle.count({where:{stage:a.s}})
      await db.listeningArticle.create({data:{id:id++,stage:a.s,order:cnt+1,title:o.title,category:a.c,content:o.content,contentZh:o.contentZh||'',wordCount:o.wordCount||50,questions:JSON.stringify(o.questions||[]),vocabulary:JSON.stringify(o.vocabulary||[]),difficulty:a.d}})
      console.log('  ok: '+o.title)
    }
  } catch(e){console.log('  err')}
}
console.log('done: '+await db.listeningArticle.count())
await db.$disconnect()
