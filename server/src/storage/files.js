// 文件存储适配层（SPEC 第 7.3 节）
// 对外只暴露 list / get / put / remove / sync 五个方法；业务代码不直接碰文件系统。
// 将来换数据库时，只替换本文件，业务逻辑与接口契约都不动。
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// 资料根目录：优先取环境变量 DATA_DIR（SPEC 第 6 章）；默认 <仓库根>/data，与进程 cwd 无关
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(HERE, '../../../data')

// frontmatter 的固定字段顺序：写出的文件字段顺序稳定，便于 diff 与人工阅读
const FM_ORDER = [
  'id',
  'title',
  'category',
  'date',
  'tags',
  'source_url',
  'created_at',
  'updated_at',
  'hash',
  'schema_version',
]

/** 确保资料根目录存在（服务启动时调用；目录被删也能自愈） */
export async function ensureReady() {
  await mkdir(DATA_DIR, { recursive: true })
}

function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, '\n')
}

function excerptOf(content, len = 120) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim()
  return flat.length > len ? `${flat.slice(0, len)}…` : flat
}

// 值优先按 JSON 解析（我们写出的就是 JSON 字面量，同时也是合法 YAML）；
// 失败则当裸字符串处理，兼容你手动在 Obsidian 里改过的文件
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

/**
 * 解析一份资料文件。返回 null 表示结构不合法（缺 frontmatter 分隔符）。
 * 用于读取；写出格式由 serialize 保证稳定。
 */
export function parseNote(rawText, id) {
  const raw = normalizeNewlines(rawText)
  if (!raw.startsWith('---')) return null

  const close = raw.indexOf('\n---', 3)
  if (close === -1) return null

  const warnings = []
  const fields = {}
  for (const line of raw.slice(3, close).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(':')
    if (at === -1) continue
    fields[trimmed.slice(0, at).trim()] = parseValue(trimmed.slice(at + 1), trimmed.slice(0, at).trim())
  }

  // frontmatter 里的 id 与文件名不一致时，以文件名（传入的 id）为准，并留下告警
  const declared = fields.id === undefined ? '' : String(fields.id)
  if (declared && declared !== id) {
    warnings.push(`frontmatter 里的 id（${declared}）与文件名不一致，已按文件名 ${id} 处理`)
  }

  return {
    meta: {
      id,
      title: String(fields.title ?? ''),
      category: String(fields.category ?? ''),
      date: String(fields.date ?? ''),
      tags: Array.isArray(fields.tags) ? fields.tags.map(String) : [],
      source_url: String(fields.source_url ?? ''),
      created_at: String(fields.created_at ?? ''),
      updated_at: String(fields.updated_at ?? ''),
      hash: String(fields.hash ?? ''),
      schema_version: Number(fields.schema_version) || 1,
    },
    content: raw.slice(close + 4).replace(/^\n/, '').trim(),
    warnings,
  }
}

/** 把元数据 + 正文序列化为文件内容（frontmatter + Markdown 正文） */
export function serializeNote(meta, content) {
  const lines = ['---']
  for (const key of FM_ORDER) {
    if (key === 'schema_version') lines.push(`${key}: ${Number(meta[key]) || 1}`)
    else if (key === 'tags') lines.push(`${key}: ${JSON.stringify(Array.isArray(meta.tags) ? meta.tags : [])}`)
    else lines.push(`${key}: ${JSON.stringify(String(meta[key] ?? ''))}`)
  }
  lines.push('---')
  return `${lines.join('\n')}\n${String(content ?? '').trim()}\n`
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

function storageError(message) {
  return Object.assign(new Error(message), { status: 503, code: 'STORAGE_FAILED' })
}

/**
 * 扫描资料目录，返回全部条目（含派生字段与正文）。
 * 返回 { items, warnings }：单个文件解析/读取失败只记警告并跳过，不让整次请求失败。
 */
export async function list() {
  const items = []
  const warnings = []

  let categories
  try {
    categories = await readdir(DATA_DIR)
  } catch (err) {
    if (err.code === 'ENOENT') return { items, warnings } // 目录还没建：视为空库
    throw storageError(`资料目录不可读：${err.message}`)
  }

  for (const category of categories.sort()) {
    if (category.startsWith('.')) continue // 跳过 .index.json 等隐藏项
    const dir = path.join(DATA_DIR, category)
    const dirStat = await stat(dir).catch(() => null)
    if (!dirStat?.isDirectory()) continue

    for (const name of (await readdir(dir)).sort()) {
      if (name.startsWith('.') || !name.endsWith('.md')) continue
      const id = name.slice(0, -3)
      const file = path.join(dir, name)
      try {
        const parsed = parseNote(await readFile(file, 'utf8'), id)
        if (!parsed) {
          warnings.push(`${category}/${name}：缺少 frontmatter，已跳过`)
          continue
        }
        const fileStat = await stat(file)
        for (const w of parsed.warnings) warnings.push(`${category}/${name}：${w}`)
        items.push({
          ...parsed.meta,
          category: parsed.meta.category || category,
          path: `${category}/${name}`,
          excerpt: excerptOf(parsed.content),
          content: parsed.content, // 供索引层做全文检索用
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        })
      } catch (err) {
        warnings.push(`${category}/${name}：读取失败（${err.message}），已跳过`)
      }
    }
  }

  return { items, warnings }
}

/** 按 id 读取单条资料（含原文） */
export async function get(id) {
  const { items } = await list()
  const hit = items.find((item) => item.id === id)
  if (!hit) return null

  let parsed
  try {
    parsed = parseNote(await readFile(path.join(DATA_DIR, hit.path), 'utf8'), id)
  } catch (err) {
    throw storageError(`读取 ${hit.path} 失败：${err.message}`)
  }
  if (!parsed) return null

  const { excerpt, content, mtimeMs, size, ...meta } = hit
  return { meta, content: parsed.content }
}

/**
 * 写入一条资料（永不覆盖同名文件）：
 * 目标文件已存在就依次尝试 <id>-2、<id>-3 …；先写临时文件再 rename，避免留下半截文件。
 */
export async function put(note) {
  await ensureReady()
  const dir = path.join(DATA_DIR, note.category)
  await mkdir(dir, { recursive: true })

  let id = note.id
  let file = path.join(dir, `${id}.md`)
  for (let suffix = 2; await exists(file); suffix += 1) {
    id = `${note.id}-${suffix}`
    file = path.join(dir, `${id}.md`)
  }

  const meta = { ...note, id }
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, serializeNote(meta, note.content), 'utf8')
    await rename(tmp, file)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw storageError(`写入资料失败：${err.message}`)
  }

  return { id, path: `${note.category}/${id}.md`, hash: note.hash }
}

/** 本期不做删除（PRD「本期不做」清单）；保留方法名以维持适配层契约 */
export async function remove() {
  throw Object.assign(new Error('本期不做删除资料'), { status: 501, code: 'NOT_IMPLEMENTED' })
}

/** 第 3 周接 Gitea 私有仓后，这里变成 git pull/commit/push；当前无远端，故为空操作 */
export async function sync() {
  return { skipped: true }
}
