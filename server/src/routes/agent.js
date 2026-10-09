// agent 对话接口（F12，SPEC §3 预留坑位转正）
//   POST /api/agent/chat   SSE：{ message, session_id? } → 事件流
//                          token* → tool_call/tool_result* → confirmation_required? → done / error
//   GET  /api/agent/runs   审计留痕查看：?limit= → { items[] }（读 runs.jsonl 倒序）
//   GET  /api/agent/tools  工具清单与可用状态（前端灰显用）
// 本路由整体挂在 requireAuth 之后（见 app.js）：隐私模块启用时未登录一律 401。
import { Router } from 'express'
import { runTurn } from '../services/agent/loop.js'
import { listRuns } from '../services/agent/audit.js'
import { manifestStatus } from '../services/agent/registry.js'

const router = Router()

router.post('/chat', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  let closed = false
  res.on('close', () => {
    closed = true // 响应侧断开才算断开（req close 在 body 读完即触发）
  })

  const send = (event, data) => {
    if (!closed) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); res.flush?.() }
  }

  try {
    await runTurn({
      sessionId: req.body?.session_id ?? null,
      message: req.body?.message,
      emit: send,
    })
  } catch (err) {
    // runTurn 入口参数校验错误（VALIDATION_FAILED / NOT_FOUND）走这里
    send('error', { code: err.code || 'INTERNAL', message: err.message || '服务器内部错误' })
    send('done', { suspended: false })
  } finally {
    if (!closed) res.end()
  }
})

router.get('/runs', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 500)
    const items = await listRuns(limit)
    res.json({ ok: true, data: { total: items.length, items } })
  } catch (err) {
    next(err)
  }
})

router.get('/tools', async (req, res) => {
  res.json({ ok: true, data: { tools: manifestStatus() } })
})

export default router
