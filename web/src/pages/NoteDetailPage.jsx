import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getNote } from '../api/notes'
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

  if (loading) return <div className="loading">载入中…</div>

  if (error) {
    return (
      <div className="empty">
        {error}
        <br />
        <Link to="/">返回列表</Link>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="empty">
        没有找到这条资料。<Link to="/">返回列表</Link>
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

      <p className="detail-back">
        <Link to="/">← 返回列表</Link>
      </p>
    </article>
  )
}
