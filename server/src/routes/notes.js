// 资料接口（SPEC 第 3 章 3–5）
//   POST /api/notes       新建资料（F1）
//   GET  /api/notes       列表与检索（F2/F3）
//   GET  /api/notes/:id   读原文（F2）
// 本路由挂 optionalAuth（GET 公开）+ 写端点挂 requireAuthForWrite（SPEC §5.6 模式②）。
import { Router } from 'express'
import { requireAuthForWrite } from '../middleware/auth.js'
import { createNote, listNotes, getNote, updateNote, removeNote } from '../services/notes.js'
import { fail } from '../services/errors.js'

const router = Router()

router.post('/', requireAuthForWrite, async (req, res, next) => {
  try {
    const created = await createNote(req.body ?? {})
    res.status(201).json({ ok: true, data: created })
  } catch (err) {
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await listNotes(req.query) })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const note = await getNote(req.params.id)
    if (!note) throw fail('NOT_FOUND', '这条资料不存在', 404)
    res.json({ ok: true, data: note })
  } catch (err) {
    next(err)
  }
})

// 板块⑥ 后台编辑：PATCH /api/notes/:id
// 数据库模式编辑主库；文件模式保留原有文件写入行为。
router.patch('/:id', requireAuthForWrite, async (req, res, next) => {
  try {
    const updated = await updateNote(String(req.params.id), req.body ?? {})
    res.json({ ok: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// 板块⑥ 后台删除：DELETE /api/notes/:id —— 删除当前权威来源的资料。
router.delete('/:id', requireAuthForWrite, async (req, res, next) => {
  try {
    const removed = await removeNote(String(req.params.id))
    res.json({ ok: true, data: removed })
  } catch (err) {
    next(err)
  }
})

export default router
