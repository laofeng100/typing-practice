import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
function extractJson(t: string): any { let x = t.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''); const s = x.indexOf('{'), e = x.lastIndexOf('}'); return s>=0 ? JSON.parse(x.slice(s,e+1)) : null }
const todo = [
  {s:'初中',c:'日常对话',t:'At the Library',d:'A2'},
  {s:'初中',c:'日常对话',t:'Talking About Hobbies',d:'A2'},
  {s:'初中',c:'日常对话',t:'Buying Clothes',d:'A2'},
  {s:'初中',c:'故事讲述',t:'The Lost Cat',d:'A2'},
  {s:'初中',c:'故事讲述',t:'A Forest Adventure',d:'A2'},
  {s:'初中',c:'故事讲述',t:'The Power of Friendship',d:'A2'},
  {s:'初中',c:'故事讲述',t:'A Rainy Day Surprise',d:'A2'},
  {s:'初中',c:'故事讲述',t:'The Boy Who Cried Wolf',d:'A2'},
  {s:'初中',c:'新闻播报',t:'School Sports Meeting',d:'A2'},
  {s:'初中',c:'新闻播报',t:'Environmental Protection',d:'A2'},
  {s:'初中',c:'新闻播报',t:'Science Competition',d:'A2'},
  {s:'初中',c:'新闻播报',t:'Community Volunteer Service',d:'A2'},
  {s:'初中',c:'科普知识',t:'How Volcanoes Form',d:'A2'},
  {s:'初中',c:'科普知识',t:'The Water Cycle',d:'A2'},
  {s:'初中',c:'科普知识',t:'Photosynthesis',d:'A2'},
  {s:'初中',c:'文化介绍',t:'Chinese Spring Festival',d:'A2'},
  {s:'初中',c:'文化介绍',t:'Western Table Manners',d:'A2'},
  {s:'初中',c:'文化介绍',t:'Greetings Around the World',d:'A2'},
  {s:'初中',c:'诗歌朗诵',t:'Friendship',d:'A2'},
  {s:'初中',c:'诗歌朗诵',t:'Dreams',d:'A2'},
]
const zai = await ZAI.create()
let id = 3200
for (const a of todo) {
  console.log(a.t)
  try {
    const r = await zai.chat.completions.create({messages:[{role:'user',content:'Generate 初中 English listening article. Topic:'+a.t+'. 100-180 words. 4 questions 4 options. JSON:{"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A.","B.","C.","D."],"answer":0,"explain":""}],"vocabulary":[]}'}],thinking:{type:'disabled'}})
    const o = extractJson(r.choices[0].message.content)
    if (o && o.title) { const cnt = await db.listeningArticle.count({where:{stage:a.s}}); await db.listeningArticle.create({data:{id:id++,stage:'初中',order:cnt+1,title:o.title,category:a.c,content:o.content,contentZh:o.contentZh||'',wordCount:o.wordCount||100,questions:JSON.stringify(o.questions||[]),vocabulary:JSON.stringify(o.vocabulary||[]),difficulty:a.d}}); console.log('  ok') }
  } catch(e){console.log('  err')}
}
console.log('junior total: '+await db.listeningArticle.count({where:{stage:'初中'}}))
await db.$disconnect()
