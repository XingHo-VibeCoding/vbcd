import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import NoteListPage from './pages/NoteListPage.jsx'
import NoteCreatePage from './pages/NoteCreatePage.jsx'
import NoteDetailPage from './pages/NoteDetailPage.jsx'
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
        <nav className="nav">
          <Link to="/">资料列表</Link>
          <Link to="/new">新建资料</Link>
          {authEnabled ? <LogoutButton /> : null}
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<NoteListPage />} />
          <Route path="/new" element={<NoteCreatePage />} />
          <Route path="/notes/:id" element={<NoteDetailPage />} />
          <Route path="/login" element={authEnabled ? <LoginPage /> : <Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Day 8 联调 · 数据存于本项目 data/ 目录
      </footer>
    </div>
  )
}
