import { getSession } from '../services/sessions.js'

// SPEC §5.6：三闸门权限模型。
//   optionalAuth        → 永不拦截，只把 req.session 填上（游客可达的路由挂这个）
//   requireAuth         → AUTH_ENABLED=1 时要求 session（隐私模式全站闸）
//   requireAuthForWrite → AUTH_WRITE_REQUIRED=1 时要求 session（公开模式的写/敏感读闸）
// 挂载口径：路由整体挂 optionalAuth 或 requireAuth 定基础门槛，内部按需加 requireAuthForWrite。

export function optionalAuth(req, _res, next) {
  req.session = getSession(req.cookies?.sid) || null
  next()
}

export function requireAuth(req, res, next) {
  if (process.env.AUTH_ENABLED !== '1') return next()
  const sid = req.cookies?.sid
  const s = getSession(sid)
  if (s) {
    req.session = s
    return next()
  }
  return res.status(401).json({
    ok: false,
    error: { code: 'AUTH_REQUIRED', message: '请先登录' },
  })
}

export function requireAuthForWrite(req, res, next) {
  if (process.env.AUTH_WRITE_REQUIRED !== '1') return next()
  const s = req.session ?? getSession(req.cookies?.sid)
  if (s) {
    req.session = s
    return next()
  }
  return res.status(401).json({
    ok: false,
    error: { code: 'AUTH_WRITE_REQUIRED', message: '登录后可操作' },
  })
}
