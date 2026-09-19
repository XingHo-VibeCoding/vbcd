import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNote } from '../api/notes'

const CATEGORIES = [
  { value: 'learning', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'work', label: '事务' },
]

export default function NoteCreatePage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('learning')
  const [tagsText, setTagsText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      createNote({ title, category, tags, source_url: sourceUrl, content })
      navigate('/')
    } catch (err) {
      // 适配层会抛带 code 的错误：VALIDATION_FAILED（缺字段）/ DUPLICATE（内容重复）
      setError(err.message || '保存失败')
    }
  }

  return (
    <section className="card">
      <h2>新建资料</h2>
      <p className="hint">保存到浏览器本地（localStorage），接后端后会落到资料目录</p>

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

        <label>
          正文 *
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="记录内容…"
          />
        </label>

        {error ? <div className="error-bar">{error}</div> : null}

        <div className="form-actions">
          <button type="submit" className="btn-primary">保存</button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/')}>返回列表</button>
        </div>
      </form>
    </section>
  )
}
