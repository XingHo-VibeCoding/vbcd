// 任务页（F4 手机端发起任务 / F5 查看进度）
// · 提交后写入 data/.runtime/tasks.json；type=note 由后端同步归档成资料
// · 状态推进走 PATCH /api/tasks/:id；高风险任务（attention）在确认前推不动，后端会回 428
// · origin 按 UA 判断手机/电脑，显式传给后端（后端不猜 UA）
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTask, listTasks, updateTaskStatus } from '../api/tasks'

const CATEGORIES = [
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

const TASK_KINDS = [
  { value: 'note', label: '记一条资料' },
  { value: 'remind', label: '提醒事项' },
  { value: 'organize', label: '整理链接' },
]

const TYPE_LABELS = {
  note: '资料',
  organize: '整理链接',
  remind: '提醒',
  delete_note: '删除资料',
}

const STATUS_LABELS = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  failed: '失败',
  attention: '需确认',
}

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'attention', label: '需确认' },
]

// 手工推进允许的下一步（与后端 ALLOWED_TRANSITIONS 对齐；attention 只能走确认流）
const NEXT_STATUS = {
  todo: [['doing', '开始'], ['done', '完成']],
  doing: [['done', '完成']],
  failed: [['todo', '重试']],
}

function isPhone() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// 列表里一句话说明"这条任务是什么"：从 payload 里取最有信息量的字段
function summaryOf(task) {
  const payload = task.payload ?? {}
  if (task.type === 'note') return payload.title || '(无标题)'
  if (task.type === 'remind') return payload.text || '(空提醒)'
  if (task.type === 'organize') return payload.url || '(空链接)'
  if (task.type === 'delete_note') return `删除资料 ${payload.note_id ?? ''}`
  return task.type
}

export default function TaskListPage() {
  const navigate = useNavigate()
  const [type, setType] = useState('note')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('learning')
  const [content, setContent] = useState('')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')

  const [status, setStatus] = useState('')
  const [tick, setTick] = useState(0) // 提交/推进后 +1，触发重新拉取
  const [result, setResult] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    listTasks({ status })
      .then((data) => {
        if (alive) setResult(data)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/tasks', { replace: true })
        else setError(err.message || '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [status, tick, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const payload =
        type === 'note'
          ? { title, content, category }
          : type === 'remind'
            ? { text }
            : { url }
      const task = await createTask({ type, payload, origin: isPhone() ? 'phone' : 'desktop' })
      setTitle('')
      setContent('')
      setText('')
      setUrl('')
      setNotice(
        `已提交：「${summaryOf(task)}」→ ${STATUS_LABELS[task.status] ?? task.status}` +
          (task.result ? `｜${task.result}` : ''),
      )
      setTick((n) => n + 1)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate('/login?from=/tasks', { replace: true })
        return
      }
      setError(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function advance(task, next) {
    setError('')
    setNotice('')
    try {
      const updated = await updateTaskStatus(task.id, next)
      setNotice(`「${summaryOf(updated)}」已更新为 ${STATUS_LABELS[updated.status] ?? updated.status}`)
      setTick((n) => n + 1)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate('/login?from=/tasks', { replace: true })
        return
      }
      // 含 428 CONFIRM_REQUIRED：后端会把"接下来会发生什么"写进 message，这里原样显示
      setError(err.message || '更新失败')
    }
  }

  const { total, items } = result

  return (
    <section className="card">
      <h2>任务</h2>
      <p className="hint">手机浏览器打开这一页就能提交；提交后电脑端刷新也能看到同一条任务</p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          任务类型
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TASK_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>

        {type === 'note' ? (
          <>
            <label>
              标题 *
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="一句话说明这条资料"
              />
            </label>
            <div className="form-row">
              <label>
                分类
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              正文 *
              <textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录内容…"
              />
            </label>
          </>
        ) : null}

        {type === 'remind' ? (
          <label>
            提醒内容 *
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="如：周五前交实验报告"
            />
          </label>
        ) : null}

        {type === 'organize' ? (
          <label>
            链接 *
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '提交中…' : '提交任务'}
          </button>
        </div>
      </form>

      {error ? <p className="error-bar">{error}</p> : null}
      {notice ? <p className="ok-bar">{notice}</p> : null}

      <div className="toolbar">
        <span className="editor-label">任务列表（{total}）</span>
        <div className="view-switch" role="group" aria-label="按状态筛选">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={status === f.value ? 'tab active' : 'tab'}
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && total === 0 ? (
        <div className="loading">载入中…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          {status ? '这个状态下还没有任务' : '还没有任务，上面提交一条试试'}
        </div>
      ) : (
        <ul className="task-list">
          {items.map((task) => (
            <li key={task.id} className="task-item">
              <div className="task-head">
                <span className="task-title">{summaryOf(task)}</span>
                <span className={`badge badge--${task.status}`}>
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              </div>
              <div className="note-item-meta">
                <span>{TYPE_LABELS[task.type] ?? task.type}</span>
                <span>·</span>
                <span>{fmtTime(task.createdAt)}</span>
                <span>·</span>
                <span>来自{task.origin === 'phone' ? '手机' : '电脑'}</span>
              </div>
              {task.result ? <p className="note-item-excerpt">{task.result}</p> : null}
              {task.status === 'attention' ? (
                <p className="hint">这条任务在等确认，确认通过后才会执行（确认页在下一步接入）</p>
              ) : (
                <div className="task-actions">
                  {(NEXT_STATUS[task.status] ?? []).map(([next, label]) => (
                    <button
                      key={next}
                      type="button"
                      className="btn-ghost"
                      onClick={() => advance(task, next)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
