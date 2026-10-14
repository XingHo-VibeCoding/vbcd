// agent 对话接口（F12，SPEC §3 预留坑位转正）
//   POST /api/agent/chat   SSE：{ message, session_id? } → 事件流
//                          token* → tool_call/tool_result* → confirmation_required? → done / error
//   GET  /api/agent/runs   审计留痕查看：?limit= → { items[] }（读 runs.jsonl 倒序）
//   GET  /api/agent/tools  工具清单与可用状态（前端灰显用）
// 本路由整体挂在 requireAuth 之后（见 app.js）：隐私模块启用时未登录一律 401。
import { Router } from 'express'
import { runTurn } from '../services/agent/loop.js'
import { listRuns } from '../services/agent/audit.js'
import { loadSession, sessionToView } from '../services/agent/state.js'
import { fail } from '../services/errors.js'
import { userMessage, STATUS_BY_CODE } from '../middleware/errors.js'
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
    // runTurn 入口参数校验错误（VALIDATION_FAILED / NOT_FOUND）走这里。
    // 与 HTTP 错误中间件同一口径：业务错误（expose）透出人工中文，原始错误换成中文兜底（Day 23）
    const code = err.code || 'INTERNAL'
    const status = err.status || STATUS_BY_CODE[code] || 500
    if (status >= 500) console.error(`[agent] stream error ${code}: ${err.detail?.message || err.message}`)
    send('error', { code, message: userMessage(err, code, status) })
    send('done', { suspended: false })
  } finally {
    if (!closed) res.end()
  }
})


// 读回已有会话的展示数据：页面刷新/切换后恢复消息流用
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const session = await loadSession(req.params.id)
    if (!session) throw fail('NOT_FOUND', `会话不存在：${req.params.id}`, 404)
    res.json({ ok: true, data: sessionToView(session) })
  } catch (err) {
    next(err)
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
