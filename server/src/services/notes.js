// 资料业务逻辑（SPEC 第 2.1 节字段 / 第 3 章接口 3）：
// 校验 → 组装 Note → 查重 → 交给存储适配层落盘。
// 本文件不直接读写文件系统，也不直接碰库——「存哪」由 storage/note-store.js 内部判定（Day 19 起）。
import { createHash } from 'node:crypto'
import * as noteStore from '../storage/note-store.js'
import * as files from '../storage/files.js'
import { dbConfigured } from '../db/pool.js'
import { loadIndex, queryEntries } from './index-store.js'
import { fail } from './errors.js'

export const CATEGORIES = ['learning', 'life', 'work', 'essay']

const TITLE_MAX = 80
const TAGS_MAX = 10
const SLUG_MAX = 40
const TZ_OFFSET_MINUTES = 8 * 60 // Asia/Shanghai（SPEC 第 6 章约定），不依赖机器时区

/** 统一时间：带 +08:00 偏移的 ISO 8601（不随机器时区变化） */
export function nowShanghai() {
  const shifted = new Date(Date.now() + TZ_OFFSET_MINUTES * 60 * 1000)
  const iso = shifted.toISOString()
  return { date: iso.slice(0, 10), iso: `${iso.slice(0, 19)}+08:00` }
}

/** 查重用的内容哈希（SPEC 第 2 章：正文与元数据的 SHA-256） */
export function hashOf(title, content) {
  return createHash('sha256').update(`${String(title).trim()}\n${String(content).trim()}`, 'utf8').digest('hex')
}

/** 由标题生成文件名用的 slug：保留中文与字母数字，其余归一为连字符 */
export function slugify(title) {
  const slug = String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
  return slug || 'note'
}

/**
 * 来源链接归一化（D10 修复，2026-10-14）：把「指向同一资源的不同写法」折叠成同一个 key。
 *
 * 只做两条**明确、可解释**的折叠，不擅自猜别名：
 *   ① 去掉 fragment（`#...`）——纯客户端锚点，不改变服务端资源；
 *   ② 去掉路径末尾的 `/`（含根路径）——`.../BV1N2pc6gErK/` 与 `.../BV1N2pc6gErK`
 *      是同一视频，这正是 D10 重复入库的成因（见 runs/2026-10-14-day21.md §1.3 D10）。
 *
 * **刻意保留 query 串**：`?t=9.7` 与 `?t=10.1` 在本库内是两条不同资料，
 * query 确实承载区分度；笼统合并会把不同资源误判为同一份。
 * 故 `.../subok?alias=1` 与 `.../subok` 仍视为**不同**（smoke「不擅自认定别名相同」断言不变）。
 *
 * ⚠️ **等价性约束**：本函数产出必须与 db/notes.js 的 `NORMALIZED_SOURCE` 表达式
 * **逐字符相同**，否则「库里存 A 写法、查 B 写法」会漏命中。故**不使用 `new URL()` 序列化**
 * （它会把 `https://host` 自动补成 `https://host/`，与 SQL 侧 rtrim 结果不一致），
 * 改为手工拼接 scheme/host/path(+query)，行为与 SQL 的 `rtrim(split_part(col,'#',1),'/')` 完全对齐。
 *
 * 非 http(s) 或解析失败时原样返回，绝不因归一化抛错。
 */
const URL_SHAPE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(?:#[\s\S]*)?$/

export function normalizeSourceUrl(raw) {
  const url = String(raw ?? '').trim()
  if (!url) return ''
  const m = URL_SHAPE.exec(url)
  if (!m) return url
  const [, scheme, host, path, query = ''] = m
  if (!/^https?$/i.test(scheme)) return url
  const trimmedPath = path.replace(/\/+$/, '')   // 去 fragment；去路径尾部所有 '/'（含根路径）
  return `${scheme}://${host}${trimmedPath}${query}`
}

/** 字段校验；不通过直接抛带 code 的错误（由统一错误中间件转成响应） */
export function validate(input) {
  const title = String(input?.title ?? '').trim()
  const content = String(input?.content ?? '').trim()
  const category = String(input?.category ?? '').trim()
  const sourceUrl = String(input?.source_url ?? '').trim()
  const sourcePart = input?.source_part ?? null
  if (sourcePart !== null && (!Number.isInteger(sourcePart) || sourcePart < 1 || !sourceUrl)) {
    throw fail('VALIDATION_FAILED', 'source_part 需要来源链接和 ≥1 的整数')
  }
  const tags = Array.isArray(input?.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : []

  if (!title) throw fail('VALIDATION_FAILED', '标题不能为空')
  if ([...title].length > TITLE_MAX) {
    throw fail('VALIDATION_FAILED', `标题最多 ${TITLE_MAX} 字（当前 ${[...title].length} 字）`)
  }
  if (!content) throw fail('VALIDATION_FAILED', '正文不能为空')
  if (!CATEGORIES.includes(category)) {
    throw fail('VALIDATION_FAILED', `分类必须是 ${CATEGORIES.join(' / ')} 之一`)
  }
  if (tags.length > TAGS_MAX) {
    throw fail('VALIDATION_FAILED', `标签最多 ${TAGS_MAX} 个（当前 ${tags.length} 个）`)
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw fail('VALIDATION_FAILED', '来源链接必须以 http:// 或 https:// 开头')
  }

  return { title, content, category, tags, sourceUrl, sourcePart }
}

/**
 * 新建资料（对应 POST /api/notes）：
 * 返回 { id, path, hash }；内容重复时抛 DUPLICATE（409），字段不合法时抛 VALIDATION_FAILED（400）。
 *
 * 落点自适应（Day 18 落地、Day 19 收进存储层）：配了 DATABASE_URL → 只写 notes 表
 * （库连不上 → 503 DB_UNAVAILABLE，不静默退文件）；没配 → 照旧落 data/ 文件。
 * 判定细节在 storage/note-store.js，本函数不再感知 DATABASE_URL。
 * 好处：F13 转写、F14 收敛、note 任务这些走本函数的归档链路自动全部入库。
 */
export async function createNote(input) {
  const { title, content, category, tags, sourceUrl, sourcePart } = validate(input)
  const hash = hashOf(title, content)

  const duplicated = await noteStore.findByHash(hash)
  if (duplicated) {
    // 库行没有 path 字段，用 category/id 派生一个同形的展示值
    const where = duplicated.path ?? `${duplicated.category}/${duplicated.id}.md`
    const error = fail('DUPLICATE', `这条资料已存在（${where}），未重复写入`, 409)
    error.note = { id: duplicated.id, path: where }
    throw error
  }

  const { date, iso } = nowShanghai()
  const note = {
    id: `${date}-${slugify(title)}`,
    title,
    category,
    date,
    tags,
    source_url: sourceUrl,
    source_part: sourcePart,
    created_at: iso,
    updated_at: iso,
    hash,
    schema_version: 1,
    content,
  }

  try {
    return await noteStore.put(note)
  } catch (err) {
    if (err.code) throw err
    throw fail('STORAGE_FAILED', `写入资料目录失败：${err.message}`, 503)
  }
}

// ── /api/db/* 读接口的业务封装（Day 19：把校验从 db 层上移回本层）──
// routes/db.js 只负责接单回响应；limit/offset 合不合法是接口语义，归业务层管。
// db/notes.js 从此是「给合法条件就查」的纯 SQL 实现，不再抛 VALIDATION_FAILED。

const DB_LIST_MAX_LIMIT = 500 // 与 index-store 的 limit 上限一致；本期数据量 ≤500，默认等价不限

/**
 * GET /api/db/notes 的列表查询：先校验/归一化参数，再交给存储层查库。
 * q（标题+正文+标签模糊）、category（精确）、limit（1–500）、offset（≥0）。
 */
export async function listNotesFromDb(params = {}) {
  const limit = params.limit === undefined || params.limit === '' ? DB_LIST_MAX_LIMIT : Number(params.limit)
  const offset = params.offset === undefined || params.offset === '' ? 0 : Number(params.offset)
  const q = String(params.q ?? '').trim()
  const category = String(params.category ?? '').trim()

  if (!Number.isInteger(limit) || limit < 1 || limit > DB_LIST_MAX_LIMIT) {
    throw fail('VALIDATION_FAILED', `limit 必须是 1 到 ${DB_LIST_MAX_LIMIT} 之间的整数`)
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw fail('VALIDATION_FAILED', 'offset 必须是不小于 0 的整数')
  }

  return await noteStore.listDb({ limit, offset, q, category })
}

/**
 * GET /api/db/notes/:id 的详情查询：库查不到返回 null，由路由层统一 404。
 * 返回 { meta, content } 与文件版同构。
 */
export async function getNoteFromDb(id) {
  return await noteStore.getDb(String(id))
}

/** 主站资料列表：数据库模式读权威表；文件模式保留原有指纹索引与查询契约。 */
export async function listNotes(params = {}) {
  if (dbConfigured()) {
    const { items } = await noteStore.list()
    return queryEntries(items, params)
  }
  const { items, warnings, rebuilt, rebuilt_at, rebuilt_in_ms } = await loadIndex()
  if (warnings.length) console.warn(`[index] 跳过 ${warnings.length} 个文件：${warnings.join('；')}`)
  return { ...queryEntries(items, params), rebuilt, rebuilt_at, rebuilt_in_ms }
}

export async function getNote(id) {
  return noteStore.get(String(id))
}

/**
 * 编辑资料：先删旧文件再重 put（put 永不覆盖，故须先 remove）。
 * 保留原 id / created_at / source_url；title/category/tags/content 可改，updated_at 刷新。
 * 字段校验复用 validate()；不存在 → NOT_FOUND。
 */
export async function updateNote(id, input) {
  const existing = await noteStore.get(String(id))
  if (!existing) throw fail('NOT_FOUND', '这条资料不存在', 404)

  const { title, content, category, tags } = validate({ ...existing.meta, ...input, source_url: existing.meta.source_url, source_part: existing.meta.source_part ?? null })
  const { iso } = nowShanghai()

  if (dbConfigured()) {
    const updated = await noteStore.update({
      id: String(id), title, category, tags, content,
      hash: hashOf(title, content), updated_at: iso,
    })
    if (!updated) throw fail('NOT_FOUND', '这条资料不存在', 404)
    return updated
  }

  // 先删后建：put 永不覆盖同名文件；删除失败抛 STORAGE_FAILED。
  const removed = await files.remove(String(id))
  if (!removed) throw fail('NOT_FOUND', '这条资料不存在', 404)

  const note = {
    id: existing.meta.id, // 保留原 id——同分类同日期下重 put 会落同名文件（旧文件已删）
    title,
    category,
    date: existing.meta.date,
    tags,
    source_url: existing.meta.source_url,
    source_part: existing.meta.source_part ?? null,
    created_at: existing.meta.created_at,
    updated_at: iso,
    hash: hashOf(title, content),
    schema_version: existing.meta.schema_version ?? 1,
    content,
  }
  try {
    return await files.put(note)
  } catch (err) {
    if (err.code) throw err
    throw fail('STORAGE_FAILED', `写入资料目录失败：${err.message}`, 503)
  }
}

/**
 * 删除资料：物理删 Markdown 文件。索引缓存按目录指纹自动重建，无需手工失效。
 * 不存在 → NOT_FOUND。返回 { id, path } 供路由回显。
 */
export async function removeNote(id) {
  const removed = await noteStore.remove(String(id))
  if (!removed) throw fail('NOT_FOUND', '这条资料不存在', 404)
  return removed
}
