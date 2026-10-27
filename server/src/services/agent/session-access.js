import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const GUEST_COOKIE = 'agent_guest'
const GUEST_ID_RE = /^[a-f0-9]{64}$/

function guestKey(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function resolveAgentOwner(req, res) {
  if (req.session) return { type: 'user' }

  let token = req.cookies?.[GUEST_COOKIE]
  if (!GUEST_ID_RE.test(String(token || ''))) {
    token = randomBytes(32).toString('hex')
    const ttlHours = Number(process.env.SESSION_TTL_HOURS || 720)
    res.cookie(GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ttlHours * 3600 * 1000,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return { type: 'guest', key: guestKey(token) }
}

export function canAccessAgentSession(session, owner) {
  if (!session || !owner) return false

  // Older sessions have no owner marker; fail closed for guests and preserve
  // access for the single authenticated user.
  const stored = session.owner ?? { type: 'user' }
  if (owner.type === 'user') return true
  if (stored.type !== 'guest' || !GUEST_ID_RE.test(String(stored.key || ''))) return false

  const expected = Buffer.from(stored.key, 'hex')
  const actual = Buffer.from(owner.key, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function claimAgentSession(session, owner) {
  if (owner?.type === 'user') session.owner = { type: 'user' }
  else if (owner?.type === 'guest' && !session.owner) session.owner = { type: 'guest', key: owner.key }
  return session
}
