// 图片资产扫描与文件管理（PLAN-admin §9.2）。
// 真实文件在 data/images/；usage 与 references 都从当前配置实时推导。
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
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
const UPLOAD_LIMIT = 10 * 1024 * 1024
const DETECTED_TYPES = new Map([
  ['jpg', { ext: '.jpg', mime: 'image/jpeg' }],
  ['png', { ext: '.png', mime: 'image/png' }],
  ['webp', { ext: '.webp', mime: 'image/webp' }],
  ['gif', { ext: '.gif', mime: 'image/gif' }],
])

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
  // 个人头像属于站点配置；Markdown 正文中的插图不参与图片资产管理。
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  if (!frontmatter) return
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^avatar\s*:\s*(.*?)\s*$/)
    if (!match) continue
    const id = imageIdFromReference(match[1].replace(/^['"]|['"]$/g, ''))
    if (id) references.push({ id, source, path: 'avatar', usage: 'avatar' })
  }
}

async function readReferences({ strict = false } = {}) {
  const references = []
  try {
    const site = JSON.parse(await readFile(SITE_FILE, 'utf8'))
    collectJsonRefs(site, [], references, 'site.json')
  } catch (err) {
    if (strict && err.code !== 'ENOENT') throw fail('IMAGE_REFERENCE_SCAN_FAILED', '无法确认站点图片引用，已取消删除，请检查站点配置', 503, err)
    if (err.code !== 'ENOENT') console.warn(`[images] site.json 扫描跳过：${err.message}`)
  }
  for (const [file, label] of [[PROFILE_FILE, 'profile.md']]) {
    try { collectMarkdownRefs(await readFile(file, 'utf8'), label, references) } catch (err) {
      if (strict && err.code !== 'ENOENT') throw fail('IMAGE_REFERENCE_SCAN_FAILED', '无法确认头像图片引用，已取消删除，请检查个人配置', 503, err)
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

export async function listImages(options) {
  const [files, references] = await Promise.all([scanFiles(), readReferences(options)])
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

export async function getImage(id, options) {
  const result = await listImages(options)
  const image = result.items.find((item) => item.id === String(id))
  if (!image) throw fail('NOT_FOUND', '图片不存在', 404)
  return image
}

/**
 * 上传一张图片到 data/images/。文件名完全由服务端生成，类型以文件魔数为准；
 * 本阶段不覆盖旧文件、不修改 site.json、不自动创建任何引用。
 */
export async function uploadImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw fail('VALIDATION_FAILED', '请选择一张图片')
  }
  if (buffer.length > UPLOAD_LIMIT) {
    throw fail('VALIDATION_FAILED', '图片不能超过 10MB')
  }
  const detected = await fileTypeFromBuffer(buffer)
  const type = detected && DETECTED_TYPES.get(detected.ext)
  if (!type || detected.mime !== type.mime) {
    throw fail('VALIDATION_FAILED', '只支持 JPG、PNG、WebP 或 GIF 图片')
  }

  await mkdir(IMAGE_DIR, { recursive: true })
  const name = `upload-${Date.now()}-${randomBytes(5).toString('hex')}${type.ext}`
  const target = path.join(IMAGE_DIR, name)
  const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temp, buffer, { flag: 'wx' })
    await rename(temp, target)
  } catch (err) {
    await unlink(temp).catch(() => {})
    throw fail('IMAGE_WRITE_FAILED', '图片保存失败，请稍后再试', 503, err)
  }
  return {
    id: name,
    name,
    url: `/images/${encodeURIComponent(name)}`,
    mime: type.mime,
    size: buffer.length,
    usage: [],
    tags: [],
    references: [],
    used: false,
  }
}

// 只允许删除未被站点配置引用的图片；笔记 Markdown 图片不在本管理范围内。
export async function deleteImage(id) {
  const image = await getImage(id, { strict: true })
  if (image.used) {
    throw fail('IMAGE_IN_USE', '图片正在被站点配置使用，请先移除引用', 409)
  }

  const target = path.join(IMAGE_DIR, image.name)
  try {
    await unlink(target)
  } catch (err) {
    if (err.code === 'ENOENT') throw fail('NOT_FOUND', '图片不存在', 404)
    throw fail('IMAGE_DELETE_FAILED', '图片删除失败，请稍后再试', 503, err)
  }
  return { id: image.id, name: image.name }
}
