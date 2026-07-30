// 仅生成高中短文
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const CATEGORY_PLAN = [
  { category: '传统文化', count: 5, topics: ['春节', '京剧', '书法', '中国茶文化', '丝绸之路'] },
  { category: '科技前沿', count: 5, topics: ['人工智能AI', '中国空间站', '量子计算', '基因编辑', '太空探索'] },
  { category: '生态文明', count: 4, topics: ['碳中和', '海洋污染', '气候变化', '绿色出行'] },
  { category: '劳动教育', count: 3, topics: ['学做饭', '社区志愿服务', '职业体验'] },
  { category: '思辨表达', count: 4, topics: ['手机的利与弊', '读书的意义', '网络交友', '课外活动价值'] },
  { category: '多模态', count: 4, topics: ['城市空气质量数据解读', '旅游攻略图表', '运动统计数据', '科技馆参观手册'] },
]

function extractJson(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  try { return JSON.parse(t.slice(s, e+1)) } catch { return null }
}

async function gen(category: string, topic: string, zai: any) {
  const prompt = `你是成都市顶级英语教师。生成一篇高中英语阅读短文，紧扣2024高考改革。
主题：${category} - ${topic}，难度B1-C1适合高中生，250-400词。
内容积极向上。英文地道语法正确。配5道选择题(4选项)，题型多样(主旨/细节/词义/推理/标题)。答案唯一明确附解析。提取5-8核心词汇，标注1-3语法点。
严格JSON输出(不要markdown)：
{"title":"英文标题","content":"正文(\\n分隔)","contentZh":"中文翻译","wordCount":词数,"questions":[{"q":"题干","options":["A.","B.","C.","D."],"answer":0,"explain":"解析"}],"vocabulary":[{"en":"","zh":""}],"grammarPoints":[""]}`
  for (let i = 0; i < 3; i++) {
    try {
      const r = await zai.chat.completions.create({ messages:[{role:'user',content:prompt}], thinking:{type:'disabled'} })
      const o = extractJson(r.choices?.[0]?.message?.content || '')
      if (o && o.title && o.content && o.questions) return o
    } catch (e:any) { console.log('  err:', e.message) }
  }
  return null
}

console.log('📝 生成高中短文...')
const zai = await ZAI.create()
let id = 51, order = 1
for (const plan of CATEGORY_PLAN) {
  for (const topic of plan.topics.slice(0, plan.count)) {
    console.log(`  [${plan.category}] ${topic}...`)
    const a = await gen(plan.category, topic, zai)
    if (!a) { console.log('    失败'); continue }
    await db.readingArticle.upsert({ where:{id}, update:{}, create:{ id, stage:'高中', order, title:String(a.title).trim(), category:plan.category, content:String(a.content).trim(), contentZh:String(a.contentZh||'').trim(), wordCount:Number(a.wordCount)||String(a.content).split(/\s+/).length, questions:JSON.stringify(a.questions||[]), vocabulary:JSON.stringify(a.vocabulary||[]), grammarPoints:JSON.stringify(a.grammarPoints||[]), difficulty:'B1' } })
    console.log(`    ✅ ${a.title}`)
    id++; order++
  }
}
console.log('完成')
const c = await db.readingArticle.groupBy({by:['stage'],_count:true})
console.log(JSON.stringify(c))
await db.$disconnect()
