// ima 笔记只读详情（F15b / SPEC 3.7）：/notes/ima/:docid
// 版式照抄档案详情页（article.card + Breadcrumb + h2 + meta 行 + detail-meta dl + MarkdownContent），
// 但只显示 ima 真的有的字段——不编造分类/标签/来源/文件路径，也没有删除（云端只读，buddy 不管删）。
//
// 图片：ima 正文里的图是 ima CDN 直链，部分含 t/sign 签名会过期（过期后 403「t info expired」）。
//   后端只转 Markdown 不判断死活；前端用 <img onError> 就地换成纯文字占位，不保留可点死链（F3 定的）。
// 登录/配置：AUTH_REQUIRED → 跳登录页；IMA_NOT_CONFIGURED → 当说明性错误显示（与 ImaPanel 同口径）。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getImaNote } from '../api/ima'
import MarkdownContent from '../components/MarkdownContent.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import BackLink from '../components/BackLink.jsx'

const LIST_URL = '/notes?src=ima&panel=notes'

function fmtTime(ms) {
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { hour12: false })
}

// 渲染器注入给 react-markdown：img 换成带 onError 的版本，挂了就地给纯文字占位。
// 定义在模块层而不是渲染函数里——每次渲染重建组件会导致整个 markdown 树被卸载重挂。
function CloudImg({ node, ...props }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return <span className="md-img-missing">图片已失效（ima 签名过期）</span>
  }
  return <img {...props} alt={props.alt ?? ''} onError={() => setBroken(true)} />
}
const CLOUD_MD_COMPONENTS = { img: CloudImg }

export default function ImaNoteDetailPage() {
  const { docid } = useParams()
  const navigate = useNavigate()
  const [note, setNote] = useState(null) // { meta, content }
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setNotFound(false)
    getImaNote(docid)
      .then((data) => {
        if (alive) setNote(data)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') {
          navigate(`/login?from=${encodeURIComponent(`/notes/ima/${docid}`)}`, { replace: true })
        } else if (err.code === 'IMA_NOTE_NOT_FOUND' || err.status === 404) {
          setNotFound(true)
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
  }, [docid, navigate])

  if (loading) return <div className="loading">载入中…</div>

  if (notFound) {
    return (
      <div className="empty">
        ima 里没有找到这篇笔记（可能已删除）。
        <br />
        <Link to={LIST_URL}>返回笔记列表</Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty">
        {error}
        <br />
        <Link to={LIST_URL}>返回笔记列表</Link>
      </div>
    )
  }

  if (!note) return null

  const meta = note.meta
  return (
    <article className="card">
      <Breadcrumb
        items={[{ label: '档案', to: '/notes' }, { label: '笔记', to: LIST_URL }, { label: meta.title }]}
      />
      <h2 className="detail-title">{meta.title}</h2>

      <div className="note-item-meta">
        <span className="badge">云端笔记</span>
        {meta.folder_name ? <span className="tag">{meta.folder_name}</span> : null}
      </div>

      <dl className="detail-meta">
        <dt>创建</dt>
        <dd>{fmtTime(meta.created_at)}</dd>
        <dt>更新</dt>
        <dd>{fmtTime(meta.updated_at)}</dd>
        <dt>来源</dt>
        <dd>ima 笔记（只读）</dd>
      </dl>

      <div className="detail-content">
        <MarkdownContent content={note.content} components={CLOUD_MD_COMPONENTS} />
      </div>

      <p className="detail-back">
        <BackLink fallback={LIST_URL} fallbackLabel="返回笔记列表" />
      </p>
    </article>
  )
}
