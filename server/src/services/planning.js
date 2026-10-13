import { fail } from './errors.js'
import { createDraft, decideDraft as storeDecision, getDraft as readDraft, planningSnapshot, getPlanningRecord, recordVersion } from '../db/planning.js'

const TZ = 'Asia/Shanghai'

function dateValue(value, field, { required = false } = {}) {
  if (!value) {
    if (required) throw fail('VALIDATION_FAILED', `${field} 不能为空`)
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw fail('VALIDATION_FAILED', `${field} 不是有效时间`)
  return date.toISOString()
}

function validatePayload(input = {}) {
  const planInput = input.plan ?? null
  const plan = planInput ? {
    id: planInput.id ? String(planInput.id) : undefined,
    title: String(planInput.title ?? '').trim(),
    description: String(planInput.description ?? '').trim(),
    start_at: dateValue(planInput.start_at, 'plan.start_at'),
    due_at: dateValue(planInput.due_at, 'plan.due_at'),
    priority: Number.isInteger(planInput.priority) ? planInput.priority : 0,
    status: ['todo', 'doing'].includes(planInput.status) ? planInput.status : 'todo',
  } : null
  if (plan && !plan.title) throw fail('VALIDATION_FAILED', 'plan.title 不能为空')
  if (plan?.start_at && plan?.due_at && new Date(plan.due_at) < new Date(plan.start_at)) {
    throw fail('VALIDATION_FAILED', 'plan.due_at 不能早于 plan.start_at')
  }

  const schedules = Array.isArray(input.schedules) ? input.schedules.map((item, index) => {
    const allDay = Boolean(item.all_day)
    const start = dateValue(item.start_at, `schedules[${index}].start_at`, { required: true })
    const end = allDay ? null : dateValue(item.end_at, `schedules[${index}].end_at`, { required: true })
    if (!allDay && new Date(end) <= new Date(start)) throw fail('VALIDATION_FAILED', `schedules[${index}] 的结束时间必须晚于开始时间`)
    const title = String(item.title ?? '').trim()
    if (!title) throw fail('VALIDATION_FAILED', `schedules[${index}].title 不能为空`)
    return { id: item.id ? String(item.id) : undefined, plan_id: item.plan_id ? String(item.plan_id) : undefined, title, start_at: start, end_at: end, all_day: allDay }
  }) : []
  if (schedules.length > 50) throw fail('VALIDATION_FAILED', '一次最多安排 50 条日程')
  return { plan, schedules }
}

function intervalOf(item) {
  const start = new Date(item.start_at)
  const end = item.all_day ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : new Date(item.end_at)
  return { start, end }
}

function conflictsOf(schedules, current) {
  const conflicts = []
  const addConflict = (item, index, old, otherIndex = null) => {
    const a = intervalOf(item)
    const b = intervalOf(old)
    if (a.start >= b.end || a.end <= b.start) return
    conflicts.push({
      kind: otherIndex === null ? 'existing' : 'draft', proposed_index: index,
      proposed_title: item.title, proposed_start_at: a.start.toISOString(), proposed_end_at: a.end.toISOString(),
      existing_id: otherIndex === null ? old.id : null, existing_index: otherIndex,
      existing_title: old.title, existing_start_at: b.start.toISOString(), existing_end_at: b.end.toISOString(),
      existing_status: old.status ?? 'scheduled',
      existing_updated_at: otherIndex === null && old.updated_at ? new Date(old.updated_at).toISOString() : null,
    })
  }
  schedules.forEach((item, index) => {
    for (const old of [...current].sort((a, b) => a.id.localeCompare(b.id))) {
      if (old.status !== 'cancelled' && old.id !== item.id) addConflict(item, index, old)
    }
    // 同一草案中的重叠也必须在首次展示和最终批准时使用相同规则检查。
    for (let otherIndex = index + 1; otherIndex < schedules.length; otherIndex++) {
      addConflict(item, index, schedules[otherIndex], otherIndex)
    }
  })
  return conflicts
}

const ACTION_LABEL = { update: '修改', complete: '标记完成', cancel: '取消' }

function prepareChange(input, record) {
  if (!['plan','schedule'].includes(input.target?.type) || !input.target?.id) throw fail('VALIDATION_FAILED', '需要明确的目标类型和 id')
  if (!ACTION_LABEL[input.action]) throw fail('VALIDATION_FAILED', '操作必须是 update / complete / cancel')
  const patch = input.patch ?? {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw fail('VALIDATION_FAILED', 'patch 必须为对象')
  const allowed = input.target.type === 'plan'
    ? ['title','description','start_at','due_at','priority','status']
    : ['title','start_at','end_at','all_day','plan_id']
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw fail('VALIDATION_FAILED', '包含不可编辑字段')
  if (input.action !== 'update' && Object.keys(patch).length) throw fail('VALIDATION_FAILED', '完成或取消操作不同时修改其他字段')
  if (input.action === 'update' && !Object.keys(patch).length) throw fail('VALIDATION_FAILED', '请提供待修改字段')
  const before = JSON.parse(JSON.stringify(record))
  const after = { ...before, ...patch }
  if (input.action === 'complete') after.status = input.target.type === 'plan' ? 'done' : 'completed'
  if (input.action === 'cancel') after.status = 'cancelled'
  if (input.action === 'update' && Object.hasOwn(patch, 'status')) {
    if (!['todo','doing'].includes(patch.status) || ['done','cancelled'].includes(before.status)) {
      throw fail('VALIDATION_FAILED', '此处只可在未完成计划的待办与进行中之间切换；完成和取消请使用对应操作')
    }
  }
  after.title = String(after.title ?? '').trim()
  if (!after.title) throw fail('VALIDATION_FAILED', '标题不能为空')
  if (input.target.type === 'plan') {
    after.description = String(after.description ?? '')
    after.start_at = dateValue(after.start_at, 'start_at')
    after.due_at = dateValue(after.due_at, 'due_at')
    if (!Number.isInteger(after.priority)) throw fail('VALIDATION_FAILED', 'priority 必须为整数')
    if (after.start_at && after.due_at && new Date(after.due_at) < new Date(after.start_at)) throw fail('VALIDATION_FAILED', '截止时间不能早于开始时间')
  } else {
    if (typeof after.all_day !== 'boolean') throw fail('VALIDATION_FAILED', 'all_day 必须为布尔值')
    after.start_at = dateValue(after.start_at, 'start_at', { required: true })
    after.end_at = after.all_day ? null : dateValue(after.end_at, 'end_at', { required: true })
    if (after.end_at && new Date(after.end_at) <= new Date(after.start_at)) throw fail('VALIDATION_FAILED', '日程结束时间必须晚于开始时间')
    if (after.plan_id !== null && typeof after.plan_id !== 'string') throw fail('VALIDATION_FAILED', 'plan_id 必须为字符串或 null')
  }
  return { target: { type: input.target.type, id: String(input.target.id) }, action: input.action, patch, before, after, expected_version: recordVersion(before) }
}

function reviewPlanning(input, existingSchedules, targets = []) {
  if (input.changes) {
    if (!Array.isArray(input.changes) || !input.changes.length || input.changes.length > 50) throw fail('VALIDATION_FAILED', '无效的变更清单')
    const keys = input.changes.map(change => `${change.target?.type}:${change.target?.id}`)
    if (new Set(keys).size !== keys.length) throw fail('VALIDATION_FAILED', '同一条记录不能在草案中重复修改')
    const changes = input.changes.map((change, index) => prepareChange(change, targets[index]))
    const schedules = changes.filter(change => change.target.type === 'schedule' && change.action === 'update' && change.after.status !== 'cancelled').map(change => change.after)
    const changedIds = new Set(changes.filter(change => change.target.type === 'schedule').map(change => change.target.id))
    const conflicts = conflictsOf(schedules, existingSchedules.filter(item => !changedIds.has(item.id)))
    const summary = changes.map(change => `将${ACTION_LABEL[change.action]}${change.target.type === 'plan' ? '计划' : '日程'}《${change.before.title}》`).join('；') + `。${conflicts.length ? `发现 ${conflicts.length} 个时间冲突，请审阅后决定。` : '关联计划和日程不会被自动连带修改。'}`
    return { operation: changes.every(change => change.action === 'cancel') ? 'cancel' : 'update', payload: { changes }, conflicts, summary }
  }
  const payload = validatePayload(input)
  if (!payload.plan && !payload.schedules.length) throw fail('VALIDATION_FAILED', '草案至少需要一个计划或一条日程')
  const conflicts = conflictsOf(payload.schedules, existingSchedules)
  const summary = `将新增 ${payload.plan ? `计划《${payload.plan.title}》` : '规划事项'}${payload.schedules.length ? `及 ${payload.schedules.length} 条日程` : ''}。${conflicts.length ? `发现 ${conflicts.length} 个时间冲突，请审阅具体安排后决定。` : '当前未发现时间冲突。'}`
  return { operation: 'create', payload, conflicts, summary }
}

function decisionResult(draft) {
  if (!draft) return null
  const result = draft.status === 'approved'
    ? draft.payload.changes ? `规划变更已生效：${draft.payload.changes.map(change => `${ACTION_LABEL[change.action]}${change.target.type === 'plan' ? '计划' : '日程'}《${change.after.title}》`).join('；')}。` : `规划已保存：${draft.payload.plan ? `计划《${draft.payload.plan.title}》` : '没有新增长期计划'}，日程 ${draft.payload.schedules?.length ?? 0} 条。`
    : draft.status === 'rejected'
      ? '你拒绝了规划草案，未对计划或日程作出任何变更。'
      : draft.status === 'failed'
        ? `工具执行失败：你已批准，但${draft.error || '保存失败，未写入计划或日程。'}`
        : draft.needs_review ? '安排或冲突信息已变化，请重新审阅后确认；尚未批准或保存。' : '等待审阅，尚未批准或保存。'
  return { ...draft, result }
}

export async function getDraft(id) {
  return decisionResult(await readDraft(id))
}

export async function decideDraft(id, decision, reviewToken) {
  return decisionResult(await storeDecision(id, decision, { reviewToken, review: reviewPlanning }))
}

export function scheduleState(item, now = new Date()) {
  const start = new Date(item.start_at)
  const end = item.end_at ? new Date(item.end_at) : new Date(start.getTime() + 24 * 60 * 60 * 1000)
  if (now < start) return 'upcoming'
  if (now < end) return 'ongoing'
  return 'ended'
}

export async function getPlanning({ from, to, planStatus = 'active', scheduleStatus = 'all', q = '', type, id } = {}) {
  if (id || type) {
    if (!['plan','schedule'].includes(type) || !id) throw fail('VALIDATION_FAILED', '按 id 查询需同时提供 type 和 id')
    const item = await getPlanningRecord(type, String(id))
    if (!item) throw fail('NOT_FOUND', '这条规划记录不存在', 404)
    return { timezone: TZ, item: { ...item, version: recordVersion(item) }, plans: type === 'plan' ? [item] : [], schedules: type === 'schedule' ? [{ ...item, time_state: scheduleState(item) }] : [] }
  }
  if (!['active','all','todo','doing','done','cancelled'].includes(planStatus)) throw fail('VALIDATION_FAILED', '无效的计划状态筛选')
  if (!['all','scheduled','completed','cancelled'].includes(scheduleStatus)) throw fail('VALIDATION_FAILED', '无效的日程状态筛选')
  const start = dateValue(from, 'from'), end = dateValue(to, 'to')
  if (start && end && new Date(start) >= new Date(end)) throw fail('VALIDATION_FAILED', '查询结束时间必须晚于开始时间')
  const data = await planningSnapshot({ from: start, to: end, planStatus, scheduleStatus, q: String(q).trim() })
  return { timezone: TZ, ...data, schedules: data.schedules.map(item => ({ ...item, time_state: scheduleState(item), completion_state: item.status === 'completed' ? 'completed' : 'incomplete' })) }
}

export async function proposePlanning(input, sourceSessionId = null) {
  const operation = input.operation ?? 'create'
  if (operation !== 'create') {
    if (!ACTION_LABEL[operation]) throw fail('VALIDATION_FAILED', '不支持的规划操作')
    if (input.plan || input.schedules?.length) throw fail('VALIDATION_FAILED', '新增记录与已有记录变更请分别生成草案')
    const target = input.target
    if (!['plan','schedule'].includes(target?.type) || !target?.id) throw fail('VALIDATION_FAILED', '先查询并提供明确的目标 type 与 id')
    const record = await getPlanningRecord(target.type, String(target.id))
    if (!record) throw fail('NOT_FOUND', '目标记录不存在，未生成变更草案', 404)
    const current = target.type === 'schedule' && operation === 'update' ? await planningSnapshot() : { schedules: [] }
    const checked = reviewPlanning({ changes: [{ target, action: operation, patch: input.patch ?? {} }] }, current.schedules, [record])
    return createDraft({ ...checked, sourceSessionId })
  }
  if (input.target || input.patch) throw fail('VALIDATION_FAILED', '修改已有记录请明确 operation')
  const payload = validatePayload(input)
  if (!payload.plan && !payload.schedules.length) throw fail('VALIDATION_FAILED', '草案至少需要一个计划或一条日程')
  const intervals = payload.schedules.map(intervalOf)
  // 包含过去和跨午夜安排，而非仅查询“现在”之后的日程。
  const from = intervals.length ? new Date(Math.min(...intervals.map(x => x.start.getTime()))).toISOString() : undefined
  const to = intervals.length ? new Date(Math.max(...intervals.map(x => x.end.getTime()))).toISOString() : undefined
  const current = intervals.length ? await planningSnapshot({ from, to }) : { schedules: [] }
  const checked = reviewPlanning(payload, current.schedules)
  return createDraft({ ...checked, sourceSessionId })
}
