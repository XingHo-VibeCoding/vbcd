// 工具折叠行与对话内确认卡；确认仍通过服务端闸门，不从前端直接写业务数据。
import { useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MarkdownContent from '../components/MarkdownContent.jsx'
import { AgentConfirmationContext, resolveConfirmation } from './runtime.js'
import { getPlanningDraft } from '../api/planning.js'

const STATUS_LABEL = { pending: '草案尚未保存', approved: '已保存', rejected: '已拒绝，未保存', failed: '保存失败' }
const CATEGORY_LABEL = { learning: '学习', life: '生活', work: '事务', essay: '随笔' }

function fmt(value) {
  if (!value) return '未设置'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

const CHANGE_FIELDS = { title: '标题', description: '说明', start_at: '开始时间', due_at: '截止时间', end_at: '结束时间', priority: '优先级', status: '状态', all_day: '全天', plan_id: '关联计划', task_id: '关联子任务', depends_on: '前置任务 ID', position: '排序位置' }
const RECORD_STATUS = { todo: '待办', doing: '进行中', blocked: '人工阻塞', done: '已完成', scheduled: '已安排', completed: '已完成', cancelled: '已取消' }
const CHANGE_LABEL = { update: '修改', complete: '标记完成', cancel: '取消' }

export function PlanningChangesPreview({ changes, reorder, basis }) {
  const valueText = (key, value) => value == null || value === '' ? '未设置'
    : key.endsWith('_at') ? fmt(value) : key === 'status' ? RECORD_STATUS[value] || value
      : typeof value === 'boolean' ? value ? '是' : '否' : String(value)
  return <div className="mt-3 flex flex-col gap-3">{reorder ? <section className="rounded-xl border border-brand/15 p-3"><strong>完整活跃任务顺序</strong><p>原：{basis?.tasks?.filter(t=>!['done','cancelled'].includes(t.status)).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id)).map(t=>t.title).join(' → ')}</p><p>改为：{reorder.task_ids.map(id=>basis?.tasks?.find(t=>t.id===id)?.title||id).join(' → ')}</p></section> : null}{changes.map((change, index) => {
    const fields = Object.keys(CHANGE_FIELDS).filter(key => JSON.stringify(change.before[key]) !== JSON.stringify(change.after[key]))
    return <section key={index} className="rounded-xl border border-brand/15 p-3">
      <strong>{CHANGE_LABEL[change.action]}{change.target.type === 'plan' ? '计划' : change.target.type === 'project_task' ? '子任务' : '日程'}《{change.before.title}》</strong>
      {change.relations ? <p className="mt-2 text-xs">所属计划：{change.relations.before.plan?.title || '独立日程'} → {change.relations.after.plan?.title || '独立日程'}<br/>关联子任务：{change.relations.before.task?.title || '无'} → {change.relations.after.task?.title || '无'}</p> : null}
      <dl className="mt-2 flex flex-col gap-2">{fields.map(key => <div key={key}>
        <dt className="text-xs font-bold">{CHANGE_FIELDS[key]}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm"><span className="text-slate-500">原：{valueText(key, change.before[key])}</span><br /><span>改为：{valueText(key, change.after[key])}</span></dd>
      </div>)}</dl>
    </section>
  })}</div>
}

export function PlanningCreatePreview({ draft }) {
  const payload = draft?.payload ?? {}, plan = payload.plan
  const tasks = payload.project_tasks ?? [], schedules = payload.schedules ?? []
  const planName = id => id === null ? '独立日程' : id ? `${payload.basis?.plans?.find(p => p.id === id)?.title || '既有计划'}（${id}）` : plan?.title || '独立日程'
  const taskName = item => item.task_ref ? `${tasks.find(t => t.ref === item.task_ref)?.title || item.task_ref}（草案引用 ${item.task_ref}）` : item.task_id ? `${payload.basis?.tasks?.find(t => t.id === item.task_id)?.title || '既有子任务'}（${item.task_id}）` : '不关联子任务'
  return <div className="mt-3 flex flex-col gap-3">
    {plan ? <section className="rounded-xl border border-brand/15 p-3"><strong>长期计划：{plan.title}</strong><p className="whitespace-pre-wrap">{plan.description}</p><p className="text-xs">开始 {fmt(plan.start_at)} · 截止 {fmt(plan.due_at)}</p></section> : null}
    <strong>项目子任务 {tasks.length} 条</strong>
    {tasks.map(task => <section key={task.ref} className="rounded-xl border border-brand/15 p-3"><strong>{task.title}</strong><p className="whitespace-pre-wrap text-sm">{task.description}</p><p className="text-xs">引用 {task.ref} · 所属计划 {planName(task.plan_id)} · 截止 {fmt(task.due_at)}</p><p className="text-xs">前置：{task.depends_on?.map(d => d.ref ? `${tasks.find(t=>t.ref===d.ref)?.title || d.ref}（引用 ${d.ref}）` : d.id).join('、') || '无'} · 初始状态：待办</p></section>)}
    <strong>日程 {schedules.length} 条 · 北京时间</strong>
    {schedules.map((item,index) => <section key={index} className="rounded-xl border border-brand/15 p-3"><strong>{item.title}</strong><p className="text-xs">{fmt(item.start_at)} — {item.all_day ? '全天' : fmt(item.end_at)}</p><p className="text-xs">所属计划 {planName(item.plan_id)} · {taskName(item)}</p></section>)}
    {payload.warnings?.map((text,index) => <p role="status" className="text-sm" key={index}>{text}</p>)}
  </div>
}

function DraftPreview({ pending, draft }) {
  if (pending.planning) {
    if (draft?.payload?.changes) return <PlanningChangesPreview changes={draft.payload.changes} reorder={draft.payload.reorder} basis={draft.payload.basis} />
    return <PlanningCreatePreview draft={draft} />
  }
  return (
    <div className="mt-3">
      <strong>归档《{draft?.title || '未命名草案'}》</strong>
      <p className="mt-1 text-xs text-slate-500">{CATEGORY_LABEL[draft?.category] || draft?.category} · {(draft?.tags || []).join('、') || '无标签'}</p>
      {draft?.source_url ? <a className="mt-1 block break-all text-xs text-brand" href={draft.source_url} target="_blank" rel="noreferrer">来源：{draft.source_url}</a> : null}
      <details className="mt-3" open><summary className="cursor-pointer text-xs font-bold">完整归档正文</summary><MarkdownContent content={draft?.content} emptyHint="正文未恢复，请重新读取会话后确认。" /></details>
    </div>
  )
}

function ConfirmationCard({ pending }) {
  const actions = useContext(AgentConfirmationContext)
  const [draft, setDraft] = useState(pending.draft)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(Boolean(pending.planning))
  const [working, setWorking] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    let alive = true
    setDraft(pending.draft)
    setOutcome(null)
    setError('')
    setNotice('')
    if (pending.planning && pending.draft_id) {
      setLoading(true)
      getPlanningDraft(pending.draft_id).then(value => { if (alive) setDraft(value) })
        .catch(err => { if (alive) setError(err.message || '最新草案读取失败，请稍后重试') })
        .finally(() => { if (alive) setLoading(false) })
    } else setLoading(false)
    return () => { alive = false }
  }, [pending.confirmation_id, pending.draft_id, pending.task_id])

  const status = outcome?.status || draft?.status || 'pending'
  const terminal = status !== 'pending'
  const disabled = working || actions?.working || actions?.generating
  const previewReady = pending.planning ? Boolean(draft?.review_token && !loading && !error) : Boolean(draft?.content && pending.task_id)

  async function refresh() {
    if (!actions || inFlight.current) return
    inFlight.current = true
    setWorking(true)
    try {
      if (pending.planning) setDraft(await getPlanningDraft(pending.draft_id))
      await actions.refresh()
      setError('')
    } catch (err) { setError(err.message || '会话读取失败，请重试') }
    finally { inFlight.current = false; setWorking(false) }
  }

  async function decide(decision) {
    if (!actions || inFlight.current || actions.generating || actions.working) return
    inFlight.current = true
    setWorking(true)
    actions.setWorking(true)
    setError('')
    setNotice('')
    try {
      const value = await resolveConfirmation(pending, decision, draft)
      if (value.kind === 'review') {
        setDraft(value.draft)
        setNotice(value.result)
        return // 不自动重发批准。
      }
      setOutcome(value)
      if (value.draft) setDraft(value.draft)
      if (value.agent_sync?.state === 'pending') {
        setNotice(value.agent_sync.message)
        return
      }
      try { await actions.refresh() }
      catch { setNotice('决定已记录，但对话刷新失败。请重读会话，不要重复保存。') }
    } catch (err) { setError(err.message || '确认失败，请重新读取草案') }
    finally {
      inFlight.current = false
      setWorking(false)
      actions.setWorking(false)
    }
  }

  return (
    <div className="aui-tool confirm">
      <div className="aui-tool-confirm-icon">{terminal ? status === 'approved' ? '✓' : '!' : '⏸'}</div>
      <div className="aui-tool-confirm-body min-w-0 flex-1">
        <div className="aui-tool-confirm-title">{pending.planning ? '规划' : '归档'} · {STATUS_LABEL[status] || status}</div>
        {loading ? <p role="status" className="mt-2 text-xs">正在读取最新草案…</p> : null}
        <DraftPreview pending={pending} draft={draft} />
        {notice ? <p role="status" className="error-bar mt-3">{notice}</p> : null}
        {error ? <p role="alert" className="error-bar mt-3">{error}</p> : null}
        {terminal ? <div className="mt-3">
          <p role="status" className={status === 'failed' ? 'error-bar' : 'hint'}>{outcome?.result || draft?.result || STATUS_LABEL[status]}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={disabled} onClick={refresh}>重读对话</button>
            {pending.planning && outcome?.agent_sync?.state === 'pending' ? <button type="button" className="btn-ghost" disabled={disabled} onClick={() => decide(draft.confirmation.decision)}>重试同步（不重复保存）</button> : null}
            {status === 'approved' ? <Link className="btn-ghost" to={pending.planning ? '/' : '/notes'}>{pending.planning ? '去首页查看计划' : '去档案查看'}</Link> : null}
          </div>
        </div> : <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={disabled || !actions || !previewReady} onClick={() => decide('approved')}>{working ? '处理中…' : notice || draft?.conflicts?.length ? '确认当前草案并保存' : '确认并保存'}</button>
          <button type="button" className="btn-ghost" disabled={disabled || !actions} onClick={() => decide('rejected')}>拒绝草案</button>
          {error ? <button type="button" className="btn-ghost" disabled={disabled} onClick={refresh}>重新读取</button> : null}
        </div>}
        {pending.planning && pending.draft_id ? <Link className="aui-tool-confirm-hint" to={`/planning/drafts/${encodeURIComponent(pending.draft_id)}/confirm`}>打开独立确认页 →</Link> : pending.task_id ? <Link className="aui-tool-confirm-hint" to={`/tasks/${encodeURIComponent(pending.task_id)}/confirm`}>打开独立确认页 →</Link> : null}
      </div>
    </div>
  )
}

export default function ToolFallback({ toolName, argsText, result, isError }) {
  if (result?.__pendingConfirm) return <ConfirmationCard pending={result} />
  const hasResult = result !== undefined
  const status = !hasResult ? '…' : isError ? '✗' : '✓'
  return (
    <details className={`aui-tool ${isError ? 'fail' : ''}`}>
      <summary>
        <span className="aui-tool-icon">🔧</span>
        <span className="aui-tool-name">{toolName}</span>
        {argsText ? <code className="aui-tool-args">{argsText.slice(0, 80)}</code> : null}
        <em className={`aui-tool-status ${isError ? 'bad' : hasResult ? 'ok' : ''}`}>{status}</em>
      </summary>
      {hasResult ? <pre className="aui-tool-result">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre> : null}
    </details>
  )
}
