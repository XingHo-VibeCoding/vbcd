// 索引服务（对应 PRD 的 F2 列表检索 / F3 打开即重建）
// 每次请求都扫描资料目录并算一次指纹：与缓存一致 → 复用缓存；不一致 → 重建并写回 data/.index.json。
// 缓存是派生数据；删掉 .index.json 只会让下次请求变慢，不会丢资料。
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import * as storage from '../storage/files.js'
import { fail } from './errors.js'
import { nowShanghai } from './notes.js'

export const INDEX_FILE = path.join(storage.DATA_DIR, '.index.json')

const SCHEMA_VERSION = 1
const SORTS = ['date_desc', 'date_asc', 'title_asc']
const MAX_LIMIT = 500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 索引里对外可见的字段（text 只用于检索，不出现在接口响应里）
const PUBLIC_FIELDS = ['id', 'title', 'category', 'date', 'tags', 'excerpt', 'path', 'hash']

function fingerprintOf(items) {
  const text = items
    .map((item) => `${item.path}:${Math.round(item.mtimeMs)}:${item.size}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// 检索用文本：标题 + 标签 + 正文，全部小写；正文可能很长，但数据量小（本期目标 ≤1000 条）
function searchTextOf(item) {
  return [item.title, (item.tags ?? []).join(' '), item.content ?? ''].join(' ').toLowerCase()
}

function toIndexEntry(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    date: item.date,
    tags: item.tags ?? [],
    excerpt: item.excerpt,
    path: item.path,
    hash: item.hash,
    text: searchTextOf(item),
  }
}

function publicEntry(entry) {
  return Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, entry[key]]))
}

async function readCache() {
  try {
    const parsed = JSON.parse(await readFile(INDEX_FILE, 'utf8'))
    if (parsed?.schema_version !== SCHEMA_VERSION || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null // 文件不存在、被手改坏、写完一半 —— 一律当无缓存
  }
}

async function writeCache(payload) {
  const tmp = `${INDEX_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    await rename(tmp, INDEX_FILE)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    console.warn(`[index] 缓存写入失败（不影响本次结果，仅下次仍重建）：${err.message}`)
  }
}

/**
 * 取得索引。
 * 返回 { items, warnings, rebuilt, rebuilt_at, rebuilt_in_ms }：
 * - rebuilt=false 表示本次命中缓存（rebuilt_in_ms 即"校验指纹"的耗时）；
 * - rebuilt=true  表示本次重建（rebuilt_in_ms 即"扫描目录重建索引"的耗时）；
 * - 设置 INDEX_CACHE=0 可强制每次重建（排错用）。
 */
export async function loadIndex({ force = false } = {}) {
  const started = Date.now()
  const useCache = !force && process.env.INDEX_CACHE !== '0'
  const cached = useCache ? await readCache() : null

  const { items: scanned, warnings } = await storage.list()
  const fingerprint = fingerprintOf(scanned)

  if (cached && cached.fingerprint === fingerprint) {
    return {
      items: cached.items,
      warnings,
      rebuilt: false,
      rebuilt_at: cached.rebuilt_at,
      rebuilt_in_ms: Date.now() - started,
    }
  }

  const items = scanned.map(toIndexEntry)
  const rebuilt_at = nowShanghai().iso
  const rebuilt_in_ms = Date.now() - started
  await writeCache({ schema_version: SCHEMA_VERSION, fingerprint, rebuilt_at, rebuilt_in_ms, items })

  return { items, warnings, rebuilt: true, rebuilt_at, rebuilt_in_ms }
}

/** 从索引里筛选：关键词（标题/正文/标签）、分类、日期区间、排序、分页 */
export function queryEntries(items, params = {}) {
  const q = String(params.q ?? '').trim().toLowerCase()
  const category = String(params.category ?? '').trim()
  const from = String(params.from ?? '').trim()
  const to = String(params.to ?? '').trim()
  const sort = String(params.sort ?? 'date_desc').trim()
  const limit = params.limit === undefined || params.limit === '' ? 0 : Number(params.limit)
  const offset = params.offset === undefined || params.offset === '' ? 0 : Number(params.offset)

  if (!SORTS.includes(sort)) throw fail('VALIDATION_FAILED', `sort 只能是 ${SORTS.join(' / ')} 之一`)
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_LIMIT) {
    throw fail('VALIDATION_FAILED', `limit 必须是 0（不限）到 ${MAX_LIMIT} 之间的整数`)
  }
  if (!Number.isInteger(offset) || offset < 0) throw fail('VALIDATION_FAILED', 'offset 必须是不小于 0 的整数')
  if (from && !DATE_RE.test(from)) throw fail('VALIDATION_FAILED', 'from 必须是 YYYY-MM-DD')
  if (to && !DATE_RE.test(to)) throw fail('VALIDATION_FAILED', 'to 必须是 YYYY-MM-DD')

  const filtered = items.filter((entry) => {
    if (category && entry.category !== category) return false
    if (from && entry.date < from) return false
    if (to && entry.date > to) return false
    if (q && !entry.text.includes(q)) return false
    return true
  })

  filtered.sort((a, b) => {
    if (sort === 'title_asc') return a.title.localeCompare(b.title, 'zh-Hans-CN')
    if (sort === 'date_asc') return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
    return a.date > b.date ? -1 : a.date < b.date ? 1 : a.id.localeCompare(b.id)
  })

  const page = limit > 0 ? filtered.slice(offset, offset + limit) : filtered.slice(offset)

  return { total: filtered.length, items: page.map(publicEntry) }
}
