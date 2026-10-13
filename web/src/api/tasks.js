// 任务与确认记录接口封装（SPEC 第 3 章接口 6–8 + 确认留痕接口）
// 与 api/notes.js 同一约定：服务端的 snake_case 字段在这里转成前端习惯的 camelCase，页面只认这一套。
import { request } from './client.js'

function toTask(raw) {
  return {
    id: raw.id,
    type: raw.type,
    payload: raw.payload ?? {},
    status: raw.status,
    result: raw.result ?? '',
    origin: raw.origin,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function toConfirmation(raw) {
  return {
    id: raw.id,
    taskId: raw.task_id,
    action: raw.action,
    summary: raw.summary,
    requestedAt: raw.requested_at,
    decision: raw.decision ?? '',
    confirmedAt: raw.confirmed_at ?? '',
  }
}

/** 建任务（F4）：type=note 提交即执行；type=delete_note 只登记待确认，不会真删（F6） */
export async function createTask({ type, payload, origin = 'desktop' }) {
  const data = await request('/api/tasks', { method: 'POST', body: { type, payload, origin } })
  return toTask(data)
}

/** 任务列表（F5）：返回 { total, items[] }，可按 status 过滤 */
export async function listTasks({ status = '' } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const qs = params.toString()
  const data = await request(`/api/tasks${qs ? `?${qs}` : ''}`)
  return { total: data.total, items: (data.items ?? []).map(toTask) }
}

/** 只改状态（F5 手工推进）；任务若有待确认动作，服务端会回 428 CONFIRM_REQUIRED */
export async function updateTaskStatus(id, status) {
  const data = await request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } })
  return toTask(data)
}

/** 提交确认结果（F6）：decision 只能是 approved / rejected */
export async function decideTask(id, decision) {
  const data = await request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: { decision } })
  return toTask(data)
}

/** 确认留痕回看（F6）：返回 { total, items[] }，可按任务过滤 */
export async function listConfirmations({ taskId = '' } = {}) {
  const params = new URLSearchParams()
  if (taskId) params.set('task_id', taskId)
  const qs = params.toString()
  const data = await request(`/api/confirmations${qs ? `?${qs}` : ''}`)
  return { total: data.total, items: (data.items ?? []).map(toConfirmation) }
}
