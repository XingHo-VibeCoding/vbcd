import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listNotes } from '../api/notes'
import NoteFileList from '../components/NoteFileList.jsx'

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false })
}

export default function NoteListPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [result, setResult] = useState({ total: 0, items: [], rebuilt: false, rebuiltAt: '', rebuiltInMs: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)
  // Day 10 · 视图切换：?view=dir 为目录分组视图，其余（含无参数）一律卡片视图。
  // 写进地址栏而不是 state/localStorage——刷新、前进后退、把链接发给手机都能保持视图。
  const [searchParams, setSearchParams] = useSearchParams()
  const isDirView = searchParams.get('view') === 'dir'

  // 搜索 250ms 防抖；分类变化立即重新请求（F3：打开/输入即刷新）
  useEffect(() => {
    setLoading(true)
    setError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      listNotes({ q, category })
        .then((data) => setResult(data))
        .catch((err) => {
          if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/notes', { replace: true })
          else setError(err.message || '加载失败')
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [q, category, navigate])

  const { total, items, rebuilt, rebuiltAt, rebuiltInMs } = result
  const indexNote = rebuiltAt
    ? `索引${rebuilt ? '本次重建' : '命中缓存'}（耗时 ${rebuiltInMs} ms）· 更新于 ${fmtTime(rebuiltAt)}`
    : '索引加载中…'

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
        <div className="view-switch" role="group" aria-label="列表视图">
          <button
            type="button"
            aria-pressed={!isDirView}
            className={isDirView ? '' : 'active'}
            onClick={() => setSearchParams({})}
          >
            卡片
          </button>
          <button
            type="button"
            aria-pressed={isDirView}
            className={isDirView ? 'active' : ''}
            onClick={() => setSearchParams({ view: 'dir' })}
          >
            目录
          </button>
        </div>
      </div>

      <p className="meta">
        共 {total} 条 · {indexNote}
      </p>

      {error ? <div className="error-bar">{error}</div> : null}

      {loading && total === 0 ? (
        <div className="loading">载入中…</div>
      ) : total === 0 ? (
        <div className="empty">没有找到{error ? '' : '，去「新建资料」记一条吧'}</div>
      ) : isDirView ? (
        // 目录视图与卡片视图共用同一份过滤结果（items），筛选行为完全一致
        <NoteFileList items={items} />
      ) : (
        <ul className="note-list">
          {items.map((n) => (
            <li key={n.id} className="note-item">
              <Link to={`/notes/${encodeURIComponent(n.id)}`}>
                <div className="note-item-title">{n.title}</div>
                <div className="note-item-excerpt">{n.excerpt}</div>
                <div className="note-item-meta">
                  <span className="badge">{n.category}</span>
                  <span>{n.date}</span>
                  {(n.tags || []).map((t) => (
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
