// 资料接口（SPEC 第 3 章 3–5）
//   POST /api/notes       新建资料（F1）
//   GET  /api/notes       列表与检索（F2/F3）
//   GET  /api/notes/:id   读原文（F2）
// 本路由整体挂在 requireAuth 之后（见 app.js），未登录一律 401 AUTH_REQUIRED。
import { Router } from 'express'
import { createNote } from '../services/notes.js'
import { loadIndex, queryEntries } from '../services/index-store.js'
import { fail } from '../services/errors.js'
import * as storage from '../storage/files.js'

const router = Router()

router.post('/', async (req, res, next) => {
  try {
    const created = await createNote(req.body ?? {})
    res.status(201).json({ ok: true, data: created })
  } catch (err) {
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { items, warnings, rebuilt, rebuilt_at, rebuilt_in_ms } = await loadIndex()
    // 解析失败的文件不使整次请求失败，但要在服务端日志里可见
    if (warnings.length) console.warn(`[index] 跳过 ${warnings.length} 个文件：${warnings.join('；')}`)

    const { total, items: page } = queryEntries(items, req.query)
    res.json({ ok: true, data: { total, items: page, rebuilt, rebuilt_at, rebuilt_in_ms } })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const note = await storage.get(String(req.params.id))
    if (!note) throw fail('NOT_FOUND', '这条资料不存在', 404)
    res.json({ ok: true, data: note })
  } catch (err) {
    next(err)
  }
})

export default router
