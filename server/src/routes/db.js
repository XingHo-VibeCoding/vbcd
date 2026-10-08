// 数据库读接口（Day 17：文件 → 数据库迁移的只读侧，见 SPEC §7.3）
//   GET /api/db/notes      → 资料列表（limit? / offset?，默认 20、上限 500）
//   GET /api/db/notes/:id  → 资料详情（含 body）；找不到 → 404 NOT_FOUND
// 与文件版 /api/notes 并存：这是迁移期的平行数据源，不动现有链路。
// 需要 DATABASE_URL；未配置 → 503 DB_NOT_CONFIGURED，库连不上 → 503 DB_UNAVAILABLE。
// 本路由整体挂在 requireAuth 之后（见 app.js），隐私模块开启时同样受保护。
// Day 19 起不再直接调 db/notes.js：参数校验与业务封装在 services/notes.js，本层只接单回响应。
import { Router } from 'express'
import { listNotesFromDb, getNoteFromDb } from '../services/notes.js'
import { fail } from '../services/errors.js'

const router = Router()

router.get('/notes', async (req, res, next) => {
  try {
    const data = await listNotesFromDb(req.query)
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/notes/:id', async (req, res, next) => {
  try {
    const note = await getNoteFromDb(String(req.params.id))
    if (!note) throw fail('NOT_FOUND', '这条资料不存在', 404)
    res.json({ ok: true, data: note })
  } catch (err) {
    next(err)
  }
})

export default router
