/**
 * 听力文章 TTS 预热脚本
 * 将所有听力文章（含日常对话的多音色分段）预合成到 TTS 服务器永久缓存，
 * 用户播放时全部 cache hit，避免英文 cache-miss 单段 20-35s 导致的超时。
 *
 * 用法: bun run scripts/prewarm-listening-tts.ts
 * 幂等：已缓存的段落服务器直接返回 cache:hit，可反复执行。
 */
import { PrismaClient } from '@prisma/client'
import { parseDialogue, voiceForSpeaker, dialogueSpeakers } from '../src/lib/dialogue'

const db = new PrismaClient()

const TTS_URL = `${process.env.TTS_SERVER_URL}/api/v1/tts/synthesize`
const TOKEN = process.env.TTS_TOKEN || ''
const DEFAULT_VOICE = 'English_PassionateWarrior'
const CONCURRENCY = Number(process.env.PREWARM_CONCURRENCY || 3)
const PER_REQ_TIMEOUT = 120000

interface Task { articleId: number; title: string; text: string; voice: string }

async function synth(t: Task): Promise<'hit' | 'miss' | 'fail'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PER_REQ_TIMEOUT)
      const resp = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: t.text,
          scene: 'article',
          voice_id: t.voice,
          language: 'english',
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
          subtitle_type: 'none',
          fmt: 'mp3',
          is_permanent: true,
          pause_dou_hao_ms: 200,
          pause_ju_hao_ms: 350,
          pause_dun_hao_ms: 250,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status} ${errText.slice(0, 80)}`)
      }
      const data = await resp.json()
      return data.cache === 'hit' ? 'hit' : 'miss'
    } catch (e: any) {
      if (attempt === 1) {
        console.log(`    [失败] #${t.articleId} ${t.voice} "${t.text.slice(0, 30)}..." ${e.message}`)
        return 'fail'
      }
    }
  }
  return 'fail'
}

async function main() {
  if (!process.env.TTS_SERVER_URL || !TOKEN) {
    console.error('缺少 TTS_SERVER_URL / TTS_TOKEN 环境变量')
    process.exit(1)
  }

  const articles = await db.listeningArticle.findMany({ orderBy: { id: 'asc' } })
  console.log(`共 ${articles.length} 篇听力文章`)

  const tasks: Task[] = []
  for (const a of articles) {
    const segments = parseDialogue(a.content)
    if (segments) {
      const speakers = dialogueSpeakers(segments)
      for (const seg of segments) {
        tasks.push({ articleId: a.id, title: a.title, text: seg.text, voice: voiceForSpeaker(speakers, seg.speaker) })
      }
    } else {
      tasks.push({ articleId: a.id, title: a.title, text: a.content, voice: DEFAULT_VOICE })
    }
  }
  console.log(`共 ${tasks.length} 个合成任务（对话已按音色分段），并发 ${CONCURRENCY}\n`)

  let hit = 0, miss = 0, fail = 0, done = 0
  let idx = 0
  const worker = async () => {
    while (idx < tasks.length) {
      const t = tasks[idx++]
      const r = await synth(t)
      if (r === 'hit') hit++
      else if (r === 'miss') miss++
      else fail++
      done++
      if (done % 10 === 0 || r === 'miss') {
        console.log(`[${done}/${tasks.length}] hit=${hit} miss=${miss} fail=${fail}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\n完成：cache命中 ${hit}，新合成 ${miss}，失败 ${fail}`)
  if (fail > 0) process.exit(2)
}

main().finally(() => db.$disconnect())
