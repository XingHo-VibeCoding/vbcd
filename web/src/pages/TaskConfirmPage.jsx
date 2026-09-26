// 确认页（F6）：高风险动作执行前，用大白话展示「接下来会发生什么」，由使用者点确认或取消。
// 前端只是「提交决定」的地方 —— 没点确认时后端不会执行任何动作（PATCH /api/tasks/:id 的 428 闸门）。
// 决定一旦提交即写入 Confirmation 留痕（时间 + 内容 + 决定），本页也会转成回看视图。
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { decideTask, listConfirmations, listTasks } from '../api/tasks'

const ACTION_LABELS = { delete_note: '删除资料' }

const STATUS_LABELS = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  failed: '失败',
  attention: '需确认',
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function TaskConfirmPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [task, setTask] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tasks, confirmations] = await Promise.all([
        listTasks(),
        listConfirmations({ taskId: id }),
      ])
      setTask(tasks.items.find((item) => item.id === id) ?? null)
      // 优先展示「待确认」那条；没有则展示最近一条已决记录（= 回看模式）
      setConfirmation(confirmations.items.find((c) => !c.decision) ?? confirmations.items[0] ?? null)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate(`/login?from=/tasks/${encodeURIComponent(id)}/confirm`, { replace: true })
        return
      }
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    load()
  }, [load])

  async function decide(decision) {
    setBusy(true)
    setError('')
    try {
      const updated = await decideTask(id, decision)
      setTask(updated)
      setConfirmation((c) => (c ? { ...c, decision, confirmedAt: new Date().toISOString() } : c))
      setDone(
        decision === 'approved'
          ? `已确认执行｜${updated.result}`
          : `已取消，未执行任何动作｜${updated.result}`,
      )
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate(`/login?from=/tasks/${encodeURIComponent(id)}/confirm`, { replace: true })
        return
      }
      setError(err.message || '提交失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading">载入中…</div>

  if (!task || !confirmation) {
    return (
      <div className="empty">
        {error || '没有找到这条待确认的操作。'}
        <br />
        <Link to="/tasks">返回任务列表</Link>
      </div>
    )
  }

  const decided = Boolean(confirmation.decision)

  return (
    <section className="card">
      <h2>确认操作</h2>
      <p className="hint">
        这一步会改动你的数据。看清楚再决定 —— 没点「确认执行」之前，什么都不会发生。
      </p>

      <div className="confirm-block">
        <p className="confirm-summary">{confirmation.summary}</p>
        <div className="note-item-meta">
          <span className={`badge badge--${task.status}`}>
            {STATUS_LABELS[task.status] ?? task.status}
          </span>
          <span>{ACTION_LABELS[confirmation.action] ?? confirmation.action}</span>
          <span>·</span>
          <span>请求确认于 {fmtTime(confirmation.requestedAt)}</span>
        </div>
      </div>

      {error ? <p className="error-bar">{error}</p> : null}
      {done ? <p className="ok-bar">{done}</p> : null}

      {!decided && !done ? (
        <div className="form-actions">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => decide('approved')}>
            {busy ? '提交中…' : '确认执行'}
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide('rejected')}>
            取消，不执行
          </button>
        </div>
      ) : (
        <>
          <dl className="detail-meta">
            <dt>最后决定</dt>
            <dd>{confirmation.decision === 'approved' ? '确认执行' : '取消，不执行'}</dd>
            <dt>决定时间</dt>
            <dd>{fmtTime(confirmation.confirmedAt)}</dd>
            <dt>任务状态</dt>
            <dd>{STATUS_LABELS[task.status] ?? task.status}</dd>
            <dt>执行结果</dt>
            <dd>{task.result || '—'}</dd>
          </dl>

          <div className="form-actions">
            <Link className="btn-primary" to="/tasks">
              返回任务列表
            </Link>
            <Link className="btn-ghost" to="/confirmations">
              查看确认留痕
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
