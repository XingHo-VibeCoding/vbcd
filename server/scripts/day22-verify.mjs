// Day 22 验证脚本：PATCH / DELETE 上线验证 + 增删改查四类操作闭环
// 运行：node server/scripts/day22-verify.mjs
// 特点：进程内起服务（createApp().listen(0)），临时 DATA_DIR，AUTH_ENABLED=0（公开模式，同当前公网口径）
//       全程走真实 HTTP 路径（fetch），不直接调 service 函数；跑完自清临时目录。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const { default: assert } = await import('node:assert/strict')

let n = 0
const verify = async (title, work) => { const r = await work(); console.log(`  ✅ d${++n} ${title}`); return r }

const directory = await mkdtemp(path.join(tmpdir(), 'buddy-day22-'))
Object.assign(process.env, {
  DATA_DIR: directory,
  DATABASE_URL: '',
  AUTH_ENABLED: '0',
  OPENAI_API_KEY: '', CHROMA_URL: '', ASR_SERVICE_URL: '', GITHUB_USERNAME: '',
  IMA_OPENAPI_CLIENTID: '', IMA_OPENAPI_APIKEY: '',
  INDEX_CACHE: '0',
})

let appServer
try {
  const { createApp } = await import('../src/app.js')
  appServer = createApp().listen(0, '127.0.0.1')
  await new Promise(resolve => appServer.once('listening', resolve))
  const base = `http://127.0.0.1:${appServer.address().port}`

  const api = async (method, url, body) => {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let payload
    try { payload = await response.json() } catch { payload = null }
    return { status: response.status, ...(payload ?? {}) }
  }

  console.log(`\n【Day 22 验证】临时 DATA_DIR=${directory}\nbase=${base}\n`)

  // ── 板块① PATCH 验证 ─────────────────────────────────────────────
  console.log('板块① PATCH 验证')

  const created = await verify('CREATE：新建一条资料（200/201）', async () => {
    const r = await api('POST', '/api/notes', { title: 'Day22 原始标题', content: 'Day22 原始正文', category: 'learning', tags: ['原始'] })
    assert.equal([200, 201].includes(r.status), true)
    assert(r.data?.id)
    return r.data
  })
  const id = created.id

  const before = await verify('READ：读回刚建的资料，记录「改之前」的值', async () => {
    const r = await api('GET', `/api/notes/${encodeURIComponent(id)}`)
    assert.equal(r.status, 200)
    return r.data
  })
  console.log('    改之前:', JSON.stringify({ title: before.meta.title, category: before.meta.category, tags: before.meta.tags, updated_at: before.meta.updated_at, created_at: before.meta.created_at }))

  const patched = await verify('PATCH：改标题/分类/标签，返回 200', async () => {
    await new Promise(resolve => setTimeout(resolve, 1100)) // 跨秒，让 updated_at 能体现「改过」
    const r = await api('PATCH', `/api/notes/${encodeURIComponent(id)}`, { title: 'Day22 改后标题', content: 'Day22 原始正文', category: 'work', tags: ['改后', '焦点'] })
    assert.equal(r.status, 200)
    return r.data
  })

  await verify('PATCH 生效：GET 复读，值确已变化（改后 ≠ 改前）', async () => {
    const r = await api('GET', `/api/notes/${encodeURIComponent(id)}`)
    assert.equal(r.status, 200)
    const m = r.data.meta
    console.log('    改之后:', JSON.stringify({ title: m.title, category: m.category, tags: m.tags, updated_at: m.updated_at, created_at: m.created_at }))
    assert.equal(m.title, 'Day22 改后标题')
    assert.equal(m.category, 'work')
    assert.deepEqual(m.tags, ['改后', '焦点'])
    assert.equal(m.title !== before.meta.title, true, '标题应已变')
    assert.equal(m.created_at, before.meta.created_at, 'created_at 必须保留')
    return m
  })

  await verify('PATCH 合法性：未知分类 → 400 VALIDATION_FAILED', async () => {
    const r = await api('PATCH', `/api/notes/${encodeURIComponent(id)}`, { title: 'x', content: 'y', category: 'nope' })
    assert.equal(r.status, 400)
    assert.equal(r.error?.code, 'VALIDATION_FAILED')
  })

  await verify('PATCH 边界：不存在的 id → 404 NOT_FOUND', async () => {
    const r = await api('PATCH', '/api/notes/__no_such_id__', { title: 'x', content: 'y', category: 'life' })
    assert.equal(r.status, 404)
    assert.equal(r.error?.code, 'NOT_FOUND')
  })

  // ── 板块② DELETE 验证 ────────────────────────────────────────────
  console.log('\n板块② DELETE 验证')

  await verify('DELETE 前：列表里能看到该条', async () => {
    const r = await api('GET', '/api/notes')
    assert.equal(r.status, 200)
    assert(r.data.items.some(it => it.id === id), '删除前应存在于列表')
  })

  const delStatus = await verify('DELETE：删除该条，记录实际状态码（待定 200/204 口径）', async () => {
    const r = await api('DELETE', `/api/notes/${encodeURIComponent(id)}`)
    console.log(`    DELETE 实际返回状态码 = ${r.status}`)
    assert([200, 204].includes(r.status))
    return r.status
  })

  await verify('DELETE 生效：GET /api/notes/:id → 404（该条不再返回）', async () => {
    const r = await api('GET', `/api/notes/${encodeURIComponent(id)}`)
    assert.equal(r.status, 404)
    assert.equal(r.error?.code, 'NOT_FOUND')
  })

  await verify('DELETE 生效：GET /api/notes 列表里该条已消失', async () => {
    const r = await api('GET', '/api/notes')
    assert.equal(r.status, 200)
    assert(!r.data.items.some(it => it.id === id), '删除后不应存在于列表')
  })

  await verify('DELETE 边界：重复删除 → 404 NOT_FOUND', async () => {
    const r = await api('DELETE', `/api/notes/${encodeURIComponent(id)}`)
    assert.equal(r.status, 404)
    assert.equal(r.error?.code, 'NOT_FOUND')
  })

  // ── 板块③ 四类操作闭环 ───────────────────────────────────────────
  console.log('\n板块③ 增删改查四类操作闭环（一条链）')

  await verify('闭环：CREATE → READ → UPDATE → READ → DELETE → READ(404)', async () => {
    const c = await api('POST', '/api/notes', { title: '闭环-初始', content: '闭环正文', category: 'life', tags: [] })
    assert.equal([200, 201].includes(c.status), true)
    const cid = c.data.id

    const r1 = await api('GET', `/api/notes/${encodeURIComponent(cid)}`)
    assert.equal(r1.status, 200); assert.equal(r1.data.meta.title, '闭环-初始')

    const u = await api('PATCH', `/api/notes/${encodeURIComponent(cid)}`, { title: '闭环-已改', content: '闭环正文', category: 'life', tags: [] })
    assert.equal(u.status, 200)

    const r2 = await api('GET', `/api/notes/${encodeURIComponent(cid)}`)
    assert.equal(r2.status, 200); assert.equal(r2.data.meta.title, '闭环-已改')

    const d = await api('DELETE', `/api/notes/${encodeURIComponent(cid)}`)
    assert([200, 204].includes(d.status))

    const r3 = await api('GET', `/api/notes/${encodeURIComponent(cid)}`)
    assert.equal(r3.status, 404)
    console.log(`    闭环链：CREATE(${c.status}) → READ(200, 初始) → UPDATE(${u.status}) → READ(200, 已改) → DELETE(${d.status}) → READ(404)`)
  })

  console.log(`\n【Day 22 验证完毕】共 ${n} 项断言通过；DELETE 实际状态码 = ${delStatus}\n`)
} finally {
  if (appServer) await new Promise(resolve => appServer.close(resolve))
  await rm(directory, { recursive: true, force: true }).catch(() => {})
}
