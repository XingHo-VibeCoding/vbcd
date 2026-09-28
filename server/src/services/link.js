// 链接抓取与正文提取（F14 链接收敛 / organize 任务的执行材料）。
// 三件事：assertPublicUrl（SSRF 闸门）→ fetchHtml（逐跳跟随重定向、限体积、做编码）→ extractArticle（正文提取）。
// 纯函数、不写任务、不写文件，可独立自测（server/scripts/link-selftest.mjs）。
import dns from 'node:dns/promises'
import net from 'node:net'
import { parse } from 'node-html-parser'
import { fail } from './errors.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const FETCH_TIMEOUT_MS = Number(env('ORGANIZE_FETCH_TIMEOUT_MS', '20000')) || 20000
const MAX_HTML_BYTES = Number(env('ORGANIZE_MAX_HTML_BYTES', String(2 * 1024 * 1024))) || 2 * 1024 * 1024
const MIN_TEXT_CHARS = Number(env('ORGANIZE_MIN_TEXT_CHARS', '200')) || 200
const EXCERPT_CHARS = Number(env('ORGANIZE_EXCERPT_CHARS', '8000')) || 8000
const MAX_REDIRECTS = 5
const ALLOW_PRIVATE = env('ORGANIZE_ALLOW_PRIVATE_IP') === '1' // 测试逃生门：仅冒烟用，默认关
const USER_AGENT = 'buddy-organize/0.1 (+https://github.com/bird-z/vbcd)'

const VIDEO_HOSTS = /(^|\.)(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|acfun\.cn|iqiyi\.com|youku\.com)$/i

// ---------- SSRF 闸门 ----------

function isPrivateIp(host) {
  const trimmed = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '')
  let ip = trimmed
  if (net.isIPv6(ip)) {
    // IPv4-mapped IPv6（::ffff:1.2.3.4）：取出 v4 部分按 v4 判；其他 v6 一律拦（本期不接 v6 出站）
    const m = ip.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (m) ip = m[1]
    else return true
  }
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || // "this" 网段
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224 // 组播/保留
    )
  }
  return false
}

/** 私网拦截提示（探测值留痕时帮忙定位） */
function privateHint(host) {
  return `来源 ${host} 指向内网/保留地址，出于安全已阻止`
}

/** URL → 规范化 {href, host, port}；非法、非 http(s)、私网一律抛带 code 的错误。 */
export function parsePublicUrl(url, { allowPrivate = ALLOW_PRIVATE } = {}) {
  const raw = String(url ?? '').trim()
  if (!raw) throw fail('INVALID_SOURCE', '链接为空')
  let u
  try {
    u = new URL(raw)
  } catch {
    throw fail('INVALID_SOURCE', `链接不合法：${raw.slice(0, 120)}`)
  }
  if (!/^https?:$/i.test(u.protocol)) {
    throw fail('INVALID_SOURCE', `链接必须以 http:// 或 https:// 开头（收到 ${u.protocol}）`)
  }
  if (u.username || u.password) {
    throw fail('INVALID_SOURCE', '链接里不允许带用户名/密码')
  }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) {
    if (!allowPrivate) throw fail('SSRF_BLOCKED', privateHint(host))
  }
  if (!allowPrivate && isPrivateIp(host)) {
    throw fail('SSRF_BLOCKED', privateHint(host))
  }
  return { href: u.href, host, port: u.port || (u.protocol === 'https:' ? '443' : '80') }
}

/** 域名 → 先解析再判断：任一解析结果是私网就拒（防 DNS 重绑定）。 */
export async function assertPublicUrl(url, { allowPrivate = ALLOW_PRIVATE } = {}) {
  const p = parsePublicUrl(url, { allowPrivate })
  if (allowPrivate || net.isIP(p.host)) return p

  let addrs
  try {
    addrs = await dns.lookup(p.host, { all: true })
  } catch {
    throw fail('DOWNLOAD_FAILED', `域名解析失败：${p.host}（检查链接或网络）`)
  }
  if (!addrs.length) throw fail('DOWNLOAD_FAILED', `域名解析无结果：${p.host}`)
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw fail('SSRF_BLOCKED', privateHint(p.host))
  }
  return p
}

// ---------- 抓取 ----------

/** 读 body 边流边封顶：超 MAX_HTML_BYTES 直接掐断返回已读部分（宁可截断不爆内存）。 */
async function readBodyCapped(resp) {
  const buf = new Uint8Array(MAX_HTML_BYTES)
  let total = 0
  const reader = resp.body?.getReader()
  if (!reader) {
    const ab = await resp.arrayBuffer()
    return new Uint8Array(ab).slice(0, MAX_HTML_BYTES)
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const n = Math.min(value.length, MAX_HTML_BYTES - total)
      buf.set(value.subarray(0, n), total)
      total += n
      if (total >= MAX_HTML_BYTES) {
        await reader.cancel('over-limit').catch(() => {})
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
  return buf.subarray(0, total)
}

function charsetOf(resp) {
  const ct = String(resp.headers.get('content-type') || '')
  const m = /charset=["']?([\w-]+)/i.exec(ct)
  return (m?.[1] || 'utf-8').toLowerCase()
}

/** 二阶段解码：先按声明 charset；乱码密度过高（>5% 的 U+FFFD）重试 gb18030（中文老站常见）。 */
function decodeHtml(buf, charset) {
  const tryDecode = (label) => {
    try {
      return new TextDecoder(label).decode(buf)
    } catch {
      return new TextDecoder('utf-8').decode(buf)
    }
  }
  let text = tryDecode(charset)
  const bad = (text.match(/�/g) || []).length
  if (charset !== 'gb18030' && bad > Math.max(5, text.length * 0.05)) {
    const alt = tryDecode('gb18030')
    const altBad = (alt.match(/�/g) || []).length
    if (altBad < bad) return { text: alt, charset: 'gb18030' }
  }
  return { text, charset }
}

/**
 * 抓取一个公开网页 → { url（最终地址）, status, contentType, html, charset, truncated }。
 * 逐跳跟随重定向（每跳重验 SSRF），最多 MAX_REDIRECTS 跳。
 * 失败统一抛 code 错误（INVALID_SOURCE / SSRF_BLOCKED / DOWNLOAD_FAILED / TIMEOUT / EXTRACT_FAILED）。
 */
export async function fetchHtml(url, { allowPrivate = ALLOW_PRIVATE } = {}) {
  let current = String(url).trim()
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const p = await assertPublicUrl(current, { allowPrivate })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let resp
    try {
      resp = await fetch(p.href, {
        redirect: 'manual', // 手动跟随：每一跳都再过一次 SSRF 闸门
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw fail('TIMEOUT', `抓取超时（>${FETCH_TIMEOUT_MS / 1000}s）：${p.host}`)
      }
      throw fail('DOWNLOAD_FAILED', `抓取失败：${typeMessage(err) || '网络不可达'}`)
    } finally {
      clearTimeout(timer)
    }

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) throw fail('DOWNLOAD_FAILED', `重定向缺少 Location（HTTP ${resp.status}）`)
      current = new URL(loc, p.href).href
      if (hop === MAX_REDIRECTS) {
        throw fail('DOWNLOAD_FAILED', `重定向超过 ${MAX_REDIRECTS} 跳，放弃`)
      }
      continue
    }

    if (resp.status !== 200) {
      const hint =
        resp.status === 403 ? '（页面可能需要登录或开启了反爬）' : resp.status === 404 ? '（链接可能已失效）' : ''
      throw fail('DOWNLOAD_FAILED', `抓取返回 HTTP ${resp.status}${hint}`)
    }

    const contentType = String(resp.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('html')) {
      throw fail('EXTRACT_FAILED', `响应不是网页（${contentType.split(';')[0] || '未知类型'}）：可以改用发散手动粘贴正文`)
    }

    const buf = await readBodyCapped(resp)
    const { text, charset } = decodeHtml(buf, charsetOf(resp))
    return { url: p.href, status: resp.status, contentType, html: text, charset, truncated: buf.length >= MAX_HTML_BYTES }
  }
  throw fail('DOWNLOAD_FAILED', '重定向解析异常')
}

function typeMessage(err) {
  const cause = err?.cause
  const code = cause?.code || err?.code || ''
  const msg = cause?.message || err?.message || ''
  const short = `${code ? `${code}: ` : ''}${msg}`.slice(0, 140)
  return short || ''
}

// ---------- 正文提取 ----------

const REMOVE_TAGS = 'script,style,noscript,iframe,svg,form,button,input,textarea,select,nav,header,footer,aside'
const MAIN_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '#content',
  '.article',
  '.article-content',
  '.post',
  '.post-content',
  '.entry-content',
  '.content',
]

function normalizeText(s) {
  const lines = String(s || '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.join('\n').trim()
}

function meta(root, attr, name) {
  const el = root.querySelector(`meta[${attr}="${name}"]`)
  return String(el?.getAttribute('content') || '').trim()
}

/**
 * HTML → { title, siteName, byline, description, text, excerpt, isVideo, mainSelector }。
 * 启发式：删干扰标签 → 优先 article/main/#content 等容器（取其中 text 最长的一个）→ 否则 body。
 * 正文 < ORGANIZE_MIN_TEXT_CHARS 抛 EXTRACT_FAILED（SPA/需登录/纯 JS 渲染等，给人工出路）。
 */
export function extractArticle(html, url, { minTextChars = MIN_TEXT_CHARS } = {}) {
  const root = parse(String(html ?? ''), { comment: false })

  for (const el of root.querySelectorAll(REMOVE_TAGS)) el.remove()

  const rawTitle =
    meta(root, 'property', 'og:title') ||
    String(root.querySelector('title')?.textContent || '').trim() ||
    String(root.querySelector('h1')?.textContent || '').trim()
  const siteName =
    meta(root, 'property', 'og:site_name') || meta(root, 'name', 'application-name') || hostOf(url)
  const byline =
    meta(root, 'name', 'author') || meta(root, 'property', 'article:author') || meta(root, 'name', 'byl')
  const description =
    meta(root, 'name', 'description') || meta(root, 'property', 'og:description') || ''

  let mainEl = null
  let mainSelector = 'body'
  let bestLen = 0
  for (const sel of MAIN_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      const len = (el.structuredText || el.text || '').length
      if (len > bestLen) {
        bestLen = len
        mainEl = el
        mainSelector = sel
      }
    }
  }
  if (!mainEl) mainEl = root.querySelector('body') || root

  const raw = (mainEl.structuredText || mainEl.text || '').toString()
  const text = normalizeText(raw)
  if (text.length < minTextChars) {
    throw fail(
      'EXTRACT_FAILED',
      `正文提取失败（只提取到 ${text.length} 字，页面可能是 JS 渲染的 SPA / 需登录 / 非文字页）：` +
        '建议发散页手动粘贴正文，或视频链接改用视频转写',
    )
  }

  const host = hostOf(url)
  const title = (rawTitle || siteName || host || '未命名链接').slice(0, 80)
  const isVideo = VIDEO_HOSTS.test(host)

  return {
    title,
    siteName,
    byline,
    description: description.slice(0, 500),
    text,
    excerpt: text.slice(0, EXCERPT_CHARS),
    isVideo,
    mainSelector,
  }
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** 统一入口：抓取 + 提取一步完成（供 organize.js / 自测用）。 */
export async function fetchArticle(url, opts = {}) {
  const fetched = await fetchHtml(url, opts)
  const article = extractArticle(fetched.html, fetched.url, opts)
  return { fetched, article }
}
