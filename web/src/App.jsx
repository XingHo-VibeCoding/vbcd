import { Link, Route, Routes } from 'react-router-dom'
import NoteListPage from './pages/NoteListPage.jsx'
import NoteCreatePage from './pages/NoteCreatePage.jsx'
import NoteDetailPage from './pages/NoteDetailPage.jsx'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>buddy</h1>
        <p className="subtitle">会成长的个人助手 · 第一版骨架</p>
        <nav className="nav">
          <Link to="/">资料列表</Link>
          <Link to="/new">新建资料</Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<NoteListPage />} />
          <Route path="/new" element={<NoteCreatePage />} />
          <Route path="/notes/:id" element={<NoteDetailPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Day 7 骨架 · 数据暂存于浏览器本地（localStorage）
      </footer>
    </div>
  )
}
