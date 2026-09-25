// Day 10 · 目录分组文件列表（纯渲染组件）：把已返回的资料按 data/<目录>/ 分组逐行列出。
// 只接收过滤后的 items，不发请求；搜索与分类筛选由列表页统一处理，对本组件透明。
import { Link } from 'react-router-dom'

// 已知分类的中文名与排序权重；不在表里的目录（手动建的其它文件夹）原样展示、排在已知分类之后。
const CATEGORY_META = {
  learning: { label: '学习', order: 0 },
  life: { label: '生活', order: 1 },
  work: { label: '事务', order: 2 },
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

/** 按目录分组：组序 = 学习 → 生活 → 事务 → 其余按目录名字母序；组内按文件名升序 */
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

export default function NoteFileList({ items }) {
  const groups = groupByDir(items)
  return (
    <div className="file-groups">
      {groups.map((g) => (
        <section key={g.dir} className="file-group">
          <h2 className="file-group-title">
            {g.label ? `${g.label} ` : ''}
            {g.dir} · {g.items.length} 个文件
          </h2>
          <ul className="file-list">
            {g.items.map((n) => (
              <li key={n.id} className="file-item">
                <Link to={`/notes/${encodeURIComponent(n.id)}`}>
                  <code className="file-name">{fileNameOf(n)}</code>
                  <span className="file-item-title">{n.title}</span>
                  <span className="file-item-meta">
                    {n.date}
                    {(n.tags || []).map((t) => (
                      <span key={t} className="tag">
                        #{t}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
