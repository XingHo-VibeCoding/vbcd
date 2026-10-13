// Agent 双卡工作区：左侧当前会话，右侧消息与输入共享主卡。
// 对话内展示完整草案并确认，历史仍通过真实会话接口恢复。
import { useEffect, useRef, useState } from 'react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import MarkdownContent from '../components/MarkdownContent.jsx'
import ToolFallback from '../agent/ToolFallback.jsx'
import { useBuddyAgentRuntime, AgentConfirmationContext } from '../agent/runtime.js'
import '../agent/theme.css'

function AgentIcon({ name, size = 20 }) {
  const paths = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    chat: <path d="M4 4h16v13H9l-5 4Z" />,
    folder: <path d="M3 6h6l2 2h10v12H3Z" />,
    list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
    spark: <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7ZM20 2v4m-2-2h4" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function AgentPageV2() {
  const { runtime, sessionId, reset, busy, confirming, pendingConfirmation, confirmationActions } = useBuddyAgentRuntime()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  const menuRef = useRef(null)
  const sidebarRef = useRef(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const onChange = () => { setMobile(media.matches); setSidebarOpen(!media.matches) }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!mobile || !sidebarOpen) return
    const id = requestAnimationFrame(() => sidebarRef.current?.querySelector('button')?.focus())
    return () => cancelAnimationFrame(id)
  }, [mobile, sidebarOpen])

  function closeSidebar() {
    setSidebarOpen(false)
    if (mobile) requestAnimationFrame(() => menuRef.current?.focus())
  }

  function newConversation() {
    if (busy || confirming) return
    reset()
    if (mobile) closeSidebar()
  }

  function onSidebarKeyDown(event) {
    if (event.key === 'Escape') { closeSidebar(); return }
    if (!mobile || event.key !== 'Tab') return
    const buttons = [...sidebarRef.current.querySelectorAll('button')].filter((button) => !button.disabled)
    const first = buttons[0], last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return (
    <section className={`aui-page ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} aria-label="Agent 工作区">
      {mobile && sidebarOpen ? <button type="button" className="aui-sidebar-scrim" aria-label="关闭会话抽屉" onClick={closeSidebar} /> : null}
      <aside
        ref={sidebarRef} id="agent-conversations" className="aui-sidebar site-glass-card"
        inert={!sidebarOpen} aria-label="会话列表"
        role={mobile && sidebarOpen ? 'dialog' : undefined}
        aria-modal={mobile && sidebarOpen ? true : undefined}
        onKeyDown={onSidebarKeyDown}
      >
        <div className="aui-sidebar-heading">
          <h2>对话</h2>
          <button type="button" className="aui-icon-button" aria-label="收回会话列表" onClick={closeSidebar}><AgentIcon name="close" /></button>
        </div>
        <button type="button" className="aui-new-conversation" disabled={busy || confirming} onClick={newConversation}>
          <AgentIcon name="plus" size={18} />新建对话
        </button>
        <div className="aui-conversation-list">
          <h3>当前会话</h3>
          <div className="aui-current-conversation" aria-current="true">
            <AgentIcon name="chat" size={18} />
            <span>{sessionId ? '当前对话' : '新会话'}{busy ? <small>正在生成</small> : null}</span>
          </div>
          <p className="aui-session-hint">{sessionId ? '离开页面后，可恢复当前对话。' : '发送第一条消息，开始这段对话。'}</p>
        </div>
        <div className="aui-sidebar-footer">
          <span className="aui-owner-avatar">B</span>
          <div><strong>我的个人空间</strong><span>资料 · 对话 · 成长</span></div>
          <AgentIcon name="shield" size={18} />
        </div>
      </aside>

      <AgentConfirmationContext.Provider value={confirmationActions}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="aui-workspace site-glass-card" inert={mobile && sidebarOpen}>
          <header className="aui-workspace-header">
            <div className="aui-header-title">
              <button ref={menuRef} type="button" className="aui-icon-button" aria-label={sidebarOpen ? '收回会话列表' : '打开会话列表'} aria-expanded={sidebarOpen} aria-controls="agent-conversations" onClick={() => sidebarOpen ? closeSidebar() : setSidebarOpen(true)}><AgentIcon name="menu" /></button>
              <div><h1>Agent</h1><p>你的资料，随时接着聊</p></div>
            </div>
            <span className={`aui-runtime-status ${busy ? 'running' : ''}`} role="status"><span />{busy ? '正在生成' : confirming ? '正在确认' : pendingConfirmation ? '草案待确认' : '准备就绪'}</span>
          </header>
          <ThreadPrimitive.Viewport className="aui-viewport">
            <ThreadPrimitive.Empty>
              <div className="aui-welcome">
                <span className="aui-welcome-icon"><AgentIcon name="spark" size={32} /></span>
                <span className="aui-eyebrow">从一个问题开始</span>
                <h2>今天，想一起做些什么？</h2>
                <p>查找自己的资料，理清一个想法，<br />或把值得留下的内容整理归档。</p>
                <div className="aui-suggestions">
                  {[
                    ['folder', '查一查我的资料', '帮我查找个人知识库相关的资料'],
                    ['spark', '理清一个想法', '帮我梳理整理项目笔记的思路'],
                    ['list', '整理值得留下的内容', '如何整理学习资料？'],
                  ].map(([icon, label, prompt]) => (
                    <ThreadPrimitive.Suggestion key={label} className="aui-suggestion" prompt={prompt} send>
                      <AgentIcon name={icon} /><span>{label}</span><span aria-hidden="true">›</span>
                    </ThreadPrimitive.Suggestion>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>
            <div className="aui-messages"><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></div>
          </ThreadPrimitive.Viewport>
          <footer className="aui-composer-area">
            <ComposerPrimitive.Root className="aui-composer-panel">
              <ComposerPrimitive.Input className="aui-input" placeholder="问问你的资料，或说说你的想法…" aria-label="发送给 buddy 的消息" disabled={busy || confirming || Boolean(pendingConfirmation)} />
              <div className="aui-composer-actions">
                <span><AgentIcon name="shield" size={15} />写入资料前会征求你的确认</span>
                {busy ? <ComposerPrimitive.Cancel className="aui-send" aria-label="停止生成"><AgentIcon name="stop" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="aui-send" aria-label="发送消息" disabled={confirming || Boolean(pendingConfirmation)}><AgentIcon name="arrow" /></ComposerPrimitive.Send>}
              </div>
            </ComposerPrimitive.Root>
            <p className="aui-input-hint">{busy ? '生成期间，请先停止再新建对话。' : confirming ? '正在记录你的决定…' : pendingConfirmation ? '草案尚未保存，请先使用对话内的确认或拒绝按钮。' : 'Enter 发送 · Shift + Enter 换行'}<span>buddy</span></p>
          </footer>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
      </AgentConfirmationContext.Provider>
    </section>
  )
}

function UserMessage() {
  return <MessagePrimitive.Root className="aui-row user"><div className="aui-bubble user"><MessagePrimitive.Content /></div></MessagePrimitive.Root>
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-row assistant">
      <span className="aui-message-avatar"><AgentIcon name="spark" size={17} /></span>
      <div className="aui-bubble assistant">
        <MessagePrimitive.Content components={{
          Text: ({ text }) => text && String(text).trim() ? <MarkdownContent content={text} /> : null,
          tools: { Fallback: ToolFallback },
        }} />
      </div>
    </MessagePrimitive.Root>
  )
}
