// 资料业务逻辑（SPEC 第 2.1 节字段 / 第 3 章接口 3）：
// 校验 → 组装 Note → 查重 → 交给存储适配层落盘。本文件不直接读写文件系统。
import { createHash } from 'node:crypto'
import * as storage from '../storage/files.js'
import { dbConfigured } from '../db/pool.js'
import { findDbNoteByHash, insertDbNote } from '../db/notes.js'
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
 * 落点自适应（Day 18，SPEC §7.3 迁移第 1 步的写侧）：
 *   - 配了 DATABASE_URL → 只写 notes 表（库连不上 → 503 DB_UNAVAILABLE，不静默退文件）；
 *   - 没配 → 照旧落 data/ 文件（本地裸跑 / smoke 的行为不变）。
 * 好处：F13 转写、F14 收敛、note 任务这些走本函数的归档链路自动全部入库。
 */
export async function createNote(input) {
  const { title, content, category, tags, sourceUrl } = validate(input)
  const hash = hashOf(title, content)

  const duplicated = dbConfigured()
    ? await findDbNoteByHash(hash)
    : (await storage.list()).items.find((item) => item.hash && item.hash === hash)
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

  if (dbConfigured()) {
    return await insertDbNote(note) // 内部已把错误转成 DB_UNAVAILABLE
  }
  try {
    return await storage.put(note)
  } catch (err) {
    if (err.code) throw err
    throw fail('STORAGE_FAILED', `写入资料目录失败：${err.message}`, 503)
  }
}
