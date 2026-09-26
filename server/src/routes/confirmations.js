// 确认记录接口（F6 留痕回看 / SPEC 第 3 章补充）
//   GET /api/confirmations  确认留痕列表，可按 ?task_id= 过滤
// 本路由整体挂在 requireAuth 之后（见 app.js）：隐私模块启用时未登录一律 401。
// 只读，没有任何写入口 —— 确认记录只能由 PATCH /api/tasks/:id 带 decision 时产生。
import { Router } from 'express'
import { listConfirmations } from '../services/tasks.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { total, items } = await listConfirmations(req.query)
    res.json({ ok: true, data: { total, items } })
  } catch (err) {
    next(err)
  }
})

export default router
