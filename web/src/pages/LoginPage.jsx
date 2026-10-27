import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login } from '../api/auth.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const requestedPath = searchParams.get('from') || searchParams.get('to') || '/'
  const from = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(password)
      // 整页重新加载，让 App 重新读取 /api/session 后更新 Journal/后台权限状态。
      window.location.assign(from)
    } catch (err) {
      // AUTH_FAILED / RATE_LIMITED / NETWORK 都直接展示后端文案
      setError(err.message || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="site-glass-card login-card login-page">
      <h2>登录</h2>
      <p className="hint">buddy 单人使用：口令只有你自己知道，服务端只存它的 bcrypt 哈希。</p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          口令
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="输入访问口令"
          />
        </label>

        {error ? <div className="error-bar">{error}</div> : null}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </div>
      </form>
    </section>
  )
}
