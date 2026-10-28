import { planningInputSchema } from './planning-schema.js'
import { validateTasks, prepareTaskChange, reviewProjects } from './project-planning.js'
import { fail } from './errors.js'
import { createDraft, decideDraft as storeDecision, getDraft as readDraft, planningSnapshot, getPlanningRecord, recordVersion, planningState } from '../db/planning.js'

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
    return { id: item.id ? String(item.id) : undefined, plan_id: item.plan_id === null ? null : item.plan_id === undefined ? undefined : String(item.plan_id), title, start_at: start, end_at: end, all_day: allDay, ...(item.task_id !== undefined ? { task_id: item.task_id } : {}), ...(item.task_ref !== undefined ? { task_ref: item.task_ref } : {}) }
  }) : []
  if (schedules.length > 50) throw fail('VALIDATION_FAILED', '一次最多安排 50 条日程')
  return { plan, schedules, project_tasks: validateTasks(input.project_tasks), source: input.source ?? 'agent' }
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
  if (input.target?.type === 'project_task') { const change = prepareTaskChange(input, record); return { ...change, expected_version: recordVersion(record) } }
  if (!['plan','schedule'].includes(input.target?.type) || !input.target?.id) throw fail('VALIDATION_FAILED', '需要明确的目标类型和 id')
  if (!ACTION_LABEL[input.action]) throw fail('VALIDATION_FAILED', '操作必须是 update / complete / cancel')
  const patch = input.patch ?? {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw fail('VALIDATION_FAILED', 'patch 必须为对象')
  const allowed = input.target.type === 'plan'
    ? ['title','description','start_at','due_at','priority','status']
    : ['title','start_at','end_at','all_day','plan_id','task_id']
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

function reviewPlanning(input, existingSchedules, targets = [], state = { plans: [], project_tasks: [] }) {
  if (input.reorder) {
    const { plan_id, task_ids } = input.reorder
    const active = state.project_tasks.filter(t => t.plan_id === plan_id && !['done','cancelled'].includes(t.status))
    if (!active.length || active.length > 50 || new Set(task_ids).size !== active.length || task_ids.length !== active.length || active.some(t => !task_ids.includes(t.id))) throw fail('VALIDATION_FAILED', '重排必须包含该计划完整活跃列表（1–50 条）')
    const byId = new Map(active.map(t => [t.id,t]))
    const changes = task_ids.flatMap((id, position) => byId.get(id).position === position ? [] : [{ target: { type: 'project_task', id }, action: 'update', patch: { position }, before: JSON.parse(JSON.stringify(byId.get(id))), after: { ...JSON.parse(JSON.stringify(byId.get(id))), position }, expected_version: recordVersion(byId.get(id)) }])
    if (!changes.length) throw fail('VALIDATION_FAILED', '顺序没有变化，无需创建草案')
    return reviewProjects({ operation: 'update', payload: { reorder: input.reorder, changes }, conflicts: [], summary: `将重排计划内 ${active.length} 条活跃任务，终态任务不变。` }, state)
  }
  if (input.changes) {
    if (!Array.isArray(input.changes) || !input.changes.length || input.changes.length > 50) throw fail('VALIDATION_FAILED', '无效的变更清单')
    const keys = input.changes.map(change => `${change.target?.type}:${change.target?.id}`)
    if (new Set(keys).size !== keys.length) throw fail('VALIDATION_FAILED', '同一条记录不能在草案中重复修改')
    const changes = input.changes.map((change, index) => prepareChange(change, targets[index]))
    const schedules = changes.filter(change => change.target.type === 'schedule' && change.action === 'update' && change.after.status !== 'cancelled').map(change => change.after)
    const changedIds = new Set(changes.filter(change => change.target.type === 'schedule').map(change => change.target.id))
    const conflicts = conflictsOf(schedules, existingSchedules.filter(item => !changedIds.has(item.id)))
    const summary = changes.map(change => `将${ACTION_LABEL[change.action]}${change.target.type === 'plan' ? '计划' : change.target.type === 'project_task' ? '任务' : '日程'}《${change.before.title}》`).join('；') + `。${conflicts.length ? `发现 ${conflicts.length} 个时间冲突，请审阅后决定。` : '关联计划和日程不会被自动连带修改。'}`
    return reviewProjects({ operation: changes.every(change => change.action === 'cancel') ? 'cancel' : 'update', payload: { changes }, conflicts, summary }, state)
  }
  const payload = validatePayload(input)
  if (!payload.plan && !payload.schedules.length && !payload.project_tasks.length) throw fail('VALIDATION_FAILED', '草案至少需要一个计划或一条日程')
  const conflicts = conflictsOf(payload.schedules, existingSchedules)
  if (payload.schedules.length + payload.project_tasks.length > 50) throw fail('VALIDATION_FAILED', '任务和日程合计最多 50 条')
  const summary = `将新增 ${payload.plan ? `计划《${payload.plan.title}》` : '规划事项'}${payload.schedules.length ? `及 ${payload.schedules.length} 条日程` : ''}，子任务 ${payload.project_tasks.length} 条。${conflicts.length ? `发现 ${conflicts.length} 个时间冲突，请审阅具体安排后决定。` : '当前未发现时间冲突。'}`
  return reviewProjects({ operation: 'create', payload, conflicts, summary }, state)
}

function decisionResult(draft) {
  if (!draft) return null
  const result = draft.status === 'approved'
    ? draft.payload.changes ? `规划变更已生效：${draft.payload.changes.map(change => `${ACTION_LABEL[change.action]}${change.target.type === 'plan' ? '计划' : change.target.type === 'project_task' ? '任务' : '日程'}《${change.after.title}》`).join('；')}。` : `规划已保存：${draft.payload.plan ? `计划《${draft.payload.plan.title}》` : '没有新增长期计划'}，日程 ${draft.payload.schedules?.length ?? 0} 条，子任务 ${draft.payload.project_tasks?.length ?? 0} 条。`
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

export async function getPlanning({ from, to, planStatus = 'active', scheduleStatus = 'all', q = '', type, id, planId, taskStatus = 'all' } = {}) {
  if (id || type) {
    if (!['plan','schedule','project_task'].includes(type) || !id) throw fail('VALIDATION_FAILED', '按 id 查询需同时提供 type 和 id')
    const item = await getPlanningRecord(type, String(id))
    if (!item) throw fail('NOT_FOUND', '这条规划记录不存在', 404)
    const state = await planningState()
    const relatedPlan = item.plan_id ? state.plans.find(p => p.id === item.plan_id) : null
    const tasks = type === 'project_task' ? [item] : type === 'plan' ? state.project_tasks.filter(t => t.plan_id === item.id) : state.project_tasks.filter(t => t.id === item.task_id)
    const childSchedules = type === 'schedule' ? [item] : (await planningSnapshot({ planStatus: 'all' })).schedules.filter(s => type === 'plan' ? s.plan_id === item.id : s.task_id === item.id)
    return {
      timezone: TZ,
      item: { ...item, version: recordVersion(item) },
      plans: type === 'plan' ? [item] : relatedPlan ? [relatedPlan] : [],
      project_tasks: tasks.map(task => ({ ...task, dependency_state: { satisfied: task.depends_on.every(id => state.project_tasks.find(t => t.id === id)?.status === 'done'), waiting_on_ids: task.depends_on.filter(id => state.project_tasks.find(t => t.id === id)?.status !== 'done') } })),
      schedules: childSchedules.map(s => ({ ...s, time_state: scheduleState(s) })),
    }
  }
  if (!['active','all','todo','doing','done','cancelled'].includes(planStatus)) throw fail('VALIDATION_FAILED', '无效的计划状态筛选')
  if (!['all','scheduled','completed','cancelled'].includes(scheduleStatus)) throw fail('VALIDATION_FAILED', '无效的日程状态筛选')
  const start = dateValue(from, 'from'), end = dateValue(to, 'to')
  if (start && end && new Date(start) >= new Date(end)) throw fail('VALIDATION_FAILED', '查询结束时间必须晚于开始时间')
  if (!['all','active','todo','doing','blocked','done','cancelled'].includes(taskStatus)) throw fail('VALIDATION_FAILED', '无效任务状态筛选')
  const data = await planningSnapshot({ from: start, to: end, planStatus, scheduleStatus, q: String(q).trim(), planId, taskStatus })
  return { timezone: TZ, ...data, schedules: data.schedules.map(item => ({ ...item, time_state: scheduleState(item), completion_state: item.status === 'completed' ? 'completed' : 'incomplete' })) }
}

export async function proposePlanning(input, sourceSessionId = null, source = 'user') {
  const parsed = planningInputSchema.safeParse(input)
  if (!parsed.success) throw fail('VALIDATION_FAILED', '规划字段或类型不合法：' + parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('；'))
  input = parsed.data
  const operation = input.operation ?? 'create'
  const state = await planningState()
  const current = await planningSnapshot({ planStatus: 'all' })
  let checked
  if (input.reorder) {
    if (operation !== 'update' || input.target || input.patch || input.changes || input.plan || input.schedules?.length || input.project_tasks?.length) throw fail('VALIDATION_FAILED', '重排不能混合其他操作')
    checked = reviewPlanning({ reorder: input.reorder }, current.schedules, [], state)
  } else if (input.changes || operation !== 'create') {
    if (input.plan || input.schedules?.length || input.project_tasks?.length) throw fail('VALIDATION_FAILED', '新增记录与已有记录变更请分别生成草案')
    if (input.changes && (operation !== 'update' || input.target || input.patch)) throw fail('VALIDATION_FAILED', '批量变更不能混合单目标操作')
    const changes = input.changes ?? [{ action: operation, target: input.target, patch: input.patch ?? {} }]
    const targets = []
    for (const change of changes) {
      if (!['plan','schedule','project_task'].includes(change.target?.type) || !change.target?.id) throw fail('VALIDATION_FAILED', '先查询并提供明确的目标 type 与 id')
      const record = await getPlanningRecord(change.target.type, change.target.id)
      if (!record) throw fail('NOT_FOUND', '目标记录不存在，未生成变更草案', 404)
      targets.push(record)
    }
    checked = reviewPlanning({ changes }, current.schedules, targets, state)
  } else {
    if (input.target || input.patch) throw fail('VALIDATION_FAILED', '修改已有记录请明确 operation')
    checked = reviewPlanning({ ...input, source }, current.schedules, [], state)
  }
  return createDraft({ ...checked, sourceSessionId })
}
