import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listNotes } from '../api/notes'

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

export default function NoteListPage() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')

  // 每次渲染/输入变化时"重建"列表（对应 F3 的行为体现：打开或输入即刷新）
  const { items, total, rebuiltAt } = useMemo(
    () => listNotes({ q, category }),
    [q, category],
  )

  return (
    <section>
      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题、内容或标签…"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <p className="meta">
        共 {total} 条 · 索引更新于 {fmtTime(rebuiltAt)}（打开/输入时自动刷新）
      </p>

      {total === 0 ? (
        <div className="empty">没有找到</div>
      ) : (
        <ul className="note-list">
          {items.map((n) => (
            <li key={n.id} className="note-item">
              <Link to={`/notes/${n.id}`}>
                <div className="note-item-title">{n.title}</div>
                <div className="note-item-excerpt">{n.excerpt}</div>
                <div className="note-item-meta">
                  <span className="badge">{n.category}</span>
                  <span>{n.date}</span>
                  {n.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
