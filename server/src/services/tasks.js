// 任务业务逻辑（SPEC 第 2.3 节字段 / 第 3 章接口 6–8）
// 依赖方向：routes → services → storage。本文件不直接读写文件系统。
// 执行器策略（已与使用者确认）：type=note 提交即同步执行；organize / remind 本期无执行器，登记为待办等人工推进。
import { randomBytes } from 'node:crypto'
import * as taskStore from '../storage/tasks.js'
import * as confirmationStore from '../storage/confirmations.js'
import * as storage from '../storage/files.js'
import { createNote, nowShanghai } from './notes.js'
import { fail } from './errors.js'

// delete_note 是高风险类型：建任务只生成「待确认」记录，必须经 decision=approved 才会真删（F6）
export const TASK_TYPES = ['note', 'organize', 'remind', 'delete_note']
export const TASK_STATUSES = ['todo', 'doing', 'done', 'failed', 'attention']
export const TASK_ORIGINS = ['phone', 'desktop']
export const CONFIRM_DECISIONS = ['approved', 'rejected']

// 状态中文名：只用于服务端错误文案（前端有自己的展示层）
const STATUS_LABELS = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  failed: '失败',
  attention: '需处理',
}

// 允许的状态迁移：done 为终态；failed 可退回重试；attention 表示需人工介入（如写盘成功但 Git 失败）
const ALLOWED_TRANSITIONS = {
  todo: ['doing', 'done', 'failed'],
  doing: ['todo', 'done', 'failed', 'attention'],
  failed: ['todo'],
  attention: ['todo', 'doing', 'done', 'failed'],
  done: [],
}

const MAX_LIST = 200

// id 规则（SPEC 第 2 章）：递增时间戳 + 随机串
function newId() {
  return `${Date.now()}-${randomBytes(2).toString('hex')}`
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

/** note 类型任务的执行器：复用资料业务，不重写写文件逻辑 */
async function executeNoteTask(task) {
  try {
    const created = await createNote(task.payload)
    task.status = 'done'
    task.result = `已归档到 ${created.path}`
  } catch (err) {
    // 用户填错字段（标题空、分类不对等）：抛给路由返回 400，不落任务 —— 这不是"任务失败"，是请求不合法
    if (err.code === 'VALIDATION_FAILED') throw err
    // 其余（重复提交、写盘失败）：落一条失败任务，让手机端在列表里能看到原因（F5）
    task.status = 'failed'
    task.result = err.message || '执行失败'
  }
  return taskStore.put(task)
}

/**
 * delete_note 类型：只登记「待确认」，绝不在这里删任何东西。
 * summary 用大白话写明「接下来会发生什么」，供确认页原样展示（F6 验收项）。
 */
async function requestDeleteTask(task) {
  const noteId = String(task.payload?.note_id ?? '').trim()
  if (!noteId) throw fail('VALIDATION_FAILED', 'delete_note 任务需要 payload.note_id')

  const note = await storage.get(noteId)
  if (!note) throw fail('NOT_FOUND', '这条资料不存在，无法删除', 404)

  const { iso } = nowShanghai()
  await confirmationStore.put({
    id: newId(),
    task_id: task.id,
    action: 'delete_note',
    summary: `将永久删除资料《${note.meta.title}》（${note.meta.path}）。删除后它不再出现在列表与检索中，且无法恢复。`,
    requested_at: iso,
    decision: '',
    confirmed_at: '',
    schema_version: 1,
  })

  task.status = 'attention'
  task.result = '等待确认后才能删除（未确认前资料保持原样）'
  return taskStore.put(task)
}

/** 取某任务尚未决定的确认记录（一条任务同时只会有一个待确认动作） */
async function pendingConfirmationOf(taskId) {
  const all = await confirmationStore.list()
  return all.find((item) => item.task_id === taskId && !item.decision) ?? null
}

/**
 * 未确认前执行高风险动作：执行前再确认一次资料是否存在，
 * 并把确认时间写进任务结果，让列表页也能看到留痕（F6）。
 */
async function executeApproved(task, confirmation, iso) {
  try {
    if (confirmation.action === 'delete_note') {
      const removed = await storage.remove(String(task.payload?.note_id ?? ''))
      task.status = removed ? 'done' : 'failed'
      task.result = removed
        ? `已删除 ${removed.path}（确认时间 ${iso}）`
        : '确认后发现资料已不存在，未做任何改动'
    } else {
      task.status = 'failed'
      task.result = `暂不支持的确认动作：${confirmation.action}`
    }
  } catch (err) {
    task.status = 'failed'
    task.result = err.message || '执行失败'
  }
  task.updated_at = iso
  return taskStore.put(task)
}

/**
 * 处理确认结果：先把决定与时间落进 Confirmation（留痕），再按决定执行或取消。
 * 拒绝一律不执行；重复提交同一确认会因"已无待确认记录"而失败（对应"不重复处理"铁律）。
 */
async function decideTask(task, decision) {
  if (!CONFIRM_DECISIONS.includes(decision)) {
    throw fail('VALIDATION_FAILED', `decision 只能是 ${CONFIRM_DECISIONS.join(' / ')}`)
  }

  const confirmation = await pendingConfirmationOf(task.id)
  if (!confirmation) throw fail('VALIDATION_FAILED', '这个任务没有待确认的操作（可能已经确认过了）')

  const { iso } = nowShanghai()
  confirmation.decision = decision
  confirmation.confirmed_at = iso
  await confirmationStore.put(confirmation)

  if (decision === 'rejected') {
    task.status = 'failed'
    task.result = `已取消：你在 ${iso} 拒绝了这次操作，未做任何改动`
    task.updated_at = iso
    return taskStore.put(task)
  }

  return executeApproved(task, confirmation, iso)
}

/**
 * 新建任务（对应 POST /api/tasks）。
 * 注意：执行失败时仍返回创建成功的任务（status=failed），不把执行结果当请求失败 ——
 * 否则手机端会以为没提交上，与 F5「进度可见」相悖。
 */
export async function createTask(input) {
  const type = String(input?.type ?? '').trim()
  if (!TASK_TYPES.includes(type)) {
    throw fail('VALIDATION_FAILED', `任务类型必须是 ${TASK_TYPES.join(' / ')} 之一`)
  }

  const payload = input?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw fail('VALIDATION_FAILED', 'payload 必须是一个对象')
  }

  const { iso } = nowShanghai()
  const task = {
    id: newId(),
    type,
    payload,
    status: 'todo',
    result: '',
    origin: TASK_ORIGINS.includes(input?.origin) ? input.origin : 'desktop',
    created_at: iso,
    updated_at: iso,
    schema_version: 1,
  }

  if (type === 'note') return executeNoteTask(task)
  if (type === 'delete_note') return requestDeleteTask(task)

  // organize / remind：本期没有自动执行器，登记为待办，等使用者在页面上推进
  task.result = '本期无自动执行器，需人工推进'
  return taskStore.put(task)
}

/** 任务列表（对应 GET /api/tasks）：可按 status 过滤，按创建时间倒序 */
export async function listTasks(query = {}) {
  const status = query.status === undefined || query.status === '' ? null : String(query.status)
  if (status && !TASK_STATUSES.includes(status)) {
    throw fail('VALIDATION_FAILED', `status 必须是 ${TASK_STATUSES.join(' / ')} 之一`)
  }

  const tasks = await taskStore.list()
  const filtered = status ? tasks.filter((task) => task.status === status) : tasks
  const items = filtered
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, MAX_LIST)

  return { total: filtered.length, items }
}

/** 确认留痕列表（对应 GET /api/confirmations）：按请求时间倒序，可按 task_id 过滤 */
export async function listConfirmations(query = {}) {
  const taskId = query.task_id === undefined || query.task_id === '' ? null : String(query.task_id)
  const all = await confirmationStore.list()
  const filtered = taskId ? all.filter((item) => item.task_id === taskId) : all
  const items = filtered
    .slice()
    .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, MAX_LIST)

  return { total: filtered.length, items }
}

/**
 * 更新任务（对应 PATCH /api/tasks/:id）。两条路径：
 *   1) 带 decision → 确认流（F6）：先落确认留痕，approved 才执行，rejected 只取消；
 *   2) 只带 status → 手工推进（F5）；但若还有未决确认，先返回 428 CONFIRM_REQUIRED —— 不给绕过确认的口子。
 */
export async function updateTask(id, patch = {}) {
  const task = await taskStore.get(id)
  if (!task) throw fail('NOT_FOUND', '这个任务不存在', 404)

  if (patch?.decision !== undefined) return decideTask(task, String(patch.decision))

  const status = patch?.status === undefined ? '' : String(patch.status)
  if (!status) throw fail('VALIDATION_FAILED', '缺少 status（或改用 decision 提交确认结果）')
  if (!TASK_STATUSES.includes(status)) {
    throw fail('VALIDATION_FAILED', `status 必须是 ${TASK_STATUSES.join(' / ')} 之一`)
  }

  const pending = await pendingConfirmationOf(task.id)
  if (pending) {
    throw fail('CONFIRM_REQUIRED', `这个任务需要先确认才能执行：${pending.summary}`, 428)
  }

  if (!ALLOWED_TRANSITIONS[task.status]?.includes(status)) {
    throw fail(
      'VALIDATION_FAILED',
      `不能把任务从「${statusLabel(task.status)}」改为「${statusLabel(status)}」`,
    )
  }

  task.status = status
  task.updated_at = nowShanghai().iso
  return taskStore.put(task)
}
