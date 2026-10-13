// Day 10 · 目录分组文件列表（纯渲染组件）：把已返回的资料按 data/<目录>/ 分组逐行列出。
// 只接收过滤后的 items，不发请求；搜索与分类筛选由列表页统一处理，对本组件透明。
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

// 已知分类的中文名与排序权重；不在表里的目录（手动建的其它文件夹）原样展示、排在已知分类之后。
const CATEGORY_META = {
  learning: { label: '学习', order: 0 },
  life: { label: '生活', order: 1 },
  work: { label: '事务', order: 2 },
  essay: { label: '随笔', order: 3 },
}

/** path 形如 "learning/2026-09-22-text.md"；取首段做目录名，脏数据兜底到 category 或「未分组」 */
function dirOf(item) {
  return (item.path || '').split('/')[0] || item.category || '未分组'
}

/** 文件名取 path 末段（含 .md）；path 缺失时退回 <id>.md */
function fileNameOf(item) {
  const parts = (item.path || '').split('/')
  return parts[parts.length - 1] || `${item.id}.md`
}

/** 按目录分组：学习 → 生活 → 事务 → 随笔 → 其余；组内按文件名升序 */
function groupByDir(items) {
  const groups = new Map()
  for (const item of items) {
    const dir = dirOf(item)
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir).push(item)
  }
  return [...groups.entries()]
    .map(([dir, list]) => ({
      dir,
      label: CATEGORY_META[dir]?.label || '',
      items: [...list].sort((a, b) => fileNameOf(a).localeCompare(fileNameOf(b))),
    }))
    .sort((a, b) => {
      const oa = CATEGORY_META[a.dir]?.order ?? 99
      const ob = CATEGORY_META[b.dir]?.order ?? 99
      return oa !== ob ? oa - ob : a.dir.localeCompare(b.dir)
    })
}

// 浮层挂到 body，避免被目录面板裁剪；滚动时关闭，保持位置准确。
function FileRow({ note }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, above: false })
  const row = useRef(null)
  const panel = useRef(null)
  const timer = useRef(null)
  const info = useRef(null)
  const id = useId()

  function show() {
    clearTimeout(timer.current)
    const rect = row.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(360, window.innerWidth - 32)
    const above = window.innerHeight - rect.bottom < 300 && rect.top > 300
    setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: above ? rect.top - 8 : rect.bottom + 8, above })
    setOpen(true)
  }
  function close() { clearTimeout(timer.current); setOpen(false) }
  function leave() { clearTimeout(timer.current); timer.current = setTimeout(close, 150) }

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    function outside(event) {
      if (!row.current?.contains(event.target) && !panel.current?.contains(event.target)) close()
    }
    function escape(event) { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', close)
    // 浮层自身滚动不会关掉浮层。
    function scroll(event) { if (!panel.current?.contains(event.target)) close() }
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open])

  return (
    <li className="directory-row" ref={row}
      onMouseEnter={() => { timer.current = setTimeout(show, 300) }} onMouseLeave={leave}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
      <span aria-hidden="true" className="directory-icon">📄</span>
      <Link className="directory-title" to={`/notes/${encodeURIComponent(note.id)}`}
        onFocus={show} aria-describedby={open ? id : undefined}>{note.title || '无标题'}</Link>
      <time className="directory-date">{note.date || '—'}</time>
      <button type="button" className="directory-info" ref={info}
        aria-label={`查看资料信息：${note.title || '无标题'}`} aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => open ? close() : show()}>ⓘ</button>
      {open && createPortal(
        <div className="directory-tooltip" id={id} role="tooltip" ref={panel}
          style={{ left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined }}
          onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>
          <strong>{note.title || '无标题'}</strong>
          <code>{fileNameOf(note)}</code>
          <span>{note.date || '日期未填写'}</span>
          {note.tags?.length ? <div className="directory-tooltip-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
          {note.excerpt ? <p>{note.excerpt}</p> : null}
        </div>, document.body) }
    </li>
  )
}

export default function NoteFileList({ items }) {
  return (
    <div className="file-groups">
      {groupByDir(items).map((group) => (
        <section key={group.dir} className="file-group">
          <h2 className="file-group-title">{group.label || group.dir} · {group.items.length} 篇</h2>
          <div className="directory-columns" aria-hidden="true"><span>资料标题</span><span>日期</span><span>信息</span></div>
          <ul className="file-list">{group.items.map((note) => <FileRow key={note.id} note={note} />)}</ul>
        </section>
      ))}
    </div>
  )
}
