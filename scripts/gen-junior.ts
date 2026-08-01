import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = x.lastIndexOf('}'); return s>=0 ? JSON.parse(x.slice(s,e+1)) : null }
const todo = [
  {s:'初中',c:'日常对话',t:'Making a Phone Call',d:'A2'},
  {s:'初中',c:'日常对话',t:'Seeing a Doctor',d:'A2'},
  {s:'初中',c:'日常对话',t:'At the Restaurant',d:'A2'},
  {s:'初中',c:'日常对话',t:'Inviting a Friend',d:'A2'},
  {s:'初中',c:'日常对话',t:'Weekend Plans',d:'A2'},
]
const zai = await ZAI.create()
let id = 3100
for (const a of todo) {
  console.log(a.s+' '+a.t)
  try {
    const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate '+a.s+' English listening article. Topic:'+a.t+'. 100-180 words. 4 questions 4 options. JSON:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
    const o = extractJson(r.choices[0].message.content)
    if (o && o.title) { const cnt = await db.listeningArticle.count({where:{stage:a.s}}); await db.listeningArticle.create({data:{id:id++,stage:a.s,order:cnt+1,title:o.title,category:a.c,content:o.content,contentZh:o.contentZh||'',wordCount:o.wordCount||100,questions:JSON.stringify(o.questions||[]),vocabulary:JSON.stringify(o.vocabulary||[]),difficulty:a.d}}); console.log('  ok: '+o.title) }
  } catch(e: any){console.log('  err: '+e.message?.slice(0,60))}
}
console.log('junior done: '+await db.listeningArticle.count({where:{stage:'初中'}}))
await db.$disconnect()
