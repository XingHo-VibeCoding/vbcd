// Day 17 板块②：把 data/ 里的真实 Markdown 资料同步进 PostgreSQL 的 notes 表。
//   用法：DATABASE_URL='postgres://…' node scripts/sync-to-db.mjs [--dry-run]
// 设计口径：
//   - 幂等：ON CONFLICT (id) DO UPDATE，仅在 hash 变化时才更新；重复执行无副作用。
//   - 文件仍是一等数据源（SPEC §7.3 迁移期）：本脚本只做「文件 → 库」单向同步，不回写文件。
//   - 解析失败、缺必填字段（title/date/category）的行逐条警告并跳过，不让一条坏数据卡住整批。
//   - hash 口径与文件版一致：sha256(title.trim() + "\n" + content.trim())（services/notes.js:hashOf），
//     与 frontmatter 里的 hash 字段同源，可对照验证迁移正确性。
//   - 不碰 tasks 表：任务运行时数据（data/.runtime/tasks.json）映射有取舍，属 Day 18 写入侧的事。
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import pg from 'pg'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(HERE, '../../data')
const DRY_RUN = process.argv.includes('--dry-run')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function hashOf(title, content) {
  return createHash('sha256').update(`${String(title).trim()}\n${String(content).trim()}`, 'utf8').digest('hex')
}

function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, '\n')
}

// 复刻 storage/files.js 的解析规则（含裸字符串兜底），保持两份解析器结果一致
function parseValue(raw, key) {
  const text = raw.trim()
  if (text === '') return key === 'tags' ? [] : ''
  try {
    return JSON.parse(text)
  } catch {
    const bare = text.replace(/^["']|["']$/g, '')
    if (key === 'tags') {
      return bare
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
    return bare
  }
}

function parseNoteFile(rawText, id) {
  const raw = normalizeNewlines(rawText)
  if (!raw.startsWith('---')) return null
  const close = raw.indexOf('\n---', 3)
  if (close === -1) return null
  const fields = {}
  for (const line of raw.slice(3, close).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(':')
    if (at === -1) continue
    fields[trimmed.slice(0, at).trim()] = parseValue(trimmed.slice(at + 1), trimmed.slice(0, at).trim())
  }
  return {
    title: String(fields.title ?? ''),
    category: String(fields.category ?? ''),
    date: String(fields.date ?? ''),
    tags: Array.isArray(fields.tags) ? fields.tags.map(String) : [],
    source_url: String(fields.source_url ?? '') || null,
    created_at: String(fields.created_at ?? '') || null,
    updated_at: String(fields.updated_at ?? '') || null,
    schema_version: Number(fields.schema_version) || 1,
    body: raw.slice(close + 4).replace(/^\n/, '').trim(),
  }
}

async function collectRows() {
  const rows = []
  const warnings = []
  const categories = await readdir(DATA_DIR)
  for (const category of categories.sort()) {
    if (category.startsWith('.')) continue
    const dir = path.join(DATA_DIR, category)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue // 根级文件（profile.md 等）与不可读目录跳过
    }
    for (const ent of entries.filter((e) => e.isFile() && e.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${category}/${ent.name}`
      const id = ent.name.slice(0, -3)
      try {
        const parsed = parseNoteFile(await readFile(path.join(dir, ent.name), 'utf8'), id)
        if (!parsed) {
          warnings.push(`${rel}：缺少 frontmatter，已跳过`)
          continue
        }
        const title = parsed.title || id
        const cat = parsed.category || category
        if (!DATE_RE.test(parsed.date)) {
          warnings.push(`${rel}：date 缺失或不是 YYYY-MM-DD（${parsed.date || '空'}），已跳过`)
          continue
        }
        rows.push({
          id,
          title,
          category: cat,
          date: parsed.date,
          tags: parsed.tags,
          source_url: parsed.source_url,
          created_at: parsed.created_at || `${parsed.date}T00:00:00+08:00`,
          updated_at: parsed.updated_at || `${parsed.date}T00:00:00+08:00`,
          hash: hashOf(title, parsed.body),
          schema_version: parsed.schema_version,
          body: parsed.body,
        })
      } catch (err) {
        warnings.push(`${rel}：读取/解析失败（${err.message}），已跳过`)
      }
    }
  }
  return { rows, warnings }
}

const { rows, warnings } = await collectRows()
for (const w of warnings) console.warn(`⚠ ${w}`)
console.log(`扫描到 ${rows.length} 条可入库资料${DRY_RUN ? '（dry-run，不写库）' : ''}`)

if (DRY_RUN) {
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.category}  ${r.date}  ${r.title}`)
  }
  process.exit(0)
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('未配置 DATABASE_URL，退出。')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.trim(), max: 2 })
try {
  let inserted = 0
  let updated = 0
  let unchanged = 0
  for (const r of rows) {
    const res = await pool.query(
      `INSERT INTO notes (id, title, category, date, tags, source_url,
                          created_at, updated_at, hash, schema_version, body)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         date = EXCLUDED.date,
         tags = EXCLUDED.tags,
         source_url = EXCLUDED.source_url,
         updated_at = now(),
         hash = EXCLUDED.hash,
         schema_version = EXCLUDED.schema_version,
         body = EXCLUDED.body
       WHERE notes.hash IS DISTINCT FROM EXCLUDED.hash
       RETURNING (xmax = 0) AS inserted_new`,
      [r.id, r.title, r.category, r.date, r.tags, r.source_url,
       r.created_at, r.updated_at, r.hash, r.schema_version, r.body],
    )
    if (res.rowCount === 0) unchanged += 1
    else if (res.rows[0].inserted_new) inserted += 1
    else updated += 1
  }
  console.log(`同步完成：新增 ${inserted} / 更新 ${updated} / 未变 ${unchanged} / 跳过 ${warnings.length}`)

  // 对账：库里有但文件里没有的行不自动删（防误伤），只报告出来由人工裁定
  const fileIds = new Set(rows.map((r) => r.id))
  const orphans = await pool.query('SELECT id, category, date FROM notes WHERE id <> ALL($1::text[]) ORDER BY date DESC', [[...fileIds]])
  if (orphans.rows.length) {
    console.log(`ℹ 库中还有 ${orphans.rows.length} 行没有对应文件（可能此前入过库或被手改 id）：`)
    for (const o of orphans.rows) console.log(`    ${o.date}  ${o.category}  ${o.id}`)
  }
} finally {
  await pool.end()
}
