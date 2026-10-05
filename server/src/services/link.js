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
// 测试逃生门：只放行**回环**（127.0.0.1 / localhost / ::1），给本地假服务器用；
// 内网网段与云元数据地址（169.254.169.254）永远拦——否则冒烟就变成「把闸门关掉测一遍」。
const ALLOW_LOOPBACK = env('ORGANIZE_ALLOW_LOOPBACK') === '1'
const USER_AGENT = 'buddy-organize/0.1 (+https://github.com/bird-z/vbcd)'

const VIDEO_HOSTS = /(^|\.)(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|acfun\.cn|iqiyi\.com|youku\.com)$/i

// ---------- SSRF 闸门 ----------

function isPrivateV4(ip) {
  const [a, b] = String(ip).split('.').map(Number)
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

/** IPv6 → 8 个 16 位整数；解析不出来返回 null（调用方按「不信任」处理）。 */
function expandV6(input) {
  let ip = String(input).trim().toLowerCase().replace(/^\[|\]$/g, '')
  let v4 = ''
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
  if (dotted) {
    v4 = dotted[1]
    ip = ip.slice(0, dotted.index).replace(/:$/, '')
  }
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length > 1 ? (halves[1] ? halves[1].split(':') : []) : null
  let groups
  if (rest === null) {
    groups = head.slice()
  } else {
    const fill = 8 - head.length - rest.length - (v4 ? 2 : 0)
    if (fill < 0) return null
    groups = [...head, ...Array(fill).fill('0'), ...rest]
  }
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
  }
  const nums = groups.map((g) => parseInt(g, 16))
  if (v4) {
    const parts = v4.split('.').map(Number)
    if (parts.length !== 4 || parts.some((n) => n > 255)) return null
    nums.push(...parts)
  }
  return nums.length === 8 ? nums : null
}

/**
 * IPv6 私有/保留判定。原本「所有 IPv6 一律拦」会把带 AAAA 记录的正常公网站点全误杀
 * （2026-09-28 实测：`en.wikipedia.org` 因解析出 `2001::1` 而被判内网），改成按段判。
 * 转换机制（Teredo / 6to4 / NAT64）额外处理：能抽出内嵌 v4 的就查 v4，否则一律拦。
 */
function isPrivateV6(ip) {
  const g = expandV6(ip)
  if (!g) return true // 解析不出来就当私有：宁枉勿纵
  const [h0, h1, h2, h3, h4, h5, h6, h7] = g

  // IPv4 映射（::ffff:a.b.c.d）/ 兼容（::a.b.c.d）：看内嵌的 v4
  if (g.slice(0, 5).every((n) => n === 0) && h5 === 0xffff) {
    return isPrivateV4(`${h6 >> 8}.${h6 & 0xff}.${h7 >> 8}.${h7 & 0xff}`)
  }
  if (g.slice(0, 6).every((n) => n === 0)) {
    if (h6 === 0 && (h7 === 0 || h7 === 1)) return true // :: 与 ::1
    return isPrivateV4(`${h6 >> 8}.${h6 & 0xff}.${h7 >> 8}.${h7 & 0xff}`)
  }

  if ((h0 & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((h0 & 0xffc0) === 0xfe80) return true // fe80::/10 链路本地
  if ((h0 & 0xff00) === 0xff00) return true // ff00::/8 组播
  if (h0 === 0x2001 && h1 === 0x0db8) return true // 文档用段
  if (h0 === 0x2001 && h1 === 0x0000) return true // Teredo
  if (h0 === 0x0064 && h1 === 0xff9b) return true // NAT64（64:ff9b::/96）
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true // 100::/64 discard
  if (h0 === 0x2002) return isPrivateV4(`${h1 >> 8}.${h1 & 0xff}.${h2 >> 8}.${h2 & 0xff}`) // 6to4
  return false // 其余归公网全局单播（2000::/3 等）
}

function isPrivateIp(host) {
  const ip = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (net.isIPv4(ip)) return isPrivateV4(ip)
  if (net.isIPv6(ip)) return isPrivateV6(ip)
  return false // 不是 IP 字面量（域名，由 assertPublicUrl 解析后再判）
}

/** 回环地址判定（逃生门只放这一类） */
function isLoopback(host) {
  const ip = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (net.isIPv4(ip)) return ip.startsWith('127.')
  const g = expandV6(ip)
  if (!g) return false
  return g.slice(0, 7).every((n) => n === 0) && g[7] === 1
}

/** 私网拦截提示（探测值留痕时帮忙定位） */
function privateHint(host) {
  return `来源 ${host} 指向内网/保留地址，出于安全已阻止`
}

/** URL → 规范化 {href, host, port}；非法、非 http(s)、私网一律抛带 code 的错误。 */
export function parsePublicUrl(url, { allowLoopback = ALLOW_LOOPBACK } = {}) {
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
  const isLocalName = host === 'localhost' || host.endsWith('.localhost')
  if (!(allowLoopback && (isLocalName || isLoopback(host)))) {
    if (isLocalName) throw fail('SSRF_BLOCKED', privateHint(host))
    if (isPrivateIp(host)) throw fail('SSRF_BLOCKED', privateHint(host))
  }
  return { href: u.href, host, port: u.port || (u.protocol === 'https:' ? '443' : '80') }
}

/** 域名 → 先解析再判断：任一解析结果是私网（回环在逃生门下除外）就拒（防 DNS 重绑定）。 */
export async function assertPublicUrl(url, { allowLoopback = ALLOW_LOOPBACK } = {}) {
  const p = parsePublicUrl(url, { allowLoopback })
  if (net.isIP(p.host)) return p

  let addrs
  try {
    addrs = await dns.lookup(p.host, { all: true })
  } catch {
    throw fail('DOWNLOAD_FAILED', `域名解析失败：${p.host}（检查链接或网络）`)
  }
  if (!addrs.length) throw fail('DOWNLOAD_FAILED', `域名解析无结果：${p.host}`)
  // 判定放宽：任一私网就拒会把「正常域名混进伪 AAAA（如 2001::1 隧道残留）」全误杀。
  // 改为「全部私网才拒」——SSRF 的 DNS 重绑定攻击通常所有记录都指向内网，不会公私混。
  const hasPublic = addrs.some((a) => !isPrivateIp(a.address))
  if (!hasPublic) {
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
export async function fetchHtml(url, { allowLoopback = ALLOW_LOOPBACK } = {}) {
  let current = String(url).trim()
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const p = await assertPublicUrl(current, { allowLoopback })
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
