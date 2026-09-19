import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createSession, destroySession } from '../services/sessions.js'

const router = Router()

// 简单限流：同一 IP 10 分钟内最多失败 5 次（SPEC 第 5.2 节的 RATE_LIMITED）
const attempts = new Map() // ip -> { count, resetAt }
const WINDOW_MS = 10 * 60 * 1000
const MAX_FAIL = 5

function isLimited(ip) {
  const a = attempts.get(ip)
  if (!a) return false
  if (Date.now() > a.resetAt) {
    attempts.delete(ip)
    return false
  }
  return a.count >= MAX_FAIL
}

function recordFail(ip) {
  const a = attempts.get(ip)
  const now = Date.now()
  if (!a || now > a.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    a.count += 1
  }
}

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown'

    if (isLimited(ip)) {
      return res.status(429).json({
        ok: false,
        error: { code: 'RATE_LIMITED', message: '尝试次数过多，请 10 分钟后再试' },
      })
    }

    const password = String(req.body?.password || '')
    const hash = process.env.PASSWORD_HASH || ''

    // 未配置口令哈希：明确报错，不静默失败（F1 验收的同款要求）
    if (!hash) {
      return res.status(500).json({
        ok: false,
        error: { code: 'INTERNAL', message: '服务端未配置口令哈希（PASSWORD_HASH）' },
      })
    }

    const ok = await bcrypt.compare(password, hash)
    if (!ok) {
      recordFail(ip)
      return res.status(401).json({
        ok: false,
        error: { code: 'AUTH_FAILED', message: '口令错误' },
      })
    }

    // 登录成功：建会话 + 写 HttpOnly Cookie
    attempts.delete(ip)
    const sid = createSession()
    const ttlHours = Number(process.env.SESSION_TTL_HOURS || 720)
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ttlHours * 3600 * 1000,
      secure: process.env.NODE_ENV === 'production', // 生产（HTTPS）下才加 Secure
    })
    res.json({ ok: true, data: { message: '登录成功' } })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.sid)
  res.clearCookie('sid')
  res.status(204).end()
})

export default router
