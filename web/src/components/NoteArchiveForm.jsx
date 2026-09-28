// 归档表单（原 /new 新建资料表单）：主页归档卡使用。
// 与旧版差异：保存成功不跳转，原地清空表单 + ok-bar 给出新资料链接；
// 失败（断网 / 校验 / 鉴权）原地报错，不离开当前页。
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createNote } from '../api/notes'
import MarkdownContent from './MarkdownContent.jsx'

const CATEGORIES = [
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

export default function NoteArchiveForm() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('learning')
  const [tagsText, setTagsText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { id } → 渲染「已归档 + 查看链接」
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState('edit') // 仅窄屏生效：编辑 / 预览

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice(null)
    setSubmitting(true)
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const created = await createNote({ title, category, tags, source_url: sourceUrl, content })
      setTitle('')
      setTagsText('')
      setSourceUrl('')
      setContent('')
      setNotice({ id: created.id })
    } catch (err) {
      // 后端会抛带 code 的错误：VALIDATION_FAILED / DUPLICATE / AUTH_REQUIRED / NETWORK
      if (err.code === 'AUTH_REQUIRED') {
        navigate('/login?from=/', { replace: true })
        return
      }
      setError(err.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        标题 *
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="一句话说明这条资料"
        />
      </label>

      <div className="form-row">
        <label>
          分类
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          标签（逗号分隔，可空）
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="如：git, 排错"
          />
        </label>
      </div>

      <label>
        来源链接（可空）
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>

      <div className="editor-block">
        <div className="editor-head">
          <span className="editor-label">正文 *（支持 Markdown）</span>
          <div className="tabs-mobile">
            <button
              type="button"
              className={tab === 'edit' ? 'tab active' : 'tab'}
              onClick={() => setTab('edit')}
            >
              编辑
            </button>
            <button
              type="button"
              className={tab === 'preview' ? 'tab active' : 'tab'}
              onClick={() => setTab('preview')}
            >
              预览
            </button>
          </div>
        </div>

        <div className="editor-split" data-mode={tab}>
          <textarea
            className="pane-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder={'记录内容…\n\n试试 Markdown：# 标题、- 列表、**加粗**、`代码`、| 表格 |'}
          />
          <div className="pane-preview">
            <MarkdownContent
              content={content}
              emptyHint="左侧开始输入，这里实时显示渲染效果"
            />
          </div>
        </div>
      </div>

      {error ? <div className="error-bar">{error}</div> : null}
      {notice ? (
        <p className="ok-bar">
          已归档到 data/ 目录｜<Link to={`/notes/${encodeURIComponent(notice.id)}`}>查看这条资料 →</Link>
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '归档中…' : '归档'}
        </button>
      </div>
    </form>
  )
}
