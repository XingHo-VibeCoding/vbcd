// 任务接口（SPEC 第 3 章接口 6–8）
//   POST   /api/tasks      新建任务（F4）
//   GET    /api/tasks      任务进度列表（F5）
//   PATCH  /api/tasks/:id  更新任务状态（F5）；高风险动作的确认流在下一板块接入（F6）
// 本路由整体挂在 requireAuth 之后（见 app.js）：隐私模块启用时未登录一律 401 AUTH_REQUIRED。
import { Router } from 'express'
import { createTask, listTasks, updateTask } from '../services/tasks.js'

const router = Router()

router.post('/', async (req, res, next) => {
  try {
    const task = await createTask(req.body ?? {})
    res.status(201).json({ ok: true, data: task })
  } catch (err) {
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { total, items } = await listTasks(req.query)
    res.json({ ok: true, data: { total, items } })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const task = await updateTask(String(req.params.id), req.body ?? {})
    res.json({ ok: true, data: task })
  } catch (err) {
    next(err)
  }
})

export default router
