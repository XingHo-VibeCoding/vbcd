// 规划管理：完整查询和历史回看；操作按钮只生成草案，确认后才改变记录。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getPlanning, proposePlanningChange } from '../api/planning.js'

const LABELS = { todo: '待办', doing: '进行中', done: '已完成', scheduled: '已安排', completed: '已完成', cancelled: '已取消' }
const TIME_LABEL = { upcoming: '未开始', ongoing: '进行中', ended: '已结束' }
const CLASS = 'rounded-xl border border-brand/15 bg-white/40 p-4 dark:bg-white/5'

function today() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10) }
function fmt(iso) { return iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未设置' }
function dateInput(iso) { return iso ? new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0,16) : '' }
function fromInput(value) { return value ? `${value}:00+08:00` : null }

export default function PlanningPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'schedules' ? 'schedules' : 'plans'
  const [status, setStatus] = useState('')
  const [date, setDate] = useState(today)
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    const timer = setTimeout(async () => {
      try {
        const from = tab === 'schedules' && date ? `${date}T00:00:00+08:00` : undefined
        const to = from ? new Date(new Date(from).getTime()+86400000).toISOString() : undefined
        const value = await getPlanning({ from, to, q, planStatus: tab === 'plans' ? status || 'active' : 'all', scheduleStatus: tab === 'schedules' ? status || 'all' : 'all' })
        if (alive) setData(value)
      } catch (err) {
        if (alive) {
          if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/planning', { replace: true })
          else setError(err.message || '规划读取失败')
        }
      } finally { if (alive) setLoading(false) }
    }, 200)
    return () => { alive = false; clearTimeout(timer) }
  }, [tab,status,date,q,retry,navigate])

  function switchTab(value) {
    setStatus(''); setData(null); setEditing(null)
    setParams(value === 'plans' ? {} : { tab: 'schedules' })
  }
  async function propose(operation, record, patch) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const draft = await proposePlanningChange({ operation, target: { type: tab === 'plans' ? 'plan' : 'schedule', id: record.id }, ...(patch ? { patch } : {}) })
      navigate(`/planning/drafts/${encodeURIComponent(draft.id)}/confirm`)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/planning', { replace: true })
      else setError(err.message || '草案生成失败，记录保持原样')
    } finally { setBusy(false) }
  }
  function openEdit(record) {
    setEditing(record)
    setForm({ title: record.title, description: record.description || '', start_at: dateInput(record.start_at), due_at: dateInput(record.due_at), end_at: dateInput(record.end_at), priority: record.priority ?? 0, status: record.status, all_day: Boolean(record.all_day) })
  }
  function saveEdit(event) {
    event.preventDefault()
    // 只提交用户实际改过的字段，避免编辑标题时把原时间的秒数截断。
    const patch = {}
    if (form.title !== editing.title) patch.title = form.title
    if (form.start_at !== dateInput(editing.start_at)) patch.start_at = fromInput(form.start_at)
    if (tab === 'plans') {
      if (form.description !== (editing.description || '')) patch.description = form.description
      if (form.due_at !== dateInput(editing.due_at)) patch.due_at = fromInput(form.due_at)
      if (Number(form.priority) !== editing.priority) patch.priority = Number(form.priority)
      if (form.status !== editing.status) patch.status = form.status
    } else {
      if (form.all_day !== Boolean(editing.all_day)) patch.all_day = form.all_day
      if (!form.all_day && form.end_at !== dateInput(editing.end_at)) patch.end_at = fromInput(form.end_at)
    }
    if (!Object.keys(patch).length) { setError('没有需要保存的修改'); return }
    propose('update', editing, patch)
  }
  const items = data ? tab === 'plans' ? data.plans : data.schedules : []
  const options = tab === 'plans'
    ? [['','未完成'],['all','全部（含历史）'],['todo','待办'],['doing','进行中'],['done','已完成'],['cancelled','已取消']]
    : [['','全部状态'],['scheduled','已安排'],['completed','已完成'],['cancelled','已取消']]
  const field = (label,key,type='text') => <label className="flex flex-col gap-1 text-sm">{label}<input className="rounded-lg border border-brand/20 bg-white/50 p-2 dark:bg-white/5" type={type} value={form[key] ?? ''} required={key === 'title' || (tab === 'schedules' && (key === 'start_at' || key === 'end_at'))} onChange={e=>setForm(previous=>({...previous,[key]:e.target.value}))} /></label>

  return <section className="site-glass-card p-4 sm:p-6">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-bold">规划</h1><p className="mt-1 text-xs text-slate-500">长期目标和具体安排 · 北京时间</p></div><Link className="btn-primary" to="/agent">让 agent 安排</Link></div>
    <div className="view-switch mt-4" role="group" aria-label="规划视图"><button type="button" className={tab==='plans'?'active':''} onClick={()=>switchTab('plans')}>计划</button><button type="button" className={tab==='schedules'?'active':''} onClick={()=>switchTab('schedules')}>日程</button></div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">关键词<input className="rounded-lg border border-brand/20 bg-transparent p-2" value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索标题或计划说明" /></label>
      <label className="flex flex-col gap-1 text-xs">状态<select className="rounded-lg border border-brand/20 bg-transparent p-2" value={status} onChange={e=>setStatus(e.target.value)}>{options.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      {tab==='schedules'? <><label className="flex flex-col gap-1 text-xs">日期<input type="date" className="rounded-lg border border-brand/20 bg-transparent p-2" value={date} onChange={e=>setDate(e.target.value)} /></label><button type="button" className="btn-ghost" onClick={()=>setDate('')}>全部日期</button><button type="button" className="btn-ghost" onClick={()=>setDate(today())}>今天</button></>:null}
      <button type="button" className="btn-ghost" onClick={()=>setRetry(value=>value+1)}>刷新</button>
    </div>
    {error ? <p className="error-bar mt-4" role="alert">{error}</p> : null}
    {loading ? <p className="loading">正在读取规划…</p> : error ? null : <>
      <p className="mt-4 text-xs text-slate-500">来源：PostgreSQL 规划 · 当前筛选 {items.length} 条</p>
      {items.length ? <ul className="mt-3 flex flex-col gap-3">{items.map(record=><li key={record.id} className={CLASS}>
        <div className="flex items-start justify-between gap-3"><strong>{record.title}</strong><span className="shrink-0 rounded-full bg-brand/10 px-2 py-1 text-xs">{LABELS[record.status]}</span></div>
        {tab==='plans'? <><p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{record.description}</p><p className="mt-2 text-xs text-slate-500">开始 {fmt(record.start_at)} · 截止 {fmt(record.due_at)} · 优先级 {record.priority}</p></> : <p className="mt-2 text-xs text-slate-500">{record.all_day?'全天 · ':''}{fmt(record.start_at)}{record.end_at?` — ${fmt(record.end_at)}`:''} · {TIME_LABEL[record.time_state]}</p>}
        {record.completed_at ? <p className="mt-1 text-xs text-slate-500">完成于 {fmt(record.completed_at)}</p> : null}
        <p className="mt-1 text-xs text-slate-400">更新于 {fmt(record.updated_at)} · 创建来源：{record.source==='agent'?'agent 草案':'个人操作'}</p>
        {!['done','completed','cancelled'].includes(record.status)? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={()=>openEdit(record)}>编辑</button><button type="button" className="btn-ghost" disabled={busy} onClick={()=>propose('complete',record)}>标记完成</button><button type="button" className="btn-ghost" disabled={busy} onClick={()=>propose('cancel',record)}>取消安排</button></div> : <p className="mt-2 text-xs text-slate-400">历史记录保留，可由 agent 查询。</p>}
      </li>)}</ul> : <p className="mt-6 text-center text-sm text-slate-400">当前筛选下没有记录。可调整筛选，或让 agent 生成安排。</p>}
    </>}
    {editing ? <form className={`${CLASS} mt-5 flex flex-col gap-3`} onSubmit={saveEdit}>
      <h2 className="font-bold">编辑《{editing.title}》</h2><p className="text-xs text-slate-500">先生成变更草案，审阅并确认后才保存。</p>
      {field('标题','title')}{tab==='plans'?<><label className="flex flex-col gap-1 text-sm">说明<textarea className="rounded-lg border border-brand/20 bg-transparent p-2" value={form.description} onChange={e=>setForm(previous=>({...previous,description:e.target.value}))} /></label>{field('开始时间','start_at','datetime-local')}{field('截止时间','due_at','datetime-local')}{field('优先级','priority','number')}<label>状态 <select value={form.status} onChange={e=>setForm(previous=>({...previous,status:e.target.value}))}><option value="todo">待办</option><option value="doing">进行中</option></select></label></> : <>{field('开始时间','start_at','datetime-local')}<label className="text-sm"><input type="checkbox" checked={form.all_day} onChange={e=>setForm(previous=>({...previous,all_day:e.target.checked}))} /> 全天日程</label>{!form.all_day?field('结束时间','end_at','datetime-local'):null}</>}
      <div className="flex gap-2"><button className="btn-primary" disabled={busy} type="submit">生成修改草案</button><button className="btn-ghost" type="button" disabled={busy} onClick={()=>setEditing(null)}>关闭编辑</button></div>
    </form>:null}
  </section>
}
