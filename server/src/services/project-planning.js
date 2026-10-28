// 项目子任务的纯校验和审阅；不在这里访问数据库或执行外部动作。
import { fail } from './errors.js'
const terminal = status => ['done','cancelled'].includes(status)
const invalid = message => { throw fail('VALIDATION_FAILED', message) }
export function taskText(value, field, max, required = false) {
  if (typeof value !== 'string') invalid(`${field} 必须为字符串`)
  const text = required ? value.trim() : value
  if ((required && !text) || [...text].length > max) invalid(`${field} ${required ? '不能为空且' : ''}最多 ${max} 字符`)
  return text
}
export function deadline(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || Number.isNaN(Date.parse(value))) invalid('截止时间需为有效的含时区 ISO 时间')
  return new Date(value).toISOString()
}
export function validateTasks(items = []) {
  const refs = new Set()
  return items.map(item => {
    if (refs.has(item.ref)) invalid('草案内 Task ref 不能重复')
    refs.add(item.ref)
    return { ...item, title: taskText(item.title, '任务标题', 200, true), description: taskText(item.description ?? '', '任务说明', 10000), due_at: deadline(item.due_at), depends_on: item.depends_on ?? [] }
  })
}
export function prepareTaskChange(input, record) {
  if (!record) throw fail('NOT_FOUND', '目标任务不存在', 404)
  if (terminal(record.status)) invalid('已完成或取消的任务只读，不能重开')
  const patch = input.patch ?? {}
  if (Object.keys(patch).some(k => !['title','description','due_at','status','depends_on'].includes(k))) invalid('包含不可编辑的任务字段')
  if (input.action !== 'update' && Object.keys(patch).length) invalid('完成或取消不能夹带其他编辑')
  if (input.action === 'update' && !Object.keys(patch).length) invalid('请提供待修改字段')
  const before = JSON.parse(JSON.stringify(record)), after = { ...before, ...patch }
  if (input.action === 'complete') {
    if (before.status === 'blocked') invalid('请先明确解除人工阻塞，再确认完成')
    after.status = 'done'
  } else if (input.action === 'cancel') after.status = 'cancelled'
  else if (input.action !== 'update') invalid('无效任务操作')
  if (Object.hasOwn(patch, 'status') && !['todo','doing','blocked'].includes(patch.status)) invalid('任务状态不可通过编辑进入终态')
  after.title = taskText(after.title, '任务标题', 200, true)
  after.description = taskText(after.description, '任务说明', 10000)
  after.due_at = deadline(after.due_at)
  if (!Array.isArray(after.depends_on) || after.depends_on.some(id => typeof id !== 'string' || !id)) invalid('依赖必须是任务 ID 数组')
  after.depends_on = [...after.depends_on].sort()
  return { target: input.target, action: input.action, patch, before, after }
}
export function reviewProjects(checked, state) {
  const payload = checked.payload
  const plans = new Map(state.plans.map(p => [p.id, p]))
  const tasks = new Map(state.project_tasks.map(t => [t.id, { ...t, depends_on: [...t.depends_on] }]))
  const involved = new Set()
  const acceptPlan = (id, adding) => {
    if (id === '@new-plan') return
    const parent = plans.get(id)
    if (!parent) throw fail('NOT_FOUND', '关联计划不存在', 404)
    if (adding && terminal(parent.status)) invalid('已完成或取消的计划不接受新增任务或新关联')
    involved.add(id)
  }
  for (const change of payload.changes ?? []) if (change.target.type === 'plan') { plans.set(change.after.id, change.after); involved.add(change.after.id) }
  const refs = new Map((payload.project_tasks ?? []).map(t => [t.ref, `ref:${t.ref}`]))
  for (const item of payload.project_tasks ?? []) {
    const planId = item.plan_id ?? (payload.plan ? '@new-plan' : null)
    if (!planId) invalid('任务需要所属计划')
    acceptPlan(planId, true)
    tasks.set(refs.get(item.ref), { ...item, id: refs.get(item.ref), plan_id: planId, status: 'todo', depends_on: item.depends_on.map(d => d.id ?? refs.get(d.ref) ?? invalid('未知草案 Task 引用')) })
  }
  for (const change of payload.changes ?? []) {
    if (change.target.type === 'project_task') {
      const task = change.after
      acceptPlan(task.plan_id, false)
      tasks.set(task.id, { ...task })
    }
  }
  // 校验整张最终依赖图，不依赖变更数组顺序；由数据库锁保证并发下仍是同一快照。
  const marks = new Map()
  const visit = task => {
    if (marks.get(task.id) === 1) invalid('项目任务依赖不能成环')
    if (marks.get(task.id) === 2) return
    marks.set(task.id, 1)
    if (new Set(task.depends_on).size !== task.depends_on.length) invalid('不能重复添加同一依赖')
    for (const dep of task.depends_on) {
      const parent = tasks.get(dep)
      if (!parent || parent.plan_id !== task.plan_id || dep === task.id) invalid('依赖必须是同一计划内的其他真实任务')
      visit(parent)
      if (['doing','done'].includes(task.status) && parent.status !== 'done') invalid('前置任务未完成，不能开始或完成；请明确退回待办或阻塞')
    }
    marks.set(task.id, 2)
  }
  for (const task of tasks.values()) visit(task)
  const bind = (item, before = null) => {
    if (item.task_ref !== undefined && item.task_id !== undefined) invalid('task_id 与 task_ref 不能同时提供')
    const taskId = item.task_ref ? refs.get(item.task_ref) : item.task_id
    if (item.task_ref && !taskId) invalid('日程引用的草案 Task 不存在')
    if (taskId) {
      const task = tasks.get(taskId)
      if (!task) throw fail('NOT_FOUND', '关联子任务不存在', 404)
      if (item.plan_id === null || (item.plan_id !== undefined && item.plan_id !== task.plan_id)) invalid('日程所属计划与子任务不一致')
      const adding = !before || before.task_id !== taskId || before.plan_id !== task.plan_id
      if (adding && terminal(task.status)) invalid('终态任务不接受新日程关联')
      acceptPlan(task.plan_id, adding)
      if (task.plan_id !== '@new-plan') item.plan_id = task.plan_id
    } else {
      const planId = item.plan_id === undefined ? (payload.plan ? '@new-plan' : null) : item.plan_id
      if (planId) acceptPlan(planId, !before || before.plan_id !== planId)
    }
  }
  for (const item of payload.schedules ?? []) bind(item)
  for (const change of payload.changes ?? []) {
    if (change.target.type === 'schedule') {
      if (Object.hasOwn(change.patch, 'task_id') && !Object.hasOwn(change.patch, 'plan_id') && change.after.task_id) {
        const task = tasks.get(change.after.task_id)
        if (task) change.after.plan_id = task.plan_id
      }
      bind(change.after, change.before)
    }
  }
  if (payload.reorder) acceptPlan(payload.reorder.plan_id, false)
  for (const change of payload.changes ?? []) {
    const links = (record, previous = false) => ({
      plan: record.plan_id ? { id: record.plan_id, title: (previous ? state.plans.find(p => p.id === record.plan_id) : plans.get(record.plan_id))?.title ?? record.plan_id } : null,
      task: record.task_id ? { id: record.task_id, title: (previous ? state.project_tasks.find(t => t.id === record.task_id) : tasks.get(record.task_id))?.title ?? record.task_id } : null,
      dependencies: (record.depends_on ?? []).map(id => ({ id, title: tasks.get(id)?.title ?? id })),
    })
    change.relations = { before: links(change.before, true), after: links(change.after) }
  }
  // 包含前置状态和依赖集合，避免只比较目标行的 updated_at 漏掉变更。
  payload.basis = {
    plans: state.plans.filter(p => involved.has(p.id)).sort((a,b) => a.id.localeCompare(b.id)),
    tasks: state.project_tasks.filter(t => involved.has(t.plan_id)).sort((a,b) => a.id.localeCompare(b.id)),
  }
  payload.warnings = []
  for (const task of tasks.values()) {
    if (!involved.has(task.plan_id) && !task.id.startsWith('ref:')) continue
    const parent = task.plan_id === '@new-plan' ? payload.plan : plans.get(task.plan_id)
    if (task.due_at && ((parent?.due_at && new Date(task.due_at) > new Date(parent.due_at)) || (parent?.start_at && new Date(task.due_at) < new Date(parent.start_at)))) payload.warnings.push(`任务《${task.title}》截止超出计划范围，不会自动改期`)
  }
  for (const schedule of [...(payload.schedules ?? []), ...(payload.changes ?? []).filter(c => c.target.type === 'schedule').map(c => c.after)]) {
    const task = tasks.get(schedule.task_id ?? refs.get(schedule.task_ref))
    if (task?.due_at && new Date(schedule.end_at ?? schedule.start_at) > new Date(task.due_at)) payload.warnings.push(`日程《${schedule.title}》晚于任务截止，不会自动改期`)
    if (task && terminal(task.status)) payload.warnings.push(`日程《${schedule.title}》的任务已结束，日程不会自动完成或取消`)
  }
  return checked
}
