import { getSession } from '../services/sessions.js'

// 隐私模块（登录/鉴权）默认关闭：仅当 AUTH_ENABLED=1 时才要求有效会话。
// 默认公开 = 任何人可读写；启用隐私后，未登录统一返回 401 AUTH_REQUIRED（SPEC 第 5.2 节）。
export function requireAuth(req, res, next) {
  if (process.env.AUTH_ENABLED !== '1') return next()
  const sid = req.cookies?.sid
  if (getSession(sid)) return next()
  return res.status(401).json({
    ok: false,
    error: { code: 'AUTH_REQUIRED', message: '请先登录' },
  })
}
