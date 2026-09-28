// link.js 的本地自测（不烧 Key、不需要起 buddy 服务）：
//   node server/scripts/link-selftest.mjs
// 覆盖：assertPublicUrl 拦截/放行、extractArticle（容器选择/剥标签/标题优先级/短文本失败）、
//       fetchHtml 走本地 fake-org 服务器（重定向跟随、GBK 解码、非 HTML 拒绝、正文提取）。
// ORGANIZE_ALLOW_PRIVATE_IP=1 只在本地 fake-org 打 127.0.0.1 时通过——真跑的默认仍拦私网。
import http from 'node:http'
import { execFileSync } from 'node:child_process'

process.env.ORGANIZE_ALLOW_PRIVATE_IP = '1' // 在 import link.js 前设置，让 fake-org 可过闸门

const { assertPublicUrl, parsePublicUrl, extractArticle, fetchHtml } = await import('../src/services/link.js')

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✅ ${name}${detail ? ` ｜ ${detail}` : ''}`) }
  else { failed += 1; console.log(`  ❌ ${name}${detail ? ` ｜ ${detail}` : ''}`) }
}

console.log('link.js 自测')

// ===== A. 闸门：非法 / 非 http / 私网 / 云元数据，一律拦 =====
const blocked = [
  ['', 'INVALID_SOURCE'],
  ['ftp://example.com/x', 'INVALID_SOURCE'],
  ['file:///etc/passwd', 'INVALID_SOURCE'],
  ['http://127.0.0.1/x', 'SSRF_BLOCKED'],
  ['http://[::1]/x', 'SSRF_BLOCKED'],
  ['http://169.254.169.254/latest/meta-data', 'SSRF_BLOCKED'],
  ['http://localhost:3000/api/health', 'SSRF_BLOCKED'],
  ['http://10.0.0.5/x', 'SSRF_BLOCKED'],
  ['http://192.168.1.1/x', 'SSRF_BLOCKED'],
  ['http://100.64.0.1/x', 'SSRF_BLOCKED'], // CGNAT
  ['http://[fd00::1]/x', 'SSRF_BLOCKED'], // ULA
  ['http://[fe80::1]/x', 'SSRF_BLOCKED'], // 链路本地
  ['http://[2001:db8::1]/x', 'SSRF_BLOCKED'], // 文档段
  ['http://[::ffff:192.168.1.1]/x', 'SSRF_BLOCKED'], // v4-mapped 私网
]
// 私网检查只在 allowPrivate=0 时验
for (const [url, want] of blocked) {
  let code = ''
  try { parsePublicUrl(url, { allowPrivate: false }) } catch (e) { code = e.code }
  check(`拦 ${url || '(空)'} → ${want}`, code === want, code)
}
check('放行 example.com（仅解析层）', (() => { try { return !!parsePublicUrl('https://example.com/a', { allowPrivate: true }).host } catch { return false } })())

// 公网 IPv6 不能误杀（实测踩过："所有 v6 一律拦" 会把带 AAAA 记录的正常站点全挡掉）
const publicV6 = ['http://[2606:4700::6810:d483]/x', 'http://[2a00:1450:4001:80f::200e]/x', 'http://[2001:4860:4860::8888]/x']
for (const u of publicV6) {
  let ok = true
  try { parsePublicUrl(u, { allowPrivate: false }) } catch { ok = false }
  check(`放行公网 v6 ${u}`, ok)
}
let mappedOk = true
try { parsePublicUrl('http://[::ffff:104.16.212.131]/x', { allowPrivate: false }) } catch { mappedOk = false }
check('放行 v4-mapped 公网地址', mappedOk)

// ===== B. extractArticle：容器选择、剥标签、标题、短文本失败 =====
const ARTICLE_HTML = `
<!doctype html><html><head>
<title>页面标题</title>
<meta property="og:title" content="正确的文章标题">
<meta property="og:site_name" content="测试站">
<meta name="description" content="这是描述。">
</head><body>
<nav>导航·登录</nav>
<article>
<h1>正确的文章标题</h1>
<p>这是一段正文，用来凑够最小长度。${'正文'.repeat(140)}</p>
<script>evil()</script><style>x{}</style>
</article>
<footer>版权信息</footer>
</body></html>`
const a1 = extractArticle(ARTICLE_HTML, 'https://blog.example.com/p/1')
check('article 容器 + og:title 优先', a1.title === '正确的文章标题' && a1.siteName === '测试站', `${a1.title}@${a1.siteName}`)
check('正文已归一化且够长', a1.text.length >= 200, `${a1.text.length} 字`)
check('正文不含干扰标签文本', !a1.text.includes('evil()') && !a1.text.includes('版权信息'), a1.mainSelector)
check('excerpt 有界', a1.excerpt.length <= 8000 && a1.excerpt.length > 0, `${a1.excerpt.length}`)

const MAIN_HTML = `<html><body><div>x</div><main><p>${'主要内容'.repeat(80)}</p></main></body></html>`
const a2 = extractArticle(MAIN_HTML, 'https://example.com/')
check('main 容器可命中', a2.mainSelector === 'main', a2.mainSelector)

const SHORT_HTML = `<html><head><title>短</title></head><body><article><p>太短了</p></article></body></html>`
let shortCode = ''
try { extractArticle(SHORT_HTML, 'https://example.com/') } catch (e) { shortCode = e.code }
check('正文 <200 字 → EXTRACT_FAILED', shortCode === 'EXTRACT_FAILED', shortCode)

const H1_HTML = `<html><body><h1>来自 h1 的标题</h1><p>${'内容'.repeat(120)}</p></body></html>`
const a3 = extractArticle(H1_HTML, 'https://example.com/')
check('无 og/title 时落 h1', a3.title === '来自 h1 的标题', a3.title)

// ===== C. fetchHtml：本地 fake-org（重定向、GBK、非 HTML、提取一体） =====
const gbkHtml = (() => {
  // 整个 HTML 文档转成 GB18030（中文老站真实形态）；本机没 iconv 就跳过这条用例
  try {
    const src = `<!doctype html><html><head><title>GBK 页面</title></head>` +
      `<body><article><p>${'这是一段用 GBK 编码的中文网页正文内容，用来验证解码。'.repeat(8)}</p></article></body></html>`
    return execFileSync('iconv', ['-f', 'UTF-8', '-t', 'GB18030'], { input: src })
  } catch {
    return null
  }
})()

const HTML_PAGE = (title, body) => Buffer.from(
  `<!doctype html><html><head><title>${title}</title><meta property="og:site_name" content="测试站点"></head>` +
    `<body><article><p>${body.repeat(40)}</p></article></body></html>`, 'utf8')

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/article') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(HTML_PAGE('冒烟文章标题', '这是一段值得被整理的网页正文内容，围绕一个主题说明来龙去脉。'))
  } else if (u.pathname === '/r1') {
    res.writeHead(302, { location: '/r2' })
    res.end()
  } else if (u.pathname === '/r2') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HTML_PAGE('重定向后的标题', '跳了两跳之后的页面内容。'))
  } else if (u.pathname === '/gbk' && gbkHtml) {
    res.writeHead(200, { 'content-type': 'text/html; charset=gbk' })
    res.end(gbkHtml)
  } else if (u.pathname === '/pdf') {
    res.writeHead(200, { 'content-type': 'application/pdf' })
    res.end(Buffer.from('%PDF-1.4 fake'))
  } else if (u.pathname === '/missing') {
    res.writeHead(404)
    res.end()
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const PORT = server.address().port
const base = `http://127.0.0.1:${PORT}`

const f1 = await fetchHtml(`${base}/article`)
check('fetchHtml 200 → 拿到 HTML', f1.html.includes('冒烟文章标题'), `status=${f1.status}`)
const a4 = extractArticle(f1.html, f1.url)
check('article 内容可读', a4.title === '冒烟文章标题' && a4.text.length > 100, `${a4.text.length} 字`)

const f2 = await fetchHtml(`${base}/r1`)
check('302 逐跳跟随到终页', f2.url.endsWith('/r2') && f2.html.includes('重定向后的标题'), f2.url)

if (gbkHtml) {
  const f3 = await fetchHtml(`${base}/gbk`)
  const art = extractArticle(f3.html, f3.url)
  check('GBK 声明 → 中文可读', art.text.includes('中文网页正文') && !/�/.test(art.text), `charset=${f3.charset} text=${art.text.length} 字`)
} else {
  console.log('  ⏭️  本机无 iconv，跳过 GBK 解码用例')
}

let nonHtmlCode = ''
try { await fetchHtml(`${base}/pdf`) } catch (e) { nonHtmlCode = e.code }
check('非 HTML 响应 → EXTRACT_FAILED', nonHtmlCode === 'EXTRACT_FAILED', nonHtmlCode)

let fourOhFourCode = ''
try { await fetchHtml(`${base}/missing`) } catch (e) { fourOhFourCode = e.code }
check('404 → DOWNLOAD_FAILED 含提示', fourOhFourCode === 'DOWNLOAD_FAILED', fourOhFourCode)

server.close()
console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
process.exit(failed ? 1 : 0)
