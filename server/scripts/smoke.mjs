// 端到端冒烟测试（零依赖，用 Node 18+ 自带 fetch）
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
// 转写链路冒烟：设 SMOKE_FAKE_ASR_PORT（如 8099）时，自动拉起 scripts/fake-asr.mjs 桩并跑转写断言；
// 需后端以 ASR_SERVICE_URL=http://127.0.0.1:<同一端口> ASR_SERVICE_TOKEN=fake-token ASR_POLL_INTERVAL_MS=1000 启动。
const FAKE_ASR_PORT = process.env.SMOKE_FAKE_ASR_PORT || ''
// ima 只读链路冒烟：设 SMOKE_FAKE_IMA_PORT（如 8097）时，自动拉起 scripts/fake-ima.mjs 桩并跑断言；
// 需后端以 IMA_BASE_URL=http://127.0.0.1:<同一端口> IMA_OPENAPI_CLIENTID=fake-cid IMA_OPENAPI_APIKEY=fake-key 启动。
// 不设 SMOKE_FAKE_IMA_PORT 时只做「未配置态」断言；后端配了真实凭据时会跳过一次真实只读调用。
// 笔记断言（im⑧–im⑪）覆盖：列表字段映射 / 详情 meta+Markdown 且 <mark> 已剥 / 404 / 隐私模式 401。
const FAKE_IMA_PORT = process.env.SMOKE_FAKE_IMA_PORT || ''

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

// ===== 按需拉起假 ASR 服务（转写断言用）=====
let fakeAsr = null
async function startFakeAsr() {
  if (!FAKE_ASR_PORT) return false
  fakeAsr = spawn(process.execPath, [fileURLToPath(new URL('./fake-asr.mjs', import.meta.url))], {
    env: { ...process.env, ASR_PORT: FAKE_ASR_PORT, FAKE_TOKEN: 'fake-token' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${FAKE_ASR_PORT}/healthz`)
      if (r.ok) return true
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('fake-asr 未能启动')
  process.exit(2)
}
// ===== 按需拉起假 ima 服务（只读断言用）=====
let fakeIma = null
async function startFakeIma() {
  if (!FAKE_IMA_PORT) return false
  fakeIma = spawn(process.execPath, [fileURLToPath(new URL('./fake-ima.mjs', import.meta.url))], {
    env: { ...process.env, IMA_PORT: FAKE_IMA_PORT },
    stdio: 'ignore',
  })
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`)
      if (r.ok) return true
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('fake-ima 未能启动')
  process.exit(2)
}
process.on('exit', () => { if (fakeAsr) fakeAsr.kill(); if (fakeIma) fakeIma.kill() })

/** 轮询任务直到终态（done/failed/attention）或超时；返回最后一次看到的任务对象。
 *  默认 60s：归档类任务可能含一次真实 LLM 整理（fallback 或慢端点都要打满等待预算）。 */
async function waitTask(id, cookie, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const res = await req('GET', '/api/tasks', { cookie })
    last = res.json?.data?.items?.find((t) => t.id === id) ?? null
    if (last && (last.status === 'done' || last.status === 'failed' || last.status === 'attention')) return last
    await new Promise((r) => setTimeout(r, 400))
  }
  return last
}

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

// ===== 视频转写链路（F13，可选）=====
// 触发条件：SMOKE_FAKE_ASR_PORT 已设 且 health.asr_configured 为真。
if (FAKE_ASR_PORT) {
  const fakeUp = await startFakeAsr()
  const h2 = await req('GET', '/api/health')
  if (!h2.json?.data?.asr_configured) {
    console.log('  ⏭️  后端未配 ASR_SERVICE_URL，跳过转写断言（fake-asr 已起但未接入）')
  } else {
    check('转① health.asr_configured → true', h2.json?.data?.asr_configured === true)

    // ㉕ 成功链路：提交 → 轮询器归档 → 资料落盘（含摘要/要点区块或回退说明 + 带时间戳全文）
    const okUrl = `https://example.com/v/${UNIQ}-ok`
    const t1 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: okUrl, category: 'learning', tags: ['转写'] } },
      cookie,
    })
    const t1done = t1.status === 201 ? await waitTask(t1.json.data.id, cookie) : null
    check(
      '转② transcribe_url → done 且归档到 data/*.md',
      t1.status === 201 && t1done?.status === 'done' && /已归档到 .+\.md/.test(t1done?.result ?? ''),
      t1done?.result,
    )
    const notePath = /已归档到 (\S+\.md)/.exec(t1done?.result ?? '')?.[1]
    const noteId = notePath ? notePath.split('/').pop().replace(/\.md$/, '') : ''
    const noteDetail = noteId ? await req('GET', `/api/notes/${encodeURIComponent(noteId)}`, { cookie }) : null
    check(
      '转③ 归档资料含 frontmatter source_url + 带时间戳全文',
      noteDetail?.status === 200 &&
        noteDetail.json?.data?.meta?.source_url === okUrl &&
        /## 全文（带时间戳）/.test(noteDetail.json?.data?.content ?? '') &&
        /\[\d{2}:\d{2}\]/.test(noteDetail.json?.data?.content ?? ''),
      noteId,
    )

    // 转④ 同一 URL 二次提交：不写第二份文件，任务 done 且提示已归档过
    const t1b = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: okUrl, category: 'learning' } },
      cookie,
    })
    const t1bdone = t1b.status === 201 ? await waitTask(t1b.json.data.id, cookie) : null
    check(
      '转④ 同一 URL 二次提交 → done 且不再写文件',
      t1b.status === 201 && t1bdone?.status === 'done' && /已归档过/.test(t1bdone?.result ?? ''),
      t1bdone?.result,
    )

    // ㉘ partial：job failed 但带已完成片段 → 仍归档 + 部分转写告警
    const pUrl = `https://example.com/v/${UNIQ}-partial`
    const t2 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: pUrl } },
      cookie,
    })
    const t2done = t2.status === 201 ? await waitTask(t2.json.data.id, cookie) : null
    const pPath = /已归档到 (\S+\.md)|已归档过 (\S+\.md)/.exec(t2done?.result ?? '')
    const pNoteId = pPath ? (pPath[1] || pPath[2]).split('/').pop().replace(/\.md$/, '') : ''
    const pNote = pNoteId ? await req('GET', `/api/notes/${encodeURIComponent(pNoteId)}`, { cookie }) : null
    check(
      '转⑤ 带 partial 的失败 → 归档成功 + 部分转写告警块',
      t2.status === 201 && t2done?.status === 'done' && /部分转写/.test(t2done?.result ?? '') &&
        /部分转写/.test(pNote?.json?.data?.content ?? ''),
      t2done?.result,
    )

    // ㉙ 完全失败（无 partial）→ 任务 failed，不落资料
    const fUrl = `https://example.com/v/${UNIQ}-fail`
    const t3 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: fUrl } },
      cookie,
    })
    const t3done = t3.status === 201 ? await waitTask(t3.json.data.id, cookie) : null
    check(
      '转⑥ job 完全失败 → 任务 failed + 中文原因',
      t3.status === 201 && t3done?.status === 'failed' && /失败/.test(t3done?.result ?? ''),
      t3done?.result,
    )

    // 转⑦ job 消失（404）→ 任务 failed + 可重试提示
    const gUrl = `https://example.com/v/${UNIQ}-gone`
    const t4 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: gUrl } },
      cookie,
    })
    const t4done = t4.status === 201 ? await waitTask(t4.json.data.id, cookie) : null
    check(
      '转⑦ job 404 → 任务 failed 且提示可退回重试',
      t4.status === 201 && t4done?.status === 'failed' && /退回待办重试/.test(t4done?.result ?? ''),
      t4done?.result,
    )

    // ㉛ 退回重试：retry URL 首次 job 失败 → PATCH todo 重新提交 → 第二次成功归档
    const rUrl = `https://example.com/v/${UNIQ}-retry`
    const t5 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: rUrl } },
      cookie,
    })
    const t5fail = t5.status === 201 ? await waitTask(t5.json.data.id, cookie) : null
    const retry = t5fail?.status === 'failed'
      ? await req('PATCH', `/api/tasks/${t5fail.id}`, { body: { status: 'todo' }, cookie })
      : null
    const t5done = retry?.status === 200 ? await waitTask(t5fail.id, cookie) : null
    check(
      '转⑧ failed→todo 重试 → 重新提交并归档',
      t5.status === 201 && t5fail?.status === 'failed' && retry?.status === 200 &&
        t5done?.status === 'done' && /已归档/.test(t5done?.result ?? ''),
      `first=${t5fail?.status} retried=${retry?.status} final=${t5done?.status} ${t5done?.result ?? ''}`,
    )

    // 转⑨ 非法 payload → 400（不落任务）
    const bad = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: 'ftp://x' } },
      cookie,
    })
    check(
      '转⑨ 非 http(s) url → 400 VALIDATION_FAILED',
      bad.status === 400 && bad.json?.error?.code === 'VALIDATION_FAILED',
      bad.json?.error?.message,
    )

    // 转⑩ 先字幕：prefer_subtitles 命中字幕 → 同步归档（字幕）+ 正文含 srt 代码块
    const subUrl = `https://example.com/v/${UNIQ}-subok`
    const t6 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: subUrl, category: 'learning', prefer_subtitles: true, formats: ['text', 'segments', 'srt'] } },
      cookie,
    })
    const t6done = t6.status === 201 ? await waitTask(t6.json.data.id, cookie) : null
    const sPath = /已归档到 (\S+\.md)/.exec(t6done?.result ?? '')
    const sNoteId = sPath ? sPath[1].split('/').pop().replace(/\.md$/, '') : ''
    const sNote = sNoteId ? await req('GET', `/api/notes/${encodeURIComponent(sNoteId)}`, { cookie }) : null
    check(
      '转⑩ prefer_subtitles 命中字幕 → done（字幕）+ 正文含 srt 代码块',
      t6.status === 201 && t6done?.status === 'done' && /（字幕）/.test(t6done?.result ?? '') &&
        /## 字幕（srt）/.test(sNote?.json?.data?.content ?? '') && /```srt/.test(sNote?.json?.data?.content ?? ''),
      t6done?.result,
    )

    // 转⑪ 先字幕但无字幕 → 回落转写并归档（结果不含「字幕」字样）
    const subMissUrl = `https://example.com/v/${UNIQ}-nosub`
    const t7 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: subMissUrl, category: 'learning', prefer_subtitles: true } },
      cookie,
    })
    const t7done = t7.status === 201 ? await waitTask(t7.json.data.id, cookie) : null
    check(
      '转⑪ prefer_subtitles 无字幕 → 回落转写并归档',
      t7.status === 201 && t7done?.status === 'done' && /已归档到/.test(t7done?.result ?? '') && !/（字幕）/.test(t7done?.result ?? ''),
      t7done?.result,
    )
  }
}

// ===== 链接收敛链路（F14）：SSRF 闸门 + 本地 fake-org 抓取 → 归档 =====
// 收① 确定性断言：指向云元数据私网地址 → 任务 failed（不依赖任何环境变量）
{
  const metaUrl = 'http://169.254.169.254/latest/meta-data'
  const t8 = await req('POST', '/api/tasks', {
    body: { type: 'organize', payload: { url: metaUrl } },
    cookie,
  })
  const t8done = t8.status === 201 ? await waitTask(t8.json.data.id, cookie) : null
  check(
    '收① 内网/元数据地址 → failed + SSRF 拦截原因（逃生门只放回环，此处恒拦）',
    t8.status === 201 && t8done?.status === 'failed' && /内网|保留|阻止/.test(t8done?.result ?? ''),
    t8done?.result,
  )

  // 收② 起本地 fake-org（含正文 + 站点名）→ 走完整 抓取→整理→归档
  const orgServer = http.createServer((req2, res2) => {
    res2.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res2.end(
      '<!doctype html><html><head><title>冒烟-收敛-' + UNIQ + '</title>' +
        '<meta property="og:site_name" content="冒烟站"></head><body><article>' +
        `<p>${'这是供收敛链路抓取的文章正文，围绕一个主题说明来龙去脉。'.repeat(10)}</p>` +
        '</article></body></html>',
    )
  })
  await new Promise((r) => orgServer.listen(0, '127.0.0.1', r))
  const orgUrl = `http://127.0.0.1:${orgServer.address().port}/article-${UNIQ}`

  const t9 = await req('POST', '/api/tasks', {
    body: { type: 'organize', payload: { url: orgUrl, category: 'work', tags: ['收敛'] } },
    cookie,
  })
  const t9done = t9.status === 201 ? await waitTask(t9.json.data.id, cookie, 30000) : null

  if (t9done?.status === 'failed' && /内网|保留|阻止/.test(t9done?.result ?? '')) {
    console.log('  ⏭️  后端未开 ORGANIZE_ALLOW_LOOPBACK，跳过「收②/收③」的本地抓取断言（SSRF 按设计生效）')
  } else {
    const oPath = /已归档到 (\S+\.md)/.exec(t9done?.result ?? '')?.[1]
    const oNoteId = oPath ? oPath.split('/').pop().replace(/\.md$/, '') : ''
    const oNote = oNoteId ? await req('GET', `/api/notes/${encodeURIComponent(oNoteId)}`, { cookie }) : null
    check(
      '收② 本地页面 → done 且归档出带 source_url 的资料',
      t9.status === 201 && t9done?.status === 'done' && !!oPath &&
        oNote?.json?.data?.meta?.source_url === orgUrl &&
        /原文节选/.test(oNote?.json?.data?.content ?? ''),
      `${t9done?.status} ${t9done?.result ?? ''}`,
    )

    const t9b = await req('POST', '/api/tasks', {
      body: { type: 'organize', payload: { url: orgUrl } },
      cookie,
    })
    const t9bdone = t9b.status === 201 ? await waitTask(t9b.json.data.id, cookie, 30000) : null
    check(
      '收③ 同一 URL 二次收敛 → done 且提示已归档过（不写第二份）',
      t9b.status === 201 && t9bdone?.status === 'done' && /已归档过/.test(t9bdone?.result ?? ''),
      t9bdone?.result,
    )
  }
  orgServer.close()
}


// ===== ima 云端知识库只读代理（F15，可选）=====
// 分支逻辑：后端未配凭据 → 只验 503 IMA_NOT_CONFIGURED；设了 SMOKE_FAKE_IMA_PORT → 起桩跑全套；
// 后端配了真实凭据但没设桩端口 → 发一发 /kbs 看 200 就跳（不拿真实服务当断言对象）。
{
  const probe = await req('GET', '/api/ima/kbs', { cookie })
  if (probe.status === 503 && probe.json?.error?.code === 'IMA_NOT_CONFIGURED') {
    check('im⓪ 未配 Key → 503 IMA_NOT_CONFIGURED', true)
  } else if (!FAKE_IMA_PORT) {
    console.log(`  ⏭️  后端已配 ima（probe=${probe.status}）但未设 SMOKE_FAKE_IMA_PORT，跳过桩断言`)
  } else if (await startFakeIma()) {
    // 桩已起；用带 query 的 /kbs 验证真字段映射（kb_id/kb_name → id/name）
    const kbs = await req('GET', '/api/ima/kbs', { cookie })
    check(
      'im① GET /api/ima/kbs → 200 且字段映射正确',
      kbs.status === 200 && kbs.json?.data?.items?.some((i) => i.id === 'kb-a' && i.name === '课程笔记'),
      `items=${kbs.json?.data?.items?.length}`,
    )

    // 浏览：文件与文件夹混排，文件夹带 kind=folder
    const items = await req('GET', '/api/ima/items?kb_id=kb-a', { cookie })
    check(
      'im② GET /api/ima/items → 混排且 kind 正确',
      items.status === 200 &&
        items.json?.data?.items?.[0]?.kind === 'folder' &&
        items.json?.data?.items?.[1]?.kind === 'entry' &&
        Array.isArray(items.json?.data?.current_path),
      `items=${items.json?.data?.items?.length}`,
    )

    // 校验：缺 kb_id / 缺 q → 400
    const noKb = await req('GET', '/api/ima/items', { cookie })
    const noQ = await req('GET', '/api/ima/search?kb_id=kb-a', { cookie })
    check(
      'im③ 缺参数 → 400 VALIDATION_FAILED',
      noKb.status === 400 && noKb.json?.error?.code === 'VALIDATION_FAILED' &&
        noQ.status === 400 && noQ.json?.error?.code === 'VALIDATION_FAILED',
      '',
    )

    // 上游非 0 code → 503 IMA_UPSTREAM_FAILED（桩 kb-err 分支）
    const upstreamErr = await req('GET', '/api/ima/items?kb_id=kb-err', { cookie })
    check(
      'im④ 上游业务错误 → 503 IMA_UPSTREAM_FAILED 且透传 errmsg',
      upstreamErr.status === 503 && upstreamErr.json?.error?.code === 'IMA_UPSTREAM_FAILED' && /接口无效/.test(upstreamErr.json?.error?.message ?? ''),
      upstreamErr.json?.error?.message,
    )

    // 搜索：高亮剥标签；q=截断 桩返 100 条 → truncated=true
    const hit = await req('GET', `/api/ima/search?kb_id=kb-a&q=${encodeURIComponent('微积分')}`, { cookie })
    const trunc = await req('GET', `/api/ima/search?kb_id=kb-a&q=${encodeURIComponent('截断')}`, { cookie })
    check(
      'im⑤ 搜索命中 → highlight 剥标签；100 条 → truncated',
      hit.status === 200 && hit.json?.data?.items?.every((i) => !/</.test(i.highlight ?? '')) &&
        trunc.status === 200 && trunc.json?.data?.truncated === true && trunc.json?.data?.items?.length === 100,
      `hit=${hit.json?.data?.items?.length} trunc=${trunc.json?.data?.items?.length}`,
    )

    // 缓存：同参第二次调用，桩侧计数不增加（TTL 60s 内）
    const uniq = `cache-${UNIQ}`
    const c1 = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`).then((r) => r.json()).then((d) => d.counts?.['/openapi/wiki/v1/search_knowledge_base'] ?? 0)
    await req('GET', `/api/ima/kbs?q=${encodeURIComponent(uniq)}`, { cookie })
    await req('GET', `/api/ima/kbs?q=${encodeURIComponent(uniq)}`, { cookie })
    const c2 = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`).then((r) => r.json()).then((d) => d.counts?.['/openapi/wiki/v1/search_knowledge_base'] ?? 0)
    check('im⑥ 同参 60s 内第二次 → 命中缓存不再打上游', c2 - c1 === 1, `上游计数 ${c1}→${c2}`)

    // 隐私模式下未带 cookie 应 401（公开模式下这发是 200，不做断言）
    if (authEnabled) {
      const noAuth = await req('GET', '/api/ima/kbs')
      check('im⑦ 未登录访问 → 401 AUTH_REQUIRED', noAuth.status === 401 && noAuth.json?.error?.code === 'AUTH_REQUIRED', '')
    }

    // ===== ima 笔记只读（F15b）=====
    // 列表：平铺字段映射（note_id → id）
    const notes = await req('GET', '/api/ima/notes', { cookie })
    check(
      'im⑧ GET /api/ima/notes → 200 且字段映射正确',
      notes.status === 200 &&
        notes.json?.data?.items?.some((i) => i.id === 'note-1' && i.title === '测试笔记' && !/</.test(i.summary ?? '')),
      `items=${notes.json?.data?.items?.length}`,
    )

    // 详情：meta + Markdown 正文，正文里的 <mark> 由服务端剥掉
    const note = await req('GET', '/api/ima/notes/note-1', { cookie })
    check(
      'im⑨ GET /api/ima/notes/:id → meta + Markdown 且 <mark> 已剥',
      note.status === 200 &&
        note.json?.data?.meta?.id === 'note-1' &&
        note.json?.data?.meta?.title === '测试笔记' &&
        String(note.json?.data?.content ?? '').startsWith('# 测试笔记') &&
        !/<mark/.test(note.json?.data?.content ?? '') &&
        /这是一个测试文档/.test(note.json?.data?.content ?? ''),
      `content=${String(note.json?.data?.content ?? '').length} 字节`,
    )

    // 不存在的笔记 → 404 IMA_NOTE_NOT_FOUND（meta 在列表里扫不到）
    const missing = await req('GET', '/api/ima/notes/note-missing', { cookie })
    check(
      'im⑩ 不存在的笔记 → 404 IMA_NOTE_NOT_FOUND',
      missing.status === 404 && missing.json?.error?.code === 'IMA_NOTE_NOT_FOUND',
      missing.json?.error?.message,
    )

    // 隐私模式未带 cookie → 401
    if (authEnabled) {
      const noAuthNotes = await req('GET', '/api/ima/notes')
      check('im⑪ 未登录访问笔记 → 401 AUTH_REQUIRED', noAuthNotes.status === 401 && noAuthNotes.json?.error?.code === 'AUTH_REQUIRED', '')
    }
  }
}

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
