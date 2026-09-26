// 确认留痕页（F6）：回看每一次高风险动作的「请求了什么、什么时候决定的、决定了什么」。
// 只读页面 —— 记录由 PATCH /api/tasks/:id 带 decision 时写入，这里不产生任何数据。
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listConfirmations } from '../api/tasks'

const ACTION_LABELS = { delete_note: '删除资料' }

// 决定 → 展示文案与徽标配色（复用任务页那套 badge--* 颜色）
const DECISION_META = {
  approved: { label: '已确认', badge: 'badge--done' },
  rejected: { label: '已取消', badge: 'badge--failed' },
  '': { label: '待确认', badge: 'badge--attention' },
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function ConfirmHistoryPage() {
  const navigate = useNavigate()
  const [result, setResult] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    listConfirmations()
      .then((data) => {
        if (alive) setResult(data)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/confirmations', { replace: true })
        else setError(err.message || '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [navigate])

  const { total, items } = result

  return (
    <section className="card">
      <h2>确认留痕（{total}）</h2>
      <p className="hint">
        每次高风险动作的请求与决定都记在这里：请求时间、决定时间、决定了什么。不记录「谁」——单人使用。
      </p>

      {error ? <p className="error-bar">{error}</p> : null}

      {loading && total === 0 ? (
        <div className="loading">载入中…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          还没有确认记录。去资料详情页点一次「删除这条资料」就会产生一条待确认记录。
        </div>
      ) : (
        <ul className="task-list">
          {items.map((item) => {
            const meta = DECISION_META[item.decision] ?? {
              label: item.decision,
              badge: 'badge--todo',
            }
            return (
              <li key={item.id} className="task-item">
                <div className="task-head">
                  <span className="task-title">{ACTION_LABELS[item.action] ?? item.action}</span>
                  <span className={`badge ${meta.badge}`}>{meta.label}</span>
                </div>

                <p className="confirm-line">{item.summary}</p>

                <div className="note-item-meta">
                  <span>请求于 {fmtTime(item.requestedAt)}</span>
                  <span>·</span>
                  <span>决定于 {item.confirmedAt ? fmtTime(item.confirmedAt) : '—（还没决定）'}</span>
                </div>

                <div className="task-actions">
                  <Link
                    className="btn-ghost"
                    to={`/tasks/${encodeURIComponent(item.taskId)}/confirm`}
                  >
                    查看这次操作
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
