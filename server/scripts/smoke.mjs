// 端到端冒烟测试（零依赖，用 Node 18+ 自带 fetch）
// 用法：
//   1) 先起后端（可用独立数据目录，避免污染真实资料）：
//        公开模式（默认）：DATA_DIR=/tmp/buddy-smoke-data PORT=3000 npm run dev
//        隐私模式：再加 AUTH_ENABLED=1 与 PASSWORD_HASH（见 server/.env.example）
//   2) 跑本脚本：
//        公开：node scripts/smoke.mjs
//        隐私：SMOKE_PASSWORD="<口令>" node scripts/smoke.mjs
// 脚本会先读 /api/health 的 auth_enabled，自动适配断言。
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

console.log(`冒烟测试 → ${BASE}`)

// ① 健康检查（公开），顺带读 auth_enabled
const health = await req('GET', '/api/health')
check('① GET /api/health → 200', health.status === 200 && health.json?.data?.status === 'ok', JSON.stringify(health.json?.data))
const authEnabled = Boolean(health.json?.data?.auth_enabled)
console.log(`   模式：${authEnabled ? '隐私（需登录）' : '公开（免登录）'}`)

const payload = { title: `冒烟测试-${UNIQ}`, category: 'work', tags: ['冒烟'], content: `# 冒烟\n\n内容 ${UNIQ}` }
let cookie = ''

if (authEnabled) {
  // ===== 隐私模式 =====
  const noAuth = await req('GET', '/api/notes')
  check('② 未登录 GET /api/notes → 401 AUTH_REQUIRED', noAuth.status === 401 && noAuth.json?.error?.code === 'AUTH_REQUIRED', noAuth.json?.error?.code)

  const badLogin = await req('POST', '/api/login', { body: { password: `wrong-${UNIQ}` } })
  check('③ 错误口令 → 401 AUTH_FAILED', badLogin.status === 401 && badLogin.json?.error?.code === 'AUTH_FAILED', badLogin.json?.error?.code)

  if (!PASSWORD) {
    console.error('隐私模式需要 SMOKE_PASSWORD（后端 PASSWORD_HASH 对应的口令）。')
    process.exit(2)
  }
  const login = await req('POST', '/api/login', { body: { password: PASSWORD } })
  const sid = sidFrom(login.setCookie)
  check('④ 登录 → 200 + Set-Cookie(sid)', login.status === 200 && !!sid, sid ? `sid=${sid.slice(0, 8)}…` : `status=${login.status} ${JSON.stringify(login.json)}`)
  if (!sid) {
    console.error('登录失败，无法继续；请确认 SMOKE_PASSWORD 与后端 PASSWORD_HASH 对应。')
    process.exit(1)
  }
  cookie = `sid=${sid}`
} else {
  // ===== 公开模式 =====
  const openList = await req('GET', '/api/notes')
  check('② 公开模式：无 Cookie 访问 /api/notes → 200', openList.status === 200 && openList.json?.ok === true, `total=${openList.json?.data?.total}`)
}

// ⑤ 新建 → 201 {id,path,hash}
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
check('⑧ 检索命中刚建的条目', list.status === 200 && !!hit, `total=${list.json?.data?.total}`)

// ⑨ 详情读回原文
const detail = await req('GET', `/api/notes/${created.json.data.id}`, { cookie })
check('⑨ 详情读回正文一致', detail.status === 200 && detail.json?.data?.content === payload.content)

// ⑩ 不存在的 id → 404 NOT_FOUND
const missing = await req('GET', `/api/notes/nope-${UNIQ}`, { cookie })
check('⑩ 不存在的 id → 404 NOT_FOUND', missing.status === 404 && missing.json?.error?.code === 'NOT_FOUND', missing.json?.error?.message)

// ===== KB 知识库问答（可选）：仅在 .env 配好 OPENAI_API_KEY + CHROMA_URL 时跑 =====
const kbIndex = await req('POST', '/api/kb/index', { cookie })
if (kbIndex.status === 503 && kbIndex.json?.error?.code === 'KB_NOT_CONFIGURED') {
  console.log('  ⏭️  KB 未配置（缺 OPENAI_API_KEY / CHROMA_URL），跳过问答冒烟')
} else if (authEnabled && kbIndex.status === 401) {
  check('KB 接口鉴权', false, '隐私模式下带会话仍 401，请检查 requireAuth 挂载')
} else {
  check('KB POST /api/kb/index → 增量索引统计', kbIndex.status === 200 && kbIndex.json?.ok === true, JSON.stringify(kbIndex.json?.data))

  const kbQ = await req('POST', '/api/kb/query', { body: { q: `冒烟 ${UNIQ} 讲了什么`, k: 3 }, cookie })
  check('KB POST /api/kb/query → 答案 + 来源', kbQ.status === 200 && typeof kbQ.json?.data?.answer === 'string' && Array.isArray(kbQ.json?.data?.sources), kbQ.json?.data?.answer?.slice(0, 40))

  const kbEmpty = await req('POST', '/api/kb/query', { body: { q: '  ' }, cookie })
  check('KB 空问题 → 400 VALIDATION_FAILED', kbEmpty.status === 400 && kbEmpty.json?.error?.code === 'VALIDATION_FAILED', kbEmpty.json?.error?.code)

  const streamRes = await fetch(`${BASE}/api/kb/stream?q=${encodeURIComponent('你好')}`, { headers: cookie ? { Cookie: cookie } : {} })
  const streamText = await streamRes.text()
  check('KB GET /api/kb/stream → SSE 事件流', streamRes.status === 200 && /event: (token|error|done)/.test(streamText), `status=${streamRes.status}`)
}

if (authEnabled) {
  // ⑪ 登出 → 204
  const logout = await req('POST', '/api/logout', { cookie })
  check('⑪ 登出 → 204', logout.status === 204, `status=${logout.status}`)

  // ⑫ 登出后旧会话失效 → 401
  const afterLogout = await req('GET', '/api/notes', { cookie })
  check('⑫ 登出后旧会话 → 401', afterLogout.status === 401, afterLogout.json?.error?.code)
}

console.log(`\n结果：✅ ${passed} 通过 ｜ ❌ ${failed} 失败`)
process.exit(failed ? 1 : 0)
