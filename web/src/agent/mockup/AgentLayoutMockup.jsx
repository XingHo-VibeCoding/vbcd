// 布局验收样板：复用 assistant-ui 和 buddy 主题，所有会话与审批仅在内存中模拟。
// 用 ?state=approval&theme=dark&nav=closed&viewport=mobile 分享验收状态。
// 本入口不接入正式路由、不调用后端、不保存真实会话。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  ThreadPrimitive, useExternalStoreRuntime,
} from '@assistant-ui/react'
import MarkdownContent from '../../components/MarkdownContent.jsx'
import { applyTheme } from '../../theme.js'
import '../../styles.css'
import './mockup.css'

const SCENARIOS = [
  ['chat', '资料对话'], ['empty', '新会话'], ['approval', '待确认'],
  ['running', '生成中'], ['long', '长对话 / 滚动'], ['approved', '审批完成'],
]
const NAV = [['home', '主页', '🏠'], ['notes', '档案', '📁'], ['log', '日志', '📋'], ['agent', 'agent', '✨'], ['about', '关于', '👤']]
const query = new URLSearchParams(window.location.search)
const initialScenario = SCENARIOS.some(([key]) => key === query.get('state')) ? query.get('state') : 'chat'
let sequence = 0
const uniqueId = () => `mock-${++sequence}`
const greeting = '我想把个人知识库做得更好，应该从哪里开始？'
const answer = '可以先从**一条值得留下的资料**开始。\n\n我查到了你的项目记录，目前 buddy 已经具备资料录入、检索和归档能力。建议先建立一个简单的习惯：\n\n1. **收集**：保存今天真正有用的一条资料。\n2. **整理**：补上标题、来源和一两句自己的理解。\n3. **复用**：下次遇到问题时，先问自己的资料库。\n\n不用一次搭出完整体系。你想先整理学习资料，还是项目笔记？'
const draft = '## 今天的整理方法\n\n- 先收集一条值得留下的资料。\n- 添加清晰标题、来源与自己的理解。\n- 遇到问题先检索，再补充新内容。\n\n下一步：整理本周的项目笔记。'

function textMessage(role, text) {
  return {
    id: uniqueId(), role, content: [{ type: 'text', text }], createdAt: new Date(), metadata: {},
    ...(role === 'assistant' ? { status: { type: 'complete', reason: 'stop' } } : {}),
  }
}
function toolMessage(kind = 'search', status = 'complete') {
  return {
    id: uniqueId(), role: 'assistant', metadata: {}, status: { type: 'complete', reason: 'stop' },
    content: [{ type: 'tool-call', toolCallId: uniqueId(), toolName: kind, args: {}, argsText: '{}', result: { status } }],
  }
}
function sampleMessages(scenario) {
  if (scenario === 'empty') return []
  if (scenario === 'approval' || scenario === 'approved') return [
    textMessage('user', '把刚才讨论的整理方法归档到学习资料。'),
    textMessage('assistant', '我整理了一份归档草案，请先查看内容，再决定是否保存。'),
    toolMessage('archive', scenario === 'approved' ? 'approved' : 'pending'),
    ...(scenario === 'approved' ? [textMessage('assistant', '已归档《个人知识库整理方法》。你想继续整理项目笔记，还是开始查找下一份资料？')] : []),
  ]
  if (scenario === 'running') return [textMessage('user', greeting), toolMessage('search', 'running')]
  if (scenario === 'long') return Array.from({ length: 6 }, (_, i) => [
    textMessage('user', ['如何组织项目资料？', '检索时如何保留上下文？', '哪些资料值得归档？'][i % 3]),
    toolMessage(), textMessage('assistant', answer),
  ]).flat()
  return [textMessage('user', greeting), toolMessage(), textMessage('assistant', answer)]
}
function seedSessions(scenario) {
  return [
    { id: 'current', title: '个人知识库，从哪里开始', group: '今天', scenario, messages: sampleMessages(scenario) },
    { id: 'waiting', title: '整理本周的项目笔记', group: '今天', scenario: 'approval', messages: sampleMessages('approval') },
    { id: 'previous', title: 'Agent 架构与工具设计', group: '昨天', scenario: 'chat', messages: [textMessage('user', 'Agent 的工具层有什么作用？'), textMessage('assistant', '工具层把资料检索、读取和归档这些能力提供给 Agent。只读操作可以直接执行，写入操作需要先展示草案并获得确认。')] },
    { id: 'older', title: '一次只整理一条资料', group: '更早', scenario: 'chat', messages: [textMessage('user', '整理资料总是很难坚持。'), textMessage('assistant', '先把门槛降到每天一条。留下标题、来源和一句自己的理解，就已经有可以复用的记录。')] },
  ]
}
function Icon({ name, size = 20, ...props }) {
  const paths = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    folder: <path d="M3 6h6l2 2h10v12H3Z" />,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    spark: <><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z" /><path d="M20 2v4m-2-2h4" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    chat: <path d="M4 4h16v13H9l-5 4Z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    edit: <><path d="m16 3 5 5-12 12H4v-5Z" /><path d="m14 5 5 5" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.chat}</svg>
}
function UserMessage() {
  return <MessagePrimitive.Root className="bm-message bm-user"><div className="bm-user-bubble"><MessagePrimitive.Content /></div></MessagePrimitive.Root>
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="bm-message bm-assistant"><div className="bm-avatar" aria-hidden="true"><Icon name="spark" size={17} /></div><div className="bm-answer"><MessagePrimitive.Content components={{ Text: ({ text }) => text?.trim() ? <MarkdownContent content={text} /> : null, tools: { Fallback: MockTool } }} /></div></MessagePrimitive.Root>
}
function MockTool({ toolName, result }) {
  if (toolName === 'archive') {
    const state = result?.status || 'pending'
    return <div className={`bm-approval ${state}`}>
      <div className="bm-approval-heading"><span className="bm-approval-icon"><Icon name={state === 'approved' ? 'check' : 'shield'} /></span><div><strong>{state === 'pending' ? '请确认这次归档' : state === 'approved' ? '已确认并归档' : '已拒绝，未写入资料'}</strong><p>{state === 'pending' ? '确认后，将保存到你的学习资料。' : '这次决定已记录在操作审计中。'}</p></div><span className="bm-status">{state === 'pending' ? '待确认' : state === 'approved' ? '已完成' : '已拒绝'}</span></div>
      <div className="bm-draft-meta"><strong>个人知识库整理方法</strong><span>学习资料 · Markdown</span></div>
      <details className="bm-draft"><summary>查看完整草案 <Icon name="chevron" size={15} /></summary><MarkdownContent content={draft} /></details>
      {state === 'pending' ? <div className="bm-approval-actions"><button type="button" className="bm-primary" data-mock-decision="approved"><Icon name="check" size={16} />确认归档</button><button type="button" className="bm-secondary" data-mock-decision="rejected">拒绝</button><span>仅模拟操作</span></div> : null}
    </div>
  }
  const running = result?.status === 'running'
  return <details className="bm-tool"><summary><span className={running ? 'bm-spinner' : 'bm-tool-check'}>{running ? null : <Icon name="check" size={14} />}</span><span>{running ? '正在查询你的资料库' : '已查询资料库'}</span><span className="bm-tool-count">{running ? '检索中' : '3 条相关资料'}</span><Icon name="chevron" size={14} /></summary><div className="bm-tool-body"><p>工具：<code>search_notes</code> · 查询：个人知识库</p><ul><li>buddy 项目范围与设计路线</li><li>资料录入、检索和归档流程</li><li>Agent 工具注册与确认闸门</li></ul><details><summary>技术详情</summary><pre>{JSON.stringify({ tool: 'search_notes', query: '个人知识库', status: running ? 'running' : 'complete', sample: true }, null, 2)}</pre></details></div></details>
}

export default function AgentLayoutMockup() {
  const [sessions, setSessions] = useState(() => seedSessions(initialScenario))
  const [activeId, setActiveId] = useState('current')
  const [page, setPage] = useState('agent')
  const [scenario, setScenario] = useState(initialScenario)
  const [runningId, setRunningId] = useState(initialScenario === 'running' ? 'current' : null)
  const [navOpen, setNavOpen] = useState(window.innerWidth >= 768 && query.get('viewport') !== 'mobile')
  const [topNavHidden, setTopNavHidden] = useState(query.get('nav') === 'closed')
  const [smallScreen, setSmallScreen] = useState(window.innerWidth < 768)
  const [device, setDevice] = useState(query.get('viewport') === 'mobile' ? 'mobile' : 'auto')
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const [decisionBusy, setDecisionBusy] = useState(false)
  const timerRef = useRef(null)
  const noticeTimer = useRef(null)
  const runningRef = useRef(runningId)
  const dialogRef = useRef(null)
  const menuButton = useRef(null)
  const navRef = useRef(null)
  const topNavRef = useRef(null)
  const scrollRef = useRef({ y: 0, distance: 0, direction: 0 })
  const mobile = device === 'mobile' || smallScreen
  const active = sessions.find((s) => s.id === activeId)
  const messages = active?.messages || []
  const pending = messages.some((m) => m.content.some((p) => p.type === 'tool-call' && p.toolName === 'archive' && p.result?.status === 'pending'))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => { setSmallScreen(media.matches); if (media.matches) setNavOpen(false) }
    media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); clearTimeout(timerRef.current); clearTimeout(noticeTimer.current) }
  }, [])
  useEffect(() => {
    const next = new URLSearchParams({ state: scenario, theme, nav: topNavHidden ? 'closed' : 'open' })
    if (device === 'mobile') next.set('viewport', 'mobile')
    window.history.replaceState(null, '', `${window.location.pathname}?${next}`)
    applyTheme(theme)
  }, [scenario, theme, topNavHidden, device])
  useEffect(() => { if (dialog && !dialogRef.current?.open) dialogRef.current?.showModal() }, [dialog])
  useEffect(() => {
    if (mobile && navOpen) {
      const id = requestAnimationFrame(() => navRef.current?.querySelector('button')?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [mobile, navOpen])

  function notify(text) {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 5000)
  }
  const updateActive = useCallback((transform) => {
    setSessions((previous) => previous.map((session) => session.id === activeId ? { ...session, messages: transform(session.messages) } : session))
  }, [activeId])
  function setRunning(id) { runningRef.current = id; setRunningId(id) }
  function closeNav() { setNavOpen(false); if (mobile) menuButton.current?.focus() }
  function stopGeneration() {
    clearTimeout(timerRef.current)
    if (runningRef.current) updateActive((previous) => [...previous.map((m) => m.content.some((p) => p.type === 'tool-call' && p.result?.status === 'running') ? { ...m, content: m.content.map((p) => p.type === 'tool-call' ? { ...p, result: { status: 'stopped' } } : p) } : m), textMessage('assistant', '已停止本次生成。你可以继续提问，或切换到其他会话。')])
    setRunning(null)
  }
  function canSwitch() {
    if (runningRef.current || decisionBusy) { notify(decisionBusy ? '正在处理审批，请稍候。' : '当前会话正在生成，请先点击「停止」，再切换会话。'); return false }
    return true
  }
  function switchSession(id) {
    if (!canSwitch()) return
    setActiveId(id); setPage('agent'); setOpenMenu(null)
    setScenario(sessions.find((s) => s.id === id)?.scenario || 'chat')
    setTopNavHidden(false)
    scrollRef.current = { y: 0, distance: 0, direction: 0 }
    if (mobile) closeNav()
  }
  function newSession() {
    if (!canSwitch()) return
    const session = { id: uniqueId(), title: '新会话', group: '今天', scenario: 'empty', messages: [] }
    setSessions((previous) => [session, ...previous]); setActiveId(session.id); setScenario('empty'); setPage('agent')
    if (mobile) closeNav()
  }
  function loadScenario(value) {
    clearTimeout(timerRef.current); setDecisionBusy(false)
    const data = seedSessions(value)
    setSessions(data); setActiveId('current'); setScenario(value); setPage('agent'); setOpenMenu(null)
    setRunning(value === 'running' ? 'current' : null)
    setTopNavHidden(false)
    scrollRef.current = { y: 0, distance: 0, direction: 0 }
  }
  function openSessionDialog(type, session) {
    setOpenMenu(null)
    const hasPending = session.messages.some((m) => m.content.some((p) => p.type === 'tool-call' && p.toolName === 'archive' && p.result?.status === 'pending'))
    if (type === 'delete' && (session.id === runningRef.current || hasPending || decisionBusy)) { notify('生成中或待确认的会话不能删除。请先停止生成，或处理审批。'); return }
    setRenameValue(session.title); setDialog({ type, session })
  }
  function submitDialog(event) {
    event.preventDefault()
    const { type, session } = dialog
    if (type === 'rename') {
      if (!renameValue.trim()) return
      setSessions((previous) => previous.map((s) => s.id === session.id ? { ...s, title: renameValue.trim() } : s))
      notify('会话名称已更新（样例）。')
    } else {
      const remaining = sessions.filter((s) => s.id !== session.id)
      const next = remaining.length ? remaining : [{ id: uniqueId(), title: '新会话', group: '今天', scenario: 'empty', messages: [] }]
      setSessions(next)
      if (activeId === session.id) { setActiveId(next[0].id); setScenario(next[0].scenario) }
      notify('对话记录已删除（样例）。已归档资料与审计记录保留。')
    }
    dialogRef.current?.close(); setDialog(null)
  }
  function decide(decision) {
    if (decisionBusy || !pending) return
    setDecisionBusy(true); notify('正在处理审批（模拟）…')
    timerRef.current = setTimeout(() => {
      updateActive((previous) => [...previous.map((m) => ({ ...m, content: m.content.map((p) => p.type === 'tool-call' && p.toolName === 'archive' ? { ...p, result: { status: decision } } : p) })), textMessage('assistant', decision === 'approved' ? '已归档《个人知识库整理方法》。接下来，你想继续整理项目笔记吗？' : '已拒绝这次归档，没有写入资料。你可以修改草案后重新提出归档。')])
      setSessions((previous) => previous.map((s) => s.id === activeId ? { ...s, scenario: decision === 'approved' ? 'approved' : 'chat' } : s))
      setScenario(decision === 'approved' ? 'approved' : 'chat'); setDecisionBusy(false)
      notify(decision === 'approved' ? '审批完成，Agent 已继续回复（模拟）。' : '已拒绝归档，可以继续对话（模拟）。')
    }, 900)
  }
  const send = useCallback(async (message) => {
    if (runningRef.current || decisionBusy) return
    if (pending) { notify('请先确认或拒绝上面的归档草案，再继续当前对话。'); return }
    const text = typeof message.content === 'string' ? message.content : message.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    if (!text.trim()) return
    const tool = toolMessage('search', 'running')
    const currentId = activeId
    setRunning(currentId)
    setSessions((previous) => previous.map((s) => s.id === currentId ? { ...s, group: '今天', title: s.messages.length ? s.title : text.slice(0, 22), scenario: 'chat', messages: [...s.messages, textMessage('user', text), tool] } : s))
    setScenario('chat')
    timerRef.current = setTimeout(() => {
      setSessions((previous) => previous.map((s) => s.id === currentId ? { ...s, messages: [...s.messages.map((m) => m.id === tool.id ? { ...m, content: m.content.map((p) => ({ ...p, result: { status: 'complete' } })) } : m), textMessage('assistant', '这是布局样板中的模拟回复。\n\n正式版本会通过现有 Agent 接口查询你的资料。现在你可以检查消息宽度、工具详情、输入框位置，并继续试用会话切换。')] } : s))
      setRunning(null)
    }, 2200)
  }, [activeId, pending, decisionBusy])
  const adapter = useMemo(() => ({ messages, isRunning: Boolean(runningId), onNew: send, onCancel: async () => stopGeneration() }), [messages, runningId, send])
  const runtime = useExternalStoreRuntime(adapter)

  function onScroll(event) {
    if (mobile && navOpen) return
    if (topNavRef.current?.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return
    const y = event.currentTarget.scrollTop
    const previous = scrollRef.current
    const delta = y - previous.y
    if (Math.abs(delta) < 1) return
    const direction = Math.sign(delta)
    const distance = previous.direction === direction ? previous.distance + Math.abs(delta) : Math.abs(delta)
    scrollRef.current = { y, distance, direction }
    if (y <= 12 || (direction < 0 && distance >= 8)) setTopNavHidden(false)
    else if (direction > 0 && distance >= 24) setTopNavHidden(true)
  }
  function navKeyboard(event) {
    if (event.key === 'Escape') { closeNav(); return }
    if (!mobile || event.key !== 'Tab') return
    const focusable = [...navRef.current.querySelectorAll('button, a, input')].filter((el) => !el.disabled && el.getClientRects().length)
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  const pageHeader = <header className="bm-page-header"><div className="bm-header-left">{page === 'agent' && <button ref={menuButton} type="button" className="bm-icon-button bm-menu-toggle" aria-label={navOpen ? '收回会话列表' : '打开会话列表'} aria-expanded={navOpen} aria-controls="mockup-navigation" onClick={() => navOpen ? closeNav() : setNavOpen(true)}><Icon name="menu" /></button>}<div><h1>{page === 'agent' ? 'Agent' : NAV.find(([key]) => key === page)?.[1]}</h1><p>{page === 'agent' ? '你的资料，随时接着聊' : '全站导航收回行为预览'}</p></div></div><div className="bm-header-right">{page === 'agent' && <span className={`bm-live-state ${runningId ? 'running' : pending ? 'waiting' : ''}`}><span />{runningId ? '正在生成' : pending ? '等待确认' : '准备就绪'}</span>}<button type="button" className="bm-icon-button" aria-label={theme === 'light' ? '切换深色主题' : '切换浅色主题'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button></div></header>

  return <div className="bm-app">
    <div className="bm-preview-bar"><span className="bm-preview-label"><span className="bm-preview-dot" />布局验收样板<span className="bm-preview-note">样例数据 · 不连接后端</span></span><div className="bm-preview-controls"><label>状态<select value={scenario} onChange={(e) => loadScenario(e.target.value)}>{SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" onClick={() => { setDevice(device === 'mobile' ? 'auto' : 'mobile'); setNavOpen(false); setTopNavHidden(false) }}>{device === 'mobile' ? '桌面预览' : '手机预览'}</button><a href="/src/agent/mockup/desktop-preview.svg" target="_blank" rel="noreferrer">桌面稿</a><a href="/src/agent/mockup/mobile-preview.svg" target="_blank" rel="noreferrer">手机稿</a></div></div>
    <div className={`bm-frame ${navOpen && page === 'agent' ? 'nav-open' : 'nav-closed'} ${topNavHidden ? 'top-nav-hidden' : ''} ${device === 'mobile' ? 'bm-phone-preview' : ''}`} data-mobile={mobile}>
      {!mobile && <header ref={topNavRef} className="bm-topnav absolute inset-x-0 top-0 z-50 border-b border-white/20 bg-white/40 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/50" inert={topNavHidden}>
        <div className="mx-auto flex h-16 w-[90%] max-w-6xl items-center justify-between px-4">
          <button type="button" onClick={() => { if (!canSwitch()) return; setPage('home'); setTopNavHidden(false); scrollRef.current = { y: 0, distance: 0, direction: 0 } }} className="flex items-center gap-2.5 text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 bg-transparent">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple-500 text-sm text-white">b</span>buddy
          </button>
          <nav className="flex items-center gap-1" aria-label="主导航">
            {NAV.map(([key, label]) => <button type="button" key={key} aria-current={page === key ? 'page' : undefined} onClick={() => { if (!canSwitch()) return; setPage(key); setOpenMenu(null); setTopNavHidden(false); scrollRef.current = { y: 0, distance: 0, direction: 0 } }} className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${page === key ? 'bg-brand text-white shadow-lg shadow-brand-glow' : 'bg-transparent text-slate-500 hover:bg-brand/10 hover:text-brand dark:text-slate-400 dark:hover:text-brand-dark-text'}`}>{label}</button>)}
          </nav>
        </div>
      </header>}
      {mobile && <nav className="bm-mobile-tabbar absolute inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around border-t border-white/20 bg-white/55 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/55" aria-label="主导航" inert={topNavHidden}>
        {NAV.map(([key, label, icon]) => <button type="button" key={key} aria-current={page === key ? 'page' : undefined} onClick={() => { if (!canSwitch()) return; setPage(key); setOpenMenu(null); setNavOpen(false); setTopNavHidden(false); scrollRef.current = { y: 0, distance: 0, direction: 0 } }} className={`flex flex-1 flex-col items-center justify-center gap-0.5 bg-transparent py-1 text-[10px] font-bold transition-colors ${page === key ? 'text-brand dark:text-brand-dark-text' : 'text-slate-500 dark:text-slate-400'}`}><span className="text-lg leading-none" aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>}
      {!mobile && topNavHidden && <button type="button" className="bm-nav-reveal bm-icon-button" aria-label="重新显示顶部主导航" onClick={() => setTopNavHidden(false)}><Icon name="chevron" size={16} /></button>}
      {mobile && topNavHidden && <button type="button" className="bm-mobile-nav-reveal" aria-label="重新显示底部主导航" onClick={() => setTopNavHidden(false)}><Icon name="chevron" size={15} /></button>}
      {!mobile && page === 'agent' && <div className="bm-edge" aria-hidden="true" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setNavOpen(true) }} />}
      {mobile && page === 'agent' && navOpen && <button type="button" className="bm-scrim" aria-label="关闭导航抽屉" onClick={closeNav} />}
      <aside ref={navRef} id="mockup-navigation" className="bm-sidebar site-glass-card" inert={!navOpen || page !== 'agent'} hidden={page !== 'agent'} aria-label="会话导航" role={mobile && navOpen ? 'dialog' : undefined} aria-modal={mobile && navOpen ? true : undefined} onKeyDown={navKeyboard}>
        <div className="bm-history-heading"><h2>对话</h2><button type="button" className="bm-icon-button" onClick={closeNav} aria-label="收回会话列表"><Icon name="close" size={18} /></button></div>
        <button type="button" className="bm-new-chat" onClick={newSession}><Icon name="plus" size={18} />新建对话</button>
        <div className="bm-session-list" aria-label="历史会话">{['今天', '昨天', '更早'].map((group) => <div className="bm-session-group" key={group}><h2>{group}</h2>{sessions.filter((s) => s.group === group).map((session) => {
          const waiting = session.messages.some((m) => m.content.some((p) => p.type === 'tool-call' && p.toolName === 'archive' && p.result?.status === 'pending'))
          return <div className={`bm-session ${activeId === session.id && page === 'agent' ? 'active' : ''}`} key={session.id}><button type="button" className="bm-session-main" onClick={() => switchSession(session.id)} aria-current={activeId === session.id && page === 'agent' ? 'true' : undefined}><Icon name="chat" size={16} /><span className="bm-session-text"><span>{session.title}</span>{waiting ? <small>待确认</small> : runningId === session.id ? <small>正在生成</small> : null}</span></button><button type="button" className="bm-session-more bm-icon-button" aria-label={`管理会话：${session.title}`} aria-expanded={openMenu === session.id} onClick={() => setOpenMenu(openMenu === session.id ? null : session.id)}><Icon name="more" size={16} /></button>{openMenu === session.id && <div className="bm-session-menu"><button type="button" onClick={() => openSessionDialog('rename', session)}><Icon name="edit" size={15} />重命名</button><button type="button" className="bm-danger-text" onClick={() => openSessionDialog('delete', session)}><Icon name="trash" size={15} />删除对话</button></div>}</div>
        })}</div>)}</div>
        <div className="bm-sidebar-footer"><span className="bm-owner-avatar">B</span><div><strong>我的个人空间</strong><span>资料 · 对话 · 成长</span></div><Icon name="shield" size={17} /></div>
      </aside>
      <main className="bm-main">
        {page !== 'agent' && pageHeader}
        {page === 'agent' ? <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="bm-thread">
          <section className="bm-dialogue-card site-glass-card" aria-label="Agent 对话">
            {pageHeader}
          <ThreadPrimitive.Viewport key={activeId} className={`bm-viewport ${!messages.length ? 'empty' : ''}`} onScroll={onScroll}>
            <ThreadPrimitive.Empty><div className="bm-welcome"><span className="bm-welcome-icon"><Icon name="spark" size={32} /></span><span className="bm-eyebrow">从一个问题开始</span><h2>今天，想一起做些什么？</h2><p>查找自己的资料，理清一个想法，<br />或把值得留下的内容整理归档。</p><div className="bm-suggestions">{[['folder', '查一查我的资料', '帮我查找个人知识库相关的资料'], ['spark', '理清一个想法', '帮我整理项目笔记的思路'], ['list', '整理值得留下的内容', '如何整理学习资料？']].map(([icon, title, prompt]) => <button key={title} type="button" onClick={() => send({ content: [{ type: 'text', text: prompt }] })}><Icon name={icon} /><span>{title}</span><Icon name="chevron" size={15} /></button>)}</div></div></ThreadPrimitive.Empty>
            <div className="bm-message-list" aria-busy={Boolean(runningId)} onClick={(event) => { const button = event.target.closest('[data-mock-decision]'); if (button) decide(button.dataset.mockDecision) }} inert={decisionBusy}><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></div>
          </ThreadPrimitive.Viewport>
          <section className="bm-composer-wrap" aria-label="消息输入">{pending || decisionBusy ? <div className="bm-composer-notice"><Icon name="shield" size={15} />{decisionBusy ? '正在处理审批，完成后会继续回复…' : '请先确认或拒绝上面的草案，再继续对话。'}</div> : null}<ComposerPrimitive.Root className="bm-composer"><ComposerPrimitive.Input className="bm-input" placeholder={pending ? '处理归档草案后，继续聊…' : '问问你的资料，或说说你的想法…'} disabled={pending || decisionBusy || Boolean(runningId)} aria-label="发送给 buddy 的消息" /><div className="bm-composer-bottom"><span><Icon name="shield" size={14} />写入资料前会征求你的确认</span>{runningId ? <ComposerPrimitive.Cancel className="bm-send" aria-label="停止生成"><Icon name="stop" size={18} /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="bm-send" aria-label="发送消息" disabled={pending || decisionBusy}><Icon name="arrow" size={20} /></ComposerPrimitive.Send>}</div></ComposerPrimitive.Root><p className="bm-input-hint">{runningId ? '生成期间，停止后可切换会话。' : 'Enter 发送 · Shift + Enter 换行'}<span>buddy · 布局样板</span></p></section>
          </section>
        </ThreadPrimitive.Root></AssistantRuntimeProvider> : <div className="bm-content-scroll" onScroll={onScroll}><div className="bm-reading-page"><span className="bm-eyebrow">全站导航交互验收</span><h2>{page === 'home' ? '把每天的小发现，留下来。' : `在${NAV.find(([key]) => key === page)?.[1]}中继续阅读`}</h2><p className="bm-reading-intro">向下滚动，导航完全收回；向上滚动，导航重新出现。顶部主导航保持原来的位置与样式；向上滚动或点击顶部恢复按钮即可重新显示。</p>{Array.from({ length: 7 }, (_, i) => <article className="bm-reading-card" key={i}><span className="bm-eyebrow">{String(i + 1).padStart(2, '0')} / 示例内容</span><h3>{['整理自己的知识库', '让资料可以再次被找到', '记录一次学习的过程'][i % 3]}</h3><p>这里使用样例内容，供你验收普通页面的滚动和导航行为。正式开发时，这套导航会用于全站，让阅读区域保留足够的空间，也让各个页面之间的切换保持清晰。</p><p>全站入口始终位于原有主导航中；Agent 左栏只提供历史会话和新建对话入口。审批和工具状态仍然留在对话上下文中。</p></article>)}</div></div>}
        {notice && <div className="bm-toast" role="status"><Icon name="info" size={16} />{notice}<button type="button" className="bm-icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}
      </main>
    </div>
    <dialog ref={dialogRef} className="bm-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)}>{dialog && <form onSubmit={submitDialog}><span className="bm-dialog-icon"><Icon name={dialog.type === 'rename' ? 'edit' : 'trash'} size={24} /></span><h2>{dialog.type === 'rename' ? '给对话起个名字' : '删除这段对话？'}</h2>{dialog.type === 'rename' ? <label>会话名称<input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={60} required /></label> : <><p>“{dialog.session.title}”的对话记录将被删除。</p><p className="bm-muted">已归档资料与操作审计会保留。这次操作仅作用于样例数据。</p></>}<div className="bm-dialog-actions"><button type="button" className="bm-secondary" onClick={() => { dialogRef.current.close(); setDialog(null) }}>取消</button><button type="submit" className={dialog.type === 'delete' ? 'bm-destructive' : 'bm-primary'}>{dialog.type === 'rename' ? '保存名称' : '删除对话'}</button></div></form>}</dialog>
  </div>
}

createRoot(document.getElementById('root')).render(<AgentLayoutMockup />)
