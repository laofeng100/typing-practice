/**
 * 补齐听力文章 - 小学30篇、初中30篇、高中30篇
 * 用法: bun run scripts/gen-listen-fill.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function extractJson(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e+1)) } catch { return null }
}

// 每学段需要补充的文章（避免已有重复）
const TODO: {stage:string, category:string, topic:string, diff:string}[] = [
  // 小学还需12篇（已有18篇，含重复）
  {stage:'小学', category:'日常对话', topic:'Visiting a Friend 拜访朋友', diff:'A1'},
  {stage:'小学', category:'日常对话', topic:'At the Restaurant 在餐厅', diff:'A1'},
  {stage:'小学', category:'故事讲述', topic:'The Lost Cat 丢失的猫', diff:'A1'},
  {stage:'小学', category:'故事讲述', topic:'A Magic Paintbrush 神奇的画笔', diff:'A1'},
  {stage:'小学', category:'故事讲述', topic:'The Clever Turtle 聪明的乌龟', diff:'A1'},
  {stage:'小学', category:'新闻播报', topic:'School Sports Day 学校运动会', diff:'A1'},
  {stage:'小学', category:'新闻播报', topic:'Tree Planting Activity 植树活动', diff:'A1'},
  {stage:'小学', category:'科普知识', topic:'How Bees Dance 蜜蜂的舞蹈', diff:'A1'},
  {stage:'小学', category:'科普知识', topic:'How Computers Work 电脑的工作原理', diff:'A1'},
  {stage:'小学', category:'文化介绍', topic:'Table Manners Around the World 世界各地餐桌礼仪', diff:'A1'},
  {stage:'小学', category:'诗歌朗诵', topic:'Spring 春天', diff:'A1'},
  {stage:'小学', category:'诗歌朗诵', topic:'My Dream 我的梦想', diff:'A1'},
  // 初中还需29篇
  {stage:'初中', category:'日常对话', topic:'Making a Phone Call 打电话', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'Seeing a Doctor 看病', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'At the Restaurant 餐厅点餐', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'Inviting a Friend 邀请朋友', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'Weekend Plans 周末计划', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'At the Library 在图书馆', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'Talking About Hobbies 谈论爱好', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'The Lost Cat 丢失的猫', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'A Forest Adventure 森林冒险', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'The Power of Friendship 友谊的力量', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'A Rainy Day Surprise 雨天的惊喜', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'The Boy Who Cried Wolf 喊狼来了的男孩', diff:'A2'},
  {stage:'初中', category:'新闻播报', topic:'School Sports Meeting 学校运动会', diff:'A2'},
  {stage:'初中', category:'新闻播报', topic:'Environmental Protection Activity 环保活动', diff:'A2'},
  {stage:'初中', category:'新闻播报', topic:'Science Competition 科技比赛', diff:'A2'},
  {stage:'初中', category:'新闻播报', topic:'Community Volunteer Service 社区志愿服务', diff:'A2'},
  {stage:'初中', category:'科普知识', topic:'How Volcanoes Form 火山的形成', diff:'A2'},
  {stage:'初中', category:'科普知识', topic:'How Computers Work 电脑工作原理', diff:'A2'},
  {stage:'初中', category:'科普知识', topic:'Photosynthesis 光合作用', diff:'A2'},
  {stage:'初中', category:'科普知识', topic:'The Water Cycle 水循环', diff:'A2'},
  {stage:'初中', category:'文化介绍', topic:'Chinese Spring Festival 中国春节', diff:'A2'},
  {stage:'初中', category:'文化介绍', topic:'Western Table Manners 西方餐桌礼仪', diff:'A2'},
  {stage:'初中', category:'文化介绍', topic:'Greetings Around the World 世界各地的问候', diff:'A2'},
  {stage:'初中', category:'诗歌朗诵', topic:'Friendship 友谊', diff:'A2'},
  {stage:'初中', category:'诗歌朗诵', topic:'Dreams 梦想', diff:'A2'},
  {stage:'初中', category:'诗歌朗诵', topic:'Autumn 秋天', diff:'A2'},
  {stage:'初中', category:'诗歌朗诵', topic:'The Sea 大海', diff:'A2'},
  {stage:'初中', category:'日常对话', topic:'Buying Clothes 买衣服', diff:'A2'},
  {stage:'初中', category:'故事讲述', topic:'A Trip to the Mountains 山间旅行', diff:'A2'},
  // 高中30篇
  {stage:'高中', category:'日常对话', topic:'At the Restaurant 餐厅点餐', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'Hotel Reservation 酒店预订', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'Job Interview 面试', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'At the Airport 在机场', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'Discussing a Movie 讨论电影', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'Planning a Trip 计划旅行', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'At the Bank 在银行', diff:'B1'},
  {stage:'高中', category:'日常对话', topic:'Talking About Future Careers 谈论未来职业', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'A Forest Adventure 森林冒险', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'The Old Lighthouse 老灯塔', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'A Letter from the Past 来自过去的信', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'The Marathon Runner 马拉松跑者', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'The Robot and the Boy 机器人和男孩', diff:'B1'},
  {stage:'高中', category:'故事讲述', topic:'A Storm at Sea 海上风暴', diff:'B1'},
  {stage:'高中', category:'新闻播报', topic:'Climate Change Conference 气候变化大会', diff:'B1'},
  {stage:'高中', category:'新闻播报', topic:'New Technology Exhibition 科技展览', diff:'B1'},
  {stage:'高中', category:'新闻播报', topic:'University Entrance Exam Results 高考成绩', diff:'B1'},
  {stage:'高中', category:'新闻播报', topic:'Environmental Protection Campaign 环保运动', diff:'B1'},
  {stage:'高中', category:'科普知识', topic:'Artificial Intelligence 人工智能', diff:'B1'},
  {stage:'高中', category:'科普知识', topic:'Gene Editing 基因编辑', diff:'B1'},
  {stage:'高中', category:'科普知识', topic:'Renewable Energy 可再生能源', diff:'B1'},
  {stage:'高中', category:'科普知识', topic:'Space Exploration 太空探索', diff:'B1'},
  {stage:'高中', category:'科普知识', topic:'The Human Brain 人脑', diff:'B1'},
  {stage:'高中', category:'文化介绍', topic:'Traditional Chinese Opera 中国传统戏曲', diff:'B1'},
  {stage:'高中', category:'文化介绍', topic:'Western Festivals 西方节日', diff:'B1'},
  {stage:'高中', category:'文化介绍', topic:'Tea Culture Around the World 世界茶文化', diff:'B1'},
  {stage:'高中', category:'文化介绍', topic:'The Silk Road 丝绸之路', diff:'B1'},
  {stage:'高中', category:'诗歌朗诵', topic:'The Road Not Taken 未选择的路', diff:'B1'},
  {stage:'高中', category:'诗歌朗诵', topic:'I Have a Dream 我有一个梦想', diff:'B1'},
  {stage:'高中', category:'诗歌朗诵', topic:'Youth 青春', diff:'B1'},
]

const zai = await ZAI.create()
let id = (await db.listeningArticle.count()) + 1000 // 从1000开始避免冲突
let success = 0, fail = 0

for (let i = 0; i < TODO.length; i++) {
  const a = TODO[i]
  const wc = a.stage === '小学' ? '50-100' : a.stage === '初中' ? '100-180' : '150-250'
  const qc = a.stage === '小学' ? 3 : a.stage === '初中' ? 4 : 5
  const opts = a.stage === '小学' ? 3 : 4
  console.log('[' + (i+1) + '/' + TODO.length + '] ' + a.stage + '·' + a.category + ' - ' + a.topic)

  const prompt = 'Generate a ' + a.stage + ' English listening article. Topic: ' + a.topic + '. Difficulty: ' + a.diff + '. Word count: ' + wc + '. Include ' + qc + ' multiple choice questions with ' + opts + ' options each. The content should be suitable for TTS reading. Strict JSON only: {"title":"","content":"","contentZh":"","wordCount":0,"questions":[{"q":"","options":["A. ","B. ","C. "],"answer":0,"explain":""}],"vocabulary":[]}'

  let success2 = false
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
      const obj = extractJson(r.choices[0].message.content)
      if (obj && obj.title && obj.content && obj.questions && obj.questions.length > 0) {
        const stageCount = await db.listeningArticle.count({ where: { stage: a.stage } })
        await db.listeningArticle.create({ data: { id: id + i, stage: a.stage, order: stageCount + 1, title: String(obj.title).trim(), category: a.category, content: String(obj.content).trim(), contentZh: String(obj.contentZh || '').trim(), wordCount: Number(obj.wordCount) || String(obj.content).split(/\s+/).length, questions: JSON.stringify(obj.questions), vocabulary: JSON.stringify(obj.vocabulary || []), difficulty: a.diff } })
        console.log('  ✅ ' + obj.title)
        success++
        success2 = true
        break
      }
    } catch(e:any) {
      if (attempt === 0) console.log('  重试...', e.message?.slice(0, 50))
    }
  }
  if (!success2) { console.log('  ❌ 失败'); fail++ }
}

console.log('\n完成: 成功' + success + '篇, 失败' + fail + '篇')
const byStage = await db.listeningArticle.groupBy({by:['stage'], _count:true, orderBy:{stage:'asc'}})
for (const g of byStage) console.log(g.stage + ': ' + g._count + '篇')
console.log('总计:', await db.listeningArticle.count(), '篇')
await db.$disconnect()
