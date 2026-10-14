// Day 24 验证脚本：slugify 尾部连字符 Bug 的「修复前 → 修复后」证据。
// 方式：进程内隔离实例 + 真实 HTTP；临时 DATA_DIR（项目内，避开 /tmp 沙箱隔离）。
// 用法：node scripts/day24-verify.mjs
//
// 断言两类：
//   [单元] slugify 纯函数：边界输入不产出尾连字符，且常规输入不变
//   [集成] 真实 HTTP 建资料：id / 落盘文件名均无尾连字符；重名兜底不产生双连字符
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const dir = await mkdtemp(join('/home/bird/work/vbcd', '.tmp-day24-'))
process.env.DATA_DIR = dir
process.env.AUTH_ENABLED = '0'
process.env.STORAGE_MODE = 'file'
delete process.env.DATABASE_URL

// 动态 import：files.js 在模块加载时读 DATA_DIR，必须先设好 env
const { createApp } = await import('/home/bird/work/vbcd/server/src/app.js')
const { slugify } = await import('/home/bird/work/vbcd/server/src/services/notes.js')

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// ── ① 单元：边界输入不得有尾连字符 ──────────────────────────────
console.log('【① 单元】slugify 边界输入')
const edgeCases = [
  ['a'.repeat(39) + '!!!b', '截断点落在连字符'],
  ['a'.repeat(39) + ' b', '截断点落在空格归一后的连字符'],
  ['x'.repeat(39) + '---y', '截断点落在多个连字符'],
  ['a'.repeat(40) + '!!!b', '截断点落在字母（对照）'],
]
for (const [input, note] of edgeCases) {
  const s = slugify(input)
  check(`尾连字符检查：${note}`, !/-$/.test(s), `slug=${JSON.stringify(s)}`)
}

// ── ② 单元：常规输入产出必须不变（防回归）──────────────────────
console.log('\n【② 单元】slugify 常规输入（应与修复前一致）')
const stableCases = [
  ['正常标题', '正常标题'],
  ['Hello World!', 'hello-world'],
  ['a/b/c', 'a-b-c'],
  ['../../etc/passwd', 'etc-passwd'],
  ['!!!', 'note'],
  ['  空白标题  ', '空白标题'],
  ['《高等数学》同济版 p15', '高等数学-同济版-p15'],
]
for (const [input, expected] of stableCases) {
  const s = slugify(input)
  check(`常规产出不变：${JSON.stringify(input)}`, s === expected, `得到 ${JSON.stringify(s)}，期望 ${JSON.stringify(expected)}`)
}

// ── ③ 集成：真实 HTTP 建资料，id 与落盘名均干净 ─────────────────
console.log('\n【③ 集成】真实 HTTP 创建（走完整链路）')
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
  return { status: res.status, json: (() => { try { return JSON.parse(t) } catch { return null } })() }
}

try {
  const title = 'a'.repeat(39) + '!!!b'

  const r1 = await req('POST', '/api/notes', { title, content: '第一次', category: 'learning' })
  const id1 = r1.json?.data?.id
  check('创建成功（201）', r1.status === 201, `status=${r1.status}`)
  check('id 无尾连字符', !!id1 && !/-$/.test(id1), `id=${JSON.stringify(id1)}`)
  check('id 不以连字符开头', !!id1 && !/^-/.test(id1.replace(/^\d{4}-\d{2}-\d{2}-/, '')), '')

  // 重名兜底：不同内容 → 绕过 hash 查重 → 触发 files.js 的 -2 后缀
  const r2 = await req('POST', '/api/notes', { title, content: '第二次不同内容', category: 'learning' })
  const id2 = r2.json?.data?.id
  check('重名兜底 id 无双连字符', !!id2 && !/--/.test(id2), `id=${JSON.stringify(id2)}`)

  // 落盘文件名核验
  const files = await readdir(join(dir, 'learning')).catch(() => [])
  const dirty = files.filter((f) => /-\.md$/.test(f) || /--/.test(f))
  check('落盘文件名全部干净', dirty.length === 0, `脏文件名 ${JSON.stringify(dirty)}`)
  check('落盘文件数 = 2', files.length === 2, `实际 ${files.length}: ${JSON.stringify(files)}`)

  // 往返：建完能按 id 取回
  if (id1) {
    const g = await req('GET', `/api/notes/${encodeURIComponent(id1)}`)
    check('新建资料可按 id 取回（200）', g.status === 200, `status=${g.status}`)
  }

  // 闭环回归：增删改查仍通
  const del = await req('DELETE', `/api/notes/${encodeURIComponent(id1)}`)
  check('删除返回 200', del.status === 200, `status=${del.status}`)
  const g2 = await req('GET', `/api/notes/${encodeURIComponent(id1)}`)
  check('删后查询 404', g2.status === 404, `status=${g2.status}`)
} finally {
  server.close()
  await rm(dir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
