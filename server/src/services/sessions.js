// 会话存储（内存 Map）：单用户 MVP 足够。
// 注意：服务重启后所有会话失效，需要重新登录——MVP 阶段可接受；
// 将来要"重启不掉线"，把这里换成文件或数据库即可（接口不变）。
import { randomBytes } from 'node:crypto'

const sessions = new Map()

const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 720) // 默认 30 天

export function createSession() {
  const sid = randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.set(sid, { createdAt: now, expiresAt: now + TTL_HOURS * 3600 * 1000 })
  return sid
}

export function getSession(sid) {
  if (!sid) return null
  const s = sessions.get(sid)
  if (!s) return null
  if (Date.now() > s.expiresAt) {
    sessions.delete(sid)
    return null
  }
  s.lastSeenAt = Date.now()
  return s
}

export function destroySession(sid) {
  if (sid) sessions.delete(sid)
}
