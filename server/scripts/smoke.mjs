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

// ===== 任务与确认链路（F4 发起 / F5 进度 / F6 确认）=====
// 注意：⑳ 会真的删除文件，所以专建一条「待删」资料，不动前面的冒烟资料。

// ⑪ 建提醒类任务（本期无自动执行器）→ 201 待办
const taskTodo = await req('POST', '/api/tasks', {
  body: { type: 'remind', payload: { text: `冒烟提醒-${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑪ POST /api/tasks(remind) → 201 待办',
  taskTodo.status === 201 && taskTodo.json?.data?.status === 'todo' && taskTodo.json?.data?.origin === 'phone',
  taskTodo.json?.data?.result,
)

// ⑫ 建资料类任务 → 同步执行 → 完成
const taskNote = await req('POST', '/api/tasks', {
  body: { type: 'note', payload: { title: `任务建的资料-${UNIQ}`, category: 'life', content: `任务正文 ${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑫ POST /api/tasks(note) → 同步归档完成',
  taskNote.status === 201 && taskNote.json?.data?.status === 'done',
  taskNote.json?.data?.result,
)

// ⑬ 重复提交同一内容 → 落一条 failed 任务（不重复写入）
const taskDup = await req('POST', '/api/tasks', {
  body: { type: 'note', payload: { title: `任务建的资料-${UNIQ}`, category: 'life', content: `任务正文 ${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑬ 重复内容 → 任务 failed + 查重原因',
  taskDup.status === 201 && taskDup.json?.data?.status === 'failed' && /已存在/.test(taskDup.json?.data?.result ?? ''),
  taskDup.json?.data?.result,
)

// ⑭ 任务列表 + 按状态过滤
const taskList = await req('GET', '/api/tasks?status=todo', { cookie })
const todoHit = Boolean(taskList.json?.data?.items?.some((t) => t.id === taskTodo.json?.data?.id))
check(
  '⑭ GET /api/tasks?status=todo → 命中且只含 todo',
  taskList.status === 200 && todoHit && taskList.json?.data?.items?.every((t) => t.status === 'todo'),
  `total=${taskList.json?.data?.total}`,
)

// ⑮ 非法状态迁移（已完成 → 待办）→ 400
const badMove = await req('PATCH', `/api/tasks/${taskNote.json?.data?.id}`, { body: { status: 'todo' }, cookie })
check(
  '⑮ 已完成→待办 → 400 VALIDATION_FAILED',
  badMove.status === 400 && badMove.json?.error?.code === 'VALIDATION_FAILED',
  badMove.json?.error?.message,
)

// ⑯ 专建一条待删资料，发起删除 → 任务 attention（此时尚未删除）
const victim = await req('POST', '/api/notes', {
  body: { title: `待删资料-${UNIQ}`, category: 'work', content: `待删正文 ${UNIQ}` },
  cookie,
})
const victimId = victim.json?.data?.id
const delTask = await req('POST', '/api/tasks', {
  body: { type: 'delete_note', payload: { note_id: victimId }, origin: 'phone' },
  cookie,
})
check(
  '⑯ 发起删除 → 任务 attention（还没删）',
  delTask.status === 201 && delTask.json?.data?.status === 'attention',
  delTask.json?.data?.result,
)

// ⑰ 未确认就想改状态 → 428（确认前的闸门）
const bypass = await req('PATCH', `/api/tasks/${delTask.json?.data?.id}`, { body: { status: 'done' }, cookie })
check(
  '⑰ 未确认改状态 → 428 CONFIRM_REQUIRED',
  bypass.status === 428 && bypass.json?.error?.code === 'CONFIRM_REQUIRED',
  bypass.json?.error?.message?.slice(0, 30),
)

// ⑱ 确认留痕可读，且带大白话 summary
const confs = await req('GET', `/api/confirmations?task_id=${delTask.json?.data?.id}`, { cookie })
const pendingConf = confs.json?.data?.items?.[0]
check(
  '⑱ GET /api/confirmations → 待确认 + summary',
  confs.status === 200 && Boolean(pendingConf) && pendingConf.decision === '' && /永久删除/.test(pendingConf.summary ?? ''),
  pendingConf?.summary?.slice(0, 30),
)

// ⑲ 拒绝 → 任务 failed，且资料原封不动
const rejected = await req('PATCH', `/api/tasks/${delTask.json?.data?.id}`, { body: { decision: 'rejected' }, cookie })
const stillThere = await req('GET', `/api/notes/${encodeURIComponent(victimId)}`, { cookie })
check(
  '⑲ 拒绝执行 → failed 且资料仍在',
  rejected.status === 200 && rejected.json?.data?.status === 'failed' && stillThere.status === 200,
  rejected.json?.data?.result,
)

// ⑳ 重新发起并确认 → 资料才真正被删除
const delTask2 = await req('POST', '/api/tasks', {
  body: { type: 'delete_note', payload: { note_id: victimId }, origin: 'phone' },
  cookie,
})
const approved = await req('PATCH', `/api/tasks/${delTask2.json?.data?.id}`, { body: { decision: 'approved' }, cookie })
const gone = await req('GET', `/api/notes/${encodeURIComponent(victimId)}`, { cookie })
check(
  '⑳ 确认执行 → done 且资料已删除',
  approved.status === 200 && approved.json?.data?.status === 'done' && gone.status === 404,
  approved.json?.data?.result,
)

// ㉑ 重复确认 → 400（同一确认提交两次应被拒）
const again = await req('PATCH', `/api/tasks/${delTask2.json?.data?.id}`, { body: { decision: 'approved' }, cookie })
check(
  '㉑ 重复确认 → 400（已无待确认）',
  again.status === 400 && again.json?.error?.code === 'VALIDATION_FAILED',
  again.json?.error?.message,
)

if (authEnabled) {
  // ㉒ 登出 → 204
  const logout = await req('POST', '/api/logout', { cookie })
  check('㉒ 登出 → 204', logout.status === 204, `status=${logout.status}`)

  // ㉓ 登出后旧会话失效 → 401
  const afterLogout = await req('GET', '/api/notes', { cookie })
  check('㉓ 登出后旧会话 → 401', afterLogout.status === 401, afterLogout.json?.error?.code)
}

console.log(`\n结果：✅ ${passed} 通过 ｜ ❌ ${failed} 失败`)
process.exit(failed ? 1 : 0)
