// GitHub 动态接口（F15）
//   GET /api/github/activity → { configured, profile?, calendar?, events? }
// 挂在 requireAuth 之后（app.js），隐私模式同样受保护。
import { Router } from 'express'
import { getGithubActivity } from '../services/github.js'

const router = Router()

router.get('/activity', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await getGithubActivity() })
  } catch (err) {
    next(err)
  }
})

export default router
