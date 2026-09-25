// 个人主页接口
//   GET /api/me → { profile: { nickname, avatar, bio }, schedule: [{ date, time, title }] }
// 本路由整体挂在 requireAuth 之后（见 app.js），隐私模块开启时同样受保护。
import { Router } from 'express'
import { getMe } from '../services/me.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await getMe() })
  } catch (err) {
    next(err)
  }
})

export default router
