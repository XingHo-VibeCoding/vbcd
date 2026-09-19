import { Link, useParams } from 'react-router-dom'
import { getNote } from '../api/notes'

const CATEGORY_LABELS = { learning: '学习', life: '生活', work: '事务' }

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function NoteDetailPage() {
  const { id } = useParams()
  const note = getNote(id)

  if (!note) {
    return (
      <div className="empty">
        没有找到这条资料。<Link to="/">返回列表</Link>
      </div>
    )
  }

  return (
    <article className="card">
      <h2 className="detail-title">{note.title}</h2>

      <div className="note-item-meta">
        <span className="badge">{CATEGORY_LABELS[note.category] || note.category}</span>
        <span>{note.date}</span>
        {(note.tags || []).map((t) => (
          <span key={t} className="tag">#{t}</span>
        ))}
      </div>

      <dl className="detail-meta">
        {note.source_url ? (
          <>
            <dt>来源</dt>
            <dd>
              <a href={note.source_url} target="_blank" rel="noreferrer">
                {note.source_url}
              </a>
            </dd>
          </>
        ) : null}
        <dt>创建</dt>
        <dd>{fmtTime(note.created_at)}</dd>
        <dt>更新</dt>
        <dd>{fmtTime(note.updated_at)}</dd>
        <dt>文件路径</dt>
        <dd>
          <code>memory/{note.category}/{note.date}-{note.id.replace(/^\d{4}-\d{2}-\d{2}-/, '')}.md</code>
        </dd>
      </dl>

      <div className="detail-content">
        {String(note.content || '').split('\n').map((line, i) => (
          <p key={i}>{line || ' '}</p>
        ))}
      </div>

      <p className="detail-back">
        <Link to="/">← 返回列表</Link>
      </p>
    </article>
  )
}
