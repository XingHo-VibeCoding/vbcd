import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
import { logout } from './api/auth.js'
import { request } from './api/client.js'
import { lazy, Suspense } from 'react'

// 后台控制台：lazy 加载，AntD/Refine 大依赖只在进 /admin 时才下载，不拖累主站首屏
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

// 主导航项（桌面顶栏 + 移动 tab bar 共用同一份，保证两处一致）
const NAV_ITEMS = [
  { to: '/', label: '主页', icon: '🏠', end: true },
  { to: '/notes', label: '档案', icon: '📁' },
  { to: '/log', label: '日志', icon: '📋' },
  { to: '/agent', label: 'agent', icon: '✨' },
  { to: '/about', label: '关于', icon: '👤' },
]

function LogoutButton({ className = '' }) {
  const navigate = useNavigate()
  async function onLogout() {
    try {
      await logout()
    } catch {
      // 登出失败也不阻塞跳转
    }
    navigate('/login', { replace: true })
  }
  return (
    <button type="button" className={className} onClick={onLogout}>
      退出
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
  const isImage = bg?.type === 'image' && images.length > 0
  const interval = conf.interval || 6000
  const [idx, setIdx] = useState(0)

  // 主题或图集变化时归零重播
  useEffect(() => { setIdx(0) }, [theme, images.length])
  // 自动轮播：淡入淡出
  useEffect(() => {
    if (!isImage || images.length < 2) return undefined
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [isImage, images.length, interval])

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
function DesktopNav({ authEnabled }) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 hidden md:block
                 border-b border-white/20 bg-white/40 shadow-sm backdrop-blur-xl
                 dark:border-white/5 dark:bg-slate-900/50"
    >
      <div className="mx-auto flex h-16 w-[90%] max-w-6xl items-center justify-between px-4">
        <NavLink to="/" className="flex items-center gap-2.5 text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple-500 text-sm text-white">
            b
          </span>
          buddy
        </NavLink>
        <nav className="flex items-center gap-1" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-brand text-white shadow-lg shadow-brand-glow'
                    : 'text-slate-500 hover:bg-brand/10 hover:text-brand dark:text-slate-400 dark:hover:text-brand-dark-text'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {authEnabled ? (
            <LogoutButton className="ml-1 rounded-full px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-danger dark:text-slate-400 dark:hover:text-danger" />
          ) : null}
        </nav>
      </div>
    </header>
  )
}

// 移动底部玻璃 tab bar（<768px）：fixed bottom-0，图标+文字
function MobileTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around
                 border-t border-white/20 bg-white/55 backdrop-blur-xl
                 dark:border-white/5 dark:bg-slate-900/55 md:hidden"
      aria-label="主导航"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition-colors ${
              isActive
                ? 'text-brand dark:text-brand-dark-text'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  const { pathname } = useLocation()
  const isAdmin = /^\/admin(?:\/|$)/.test(pathname)
  const isAgent = /^\/agent(?:\/|$)/.test(pathname)
  // 隐私模块默认关闭：读 /api/health 的 auth_enabled，决定是否显示「退出」与登录页
  const [authEnabled, setAuthEnabled] = useState(false)
  // L0 背景 + 站点视觉配置（site.json）
  const [site, setSite] = useState(null)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    request('/api/health')
      .then((data) => setAuthEnabled(Boolean(data?.auth_enabled)))
      .catch(() => setAuthEnabled(false))
    // site.json（含 background/social/hotspots/projects）；失败不阻塞
    request('/api/me')
      .then((d) => setSite(d?.site ?? null))
      .catch(() => setSite(null))
    // 背景图跟随当前主题：直接读 <html> 的 data-theme（首屏脚本已写）
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    // 监听主题切换：切换时换背景图
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="app font-serif text-slate-900 dark:text-slate-100">
      <BackgroundLayer site={site} theme={theme} effectsEnabled={!isAdmin && !isAgent} />
      <DesktopNav authEnabled={authEnabled} />
      <MobileTabBar />

      {/* 内容区：桌面顶出导航高(16*4=64px→pt-20 留余量)，移动底出 tab bar(16*4=64→pb-20) */}
      <main className={`${isAdmin ? '' : 'site-main '}relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 pt-20 sm:px-6 md:pb-12 md:pt-24 lg:px-10`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/notes" element={<NoteListPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/tasks/:id/confirm" element={<TaskConfirmPage />} />
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
          <Route path="/login" element={authEnabled ? <LoginPage /> : <Navigate to="/" replace />} />
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
