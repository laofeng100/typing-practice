/**
 * 训练句子生成脚本
 * 为三个学段各生成150条英语训练句子，共450条
 * 用法: bun run scripts/gen-sentences.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const STAGES = [
  { stage: '小学', startId: 1, difficulty: 'A1', patterns: ['be动词','一般现在时','现在进行时','一般过去时','一般将来时','can/can\'t','there be','祈使句','感叹句','比较级','最高级','人称代词','物主代词','指示代词','疑问句','名词单复数','常用介词'] },
  { stage: '初中', startId: 151, difficulty: 'A2', patterns: ['一般现在时','一般过去时','一般将来时','现在进行时','过去进行时','现在完成时','过去完成时','过去将来时','被动语态','宾语从句','状语从句','定语从句','主谓一致','动名词','不定式','分词','反意疑问句','倒装句','直接间接引语'] },
  { stage: '高中', startId: 301, difficulty: 'B2', patterns: ['复杂从句嵌套','虚拟语气','独立主格结构','强调句','省略句','非谓语综合','倒装句','it用法','as用法','情态动词表推测','情态动词表责备','主语从句','表语从句','同位语从句','让步状语从句','方式状语从句'] },
]

const PROMPTS: Record<string, string> = {
  '小学': `你是成都市顶级小学英语教师。请生成{N}条小学阶段英语训练句子，用于打字练习+语法学习。

要求：
1. 难度A1-A2，适合小学3-6年级
2. 句子长度5-12词，内容贴近小学生活（校园、家庭、动物、食物、运动、节日）
3. 句型覆盖：{PATTERNS}
4. 英文语法正确、地道；中文翻译准确自然
5. 语法讲解1-2句话，简明扼要讲清本句语法重点
6. 每条句子聚焦一个语法点，多样化不重复

严格按以下JSON数组格式输出（不要markdown代码块，不要多余文字）：
[{{"en":"英文句子","zh":"中文翻译","grammarPoint":"语法点名称","grammarExplain":"语法讲解"}}]`,

  '初中': `你是成都市顶级初中英语教师。请生成{N}条初中阶段英语训练句子，用于打字练习+语法学习。

要求：
1. 难度A2-B2，适合7-9年级
2. 句子长度8-18词，内容涉及个人经历、社会现象、科普常识、文化差异、梦想规划
3. 句型覆盖：{PATTERNS}
4. 英文语法正确、地道；中文翻译准确流畅
5. 语法讲解1-2句话，讲清本句语法重点
6. 多样化，避免重复句型

严格按以下JSON数组格式输出（不要markdown代码块，不要多余文字）：
[{{"en":"英文句子","zh":"中文翻译","grammarPoint":"语法点名称","grammarExplain":"语法讲解"}}]`,

  '高中': `你是成都市顶级高中英语教师。请生成{N}条高中阶段英语训练句子，用于打字练习+语法学习。

要求：
1. 难度B1-C1，适合10-12年级
2. 句子长度12-25词，内容涉及学术表达、社会议题、文学引用、科技前沿、思辨论述
3. 句型覆盖：{PATTERNS}
4. 英文语法正确、地道、有高级感；中文翻译准确典雅
5. 语法讲解1-2句话，讲清本句语法重点（可涉及长难句分析）
6. 多样化，每条聚焦不同语法点

严格按以下JSON数组格式输出（不要markdown代码块，不要多余文字）：
[{{"en":"英文句子","zh":"中文翻译","grammarPoint":"语法点名称","grammarExplain":"语法讲解"}}]`,
}

function extractJson(text: string): any[] {
  // 去除markdown代码块
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  // 找到第一个 [ 和最后一个 ]
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  const jsonStr = t.slice(start, end + 1)
  try {
    return JSON.parse(jsonStr)
  } catch {
    return []
  }
}

async function genBatch(stage: string, n: number, patterns: string[], difficulty: string, zai: any): Promise<any[]> {
  const prompt = PROMPTS[stage].replace('{N}', String(n)).replace('{PATTERNS}', patterns.join('、'))
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'disabled' },
      })
      const content = r.choices?.[0]?.message?.content || ''
      const arr = extractJson(content)
      if (arr.length > 0) return arr
      console.log(`  [重试 ${attempt+1}] ${stage} 解析失败，重试...`)
    } catch (e: any) {
      console.log(`  [错误 ${attempt+1}] ${stage}: ${e.message}`)
    }
  }
  return []
}

async function main() {
  console.log('🚀 开始生成训练句子...')
  const zai = await ZAI.create()

  for (const cfg of STAGES) {
    console.log(`\n📝 生成 ${cfg.stage} 句子 (目标150条)...`)
    const all: any[] = []
    // 分5批，每批30条
    for (let batch = 0; batch < 5; batch++) {
      console.log(`  批次 ${batch+1}/5...`)
      const arr = await genBatch(cfg.stage, 30, cfg.patterns, cfg.difficulty, zai)
      all.push(...arr)
      console.log(`    获得 ${arr.length} 条，累计 ${all.length}`)
      if (all.length >= 150) break
    }

    // 去重 & 截断到150
    const seen = new Set<string>()
    const unique = all.filter((s: any) => {
      if (!s.en || !s.zh) return false
      const key = String(s.en).toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 150)

    // 不足150则补充
    let supplement = 0
    while (unique.length < 150 && supplement < 3) {
      console.log(`  补充生成 ${150 - unique.length} 条...`)
      const more = await genBatch(cfg.stage, 150 - unique.length, cfg.patterns, cfg.difficulty, zai)
      for (const s of more) {
        if (unique.length >= 150) break
        const key = String(s.en).toLowerCase().trim()
        if (!seen.has(key) && s.en && s.zh) {
          seen.add(key)
          unique.push(s)
        }
      }
      supplement++
    }

    console.log(`  ✅ ${cfg.stage} 共 ${unique.length} 条，写入数据库...`)
    for (let i = 0; i < unique.length; i++) {
      const s = unique[i]
      await db.sentence.upsert({
        where: { id: cfg.startId + i },
        update: {},
        create: {
          id: cfg.startId + i,
          stage: cfg.stage,
          order: i + 1,
          en: String(s.en).trim(),
          zh: String(s.zh).trim(),
          grammarPoint: String(s.grammarPoint || '').trim(),
          grammarExplain: String(s.grammarExplain || '').trim(),
          difficulty: cfg.difficulty,
        },
      })
    }
  }

  const counts = await db.sentence.groupBy({ by: ['stage'], _count: true })
  console.log('\n📊 生成结果:')
  for (const c of counts) console.log(`  ${c.stage}: ${c._count} 条`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
