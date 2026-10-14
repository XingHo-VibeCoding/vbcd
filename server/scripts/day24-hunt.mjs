// Day 24 Bug 猎捕脚本：用「刁钻输入」扫各个接口，找真实缺陷。
// 隔离实例（进程内 listen(0)）+ 真实 HTTP，临时 DATA_DIR。
// 用法：node scripts/day24-hunt.mjs
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'

const dir = await mkdtemp(join(tmpdir(), 'day24-'))
process.env.DATA_DIR = dir
process.env.AUTH_ENABLED = '0'
process.env.STORAGE_MODE = 'file'
delete process.env.DATABASE_URL

const app = createApp()
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
const base = `http://127.0.0.1:${server.address().port}`

async function req(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const t = await res.text()
  return { status: res.status, text: t, json: (() => { try { return JSON.parse(t) } catch { return null } })() }
}

function show(label, r) {
  console.log(`\n── ${label}`)
  console.log(`   status=${r.status} ${r.text.slice(0, 220)}`)
}

try {
  // ═══ A. 超长文本 / 边界 ═══
  const longTitle = 'A'.repeat(200)
  show('A1 标题 200 字', await req('POST', '/api/notes', { title: longTitle, content: 'x', category: 'learning' }))

  // ═══ B. 空值 / 空白 ═══
  show('B1 标题纯空格', await req('POST', '/api/notes', { title: '   ', content: 'x', category: 'learning' }))
  show('B2 正文纯空白', await req('POST', '/api/notes', { title: 't', content: '   ', category: 'learning' }))

  // ═══ C. 特殊字符 → slug 生成 ═══
  show('C1 标题全特殊字符 "!!!"', await req('POST', '/api/notes', { title: '!!!', content: 'c1', category: 'learning' }))
  show('C2 标题含斜杠 a/b/c', await req('POST', '/api/notes', { title: 'a/b/c', content: 'c2', category: 'learning' }))
  show('C3 标题含 ../ 路径穿越', await req('POST', '/api/notes', { title: '../../etc/passwd', content: 'c3', category: 'learning' }))
  show('C4 标题含空字节', await req('POST', '/api/notes', { title: 'ab\u0000cd', content: 'c4', category: 'learning' }))
  show('C5 标题超长+特殊 (切 40 字符后尾部连字符)', await req('POST', '/api/notes', { title: 'a'.repeat(39) + '!!!b', content: 'c5', category: 'learning' }))

  // ═══ D. tags 边界 ═══
  show('D1 tags 11 个', await req('POST', '/api/notes', { title: 'd1', content: 'x', category: 'learning', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }))
  show('D2 tags 含非字符串', await req('POST', '/api/notes', { title: 'd2', content: 'x', category: 'learning', tags: [1, 2, {}] }))
  show('D3 tags 含空字符串', await req('POST', '/api/notes', { title: 'd3', content: 'x', category: 'learning', tags: ['', '  ', 'ok'] }))

  // ═══ E. PATCH 部分字段 ═══
  const c = await req('POST', '/api/notes', { title: '兜底资料', content: '原正文', category: 'learning', tags: ['x'] })
  const id = c.json?.data?.id
  console.log(`\n(基准资料 id=${id})`)
  show('E1 PATCH 只给 title', await req('PATCH', `/api/notes/${id}`, { title: '只改标题' }))
  show('E2 PATCH 空对象', await req('PATCH', `/api/notes/${id}`, {}))
  show('E3 PATCH category 换类', await req('PATCH', `/api/notes/${id}`, { category: 'work' }))

  // ═══ F. 来源 URL 边界 ═══
  show('F1 source_url 非 http', await req('POST', '/api/notes', { title: 'f1', content: 'x', category: 'learning', source_url: 'ftp://a/b' }))
  show('F2 source_part 无 url', await req('POST', '/api/notes', { title: 'f2', content: 'x', category: 'learning', source_part: 2 }))
  show('F3 source_part = 0', await req('POST', '/api/notes', { title: 'f3', content: 'x', category: 'learning', source_url: 'https://a/b', source_part: 0 }))

  // ═══ G. 查询参数边界 ═══
  show('G1 ?limit=abc', await req('GET', '/api/db/notes?limit=abc'))
  show('G2 ?limit=1.5', await req('GET', '/api/db/notes?limit=1.5'))
  show('G3 ?limit=0', await req('GET', '/api/db/notes?limit=0'))
  show('G4 ?offset=-1', await req('GET', '/api/db/notes?offset=-1'))
  show('G5 ?q=百分号%', await req('GET', '/api/notes?q=%25'))
  show('G6 ?q=下划线_', await req('GET', '/api/notes?q=_'))

  // ═══ H. 不存在 / 畸形 id ═══
  show('H1 GET 畸形 id（路径穿越）', await req('GET', '/api/notes/..%2f..%2fetc%2fpasswd'))
  show('H2 DELETE 畸形 id', await req('DELETE', '/api/notes/..%2f..%2fetc%2fpasswd'))
  show('H3 GET 超长 id', await req('GET', `/api/notes/${'x'.repeat(500)}`))

  // ═══ I. 数组/对象传参 ═══
  show('I1 title 传数组', await req('POST', '/api/notes', { title: ['a', 'b'], content: 'x', category: 'learning' }))
  show('I2 category 传数组', await req('POST', '/api/notes', { title: 'i2', content: 'x', category: ['learning'] }))
  show('I3 整体传数组', await req('POST', '/api/notes', ['a']))
  show('I4 整体传字符串', await req('POST', '/api/notes', 'hello'))
} finally {
  server.close()
}
