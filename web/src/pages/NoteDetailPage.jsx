import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getNote } from '../api/notes'
import { createTask } from '../api/tasks'
import MarkdownContent from '../components/MarkdownContent.jsx'
import Toast from '../components/Toast.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import BackLink from '../components/BackLink.jsx'

const CATEGORY_LABELS = { learning: '学习', life: '生活', work: '事务' }

// 反馈时长（SPEC 5.3.1）：提示条成功 3 秒 / 失败 5 秒，按钮文字一律 3 秒后复原
const TOAST_OK_MS = 3000
const TOAST_ERROR_MS = 5000
const BUTTON_RESET_MS = 3000

function fmtTime(iso) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export default function NoteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [note, setNote] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // 删除：本页只负责「发起待确认任务」，真正的删除在确认页点确认后才执行（F6）
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // 交互反馈（Day 11）：copyState 管按钮文字（即时态），toast 管提示条（短暂提示）
  const [copyState, setCopyState] = useState('idle') // idle | ok | failed
  const [toast, setToast] = useState(null) // { text, tone } | null
  const pathRef = useRef(null) // 「文件路径」里的 <code>，降级时用它选中文本
  const toastTimer = useRef(null) // 单例计时器：再次触发先清掉旧的，保证连点不叠加
  const copyTimer = useRef(null)

  // 离开页面时把计时器全清掉：否则会在卸载后 setState
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(copyTimer.current)
    },
    [],
  )

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getNote(id)
      .then((data) => {
        if (alive) setNote(data)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') {
          navigate(`/login?from=/notes/${encodeURIComponent(id)}`, { replace: true })
          // 列表页已挪到 /notes（个人主页占用了 /）
        } else {
          setError(err.message || '加载失败')
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id, navigate])

  // 点「删除」不会删任何东西：建一条 delete_note 待确认任务，然后跳到确认页由使用者决定
  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      const task = await createTask({
        type: 'delete_note',
        payload: { note_id: note.meta.id },
        origin: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'desktop',
      })
      navigate(`/tasks/${encodeURIComponent(task.id)}/confirm`)
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        navigate(`/login?from=/notes/${encodeURIComponent(id)}`, { replace: true })
        return
      }
      setDeleteError(err.message || '发起删除失败')
      setDeleting(false)
    }
  }

  // 降级：剪贴板不可用（非 HTTPS / 非 localhost，如用 IP 访问手机端）时，
  // 自动选中路径文本让使用者手动复制——不引 polyfill、不请求额外权限
  function selectPathText() {
    const el = pathRef.current
    const selection = window.getSelection?.()
    if (!el || !selection || !document.createRange) return
    const range = document.createRange()
    range.selectNodeContents(el)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  // 复制文件路径：不依赖后端，只读页面上已有的 meta.path
  async function handleCopyPath() {
    if (!note) return
    const full = `data/${note.meta.path}`
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(full)
        ok = true
      }
    } catch {
      ok = false // 用户拒绝授权 / 非安全上下文 → 走降级
    }
    if (!ok) selectPathText()

    setCopyState(ok ? 'ok' : 'failed')
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState('idle'), BUTTON_RESET_MS)

    clearTimeout(toastTimer.current) // 单例：新提示顶掉旧提示，不排队
    setToast(
      ok
        ? { text: `路径已复制：${full}`, tone: 'ok' }
        : { text: '复制失败，请长按选中路径手动复制', tone: 'error' },
    )
    toastTimer.current = setTimeout(() => setToast(null), ok ? TOAST_OK_MS : TOAST_ERROR_MS)
  }

  if (loading) return <div className="loading">载入中…</div>

  if (error) {
    return (
      <div className="empty">
        {error}
        <br />
        <Link to="/notes">返回列表</Link>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="empty">
        没有找到这条资料。<Link to="/notes">返回列表</Link>
      </div>
    )
  }

  const meta = note.meta
  return (
    <article className="card">
      {/* 层级只有「档案」这一层，但末项写标题而不是「详情」——反正都要占一行，写标题更有用 */}
      <Breadcrumb items={[{ label: '档案', to: '/notes' }, { label: meta.title }]} />
      <h2 className="detail-title">{meta.title}</h2>

      <div className="note-item-meta">
        <span className="badge">{CATEGORY_LABELS[meta.category] || meta.category}</span>
        <span>{meta.date}</span>
        {(meta.tags || []).map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
      </div>

      <dl className="detail-meta">
        {meta.source_url ? (
          <>
            <dt>来源</dt>
            <dd>
              <a href={meta.source_url} target="_blank" rel="noreferrer">
                {meta.source_url}
              </a>
            </dd>
          </>
        ) : null}
        <dt>创建</dt>
        <dd>{fmtTime(meta.created_at)}</dd>
        <dt>更新</dt>
        <dd>{fmtTime(meta.updated_at)}</dd>
        <dt>文件路径</dt>
        <dd className="detail-path">
          <code ref={pathRef}>data/{meta.path}</code>
          <button type="button" className="btn-ghost btn-copy" onClick={handleCopyPath}>
            {copyState === 'ok' ? '已复制 ✓' : copyState === 'failed' ? '复制失败' : '复制路径'}
          </button>
        </dd>
      </dl>

      <div className="detail-content">
        <MarkdownContent content={note.content} />
      </div>

      <div className="danger-zone">
        <button type="button" className="btn-danger" disabled={deleting} onClick={handleDelete}>
          {deleting ? '正在发起…' : '删除这条资料'}
        </button>
        <p className="hint">不会立即删除：下一步会请你确认，确认之后才真正删掉。</p>
        {deleteError ? <p className="error-bar">{deleteError}</p> : null}
      </div>

      <p className="detail-back">
        <BackLink fallback="/notes" fallbackLabel="返回档案列表" />
      </p>

      <Toast text={toast?.text} tone={toast?.tone} />
    </article>
  )
}
