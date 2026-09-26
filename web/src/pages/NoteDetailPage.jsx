import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getNote } from '../api/notes'
import { createTask } from '../api/tasks'
import MarkdownContent from '../components/MarkdownContent.jsx'

const CATEGORY_LABELS = { learning: '学习', life: '生活', work: '事务' }

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
        <dd>
          <code>data/{meta.path}</code>
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
        <Link to="/notes">← 返回列表</Link>
      </p>
    </article>
  )
}
