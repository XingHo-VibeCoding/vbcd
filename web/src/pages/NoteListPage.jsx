import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listNotes } from '../api/notes'
import NoteFileList from '../components/NoteFileList.jsx'
import StateBlock from '../components/StateBlock.jsx'
import ImaPanel from '../components/ImaPanel.jsx'

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
  { value: 'essay', label: '随笔' },
]

// 分类菜单使用主站样式；筛选值与原 select 完全一致。
function CategoryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const options = useRef([])
  const menuId = useId()
  const selected = Math.max(0, CATEGORIES.findIndex((c) => c.value === value))

  useEffect(() => {
    if (!open) return
    options.current[selected]?.focus()
    const closeOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, selected])

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function navigate(event, index) {
    let next
    if (event.key === 'ArrowDown') next = (index + 1) % CATEGORIES.length
    if (event.key === 'ArrowUp') next = (index + CATEGORIES.length - 1) % CATEGORIES.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = CATEGORIES.length - 1
    if (next !== undefined) {
      event.preventDefault()
      options.current[next]?.focus()
    }
    if (event.key === 'Escape') { event.preventDefault(); close() }
  }

  return (
    <div className="category-picker" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button type="button" className="category-trigger" ref={trigger}
        aria-label={`资料分类：${CATEGORIES[selected].label}`} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
          }
        }}>
        {CATEGORIES[selected].label}<span aria-hidden="true">⌄</span>
      </button>
      {open && <div id={menuId} className="category-menu" role="menu" aria-label="资料分类">
        {CATEGORIES.map((category, index) => (
          <button key={category.value} type="button" role="menuitemradio"
            aria-checked={value === category.value} tabIndex={-1}
            ref={(element) => { options.current[index] = element }}
            onKeyDown={(event) => navigate(event, index)}
            onClick={() => { onChange(category.value); close() }}>
            {category.label}<span aria-hidden="true">{value === category.value ? '✓' : ''}</span>
          </button>
        ))}
      </div>}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false })
}

export default function NoteListPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [result, setResult] = useState({ total: 0, items: [], rebuilt: false, rebuiltAt: '', rebuiltInMs: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // Day 13 · 错误态重试：改动这个数就重新发一次请求（不重发就只剩刷新浏览器一条路）
  const [retryTick, setRetryTick] = useState(0)
  const debounceRef = useRef(null)
  // Day 10 · 视图切换：?view=dir 为目录分组视图，其余（含无参数）一律卡片视图。
  // 写进地址栏而不是 state/localStorage——刷新、前进后退、把链接发给手机都能保持视图。
  const [searchParams, setSearchParams] = useSearchParams()
  // 分类以地址栏为准：首页入口、刷新以及前进/后退都保持同一筛选。
  const selectedCategory = searchParams.get('category') || ''
  const category = CATEGORIES.some(item => item.value === selectedCategory) ? selectedCategory : ''
  function setCategory(value) {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (value) next.set('category', value)
      else next.delete('category')
      return next
    })
  }
  const isDirView = searchParams.get('view') === 'dir'
  // F15 · 来源切换：?src=ima 为云端（ima 知识库只读视图），缺省/其他值一律本地。
  const src = searchParams.get('src') === 'ima' ? 'ima' : 'local'
  // Day 12：无结果时要区分「被筛掉了」和「本来就没资料」——前者该引导清空筛选，
  // 后者才该引导去归档；两者共用一句「+ 归档」会把人带偏。
  const hasFilter = q.trim() !== '' || category !== ''

  // 搜索 250ms 防抖；分类变化立即重新请求（F3：打开/输入即刷新）
  useEffect(() => {
    if (src === 'ima') return // 云端形态的数据由 ImaPanel 自取，本地接口不白打一发
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
  }, [q, category, retryTick, navigate, src])

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

  // 两种资料来源共用标题和来源切换，云端组件把自己的搜索接在其后。
  const toolbarHeader = (
    <>
      <div className="archive-heading">
        <h1>档案</h1>
        <Link className="btn-primary" to="/archive">＋ 归档</Link>
      </div>
      <div className="view-switch" role="group" aria-label="资料来源">
        <button type="button" aria-pressed={src === 'local'} className={src === 'local' ? 'active' : ''}
          onClick={() => setSearchParams({})}>本地</button>
        <button type="button" aria-pressed={src === 'ima'} className={src === 'ima' ? 'active' : ''}
          onClick={() => setSearchParams({ src: 'ima' })}>云端</button>
      </div>
    </>
  )

  return (
    <section className="archive-page">
      {src === 'local' && <header className="site-glass-card archive-tools">
        {toolbarHeader}
        <div className="toolbar">
        {src === 'local' && (
          <>
            <input
              className="search-input"
              type="search"
              aria-label="搜索本地资料"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索标题、内容或标签…"
            />
            <CategoryPicker value={category} onChange={setCategory} />
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
          </>
        )}
        </div>
      </header>}

      {src === 'ima' ? (
        <ImaPanel toolbarHeader={toolbarHeader} />
      ) : (
        <>
          {/* 错误时不说「共 N 条」：这个数字此时不可信 */}
          {state === 'error' ? null : (
            <div className="archive-summary">
              <p className="meta">{loading ? '正在更新资料…' : `共 ${total} 条资料`}</p>
              <details className="archive-index">
                <summary>索引信息</summary>
                <p>{indexNote}</p>
              </details>
            </div>
          )}

      <StateBlock
        state={state}
        errorText={error || '加载失败'}
        onRetry={() => setRetryTick((t) => t + 1)}
        emptyText={
          hasFilter
            ? '没有匹配的资料，请换个关键词或清空筛选。'
            : '还没有资料，点击「＋ 归档」添加第一条。'
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
          <div className="site-glass-card archive-directory"><NoteFileList items={items} /></div>
        ) : (
          <ul className="note-list">
            {items.map((n) => (
              <li key={n.id} className="note-item">
                <Link to={`/notes/${encodeURIComponent(n.id)}`}>
                  <div className="note-item-meta archive-card-top">
                    <span className="badge">{CATEGORIES.find((c) => c.value === n.category)?.label || n.category}</span>
                    <span>{n.date}</span>
                  </div>
                  <div className="note-item-title">{n.title}</div>
                  <div className="note-item-excerpt">{n.excerpt}</div>
                  <div className="note-item-meta">
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
        </>
      )}
    </section>
  )
}
