// 本地数据适配层：函数签名与 SPEC.md 第 3 章的接口一一对应
// 今天没有后端，读写都在浏览器 localStorage；将来接后端时只换本文件实现，页面不动
import { notes as seedNotes } from '../data/notes'

const STORAGE_KEY = 'buddy-notes-local'

// 轻量哈希（djb2）：仅用于本地去重；非安全用途，接后端时换 SHA-256（SPEC 第 2 章）
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function saveLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function excerptOf(content, len = 120) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim()
  return flat.length > len ? flat.slice(0, len) + '…' : flat
}

// 列表与检索：合并"测试数据 + 本地新增"，按关键词与分类过滤，按日期排序
// 返回的 items 字段对应 SPEC.md 第 2.2 节（IndexEntry）
export function listNotes({ q = '', category = '' } = {}) {
  const local = loadLocal()
  const localIds = new Set(local.map((n) => n.id))
  const all = [...local, ...seedNotes.filter((n) => !localIds.has(n.id))]

  const kw = q.trim().toLowerCase()
  const filtered = all.filter((n) => {
    if (category && n.category !== category) return false
    if (!kw) return true
    const hay = [n.title, n.content, (n.tags || []).join(' ')].join(' ').toLowerCase()
    return hay.includes(kw)
  })

  filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return {
    total: filtered.length,
    rebuiltAt: new Date().toISOString(), // 本次"重建"时间（F3 的行为体现）
    items: filtered.map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      date: n.date,
      tags: n.tags || [],
      excerpt: excerptOf(n.content),
      path: `memory/${n.category}/${n.date}-${n.id.split('-').slice(3).join('-')}.md`,
    })),
  }
}

// 读原文
export function getNote(id) {
  const local = loadLocal()
  return local.find((n) => n.id === id) || seedNotes.find((n) => n.id === id) || null
}

// 新建资料：校验 → 查重 → 存 localStorage
export function createNote({ title, category, content, tags = [], source_url = '' }) {
  if (!title || !title.trim()) {
    throw Object.assign(new Error('标题不能为空'), { code: 'VALIDATION_FAILED' })
  }
  if (!content || !content.trim()) {
    throw Object.assign(new Error('正文不能为空'), { code: 'VALIDATION_FAILED' })
  }
  const hash = djb2(`${title.trim()}\n${content.trim()}`)
  const exists = listNotes().items.some((n) => getNote(n.id) && djb2(`${getNote(n.id).title}\n${getNote(n.id).content}`) === hash)
  if (exists) {
    throw Object.assign(new Error('这条资料已存在（内容相同）'), { code: 'DUPLICATE' })
  }

  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'note'
  const note = {
    id: `${date}-${slug}`,
    title: title.trim(),
    category: category || 'life',
    date,
    tags: Array.isArray(tags) ? tags : [],
    source_url,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    hash,
    schema_version: 1,
    content,
  }

  const local = loadLocal()
  local.push(note)
  saveLocal(local)
  return note
}
