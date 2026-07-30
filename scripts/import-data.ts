/**
 * 数据导入脚本：从成都英语课程知识点汇总_完整版.xlsx 导入到 SQLite
 * 用法: bun run scripts/import-data.ts
 */
import * as xlsx from 'xlsx'
import { PrismaClient } from '@prisma/client'
import path from 'path'

const db = new PrismaClient()

const EXCEL_PATH = path.resolve(process.cwd(), 'upload/成都英语课程知识点汇总_完整版.xlsx')

async function main() {
  console.log('📖 读取 Excel:', EXCEL_PATH)
  const wb = xlsx.readFile(EXCEL_PATH)
  console.log('Sheets:', wb.SheetNames)

  await importWords(wb)
  await importGrammarPatterns(wb)
  await importGrammarSystem(wb)

  console.log('\n✅ 全部导入完成')
  await printStats()
}

async function importWords(wb: xlsx.WorkBook) {
  // 学段ID偏移：小学 1-9999, 初中 10000-19999, 高中 20000-29999
  const stageConfig: { sheet: string; stage: string; offset: number }[] = [
    { sheet: '小学词汇表', stage: '小学', offset: 0 },
    { sheet: '初中词汇表', stage: '初中', offset: 10000 },
    { sheet: '高中词汇表', stage: '高中', offset: 20000 },
  ]
  let total = 0
  for (const { sheet: sheetName, stage, offset } of stageConfig) {
    const ws = wb.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
    const dataRows = rows.slice(1) as any[][]
    console.log(`  ${sheetName}: ${dataRows.length} 行`)

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
  }
  console.log(`  ✅ 单词导入完成: ${total} 条`)
}

async function importGrammarPatterns(wb: xlsx.WorkBook) {
  const sheets = ['小学语法句式', '初中语法句式', '高中语法句式']
  let total = 0
  let id = 1
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
    const dataRows = rows.slice(1) as any[][]
    console.log(`  ${sheetName}: ${dataRows.length} 行`)

    for (const r of dataRows) {
      if (!r[0]) continue
      await db.grammarPattern.upsert({
        where: { id },
        update: {},
        create: {
          id,
          stage: String(r[0] || '').trim(),
          grade: String(r[1] || '').trim(),
          term: String(r[2] || '').trim(),
          category: String(r[3] || '').trim(),
          name: String(r[4] || '').trim(),
          structure: String(r[5] || '').trim(),
          example: String(r[6] || '').trim(),
          difficulty: String(r[7] || 'A1').trim(),
        },
      })
      id++
      total++
    }
  }
  console.log(`  ✅ 语法句式导入完成: ${total} 条`)
}

async function importGrammarSystem(wb: xlsx.WorkBook) {
  const ws = wb.Sheets['语法体系总览']
  const rows = xlsx.utils.sheet_to_json<any>(ws, { header: 1 })
  const dataRows = rows.slice(1) as any[][]
  console.log(`  语法体系总览: ${dataRows.length} 行`)

  let id = 1
  for (const r of dataRows) {
    if (!r[0]) continue
    await db.grammarSystem.upsert({
      where: { id },
      update: {},
      create: {
        id,
        majorCat: String(r[0] || '').trim(),
        itemName: String(r[1] || '').trim(),
        content: String(r[2] || '').trim(),
        stage: String(r[3] || '').trim(),
        grade: String(r[4] || '').trim(),
        difficulty: String(r[5] || 'A1').trim(),
      },
    })
    id++
  }
  console.log(`  ✅ 语法体系导入完成: ${dataRows.length} 条`)
}

async function printStats() {
  const wordCount = await db.word.count()
  const gpCount = await db.grammarPattern.count()
  const gsCount = await db.grammarSystem.count()
  console.log('\n📊 数据库统计:')
  console.log(`  单词: ${wordCount}`)
  console.log(`  语法句式: ${gpCount}`)
  console.log(`  语法体系: ${gsCount}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
