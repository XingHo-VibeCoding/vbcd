import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import NoteListPage from './pages/NoteListPage.jsx'
import LogPage from './pages/LogPage.jsx'
import TaskConfirmPage from './pages/TaskConfirmPage.jsx'
import NoteDetailPage from './pages/NoteDetailPage.jsx'
import ImaNoteDetailPage from './pages/ImaNoteDetailPage.jsx'
import ArchivePage from './pages/ArchivePage.jsx'
import AgentPageV2 from './pages/AgentPageV2.jsx'
import AboutPage from './pages/AboutPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PlanningDraftConfirmPage from './pages/PlanningDraftConfirmPage.jsx'
import PlanningPage from './pages/PlanningPage.jsx'
import { logout } from './api/auth.js'
import { request } from './api/client.js'
import { lazy, Suspense } from 'react'

// 后台控制台：lazy 加载，AntD/Refine 大依赖只在进 /admin 时才下载，不拖累主站首屏
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

// 主导航项（桌面顶栏 + 移动 tab bar 共用同一份，保证两处一致）
const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/notes', label: 'Archive', icon: '📁' },
  { to: '/planning', label: 'Planner', icon: '🧭' },
  { to: '/log', label: 'Journal', icon: '📋' },
  { to: '/agent', label: 'Agent', icon: '✨' },
  { to: '/about', label: 'About', icon: '👤' },
]

function LogoutButton({ className = '' }) {
  async function onLogout() {
    try {
      await logout()
    } catch {
      // 登出失败也不阻塞跳转
    }
    window.location.assign('/login')
  }
  return (
    <button type="button" className={className} onClick={onLogout} aria-label="Logout">
      <span className="nav-l1">Logout</span>
      <span className="nav-l2" aria-hidden="true">Logout</span>
      <span className="nav-swash" aria-hidden="true" />
    </button>
  )
}

// 氛围动画只负责低负载的光层；背景图片本身不模糊、不参与动画。
function BackgroundAtmosphere({ theme, enabled }) {
  const [mobile, setMobile] = useState(false)
  const [paused, setPaused] = useState(true)
  const fireflies = [
    [8, 18, 11, 22], [19, 67, 9, 31], [31, 38, 13, 27], [43, 82, 9, 36],
    [55, 24, 11, 29], [66, 58, 9, 34], [77, 34, 13, 25], [89, 72, 9, 32],
    [14, 45, 9, 38], [27, 89, 11, 24], [39, 12, 9, 33], [51, 51, 13, 28],
    [72, 86, 9, 35], [84, 14, 11, 30], [94, 48, 9, 26], [61, 8, 9, 37],
  ]

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const smallScreen = window.matchMedia('(max-width: 767px)')
    const sync = () => setPaused(!enabled || reduceMotion.matches || document.hidden)
    const syncScreen = () => setMobile(smallScreen.matches)
    sync()
    syncScreen()
    reduceMotion.addEventListener?.('change', sync)
    smallScreen.addEventListener?.('change', syncScreen)
    document.addEventListener('visibilitychange', sync)
    return () => {
      reduceMotion.removeEventListener?.('change', sync)
      smallScreen.removeEventListener?.('change', syncScreen)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [enabled])

  if (!enabled) return null

  const shownFlies = fireflies.slice(0, mobile ? 6 : 16)
  return (
    <div aria-hidden="true" className={`background-atmosphere ${paused ? 'is-paused' : ''}`}>
      {theme === 'dark' ? (
        <div className="firefly-field">
          {shownFlies.map(([left, top, size, duration], index) => (
            <span key={index} className={`firefly firefly-path-${index % 4}`} style={{
              left: `${left}%`, top: `${top}%`, width: `${size}px`, height: `${size}px`,
              '--drift-duration': `${duration}s`,
              '--drift-delay': `${-index * 1.7}s`,
              '--breathe-delay': `${-index * 0.43}s`,
            }} />
          ))}
        </div>
      ) : (
        <div className="waterlight-field">
          <span className="waterlight waterlight-one" />
          <span className="waterlight waterlight-two" />
          <span className="waterlight waterlight-three" />
        </div>
      )}
    </div>
  )
}

// L0 背景层：读 site.json 的 background——
//   type='image'    → 多图淡入淡出轮播（images[] 数组；也兼容单 src）
//   type='gradient' → 渐变兜底（或未配图时）
// 图片保持清晰；静态 veil 保证文字可读，氛围层位于 veil 之上、内容之下。
// interval 默认 6000ms，可在 site.json 的 background.interval 调。
function BackgroundLayer({ site, theme, effectsEnabled }) {
  const conf = site?.background || {}
  const bg = conf[theme]
  // 兼容两种配置：images[]（轮播）或 src（单图）
  const images = Array.isArray(bg?.images) && bg.images.length
    ? bg.images
    : (bg?.src ? [bg.src] : [])
  const isImage = conf.enabled !== false && bg?.type === 'image' && images.length > 0
  const interval = conf.interval || 6000
  const [idx, setIdx] = useState(0)

  // 主题或图集变化时归零重播
  useEffect(() => { setIdx(0) }, [theme, images.length])
  // 自动轮播：淡入淡出
  useEffect(() => {
    if (!isImage || conf.autoplay === false || images.length < 2) return undefined
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [isImage, conf.autoplay, images.length, interval])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-9 overflow-hidden">
      {isImage ? (
        images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out
                        ${i === idx ? 'opacity-100' : 'opacity-0'}`}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ))
      ) : (
        <div className="absolute inset-0 z-0 h-full w-full bg-gradient-to-br from-pink-50 via-rose-50 to-indigo-50
                        dark:from-slate-950 dark:via-slate-900 dark:to-fuchsia-950" />
      )}
      {/* 静态 veil：不做亮度脉冲，避免影响全页阅读对比 */}
      <div className="absolute inset-0 z-10 bg-white/85 dark:bg-slate-950/50" />
      <div className="absolute inset-0 z-20">
        <BackgroundAtmosphere theme={theme} enabled={effectsEnabled} />
      </div>
    </div>
  )
}

// 桌面顶部玻璃导航（>=768px）：fixed top-0，半透明 + backdrop-blur
// 品牌名读站点配置（site.site.title 双层兼容），admin 改站名后此处与标签页同步变化
// 导航品牌 logo：admin 配置了头像（profile.avatar）时显示头像图，加载失败回退品牌名首字母。
function BrandMark({ brand, avatar }) {
  const [broken, setBroken] = useState(false)
  const showAvatar = avatar && !broken
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brand to-purple-500 text-sm text-white" aria-hidden="true">
      {showAvatar ? (
        <img
          className="h-full w-full object-cover"
          src={avatar}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        brand.trim().charAt(0).toLowerCase() || 'b'
      )}
    </span>
  )
}

function DesktopNav({ isAuthenticated, showJournal, site, avatar }) {
  const brand = site?.site?.title || site?.title || 'buddy'
  const navItems = NAV_ITEMS.filter((item) => item.to !== '/log' || showJournal)
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 hidden md:block
                 border-b border-white/20 bg-white/40 shadow-sm backdrop-blur-xl
                 dark:border-white/5 dark:bg-slate-900/50"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <NavLink to="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
          <BrandMark brand={brand} avatar={avatar} />
          {brand}
        </NavLink>
        <nav className="flex items-center gap-1" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-tab inline-flex h-11 shrink-0 items-center rounded-xl px-3.5 text-slate-500 hover:text-brand dark:text-slate-400 dark:hover:text-brand-dark-text${isActive ? ' nav-tab-active' : ''}`
              }
            >
              <span className="nav-l1">{item.label}</span>
              <span className="nav-l2" aria-hidden="true">{item.label}</span>
              <span className="nav-swash" aria-hidden="true" />
            </NavLink>
          ))}
          {isAuthenticated ? (
            <LogoutButton className="nav-tab inline-flex h-11 shrink-0 cursor-pointer items-center rounded-xl border-0 bg-transparent px-3.5 text-slate-500 dark:text-slate-400" />
          ) : null}
        </nav>
      </div>
    </header>
  )
}

// 移动底部玻璃 tab bar（<768px）：fixed bottom-0，图标+文字
function MobileTabBar({ showJournal }) {
  const navItems = NAV_ITEMS.filter((item) => item.to !== '/log' || showJournal)
  return (
    <nav
      data-mobile-nav="true"
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around
                 border-t border-white/20 bg-white/55 backdrop-blur-xl
                 dark:border-white/5 dark:bg-slate-900/55 md:hidden"
      aria-label="主导航"
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-1 font-sans text-xs font-bold transition-colors ${
              isActive
                ? 'text-brand dark:text-brand-dark-text'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none" aria-hidden="true">
            {item.icon}
          </span>
          <span className="tabbar-en">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// 移动端品牌栏：只保留站点身份，不复制桌面主导航。
// 品牌名与桌面导航同源：读站点配置 site.title，回退 buddy
function MobileBrandBar({ site, avatar }) {
  const brand = site?.site?.title || site?.title || 'buddy'
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[52px] border-b border-white/20 bg-white/55 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/55 md:hidden">
      <NavLink
        to="/"
        aria-label="返回 buddy 主页"
        className="mx-auto flex h-full w-full max-w-6xl items-center gap-2 px-4 font-sans text-base font-black text-slate-900 dark:text-slate-100 sm:px-6"
      >
        <BrandMark brand={brand} avatar={avatar} />
        {brand}
      </NavLink>
    </header>
  )
}

export default function App() {
  const { pathname } = useLocation()
  const isAdmin = /^\/admin(?:\/|$)/.test(pathname)
  const isAgent = /^\/agent(?:\/|$)/.test(pathname)
  const mainSpacing = isAdmin
    ? 'pt-20 pb-20 md:pt-24 md:pb-12'
    : 'pt-[calc(52px+1rem)] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-24 md:pb-12'
  // 两种鉴权模式都开放登录页：全站隐私模式或公开读/登录写模式。
  // null 表示健康检查尚未完成，避免直接打开 /login 时误跳回首页。
  const [authRequired, setAuthRequired] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(null)
  const showJournal = isAuthenticated === true
  // L0 背景 + 站点视觉配置（site.json）
  const [site, setSite] = useState(null)
  const [avatar, setAvatar] = useState(null)
  const [theme, setTheme] = useState('light')
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (isAdmin || !window.visualViewport) return undefined
    const mobile = window.matchMedia('(max-width: 767px)')
    const viewport = window.visualViewport
    const syncViewport = () => {
      if (!mobile.matches) {
        setKeyboardOpen(false)
        return
      }
      const height = Math.round(viewport.height)
      const focusedTextField = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
      const open = window.innerHeight - viewport.height > 120 && focusedTextField
      document.documentElement.style.setProperty('--app-visual-height', `${height}px`)
      setKeyboardOpen(Boolean(open && isAgent))
    }
    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)
    mobile.addEventListener?.('change', syncViewport)
    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
      mobile.removeEventListener?.('change', syncViewport)
      document.documentElement.style.removeProperty('--app-visual-height')
      setKeyboardOpen(false)
    }
  }, [isAdmin, isAgent])

  useEffect(() => {
    request('/api/health')
      .then((data) => {
        setAuthRequired(Boolean(data?.auth_enabled || data?.auth_write_required))
        setIsAuthenticated(Boolean(data?.authenticated))
      })
      .catch(() => {
        setAuthRequired(false)
        setIsAuthenticated(false)
      })
    // site.json（含 background/social/hotspots/projects）；profile.avatar 供导航 logo 使用；失败不阻塞
    request('/api/me')
      .then((d) => {
        setSite(d?.site ?? null)
        setAvatar(d?.profile?.avatar || null)
      })
      .catch(() => {
        setSite(null)
        setAvatar(null)
      })
    // 背景图跟随当前主题：直接读 <html> 的 data-theme（首屏脚本已写）
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    // 监听主题切换：切换时换背景图
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // 站名/副标题 → 浏览器标签标题。
  // 背景：admin 可配置 site.title/subtitle，但主站此前没有任何渲染点消费站名，
  // 标签页永远是 index.html 里硬编码的「buddy — 会成长的个人助手」。
  // site.json 存储格式分裂：title/subtitle 在嵌套 site 键下（site.site.title），
  // 取值做双层兼容；读不到时回退 index.html 的默认标题。
  useEffect(() => {
    const title = site?.site?.title || site?.title || ''
    const subtitle = site?.site?.subtitle || site?.subtitle || ''
    document.title = title ? `${title}${subtitle ? ` — ${subtitle}` : ''}` : 'buddy — 会成长的个人助手'
  }, [site])

  return (
    <div className="app font-serif text-slate-900 dark:text-slate-100" data-keyboard-open={keyboardOpen ? 'true' : undefined}>
      <BackgroundLayer site={site} theme={theme} effectsEnabled={!isAdmin && !isAgent} />
      {!isAdmin ? <MobileBrandBar site={site} avatar={avatar} /> : null}
      <DesktopNav isAuthenticated={isAuthenticated === true} showJournal={showJournal} site={site} avatar={avatar} />
      <MobileTabBar showJournal={showJournal} />

      {/* 主站移动端只保留 16px 顶部呼吸空间；底部为 tab bar 高度 + 安全区。桌面维持原间距，admin 维持原规则。 */}
      <main className={`${isAdmin ? '' : 'site-main '}relative z-10 mx-auto w-full max-w-6xl px-4 ${mainSpacing} sm:px-6 lg:px-10`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/notes" element={<NoteListPage />} />
          <Route
            path="/log"
            element={isAuthenticated === null
              ? <div role="status" className="hint">正在检查登录状态…</div>
              : isAuthenticated
                ? <LogPage />
                : authRequired
                  ? <Navigate to="/login?from=/log" replace />
                  : <Navigate to="/" replace />}
          />
          <Route path="/tasks/:id/confirm" element={<TaskConfirmPage />} />
          <Route path="/planning/drafts/:id/confirm" element={<PlanningDraftConfirmPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/notes/:id" element={<NoteDetailPage />} />
          {/* F15b · ima 笔记详情（只读）：静态段 ima 优先于动态段 :id（/notes/ima 落到重定向而非 id="ima" 的资料查询） */}
          <Route path="/notes/ima" element={<Navigate to="/notes?src=ima&panel=notes" replace />} />
          <Route path="/notes/ima/:docid" element={<ImaNoteDetailPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          {/* 旧入口重定向：新建资料 → 归档页；任务 / 确认记录 → 日志页 */}
          <Route path="/new" element={<Navigate to="/archive" replace />} />
          <Route path="/tasks" element={<Navigate to="/log" replace />} />
          <Route path="/confirmations" element={<Navigate to="/log?tab=confirm" replace />} />
          <Route path="/agent" element={<AgentPageV2 />} />
          <Route path="/agent-v2" element={<Navigate to="/agent" replace />} />
          <Route path="/ask" element={<Navigate to="/agent" replace />} />
          <Route path="/about" element={<AboutPage />} />
          <Route
            path="/login"
            element={authRequired === null
              ? <div role="status" className="hint">正在检查登录状态…</div>
              : authRequired ? <LoginPage /> : <Navigate to="/" replace />}
          />
          {/* 后台控制台：/admin 及子路径全部交给 Refine 的 AdminApp */}
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div style={{ padding: 24 }}>后台加载中…</div>}>
                <AdminApp />
              </Suspense>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
