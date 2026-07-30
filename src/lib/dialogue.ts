export interface DialogueSegment {
  speaker: string
  text: string
}

const SPEAKER_RE = /(?:^|[\s.!?"'])([A-Z][a-zA-Z]{1,15}):\s*/g

// 注意：English_Playful_Child 在 TTS 服务器上持续 500，不可用，已移除
const DIALOGUE_VOICES = [
  'English_Graceful_Lady',
  'English_Trustworth_Man',
  'English_PassionateWarrior',
  'English_expressive_narrator',
]

export function parseDialogue(content: string): DialogueSegment[] | null {
  const matches = [...content.matchAll(new RegExp(SPEAKER_RE.source, 'g'))]
  if (matches.length < 2) return null

  const speakers = new Set(matches.map(m => m[1]))
  if (speakers.size < 2) return null

  const segments: DialogueSegment[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length
    const text = content.slice(start, end).trim()
    if (text) segments.push({ speaker: matches[i][1], text })
  }

  const labeledLen = segments.reduce((n, s) => n + s.text.length, 0)
  if (labeledLen < content.length * 0.6) return null

  return segments.length >= 2 ? segments : null
}

const NAME_VOICE_MAP: Record<string, string> = {
  mom: 'English_Graceful_Lady',
  mother: 'English_Graceful_Lady',
  mum: 'English_Graceful_Lady',
  dad: 'English_Trustworth_Man',
  father: 'English_Trustworth_Man',
  child: 'English_Graceful_Lady',
  kid: 'English_Graceful_Lady',
  boy: 'English_Graceful_Lady',
  girl: 'English_Graceful_Lady',
  lily: 'English_Graceful_Lady',
  sarah: 'English_Graceful_Lady',
  mary: 'English_Graceful_Lady',
  amy: 'English_Graceful_Lady',
  lucy: 'English_Graceful_Lady',
  kate: 'English_Graceful_Lady',
  anna: 'English_Graceful_Lady',
  emma: 'English_Graceful_Lady',
  tom: 'English_Trustworth_Man',
  jack: 'English_Trustworth_Man',
  mike: 'English_Trustworth_Man',
  peter: 'English_Trustworth_Man',
  ben: 'English_Trustworth_Man',
  sam: 'English_Trustworth_Man',
  shopkeeper: 'English_expressive_narrator',
  waiter: 'English_expressive_narrator',
  waitress: 'English_Graceful_Lady',
  teacher: 'English_Graceful_Lady',
  doctor: 'English_Graceful_Lady',
  narrator: 'English_expressive_narrator',
  librarian: 'English_Graceful_Lady',
  hostess: 'English_Graceful_Lady',
  receptionist: 'English_Graceful_Lady',
  interviewer: 'English_Trustworth_Man',
  candidate: 'English_Graceful_Lady',
  john: 'English_Trustworth_Man',
  lisa: 'English_Graceful_Lady',
  alex: 'English_Trustworth_Man',
}

export function voiceForSpeaker(speakers: string[], speaker: string): string {
  const mapped = NAME_VOICE_MAP[speaker.toLowerCase()]
  if (mapped) return mapped
  const idx = Math.max(0, speakers.indexOf(speaker))
  return DIALOGUE_VOICES[idx % DIALOGUE_VOICES.length]
}

export function dialogueSpeakers(segments: DialogueSegment[]): string[] {
  const seen: string[] = []
  for (const s of segments) if (!seen.includes(s.speaker)) seen.push(s.speaker)
  return seen
}
