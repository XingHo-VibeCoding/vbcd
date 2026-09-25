import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MarkdownContent from '../components/MarkdownContent.jsx'
import { streamKb } from '../api/kb.js'

// 知识库问答页（F9）：提问 → SSE 打字机输出 → 底部列出来源文件（可点击跳详情）。
// 每轮问答独立（本期不做多轮记忆）；新提问会清掉上一轮的展示。
export default function KbAskPage() {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  function ask(e) {
    e?.preventDefault()
    const question = q.trim()
    if (!question || streaming) return

    abortRef.current?.abort()
    setAnswer('')
    setSources([])
    setError('')
    setAsked(true)
    setStreaming(true)

    abortRef.current = streamKb(question, {
      onSources: (list) => setSources(list),
      onToken: (text) => setAnswer((prev) => prev + text),
      onError: (err) => {
        setError(err.message || '问答失败')
        setStreaming(false)
      },
      onDone: () => setStreaming(false),
    })
  }

  function stop() {
    abortRef.current?.abort()
    setStreaming(false)
  }

  return (
    <section>
      <form className="kb-ask-form" onSubmit={ask}>
        <input
          className="search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="向你的资料库提问，例如：WSL 里 Docker 怎么配？"
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" className="btn-ghost" onClick={stop}>
            停止
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!q.trim()}>
            提问
          </button>
        )}
      </form>

      {error ? <div className="error-bar">{error}</div> : null}

      {asked ? (
        <div className="card kb-answer">
          <h2>回答{streaming ? '…' : ''}</h2>
          <MarkdownContent content={answer} emptyHint={streaming ? '正在检索与生成…' : '（无内容）'} />
          {sources.length ? (
            <div className="kb-sources">
              <span className="kb-sources-label">来源：</span>
              {sources.map((s, i) => (
                <Link key={`${s.note_id}-${s.chunk_index}-${i}`} className="kb-source" to={`/notes/${encodeURIComponent(s.note_id)}`}>
                  {s.title || s.path}（第 {s.chunk_index + 1} 段）
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty">问点什么吧——回答只基于你 data/ 里的资料，答不上来会直说。</div>
      )}
    </section>
  )
}
