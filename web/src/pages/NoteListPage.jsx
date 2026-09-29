import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listNotes } from '../api/notes'
import NoteFileList from '../components/NoteFileList.jsx'
import StateBlock from '../components/StateBlock.jsx'

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
  // Day 13 · 错误态重试：改动这个数就重新发一次请求（不重发就只剩刷新浏览器一条路）
  const [retryTick, setRetryTick] = useState(0)
  const debounceRef = useRef(null)
  // Day 10 · 视图切换：?view=dir 为目录分组视图，其余（含无参数）一律卡片视图。
  // 写进地址栏而不是 state/localStorage——刷新、前进后退、把链接发给手机都能保持视图。
  const [searchParams, setSearchParams] = useSearchParams()
  const isDirView = searchParams.get('view') === 'dir'
  // Day 12：无结果时要区分「被筛掉了」和「本来就没资料」——前者该引导清空筛选，
  // 后者才该引导去归档；两者共用一句「+ 归档」会把人带偏。
  const hasFilter = q.trim() !== '' || category !== ''

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
  }, [q, category, retryTick, navigate])

  const { total, items, rebuilt, rebuiltAt, rebuiltInMs } = result
  const indexNote = rebuiltAt
    ? `索引${rebuilt ? '本次重建' : '命中缓存'}（耗时 ${rebuiltInMs} ms）· 更新于 ${fmtTime(rebuiltAt)}`
    : '索引加载中…'

  // Day 13 · 四态判定（互斥，同时只有一个成立）：
  //   加载：正在请求且手上还没有数据（重新筛选时保留旧列表、不闪「载入中」，否则列表会抖）
  //   错误：请求失败。它优先于空态——失败时「共 0 条」是假的，所以下面 meta 行也要藏起来
  //   空：请求成功但这批数据确实为空
  //   正常：有数据
  const state = error ? 'error' : loading ? (total === 0 ? 'loading' : 'ok') : total === 0 ? 'empty' : 'ok'

  function clearFilter() {
    setQ('')
    setCategory('')
  }

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
        <Link className="btn-primary" to="/archive">
          + 归档
        </Link>
      </div>

      {/* 错误时不说「共 N 条」：这个数字此时不可信 */}
      {state === 'error' ? null : (
        <p className="meta">
          共 {total} 条 · {indexNote}
        </p>
      )}

      <StateBlock
        state={state}
        errorText={error || '加载失败'}
        onRetry={() => setRetryTick((t) => t + 1)}
        emptyText={
          hasFilter
            ? '没有匹配的资料，试试'
            : '没有找到，点上面「+ 归档」记一条吧'
        }
        emptyAction={
          // Day 12 已记录「筛选后无结果缺一个显式出口」，本次四态补齐时一并补上
          hasFilter ? (
            <button type="button" className="btn-ghost" onClick={clearFilter}>
              清空筛选条件
            </button>
          ) : null
        }
      >
        {isDirView ? (
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
      </StateBlock>
    </section>
  )
}
