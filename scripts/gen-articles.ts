/**
 * 阅读短文生成脚本
 * 为三个学段各生成25篇英语阅读短文，共75篇
 * 用法: bun run scripts/gen-articles.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const STAGE_CFG = [
  {
    stage: '小学', startId: 1, difficulty: 'A1', wordRange: [80, 150], qCount: 3, optionsPerQ: 3,
  },
  {
    stage: '初中', startId: 26, difficulty: 'A2', wordRange: [150, 250], qCount: 4, optionsPerQ: 4,
  },
  {
    stage: '高中', startId: 51, difficulty: 'B1', wordRange: [250, 400], qCount: 5, optionsPerQ: 4,
  },
]

// 每学段25篇的类别分布
const CATEGORY_PLAN = [
  { category: '传统文化', count: 5, topics: ['春节', '端午节', '中秋节', '京剧', '书法', '中国茶文化', '传统建筑四合院', '剪纸艺术', '功夫', '丝绸之路'] },
  { category: '科技前沿', count: 5, topics: ['人工智能AI', '中国空间站', '新能源汽车', '5G技术', '量子计算', '基因编辑', '可再生能源', '智能家居', '太空探索', '机器人技术'] },
  { category: '生态文明', count: 4, topics: ['垃圾分类', '碳中和', '生物多样性保护', '海洋污染', '植树造林', '减少塑料使用', '气候变化', '绿色出行'] },
  { category: '劳动教育', count: 3, topics: ['学做饭', '校园种植', '社区志愿服务', '手工制作', '家务劳动', '职业体验'] },
  { category: '思辨表达', count: 4, topics: ['手机的利与弊', '读书的意义', '合作与竞争', '成功的定义', '网络交友', '课外活动价值'] },
  { category: '多模态', count: 4, topics: ['城市空气质量数据解读', '学校活动海报', '旅游攻略图表', '运动统计数据', '图书馆借阅指南', '科技馆参观手册'] },
]

function buildPrompt(stage: string, category: string, topic: string, wordRange: number[], qCount: number, optionsPerQ: number) {
  const difficultyMap: Record<string, string> = {
    '小学': 'A1-A2，适合3-6年级小学生',
    '初中': 'A2-B2，适合7-9年级初中生',
    '高中': 'B1-C1，适合10-12年级高中生',
  }
  return `你是成都市顶级英语教师，擅长命题。请生成一篇${stage}英语阅读短文，紧扣2024中高考改革方向。

【主题】${category} - ${topic}
【难度】${difficultyMap[stage]}
【篇幅】${wordRange[0]}-${wordRange[1]}词
【要求】
1. 内容积极向上、符合社会主义核心价值观，体现中华优秀文化和时代精神
2. 英文地道、语法正确、难度匹配学段
3. 适合作为打字练习材料（避免过多特殊符号）
4. 配套${qCount}道选择题，题型多样化（主旨大意/细节理解/词义猜测/推理判断/作者态度/标题匹配/信息判断）
5. 每题${optionsPerQ}个选项，答案唯一明确，附简短解析
6. 提取5-8个核心词汇（来自本学段词汇）
7. 标注1-3个语法点

严格按以下JSON格式输出（不要markdown代码块，不要多余文字）：
{{
  "title": "英文标题",
  "content": "英文正文（多段落用\\n分隔）",
  "contentZh": "中文翻译",
  "wordCount": 词数,
  "questions": [
    {{"q":"题干（英文）","options":["A. 选项","B. 选项","C. 选项"],"answer":0,"explain":"解析（中文）"}}
  ],
  "vocabulary": [{{"en":"单词","zh":"释义"}}],
  "grammarPoints": ["语法点1","语法点2"]
}}

answer字段是正确选项的索引（0开始）。只输出JSON。`
}

function extractJson(text: string): any | null {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

async function genArticle(stage: string, category: string, topic: string, wordRange: number[], qCount: number, optionsPerQ: number, zai: any): Promise<any | null> {
  const prompt = buildPrompt(stage, category, topic, wordRange, qCount, optionsPerQ)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'disabled' },
      })
      const content = r.choices?.[0]?.message?.content || ''
      const obj = extractJson(content)
      if (obj && obj.title && obj.content && obj.questions) return obj
      console.log(`    [重试 ${attempt+1}] 解析失败`)
    } catch (e: any) {
      console.log(`    [错误 ${attempt+1}] ${e.message}`)
    }
  }
  return null
}

async function main() {
  console.log('🚀 开始生成阅读短文...')
  const zai = await ZAI.create()

  for (const cfg of STAGE_CFG) {
    console.log(`\n📝 生成 ${cfg.stage} 短文 (目标25篇)...`)
    let order = 1
    let id = cfg.startId
    const stageDone: string[] = []

    for (const plan of CATEGORY_PLAN) {
      const topics = plan.topics.slice(0, plan.count)
      for (const topic of topics) {
        console.log(`  [${plan.category}] ${topic}...`)
        const art = await genArticle(cfg.stage, plan.category, topic, cfg.wordRange, cfg.qCount, cfg.optionsPerQ, zai)
        if (!art) {
          console.log(`    ❌ 生成失败，跳过`)
          continue
        }
        await db.readingArticle.upsert({
          where: { id },
          update: {},
          create: {
            id,
            stage: cfg.stage,
            order,
            title: String(art.title).trim(),
            category: plan.category,
            content: String(art.content).trim(),
            contentZh: String(art.contentZh || '').trim(),
            wordCount: Number(art.wordCount) || String(art.content).split(/\s+/).length,
            questions: JSON.stringify(art.questions || []),
            vocabulary: JSON.stringify(art.vocabulary || []),
            grammarPoints: JSON.stringify(art.grammarPoints || []),
            difficulty: cfg.difficulty,
          },
        })
        stageDone.push(`${plan.category}: ${art.title}`)
        id++
        order++
      }
    }
    console.log(`  ✅ ${cfg.stage} 共生成 ${stageDone.length} 篇`)
  }

  const counts = await db.readingArticle.groupBy({ by: ['stage'], _count: true })
  console.log('\n📊 生成结果:')
  for (const c of counts) console.log(`  ${c.stage}: ${c._count} 篇`)
  const catCounts = await db.readingArticle.groupBy({ by: ['category'], _count: true })
  console.log('按类别:')
  for (const c of catCounts) console.log(`  ${c.category}: ${c._count}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
