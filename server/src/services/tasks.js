// 任务业务逻辑（SPEC 第 2.3 节字段 / 第 3 章接口 6–8）
// 依赖方向：routes → services → storage。本文件不直接读写文件系统。
// 执行器策略（已与使用者确认）：type=note 提交即同步执行；organize / remind 本期无执行器，登记为待办等人工推进。
import { randomBytes } from 'node:crypto'
import * as taskStore from '../storage/tasks.js'
import { createNote, nowShanghai } from './notes.js'
import { fail } from './errors.js'

export const TASK_TYPES = ['note', 'organize', 'remind']
export const TASK_STATUSES = ['todo', 'doing', 'done', 'failed', 'attention']
export const TASK_ORIGINS = ['phone', 'desktop']

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
  attention: ['todo', 'doing', 'done'],
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

/** 更新任务状态（对应 PATCH /api/tasks/:id；本步骤只做 status，确认流在下一板块接入） */
export async function updateTask(id, patch = {}) {
  const task = await taskStore.get(id)
  if (!task) throw fail('NOT_FOUND', '这个任务不存在', 404)

  const status = patch?.status === undefined ? '' : String(patch.status)
  if (!status) throw fail('VALIDATION_FAILED', '缺少 status')
  if (!TASK_STATUSES.includes(status)) {
    throw fail('VALIDATION_FAILED', `status 必须是 ${TASK_STATUSES.join(' / ')} 之一`)
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
