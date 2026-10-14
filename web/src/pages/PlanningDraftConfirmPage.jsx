import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb.jsx'
import { getPlanningDraft } from '../api/planning.js'
import { request } from '../api/client.js'
import { PlanningChangesPreview } from '../agent/ToolFallback.jsx'

const STATUS_LABEL = { pending: '待确认', approved: '已批准并保存', rejected: '已拒绝', failed: '已批准，但保存失败' }

function fmt(iso) {
  if (!iso) return '未设置'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false,
  }).format(date)
}

export default function PlanningDraftConfirmPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const handleAuth = useCallback(err => {
    if (err.code !== 'AUTH_REQUIRED') return false
    navigate(`/login?from=/planning/drafts/${encodeURIComponent(id)}/confirm`, { replace: true })
    return true
  }, [id, navigate])

  const load = useCallback(async () => {
    const value = await getPlanningDraft(id)
    setDraft(value)
    return value
  }, [id])

  useEffect(() => {
    let alive = true
    setDraft(null)
    setError('')
    setNotice('')
    getPlanningDraft(id).then(value => { if (alive) setDraft(value) }).catch(err => {
      if (alive && !handleAuth(err)) setError(err.message || '草案加载失败')
    })
    return () => { alive = false }
  }, [id, handleAuth])

  async function decide(decision) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      // 明确提交本页实际展示的草案凭据；旧页面不能批准未看过的新冲突。
      const updated = await request(`/api/planning/drafts/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { decision, review_token: draft.review_token },
      })
      setDraft(updated)
    } catch (err) {
      if (handleAuth(err)) return
      if (err.code === 'PLANNING_REVIEW_REQUIRED') {
        // 未记录批准；重新读取后只展示，不自动重发批准。
        try {
          await load()
          setNotice('冲突或草案已变化。下方已展示最新内容，尚未批准或保存，请重新审阅后决定。')
        } catch {
          setError('未能读取最新草案，请刷新页面后再确认。')
          setDraft(null)
        }
      } else {
        setError(err.message || '提交决定失败，请重新读取草案')
        // 响应丢失时保存可能已完成。以重新读取的数据库结果为准。
        try { await load() } catch { /* 保留错误，重试仍需提交原审阅凭据 */ }
      }
    } finally { setBusy(false) }
  }

  if (!draft && !error) return <div className="loading">正在读取草案…</div>
  if (!draft) return <section className="site-glass-card confirm-page"><p role="alert" className="error-bar">{error}</p><Link to="/agent">返回 agent</Link></section>

  const pending = draft.status === 'pending'
  const plan = draft.payload?.plan
  const schedules = draft.payload?.schedules ?? []
  const syncPending = draft.source_session_id && draft.agent_sync?.state !== 'synced'
  return (
    <section className="site-glass-card confirm-page">
      <Breadcrumb items={[{ label: 'agent', to: '/agent' }, { label: '规划草案确认' }]} />
      <h2>规划草案</h2>
      <p className="hint">草案使用北京时间。批准后本组变更才会生效，拒绝则保持现有记录。</p>
      {notice ? <p role="status" className="error-bar">{notice}</p> : null}
      <div className="confirm-block">
        <p className="confirm-summary">{draft.summary}</p>
        <span>状态：{STATUS_LABEL[draft.status] || draft.status}</span>
        {draft.confirmation?.confirmed_at ? <p className="hint">决定时间：{fmt(draft.confirmation.confirmed_at)}</p> : null}
      </div>
      {draft.payload?.changes ? <PlanningChangesPreview changes={draft.payload.changes} /> : <>
      {plan ? (
        <article className="card mt-4">
          <h3>长期计划：{plan.title}</h3>
          <p>{plan.description || '暂无说明'}</p>
          <p>开始：{fmt(plan.start_at)} · 截止：{fmt(plan.due_at)} · 优先级：{plan.priority ?? 0}</p>
        </article>
      ) : null}
      <h3 className="mt-5 font-bold">日程（{schedules.length}）</h3>
      {schedules.length ? (
        <ol className="mt-2 flex flex-col gap-2">
          {schedules.map((item, index) => (
            <li className="rounded-xl border border-brand/15 p-3" key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              <div className="text-sm text-slate-500">
                {item.all_day ? `${fmt(item.start_at)} · 全天` : `${fmt(item.start_at)} – ${fmt(item.end_at)}`}
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="hint">草案没有新增具体日程。</p>}
      </>}
      {draft.conflicts?.length ? (
        <div role="status" className="error-bar mt-4">
          发现 {draft.conflicts.length} 个时间冲突，请确认是否保留重叠安排：
          {draft.conflicts.map((conflict, index) => (
            <div key={index} className="mt-2">
              <strong>{conflict.proposed_title}</strong> 与「{conflict.existing_title}」重叠
              <div>{fmt(conflict.existing_start_at)} – {fmt(conflict.existing_end_at)}</div>
              {conflict.kind === 'draft' ? <span>同一草案内的日程</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="error-bar mt-3">{error}</p> : null}
      {draft.result ? (
        <p role="status" className={draft.status === 'approved' ? 'ok-bar mt-3' : draft.status === 'failed' ? 'error-bar mt-3' : 'hint mt-3'}>
          {draft.result}
        </p>
      ) : null}
      {!pending && draft.agent_sync?.message ? <p role="status" className="hint">{draft.agent_sync.message}</p> : null}
      {pending ? (
        <div className="form-actions mt-5">
          <button type="button" className="btn-primary" disabled={busy || !draft.review_token} onClick={() => decide('approved')}>
            {busy ? '处理中…' : notice || draft.conflicts?.length ? '确认当前安排并保存' : '确认并保存'}
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide('rejected')}>拒绝草案</button>
        </div>
      ) : (
        <div className="form-actions mt-4">
          <Link className="btn-primary" to="/agent">返回 agent</Link>
          {syncPending ? <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide(draft.confirmation.decision)}>
            {busy ? '同步中…' : '重试同步会话（不重复保存）'}
          </button> : null}
        </div>
      )}
    </section>
  )
}
