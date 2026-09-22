// 端到端冒烟测试（零依赖，用 Node 18+ 自带的 fetch）
// 用法：
//   1) 先起后端（可用独立数据目录与临时口令，避免污染真实资料）：
//        DATA_DIR=/tmp/buddy-smoke-data PORT=3000 npm run dev
//   2) 再跑本脚本：
//        SMOKE_PASSWORD="<后端 .env 里 PASSWORD_HASH 对应的口令>" node scripts/smoke.mjs
// 覆盖：健康检查 → 未登录 401 → 口令错 401 → 登录 → 新建 201 → 重复 409 →
//      列表/检索 → 详情 → 404 → 登出 204 → 登出后会话失效 401
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const PASSWORD = process.env.SMOKE_PASSWORD || ''
const UNIQ = `${Date.now()}` // 每次运行用唯一内容，避免与历史数据撞查重

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}${detail ? ` ｜ ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}${detail ? ` ｜ ${detail}` : ''}`)
  }
}

async function req(method, url, { body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let json = null
  const text = await res.text()
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' }
}

function sidFrom(setCookie) {
  const m = /sid=([^;]+)/.exec(setCookie)
  return m ? m[1] : null
}

if (!PASSWORD) {
  console.error('请先设置 SMOKE_PASSWORD（后端 .env 里 PASSWORD_HASH 对应的口令）。')
  console.error('用法：SMOKE_PASSWORD="你的口令" node scripts/smoke.mjs')
  process.exit(2)
}

console.log(`冒烟测试 → ${BASE}`)

// ① 健康检查（公开）
const health = await req('GET', '/api/health')
check('① GET /api/health → 200', health.status === 200 && health.json?.data?.status === 'ok', JSON.stringify(health.json?.data))

// ② 未登录访问资料接口 → 401 AUTH_REQUIRED
const noAuth = await req('GET', '/api/notes')
check('② 未登录 GET /api/notes → 401 AUTH_REQUIRED', noAuth.status === 401 && noAuth.json?.error?.code === 'AUTH_REQUIRED', noAuth.json?.error?.code)

// ③ 口令错误 → 401 AUTH_FAILED（注意：错太多次会触发 429 限流）
const badLogin = await req('POST', '/api/login', { body: { password: `wrong-${UNIQ}` } })
check('③ 错误口令 → 401 AUTH_FAILED', badLogin.status === 401 && badLogin.json?.error?.code === 'AUTH_FAILED', badLogin.json?.error?.code)

// ④ 正确口令 → 200 + Set-Cookie
const login = await req('POST', '/api/login', { body: { password: PASSWORD } })
const sid = sidFrom(login.setCookie)
check('④ 登录 → 200 + Set-Cookie(sid)', login.status === 200 && !!sid, sid ? `sid=${sid.slice(0, 8)}…` : `status=${login.status} ${JSON.stringify(login.json)}`)
if (!sid) {
  console.error('登录失败，无法继续；请确认 SMOKE_PASSWORD 与后端 PASSWORD_HASH 对应。')
  process.exit(1)
}
const cookie = `sid=${sid}`

// ⑤ 新建 → 201 {id,path,hash}
const payload = { title: `冒烟测试-${UNIQ}`, category: 'work', tags: ['冒烟'], content: `# 冒烟\n\n内容 ${UNIQ}` }
const created = await req('POST', '/api/notes', { body: payload, cookie })
check('⑤ 新建 → 201 {id,path,hash}', created.status === 201 && created.json?.data?.id && created.json?.data?.path && created.json?.data?.hash, created.json?.data?.path)

// ⑥ 重复提交同一内容 → 409 DUPLICATE
const dup = await req('POST', '/api/notes', { body: payload, cookie })
check('⑥ 重复提交 → 409 DUPLICATE', dup.status === 409 && dup.json?.error?.code === 'DUPLICATE', dup.json?.error?.message)

// ⑦ 空标题 → 400 VALIDATION_FAILED
const bad = await req('POST', '/api/notes', { body: { ...payload, title: '  ' }, cookie })
check('⑦ 空标题 → 400 VALIDATION_FAILED', bad.status === 400 && bad.json?.error?.code === 'VALIDATION_FAILED', bad.json?.error?.message)

// ⑧ 列表 + 全文检索：能按唯一关键词搜到刚建的那条
const list = await req('GET', `/api/notes?q=${encodeURIComponent(UNIQ)}`, { cookie })
const hit = list.json?.data?.items?.find((i) => i.id === created.json.data.id)
check('⑧ 检索命中刚建的条目', list.status === 200 && !!hit, `total=${list.json?.data?.total}, rebuilt=${list.json?.data?.rebuilt}`)

// ⑨ 详情读回原文
const detail = await req('GET', `/api/notes/${created.json.data.id}`, { cookie })
check('⑨ 详情读回正文一致', detail.status === 200 && detail.json?.data?.content === payload.content, `title=${detail.json?.data?.meta?.title}`)

// ⑩ 不存在的 id → 404 NOT_FOUND
const missing = await req('GET', `/api/notes/nope-${UNIQ}`, { cookie })
check('⑩ 不存在的 id → 404 NOT_FOUND', missing.status === 404 && missing.json?.error?.code === 'NOT_FOUND', missing.json?.error?.message)

// ⑪ 登出 → 204
const logout = await req('POST', '/api/logout', { cookie })
check('⑪ 登出 → 204', logout.status === 204, `status=${logout.status}`)

// ⑫ 登出后旧会话失效 → 401
const afterLogout = await req('GET', '/api/notes', { cookie })
check('⑫ 登出后旧会话 → 401', afterLogout.status === 401, afterLogout.json?.error?.code)

console.log(`\n结果：✅ ${passed} 通过 ｜ ❌ ${failed} 失败`)
process.exit(failed ? 1 : 0)
