import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import NoteListPage from './pages/NoteListPage.jsx'
import LogPage from './pages/LogPage.jsx'
import TaskConfirmPage from './pages/TaskConfirmPage.jsx'
import NoteDetailPage from './pages/NoteDetailPage.jsx'
import ImaNoteDetailPage from './pages/ImaNoteDetailPage.jsx'
import ArchivePage from './pages/ArchivePage.jsx'
import KbAskPage from './pages/KbAskPage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { logout } from './api/auth.js'
import { request } from './api/client.js'

function LogoutButton() {
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
    <button type="button" className="logout" onClick={onLogout}>
      退出
    </button>
  )
}

export default function App() {
  // 隐私模块默认关闭：读 /api/health 的 auth_enabled，决定是否显示「退出」与登录页
  const [authEnabled, setAuthEnabled] = useState(false)

  useEffect(() => {
    request('/api/health')
      .then((data) => setAuthEnabled(Boolean(data?.auth_enabled)))
      .catch(() => setAuthEnabled(false)) // 后端连不上按公开处理，页面会自行报错
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>buddy</h1>
        <p className="subtitle">会成长的个人助手 · 第一版骨架</p>
        {/* Day 13：链接换成 NavLink —— 当前项自动获得 aria-current="page"（无障碍导航标签）。
            「主页」要加 end，否则 /notes、/about 等所有路径都会把它也算成当前项。
            视觉上不加当前项标记（使用者未要求，不擅自加）。 */}
        <nav className="nav">
          <NavLink to="/" end>
            主页
          </NavLink>
          <NavLink to="/notes">档案</NavLink>
          <NavLink to="/log">日志</NavLink>
          <NavLink to="/ask">agent</NavLink>
          <NavLink to="/about">关于</NavLink>
          {authEnabled ? <LogoutButton /> : null}
        </nav>
      </header>

      <main className="app-main">
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
          <Route path="/ask" element={<KbAskPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={authEnabled ? <LoginPage /> : <Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Day 8 联调 · 数据存于本项目 data/ 目录
      </footer>
    </div>
  )
}
