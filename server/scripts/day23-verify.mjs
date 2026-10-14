// Day 23 验证脚本：证明「三类错误提示统一」改前 → 改后。
// 方式：起一个进程内隔离实例（listen(0)），用真实 HTTP 打三类错误路径，
//       断言响应体里【不再出现英文原始错误】，且是【中文人话】。
// 用法：node scripts/day23-verify.mjs
// 说明：AUTH_ENABLED=0 → 公开模式，与当前线上口径一致；DATA_DIR 用临时目录，不污染仓库。
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 判定「是否含英文原始错误特征」：出现典型英文报错词 → 说明还在裸透
const EN_LEAK = /(Expected|Unexpected|entity too large|ENOENT|EACCES|Position|line \d+ column|Cannot read|undefined is not)/i
// 判定「是否中文」：含 CJK 字符
const HAS_CJK = /[\u4e00-\u9fa5]/

const dir = await mkdtemp(join(tmpdir(), 'day23-'))
process.env.DATA_DIR = dir
process.env.AUTH_ENABLED = '0'
process.env.STORAGE_MODE = 'file'
delete process.env.DATABASE_URL

const app = createApp()
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${server.address().port}`

async function req(method, path, { body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, text, json }
}

try {
  // ── ① 用户输入错（400）：非法 JSON ──────────────────────────────
  // 改前：{ code:'INTERNAL', message:"Expected property name or '}' in JSON at position 1 ..." }
  // 改后：{ code:'VALIDATION_FAILED', message:'请求格式不正确，请检查提交的内容' }
  {
    const r = await req('POST', '/api/notes', { body: '{ bad json' })
    check('① 非法 JSON → 400', r.status === 400, `status=${r.status}`)
    check('① 非法 JSON → code=VALIDATION_FAILED', r.json?.error?.code === 'VALIDATION_FAILED', `code=${r.json?.error?.code}`)
    check('① 非法 JSON → 中文人话', HAS_CJK.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
    check('① 非法 JSON → 无英文原始错误泄漏', !EN_LEAK.test(r.text), r.text.slice(0, 80))
  }

  // ── ② 用户输入错（400）：类型不对（title 传对象）───────────────
  // 改前：201 创建成功，id 变成 "2026-10-14-object-object"（脏数据！）
  // 改后：400 + 中文提示「title 必须是字符串」
  {
    const r = await req('POST', '/api/notes', { body: { title: { a: 1 }, content: 'x', category: 'learning' } })
    check('② title 传对象 → 400', r.status === 400, `status=${r.status}`)
    check('② title 传对象 → 中文人话', HAS_CJK.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
    check('② title 传对象 → 提示字段是字符串', /字符串/.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
  }

  // ── ③ 用户输入错（400）：分类非法 ──────────────────────────────
  {
    const r = await req('POST', '/api/notes', { body: { title: 't', content: 'c', category: 'nope' } })
    check('③ 分类非法 → 400', r.status === 400, `status=${r.status}`)
    check('③ 分类非法 → 中文人话', HAS_CJK.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
  }

  // ── ④ 用户输入错（404）：不存在 ────────────────────────────────
  {
    const r = await req('GET', '/api/notes/2099-01-01-nope')
    check('④ 不存在的 id → 404', r.status === 404, `status=${r.status}`)
    check('④ 不存在的 id → 中文人话', HAS_CJK.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
  }

  // ── ⑤ 用户输入错（413）：提交过大（body-parser 原始英文）───────
  // 改前：message = "request entity too large"（英文）
  // 改后：413 + '提交内容过大（上限 1MB），请精简后重试'
  {
    const big = 'x'.repeat(1024 * 1024 + 64 * 1024) // > 1mb
    const r = await req('POST', '/api/notes', { body: JSON.stringify({ title: 't', content: big, category: 'learning' }) })
    check('⑤ 提交过大 → 413', r.status === 413, `status=${r.status}`)
    check('⑤ 提交过大 → 中文人话', HAS_CJK.test(r.json?.error?.message || ''), `msg=${r.json?.error?.message}`)
    check('⑤ 提交过大 → 无英文原始错误泄漏', !EN_LEAK.test(r.text), r.text.slice(0, 80))
  }

  // ── ⑥ 正常增删改查闭环仍然通（改动没打破业务）─────────────────
  {
    const c = await req('POST', '/api/notes', { body: { title: '闭环验证', content: '正文', category: 'learning', tags: ['a'] } })
    check('⑥ 新增 → 201', c.status === 201, `status=${c.status}`)
    const id = c.json?.data?.id
    const g = await req('GET', `/api/notes/${id}`)
    check('⑥ 查询 → 200', g.status === 200, `status=${g.status}`)
    const p = await req('PATCH', `/api/notes/${id}`, { body: { title: '改过了', content: '正文', category: 'learning' } })
    check('⑥ 修改 → 200', p.status === 200, `status=${p.status}`)
    const d = await req('DELETE', `/api/notes/${id}`)
    check('⑥ 删除 → 200', d.status === 200, `status=${d.status}`)
    const g2 = await req('GET', `/api/notes/${id}`)
    check('⑥ 删后查询 → 404', g2.status === 404, `status=${g2.status}`)
  }
} finally {
  server.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
