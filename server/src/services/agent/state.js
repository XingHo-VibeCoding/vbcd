// agent 会话状态存储：一个会话一个 JSON 文件，落 DATA_DIR/.runtime/agent/<sessionId>.json。
// 复用 storage/tasks.js 的「读全部→改→临时文件+原子重命名」模式（运行时数据可再生，
// 读坏/写半截一律回退为新会话，不阻塞服务）。
// 状态形状即 JSON 接缝：{id, messages[], step, pendingConfirmationId?, created_at, updated_at}
// —— 将来若迁 langgraph，迁的是「谁驱动状态转移」，这份数据不用改。

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { RUNTIME_DIR } from '../../storage/tasks.js'

export const AGENT_DIR = path.join(RUNTIME_DIR, 'agent')
export const RUNS_FILE = path.join(AGENT_DIR, 'runs.jsonl')

async function ensureReady() {
  await mkdir(AGENT_DIR, { recursive: true })
}

// Day 23：message 一律是给用户看的中文；原始错误细节放 detail，只进服务端日志（SPEC §5.3）
function storageError(message, detail) {
  return Object.assign(new Error(message), { status: 503, code: 'STORAGE_FAILED', expose: true, detail })
}

function sessionPath(id) {
  // sessionId 由服务端生成（hex），不直接拼外部输入——但仍防一手路径分隔符
  if (!/^[a-z0-9-]+$/i.test(id)) throw storageError('非法会话 id')
  return path.join(AGENT_DIR, `${id}.json`)
}

/** 新会话骨架 */
export function newSession(id = randomBytes(8).toString('hex')) {
  const now = new Date().toISOString()
  return {
    id,
    messages: [],          // langchain 消息序列化后的普通对象（role/content/tool_calls/tool_call_id/name）
    step: 0,
    pendingConfirmationId: null,
    created_at: now,
    updated_at: now,
  }
}

/** 读会话：不存在/损坏 → null（调用方决定是报错还是新建） */
export async function loadSession(id) {
  await ensureReady()
  try {
    const parsed = JSON.parse(await readFile(sessionPath(id), 'utf8'))
    if (!parsed || parsed.id !== id || !Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}

/** 写会话：临时文件 + 原子重命名 */
export async function saveSession(session) {
  await ensureReady()
  session.updated_at = new Date().toISOString()
  const file = sessionPath(session.id)
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw storageError('保存会话状态失败，请稍后再试', err)
  }
}

/** 从完整工具响应恢复待确认对象，普通工具摘要仍可截断。 */
export function pendingConfirmationView(session) {
  const confirmationId = session.pendingConfirmationId
  if (!confirmationId) return null
  for (const message of [...session.messages].reverse()) {
    if (message.type !== 'tool') continue
    const data = message.data ?? {}
    let parsed
    try { parsed = JSON.parse(contentText(data.content)) } catch { continue }
    if (!parsed.pending_confirmation || parsed.confirmation_id !== confirmationId) continue
    const planning = data.name === 'propose_planning' || Boolean(parsed.draft_id)
    const original = session.messages.flatMap(m => m.type === 'ai' ? m.data?.tool_calls ?? [] : [])
      .find(call => call.id === data.tool_call_id)
    // 兼容旧归档草案：旧响应不含正文，但原工具参数中仍保留完整正文。
    const draft = planning ? parsed.draft : { ...(original?.args ?? {}), ...(parsed.draft ?? {}) }
    return {
      confirmation_id: confirmationId, task_id: parsed.task_id,
      draft_id: parsed.draft_id || parsed.draft?.id, planning, draft,
      note: planning ? '规划草案尚未保存，请先确认或拒绝。' : '归档草案尚未保存，请先确认或拒绝。',
    }
  }
  return { confirmation_id: confirmationId, note: '仍有一项操作待确认，请重新读取草案。' }
}

/**
 * 把落盘会话还原成前端可渲染的消息行（GET /api/agent/sessions/:id 用）。
 * 还原规则：
 *   human → user 气泡；ai → assistant 气泡（空正文且有 tool_calls 时省略气泡，
 *   只留工具行）；ai.data.tool_calls 与后续 tool 消息按 tool_call_id 配对成
 *   「工具调用行」（toolOk/toolResult 由 tool 消息回填，找不到配对就单列）。
 *   session.pendingConfirmationId 非空 → 末尾追加一行确认提示。
 * 返回的是纯展示数据，不含 langchain 私有字段。
 */
export function sessionToView(session) {
  const rows = []
  const pendingByCallId = new Map() // tool_call_id → row index（等回填）

  for (const m of session.messages ?? []) {
    const data = m?.data ?? {}
    if (m.type === 'human') {
      rows.push({ role: 'user', text: contentText(data.content) })
    } else if (m.type === 'ai') {
      const text = contentText(data.content)
      const calls = Array.isArray(data.tool_calls) ? data.tool_calls : []
      if (text) rows.push({ role: 'assistant', text })
      for (const call of calls) {
        pendingByCallId.set(call.id, rows.length)
        rows.push({ role: 'tool', toolName: call.name, toolArgs: call.args ?? {}, pending: true })
      }
    } else if (m.type === 'tool') {
      const idx = data.tool_call_id != null ? pendingByCallId.get(data.tool_call_id) : undefined
      const result = contentText(data.content)
      const row = {
        role: 'tool',
        toolName: data.name ?? 'tool',
        toolOk: !String(result).startsWith('工具执行失败'),
        toolResult: String(result).slice(0, 500), // 与 SSE tool_result 同口径截断
        pending: false,
      }
      if (idx !== undefined) {
        rows[idx] = { ...rows[idx], ...row, toolArgs: rows[idx].toolArgs }
        pendingByCallId.delete(data.tool_call_id)
      } else {
        rows.push(row) // 配对不上的孤立 tool 消息也如实显示
      }
    }
  }

  // 历史里没等到结果的调用：pending 保留但不再显示转圈（页面刷新后没有进行中的流）
  for (const row of rows) if (row.pending) row.pending = false

  if (session.pendingConfirmationId) {
    rows.push({
      role: 'tool',
      toolName: 'confirmation',
      confirm: pendingConfirmationView(session),
      text: '这个动作需要你先确认',
    })
  }

  return {
    session_id: session.id,
    created_at: session.created_at,
    updated_at: session.updated_at,
    pending_confirmation_id: session.pendingConfirmationId ?? null,
    rows,
  }
}

/** ai/tool 消息的 content 统一取文本（可能是字符串或多模态块数组） */
function contentText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => c?.text || '').join('')
  return content == null ? '' : String(content)
}

/** 按 pendingConfirmationId 反查会话：确认链路完成时用它找到该通知哪个会话 */
export async function findSessionByPendingConfirmation(confirmationId) {
  await ensureReady()
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(AGENT_DIR).catch(() => [])
  for (const name of files) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -5)
    const session = await loadSession(id).catch(() => null)
    if (session?.pendingConfirmationId === confirmationId) return session
  }
  return null
}
