// 资料业务逻辑（SPEC 第 2.1 节字段 / 第 3 章接口 3）：
// 校验 → 组装 Note → 查重 → 交给存储适配层落盘。
// 本文件不直接读写文件系统，也不直接碰库——「存哪」由 storage/note-store.js 内部判定（Day 19 起）。
import { createHash } from 'node:crypto'
import * as noteStore from '../storage/note-store.js'
import * as files from '../storage/files.js'
import { dbConfigured } from '../db/pool.js'
import { fail } from './errors.js'

export const CATEGORIES = ['learning', 'life', 'work']

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

/** 字段校验；不通过直接抛带 code 的错误（由统一错误中间件转成响应） */
export function validate(input) {
  const title = String(input?.title ?? '').trim()
  const content = String(input?.content ?? '').trim()
  const category = String(input?.category ?? '').trim()
  const sourceUrl = String(input?.source_url ?? '').trim()
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

  return { title, content, category, tags, sourceUrl }
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
  const { title, content, category, tags, sourceUrl } = validate(input)
  const hash = hashOf(title, content)

  const duplicated = await noteStore.findByHash(hash)
  if (duplicated) {
    // 库行没有 path 字段，用 category/id 派生一个同形的展示值
    const where = duplicated.path ?? `${duplicated.category}/${duplicated.id}.md`
    throw fail('DUPLICATE', `这条资料已存在（${where}），未重复写入`, 409)
  }

  const { date, iso } = nowShanghai()
  const note = {
    id: `${date}-${slugify(title)}`,
    title,
    category,
    date,
    tags,
    source_url: sourceUrl,
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

// ── 板块⑥ 后台资料编辑 / 删除（文件层专属）───────────────────────────────
// 边界（PLAN-admin §3 D6+D7）：后台可对 note 做编辑与删除，权限高于主站；
// 冲突策略 A = 网站改动直接覆盖文件，Obsidian 靠远程同步刷新（单人可控，不乐观锁）。
// 仅文件模式支持：配了 DATABASE_URL 时写侧在 notes 表，编辑/删除走库是另一套，
// 第一期不做（PLAN §7 遗留）——此处如实抛 NOT_SUPPORTED，不静默退到文件层。

/**
 * 编辑资料：先删旧文件再重 put（put 永不覆盖，故须先 remove）。
 * 保留原 id / created_at / source_url；title/category/tags/content 可改，updated_at 刷新。
 * 字段校验复用 validate()；不存在 → NOT_FOUND。
 */
export async function updateNote(id, input) {
  if (dbConfigured()) {
    throw fail('NOT_SUPPORTED', '数据库模式下的资料编辑未实现：后台编辑目前只支持文件存储模式', 501)
  }
  const existing = await files.get(String(id))
  if (!existing) throw fail('NOT_FOUND', '这条资料不存在', 404)

  const { title, content, category, tags } = validate({ ...existing.meta, ...input, source_url: existing.meta.source_url })
  const { iso } = nowShanghai()

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
  if (dbConfigured()) {
    throw fail('NOT_SUPPORTED', '数据库模式下的资料删除未实现：后台删除目前只支持文件存储模式', 501)
  }
  const removed = await files.remove(String(id))
  if (!removed) throw fail('NOT_FOUND', '这条资料不存在', 404)
  return removed
}
