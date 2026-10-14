// 图片资产只读扫描（PLAN-admin §9.2 / 图片资源板块步骤 2）
// 真实文件在 data/images/；usage 与 references 都从当前配置/Markdown 引用实时推导。
// 本阶段不上传、不删除、不写 manifest、不建立数据库表。
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from '../storage/files.js'
import { fail } from './errors.js'

const IMAGE_DIR = path.join(DATA_DIR, 'images')
const SITE_FILE = path.join(DATA_DIR, 'site.json')
const PROFILE_FILE = path.join(DATA_DIR, 'profile.md')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function imageIdFromReference(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/(?:^|\/)images\/([^?#]+?)(?:[?#].*)?$/i)
  if (!match) return null
  const name = decodeURIComponent(match[1])
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') return null
  return name
}

function usageForPath(pathText, source) {
  const p = String(pathText).toLowerCase()
  if (source === 'profile.md' && p.includes('avatar')) return 'avatar'
  if (p.includes('background')) return 'background'
  if (p.includes('hotspot')) return 'hotspot'
  if (p.includes('project')) return 'project'
  if (source.endsWith('.md')) return 'markdown'
  return 'site'
}

function collectJsonRefs(value, pathParts, references, source) {
  if (typeof value === 'string') {
    const id = imageIdFromReference(value)
    if (id) references.push({ id, source, path: pathParts.join('.') || '$', usage: usageForPath(pathParts.join('.'), source) })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonRefs(item, [...pathParts, `[${index}]`], references, source))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectJsonRefs(item, [...pathParts, key], references, source))
  }
}

function collectMarkdownRefs(text, source, references) {
  const raw = String(text ?? '')
  const patterns = [
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    /(?:^|\n)\s*(?:avatar|image|cover)\s*:\s*["']?([^\s"']+)["']?/gi,
  ]
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const id = imageIdFromReference(match[1])
      if (id) {
        const isFrontmatter = pattern === patterns[1]
        references.push({
          id,
          source,
          path: isFrontmatter ? match[0].split(':')[0].trim() : 'markdown',
          usage: usageForPath(isFrontmatter ? match[0].split(':')[0] : match[0], source),
        })
      }
    }
  }
}

async function readReferences() {
  const references = []
  try {
    const site = JSON.parse(await readFile(SITE_FILE, 'utf8'))
    collectJsonRefs(site, [], references, 'site.json')
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[images] site.json 扫描跳过：${err.message}`)
  }
  for (const [file, label] of [[PROFILE_FILE, 'profile.md']]) {
    try { collectMarkdownRefs(await readFile(file, 'utf8'), label, references) } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[images] ${label} 扫描跳过：${err.message}`)
    }
  }
  return references
}

async function scanFiles() {
  let names
  try { names = await readdir(IMAGE_DIR) } catch (err) {
    if (err.code === 'ENOENT') return []
    throw fail('IMAGE_SCAN_FAILED', '图片目录读取失败', 503, err)
  }
  const files = []
  for (const name of names.sort()) {
    const ext = path.extname(name).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext) || name.startsWith('.')) continue
    const file = path.join(IMAGE_DIR, name)
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) continue
    files.push({
      id: name,
      name,
      url: `/images/${encodeURIComponent(name)}`,
      mime: MIME_TYPES[ext],
      size: info.size,
      updated_at: info.mtime.toISOString(),
      usage: [],
      tags: [],
      references: [],
      used: false,
    })
  }
  return files
}

export async function listImages() {
  const [files, references] = await Promise.all([scanFiles(), readReferences()])
  const byId = new Map(files.map((file) => [file.id, file]))
  for (const ref of references) {
    const file = byId.get(ref.id)
    if (!file) continue
    if (!file.usage.includes(ref.usage)) file.usage.push(ref.usage)
    file.references.push({ source: ref.source, path: ref.path })
    file.used = true
  }
  return { total: files.length, items: files }
}

export async function getImage(id) {
  const result = await listImages()
  const image = result.items.find((item) => item.id === String(id))
  if (!image) throw fail('NOT_FOUND', '图片不存在', 404)
  return image
}
