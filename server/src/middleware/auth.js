import { getSession } from '../services/sessions.js'

// 受保护接口要求有效会话；未登录统一返回 401 AUTH_REQUIRED（SPEC 第 5.2 节）
export function requireAuth(req, res, next) {
  const sid = req.cookies?.sid
  if (getSession(sid)) return next()
  return res.status(401).json({
    ok: false,
    error: { code: 'AUTH_REQUIRED', message: '请先登录' },
  })
}
