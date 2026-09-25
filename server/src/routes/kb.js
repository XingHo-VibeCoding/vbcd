// 知识库问答接口（SPEC 第 3 章 9–11）
//   POST /api/kb/query   普通问答：{ q, k? } → { answer, sources[] }
//   GET  /api/kb/stream  SSE 流式问答：?q=&k= → 事件 sources → token* → done / error
//   POST /api/kb/index   触发增量索引 → { added, updated, removed, unchanged, chunks }
// 本路由整体挂在 requireAuth 之后（见 app.js）。
import { Router } from 'express'
import { query, reindex, prepareStream } from '../services/kb.js'

const router = Router()

router.post('/query', async (req, res, next) => {
  try {
    const data = await query(req.body?.q, req.body?.k)
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

// SSE：检索结果先发（前端立刻显示"依据"），再逐 token 推回答，最后 done；
// 检索/生成任何一步出错都走 event: error 收尾（SSE 通道内不再走统一 JSON 错误格式）。
router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 将来 Nginx 反代时不缓冲
  })
  res.flushHeaders?.()

  let closed = false
  req.on('close', () => {
    closed = true // 前端断开就停止生成（for-await 退出会终止底层 LLM 流）
  })

  const send = (event, data) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const { sources, tokens } = await prepareStream(req.query.q, req.query.k)
    send('sources', { sources })
    for await (const text of tokens) {
      if (closed) break
      send('token', { text })
    }
    send('done', {})
  } catch (err) {
    send('error', { code: err.code || 'INTERNAL', message: err.message || '服务器内部错误' })
  } finally {
    if (!closed) res.end()
  }
})

router.post('/index', async (req, res, next) => {
  try {
    const data = await reindex()
    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

export default router
