// 归档页（原 /new 新建资料，2026-09-28 收编「整理链接」后改两个入口）：
//   收敛 = 贴一个链接，登记一条 type=organize 任务（本期无自动执行器，只登记待办）——默认打开的入口
//   发散 = 手动填写资料（原 NoteArchiveForm，POST /api/notes 直接落盘）
// 入口状态写进地址栏 ?mode=converge|diverge（与 ?view / ?tab / ?cal 同一套约定），默认 converge。
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import NoteArchiveForm from '../components/NoteArchiveForm.jsx'
import { createTask } from '../api/tasks'

const MODES = [
  { value: 'converge', label: '收敛' },
  { value: 'diverge', label: '发散' },
]

const CATEGORIES = [
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

function isPhone() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

/**
 * 收敛：把链接收进任务流（不抓内容、不立刻归档）。
 * 语义与日志页原「整理链接」完全一致：POST /api/tasks {type:organize, payload:{url}}。
 */
function ConvergeForm() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('learning')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const submittedUrl = url          // 清表单前先存下来，供提示条引用
      const task = await createTask({
        type: 'organize',
        payload: { url, category },
        origin: isPhone() ? 'phone' : 'desktop',
      })
      setUrl('')
      // 提示透出后端 result（「已提交，正在抓取链接」），进度去日志页看
      setNotice(`已登记：${submittedUrl}｜${task.result || '已提交'}`)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate('/login?from=/archive', { replace: true })
        return
      }
      setError(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <p className="hint">
        贴一个链接，buddy 抓取正文并用模型整理成资料（失败会告诉你原因）；
        任务进度去<Link to="/log">日志</Link>看。
      </p>
      <label>
        链接 *
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          required
        />
      </label>
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
      {error ? <p className="error-bar">{error}</p> : null}
      {notice ? (
        <p className="ok-bar">
          {notice}｜<Link to="/log">去日志页看进度 →</Link>
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '登记中…' : '收敛这条链接'}
        </button>
      </div>
    </form>
  )
}

export default function ArchivePage() {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'diverge' ? 'diverge' : 'converge'

  return (
    <section className="card">
      <h2>归档</h2>
      <p className="hint">收敛：贴链接 → 抓取正文+模型整理 → 归档｜发散：手动写一条资料</p>
      <div className="view-switch" role="group" aria-label="归档方式">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={mode === m.value ? 'tab active' : 'tab'}
            aria-pressed={mode === m.value}
            onClick={() => setParams({ mode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'converge' ? <ConvergeForm /> : <NoteArchiveForm />}
    </section>
  )
}
