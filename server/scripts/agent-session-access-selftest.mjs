// Agent 会话归属与游客隔离自测（临时目录、无模型调用、无真实资料）。
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'buddy-agent-access-'))
let server

try {
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    AUTH_ENABLED: '0',
    AUTH_WRITE_REQUIRED: '1',
    TRUST_PROXY: '0',
    OPENAI_API_KEY: '',
    CHROMA_URL: '',
  })

  const { createApp } = await import('../src/app.js')
  const { newSession, saveSession } = await import('../src/services/agent/state.js')
  const { createSession } = await import('../src/services/sessions.js')

  const privateDraft = 'PRIVATE_AGENT_DRAFT_SENTINEL'
  const ownerSession = newSession({ owner: { type: 'user' } })
  ownerSession.pendingConfirmationId = 'owner-confirmation'
  ownerSession.messages = [{
    type: 'tool',
    data: {
      name: 'archive_note',
      tool_call_id: 'owner-tool-call',
      content: JSON.stringify({
        pending_confirmation: true,
        confirmation_id: 'owner-confirmation',
        task_id: 'owner-task',
        draft: { title: privateDraft, content: 'private draft body' },
      }),
    },
  }]
  await saveSession(ownerSession)

  const guestToken = randomBytes(32).toString('hex')
  const guestKey = createHash('sha256').update(guestToken).digest('hex')
  const guestSession = newSession({ owner: { type: 'guest', key: guestKey } })
  guestSession.pendingConfirmationId = 'guest-confirmation'
  guestSession.messages = [
    { type: 'human', data: { content: 'guest-only conversation' } },
    { type: 'tool', data: { name: 'archive_note', tool_call_id: 'guest-tool-call', content: JSON.stringify({
      pending_confirmation: true,
      confirmation_id: 'guest-confirmation',
      task_id: 'guest-task',
      draft: { title: 'OWN_GUEST_DRAFT_SENTINEL', content: 'guest private draft' },
    }) } },
  ]
  await saveSession(guestSession)

  const app = createApp()
  server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`

  const foreignGuestRead = await fetch(`${base}/api/agent/sessions/${ownerSession.id}`, {
    headers: { Cookie: `agent_guest=${randomBytes(32).toString('hex')}` },
  })
  assert.equal(foreignGuestRead.status, 404, '游客不能读取登录用户会话')
  assert(!(await foreignGuestRead.text()).includes(privateDraft))

  const foreignGuestContinue = await fetch(`${base}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `agent_guest=${randomBytes(32).toString('hex')}` },
    body: JSON.stringify({ message: '继续', session_id: ownerSession.id }),
  })
  assert.equal(foreignGuestContinue.status, 404, '游客不能通过 chat session_id 读取/续用登录会话')
  assert(!(await foreignGuestContinue.text()).includes(privateDraft))

  const ownGuestRead = await fetch(`${base}/api/agent/sessions/${guestSession.id}`, {
    headers: { Cookie: `agent_guest=${guestToken}` },
  })
  assert.equal(ownGuestRead.status, 200, '游客可恢复自己的只读会话')
  assert((await ownGuestRead.text()).includes('guest-only conversation'))

  const ownGuestContinue = await fetch(`${base}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `agent_guest=${guestToken}` },
    body: JSON.stringify({ message: '继续', session_id: guestSession.id }),
  })
  const ownGuestText = await ownGuestContinue.text()
  assert.equal(ownGuestContinue.status, 200, '游客可继续自己的待确认只读会话')
  assert(ownGuestText.includes('OWN_GUEST_DRAFT_SENTINEL'))

  const loggedInGuestRead = await fetch(`${base}/api/agent/sessions/${guestSession.id}`, {
    headers: { Cookie: `sid=${createSession()}` },
  })
  assert.equal(loggedInGuestRead.status, 200, '登录后可接续该浏览器此前的游客会话')

  const otherGuestRead = await fetch(`${base}/api/agent/sessions/${guestSession.id}`, {
    headers: { Cookie: `agent_guest=${randomBytes(32).toString('hex')}` },
  })
  assert.equal(otherGuestRead.status, 404, '其他游客不能读取该游客会话')
  assert(!(await otherGuestRead.text()).includes('OWN_GUEST_DRAFT_SENTINEL'))

  const otherGuestContinue = await fetch(`${base}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `agent_guest=${randomBytes(32).toString('hex')}` },
    body: JSON.stringify({ message: '继续', session_id: guestSession.id }),
  })
  const otherGuestText = await otherGuestContinue.text()
  assert.equal(otherGuestContinue.status, 404, '其他游客不能通过 chat 继续该游客会话')
  assert(!otherGuestText.includes('OWN_GUEST_DRAFT_SENTINEL'))

  const sid = createSession()
  const ownerRead = await fetch(`${base}/api/agent/sessions/${ownerSession.id}`, {
    headers: { Cookie: `sid=${sid}` },
  })
  assert.equal(ownerRead.status, 200, '登录用户可恢复自己的会话')
  assert((await ownerRead.text()).includes(privateDraft))

  const logout = await fetch(`${base}/api/logout`, {
    method: 'POST',
    headers: { Cookie: `sid=${sid}; agent_guest=${guestToken}` },
  })
  assert.equal(logout.status, 204, '退出成功')
  assert.match(logout.headers.get('set-cookie') || '', /agent_guest=/, '退出响应清除匿名身份 Cookie')

  const missingRead = await fetch(`${base}/api/agent/sessions/${randomBytes(8).toString('hex')}`)
  assert.equal(missingRead.status, 404, '匿名访问不存在会话返回统一 404')
  const setCookie = missingRead.headers.get('set-cookie') || ''
  assert.match(setCookie, /agent_guest=.*HttpOnly/i, '访客身份 Cookie 必须为 HttpOnly')

  console.log('agent-session-access-selftest: PASS (10 access-boundary assertions)')
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
}
