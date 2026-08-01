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

// 业务表（测试数据）：清空；User 保留
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
const base = ['WordDict', 'Book', 'BookWord', 'WordPhrase', 'Sentence', 'User']
  .map(t => `${t}=${count(t)}`).join(' ')
console.log(`[setup-e2e] 业务表已清空: ${biz}`)
console.log(`[setup-e2e] 账号与基础表保留: ${base}`)
db.close()
