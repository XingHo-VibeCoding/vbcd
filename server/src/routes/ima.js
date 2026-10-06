// ima 云端知识库只读代理（F15 / SPEC 3.6）+ ima 笔记只读（F15b / SPEC 3.7）
//   GET /api/ima/kbs       → 列知识库（q? 库名关键词, cursor?, limit?）
//   GET /api/ima/items     → 浏览条目（kb_id 必填, folder_id?, cursor?, limit?）
//   GET /api/ima/search    → 库内搜索（kb_id + q 必填, cursor?）
//   GET /api/ima/notes     → 列笔记（cursor?, limit?；默认修改时间倒序）
//   GET /api/ima/notes/:id → 笔记 meta + Markdown 正文；找不到 → 404 IMA_NOTE_NOT_FOUND
// 只读：ima 内容零落盘，上游结果只在进程内 TTL 缓存；未配 Key 返回 503 IMA_NOT_CONFIGURED。
// 本路由整体挂在 requireAuth 之后（见 app.js），隐私模块开启时同样受保护。
import { Router } from 'express'
import { listKbs, listItems, searchItems, listNotes, getNote } from '../services/ima.js'

const router = Router()

router.get('/kbs', async (req, res, next) => {
  try {
    const data = await listKbs({
      q: req.query.q,
      cursor: req.query.cursor,
      limit: req.query.limit,
    })
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/items', async (req, res, next) => {
  try {
    const data = await listItems({
      kb_id: req.query.kb_id,
      folder_id: req.query.folder_id,
      cursor: req.query.cursor,
      limit: req.query.limit,
    })
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const data = await searchItems({
      kb_id: req.query.kb_id,
      q: req.query.q,
      cursor: req.query.cursor,
    })
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/notes', async (req, res, next) => {
  try {
    const data = await listNotes({ cursor: req.query.cursor, limit: req.query.limit })
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/notes/:id', async (req, res, next) => {
  try {
    const data = await getNote({ id: req.params.id })
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

export default router
