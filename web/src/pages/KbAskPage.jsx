import { useRef, useState } from 'react'
import MarkdownContent from '../components/MarkdownContent.jsx'
import { streamAgentChat } from '../api/agent.js'

// agent 对话页（F12）：多轮会话 + 工具调用可见。
// 消息流节点三种：user（用户气泡）/ assistant（agent 回答，Markdown 渲染）/ tool（工具调用折叠行）。
// session_id 记在本组件 state——刷新即新会话（本期不留持久会话切换 UI）。
let uid = 0
const nid = () => `m${++uid}`

export default function KbAskPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([]) // {id, role:'user'|'assistant'|'tool', text, toolName?, toolArgs?, toolOk?, streaming?}
  const [sessionId, setSessionId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  function scrollDown() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  function appendMsg(msg) {
    setMessages((prev) => [...prev, msg])
    scrollDown()
  }
  function patchLast(id, patch) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    scrollDown()
  }

  function send(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return

    abortRef.current?.abort()
    setError('')
    setInput('')
    setBusy(true)

    appendMsg({ id: nid(), role: 'user', text })
    const assistantId = nid()
    appendMsg({ id: assistantId, role: 'assistant', text: '', streaming: true })

    abortRef.current = streamAgentChat(text, {
      sessionId,
      onEvent: (ev) => {
        if (ev.type === 'token') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + (ev.text ?? '') } : m)),
          )
          scrollDown()
        } else if (ev.type === 'tool_call') {
          appendMsg({
            id: nid(),
            role: 'tool',
            toolName: ev.name,
            toolArgs: ev.args,
            toolOk: null, // 待 tool_result 回填
            pending: true,
          })
        } else if (ev.type === 'tool_result') {
          setMessages((prev) => {
            // 回填最近一条 pending 的同名 tool 行
            const idx = [...prev].reverse().findIndex((m) => m.role === 'tool' && m.pending && m.toolName === ev.name)
            if (idx === -1) return prev
            const real = prev.length - 1 - idx
            const next = [...prev]
            next[real] = { ...next[real], toolOk: ev.ok, toolResult: ev.result, pending: false }
            return next
          })
          scrollDown()
        } else if (ev.type === 'confirmation_required') {
          appendMsg({
            id: nid(),
            role: 'tool',
            toolName: 'confirmation',
            confirm: ev,
            text: '这个动作需要你先确认',
          })
          scrollDown()
        }
      },
      onError: (err) => {
        setError(err.message || '对话失败')
        patchLast(assistantId, { streaming: false })
        setBusy(false)
      },
      onDone: (info) => {
        if (info?.session_id) setSessionId(info.session_id)
        patchLast(assistantId, { streaming: false })
        setBusy(false)
      },
    })
  }

  function stop() {
    abortRef.current?.abort()
    setBusy(false)
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }

  function reset() {
    abortRef.current?.abort()
    setMessages([])
    setSessionId(null)
    setError('')
    setBusy(false)
  }

  return (
    <section>
      <div className="agent-head">
        <h2>agent</h2>
        {sessionId ? (
          <button type="button" className="btn-ghost" onClick={reset} title="清空并开始新会话">
            新会话
          </button>
        ) : null}
      </div>

      <div className="agent-chat">
        {messages.length === 0 ? (
          <div className="empty">
            说点什么——我可以查你的资料库、帮你归档整理，写操作会先给你看草案再等你确认。
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="chat-row user">
                <div className="chat-bubble user">{m.text}</div>
              </div>
            ) : m.role === 'assistant' ? (
              <div key={m.id} className="chat-row assistant">
                <div className="chat-bubble assistant">
                  <MarkdownContent content={m.text} emptyHint={m.streaming ? '思考中…' : '（无内容）'} />
                </div>
              </div>
            ) : m.toolName === 'confirmation' ? (
              <div key={m.id} className="chat-tool confirm">
                ⏸ 需要确认：{m.confirm?.draft?.title ? `归档《${m.confirm.draft.title}》` : '写操作'}
                {m.confirm?.confirmation_id ? <code>#{m.confirm.confirmation_id}</code> : null}
                <span className="chat-tool-hint">请到「日志 → 确认留痕」处理</span>
              </div>
            ) : (
              <details key={m.id} className={`chat-tool ${m.toolOk === false ? 'fail' : ''}`}>
                <summary>
                  🔧 {m.toolName}
                  {m.toolArgs ? <code>{JSON.stringify(m.toolArgs).slice(0, 60)}</code> : null}
                  {m.pending ? <em>…</em> : m.toolOk === true ? <em className="ok">✓</em> : m.toolOk === false ? <em className="bad">✗</em> : null}
                </summary>
                {m.toolResult ? <pre>{m.toolResult}</pre> : null}
              </details>
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <div className="error-bar">{error}</div> : null}

      <form className="kb-ask-form" onSubmit={send}>
        <input
          className="search-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问资料库、或让我帮你归档 / 建任务…"
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn-ghost" onClick={stop}>
            停止
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!input.trim()}>
            发送
          </button>
        )}
      </form>
    </section>
  )
}
