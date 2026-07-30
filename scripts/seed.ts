/**
 * 初始化脚本：创建固定账号 + 重置并导入数据
 * 用法: bun run scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import * as xlsx from 'xlsx'
import path from 'path'

const db = new PrismaClient()
const EXCEL_PATH = path.resolve(process.cwd(), 'upload/成都英语课程知识点汇总_完整版.xlsx')

// 两个固定账号
const FIXED_USERS = [
  { phone: '18990341688', name: '弟弟', nickname: '弟弟', avatar: 'boy' },
  { phone: '18011289973', name: '姐姐', nickname: '姐姐', avatar: 'girl' },
]

async function main() {
  console.log('🔧 初始化固定账号...')
  for (const u of FIXED_USERS) {
    await db.user.upsert({
      where: { phone: u.phone },
      update: { name: u.name, nickname: u.nickname, avatar: u.avatar, stage: '小学', grade: '小升初' },
      create: { ...u, stage: '小学', grade: '小升初' },
    })
    console.log(`  ✅ ${u.name} (${u.phone})`)
  }

  console.log('\n📖 读取 Excel 导入教学数据...')
  const wb = xlsx.readFile(EXCEL_PATH)

  await importWords(wb)
  await importGrammar(wb)

  await printStats()
}

async function importWords(wb: xlsx.WorkBook) {
  const stageConfig = [
    { sheet: '小学词汇表', stage: '小学', offset: 0 },
    { sheet: '初中词汇表', stage: '初中', offset: 10000 },
    { sheet: '高中词汇表', stage: '高中', offset: 20000 },
  ]
  let total = 0
  for (const { sheet: sheetName, stage, offset } of stageConfig) {
    const ws = wb.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
    const dataRows = rows.slice(1) as any[][]
    const records = dataRows
      .filter(r => r[0] != null && r[1] != null)
      .map(r => ({
        id: Number(r[0]) + offset,
        en: String(r[1]).trim(),
        zh: String(r[2] || '').trim(),
        pos: String(r[3] || '').trim(),
        stage,
        difficulty: String(r[5] || 'A1').trim(),
      }))
    for (const rec of records) {
      await db.word.upsert({
        where: { id: rec.id },
        update: rec,
        create: rec,
      })
    }
    total += records.length
    console.log(`  ${sheetName}: ${records.length} 条`)
  }
  console.log(`  ✅ 单词: ${total}`)
}

async function importGrammar(wb: xlsx.WorkBook) {
  const sheets = ['小学语法句式', '初中语法句式', '高中语法句式']
  let id = 1
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
    const dataRows = rows.slice(1) as any[][]
    for (const r of dataRows) {
      if (!r[0]) continue
      await db.grammarPattern.upsert({
        where: { id },
        update: {},
        create: {
          id, stage: String(r[0]||'').trim(), grade: String(r[1]||'').trim(),
          term: String(r[2]||'').trim(), category: String(r[3]||'').trim(),
          name: String(r[4]||'').trim(), structure: String(r[5]||'').trim(),
          example: String(r[6]||'').trim(), difficulty: String(r[7]||'A1').trim(),
        },
      })
      id++
    }
  }
  console.log(`  ✅ 语法句式: ${id-1}`)

  const ws = wb.Sheets['语法体系总览']
  const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
  const dataRows = rows.slice(1) as any[][]
  let gid = 1
  for (const r of dataRows) {
    if (!r[0]) continue
    await db.grammarSystem.upsert({
      where: { id: gid },
      update: {},
      create: {
        id: gid, majorCat: String(r[0]||'').trim(), itemName: String(r[1]||'').trim(),
        content: String(r[2]||'').trim(), stage: String(r[3]||'').trim(),
        grade: String(r[4]||'').trim(), difficulty: String(r[5]||'A1').trim(),
      },
    })
    gid++
  }
  console.log(`  ✅ 语法体系: ${gid-1}`)
}

async function printStats() {
  console.log('\n📊 数据库统计:')
  console.log(`  用户: ${await db.user.count()}`)
  console.log(`  单词: ${await db.word.count()}`)
  console.log(`  语法句式: ${await db.grammarPattern.count()}`)
  console.log(`  语法体系: ${await db.grammarSystem.count()}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
