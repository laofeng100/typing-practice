/**
 * E2E 测试库初始化：复制正式库 → 清空业务表（测试数据）
 *
 * 用法: node scripts/test/setup-e2e.ts
 *
 * 隔离原则：
 * - 复制正式库全部 schema/基础表（词库/教材/短语/句子等），保证测试环境与生产同构
 * - 清空业务表（练习产生数据），User 账号保留（登录页需要）
 * - 测试全部发生在 e2e.db 中，正式库 custom.db 零接触
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DB_DIR = fileURLToPath(new URL('../../prisma/db/', import.meta.url))
const SRC = `${DB_DIR}custom.db`
const DST = `${DB_DIR}e2e.db`

// 防呆校验（正式库保护，禁止改动）：
// 1) 源/目标文件名必须精确匹配，防止误改路径后把清空操作指向正式库或其他库
// 2) 源与目标必须不同，防止原地清空正式库
if (!SRC.endsWith('custom.db') || !DST.endsWith('e2e.db') || SRC === DST) {
  console.error(`[setup-e2e] 路径校验失败，拒绝执行（仅允许 custom.db → e2e.db）: ${SRC} → ${DST}`)
  process.exit(1)
}

// 业务表（测试数据）：仅对 e2e.db 清空；User 保留。正式库 custom.db 零接触（只读复制）
const BUSINESS_TABLES = [
  'TypingRecord',
  'TypingSession',
  'FsrsReview',
  'FsrsCard',
  'DailyStat',
  'UserProgress',
  'UserSetting',
  'Assessment',
]

if (!existsSync(SRC)) {
  console.error(`[setup-e2e] 源库不存在: ${SRC}`)
  process.exit(1)
}
if (existsSync(DST)) rmSync(DST)

// 源库若启用 WAL，先 checkpoint 保证复制到完整数据（只读连接失败则忽略）
try {
  const src = new DatabaseSync(SRC, { readOnly: true })
  src.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  src.close()
} catch { /* 非 WAL 模式或只读限制，跳过 */ }

copyFileSync(SRC, DST)

const db = new DatabaseSync(DST)
db.exec('PRAGMA foreign_keys = OFF;')
for (const t of BUSINESS_TABLES) db.exec(`DELETE FROM "${t}";`)

// 测试账号：固定 ID，测试可引用（INSERT OR IGNORE：正式库账号不足时补充，已有则保留）
const TEST_USERS = [
  { id: 'e2e-didi', phone: 'e2e-didi', name: '弟弟', stage: '小学', grade: '三年级', bookId: 'PEPXiaoXue3_1' },
  { id: 'e2e-jiejie', phone: 'e2e-jiejie', name: '姐姐', stage: '小学', grade: '四年级', bookId: 'PEPXiaoXue3_1' },
]
const ins = db.prepare(
  `INSERT OR IGNORE INTO "User" (id, phone, name, role, stage, grade, bookId, createdAt, updatedAt)
   VALUES (?, ?, ?, 'student', ?, ?, ?, datetime('now'), datetime('now'))`
)
for (const u of TEST_USERS) ins.run(u.id, u.phone, u.name, u.stage, u.grade, u.bookId)
const userCount = (db.prepare('SELECT COUNT(*) AS c FROM "User"').get() as { c: number }).c
console.log(`[setup-e2e] 测试账号就绪（e2e-didi / e2e-jiejie），共 ${userCount} 个账号`)
db.exec('PRAGMA foreign_keys = ON;')

const count = (t: string): number => (db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c
const biz = BUSINESS_TABLES.map(t => `${t}=${count(t)}`).join(' ')
// 硬校验：业务表必须全部清空，残留会让测试断言失真（如错题本/复习队列基线）
const dirty = BUSINESS_TABLES.filter(t => count(t) > 0)
if (dirty.length > 0) {
  console.error(`[setup-e2e] 业务表清空失败，残留: ${dirty.join(',')}`)
  process.exit(1)
}
const base = ['WordDict', 'Book', 'BookWord', 'WordPhrase', 'Sentence', 'User']
  .map(t => `${t}=${count(t)}`).join(' ')
console.log(`[setup-e2e] 业务表已清空: ${biz}`)
console.log(`[setup-e2e] 账号与基础表保留: ${base}`)
db.close()
