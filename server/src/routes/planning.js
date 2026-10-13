import { Router } from 'express'
import { getPlanning, getDraft, decideDraft, proposePlanning } from '../services/planning.js'
import { resumeAfterDecision } from '../services/agent/loop.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try { res.json({ ok: true, data: await getPlanning({ from: req.query.from, to: req.query.to, planStatus: req.query.plan_status, scheduleStatus: req.query.schedule_status, q: req.query.q, type: req.query.type, id: req.query.id }) }) } catch (err) { next(err) }
})

router.post('/drafts', async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await proposePlanning(req.body ?? {}) }) } catch (err) { next(err) }
})

router.get('/drafts/:id', async (req, res, next) => {
  try {
    const data = await getDraft(req.params.id)
    if (!data) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '这个规划草案不存在' } })
    res.json({ ok: true, data })
  } catch (err) { next(err) }
})

router.patch('/drafts/:id', async (req, res, next) => {
  try {
    const data = await decideDraft(req.params.id, req.body?.decision, req.body?.review_token)
    if (data.needs_review) {
      // 冲突快照刷新已提交，但用户的批准尚未记录；前端需重新展示并提交新凭据。
      return res.status(409).json({
        ok: false,
        error: { code: 'PLANNING_REVIEW_REQUIRED', message: '草案或时间冲突已变化，请重新审阅后确认' },
        data,
      })
    }
    let agentSync = { state: 'not_linked', message: '此草案未关联 agent 会话。' }
    if (data.source_session_id && data.confirmation?.id) {
      try {
        await resumeAfterDecision({
          sessionId: data.source_session_id, confirmationId: data.confirmation.id,
          decision: data.confirmation.decision, result: data.result,
        })
        agentSync = { state: 'synced', message: 'agent 已收到实际结果，可以继续对话。' }
      } catch (err) {
        // 已提交的业务结果不能被会话文件失败改写成“保存失败”。重试只同步终态。
        console.warn(`[planning] 会话同步失败 draft=${data.id} code=${err.code || 'UNKNOWN'}`)
        agentSync = { state: 'pending', message: '业务结果已记录，但 agent 会话尚未同步。请重试同步；不会重复保存。' }
      }
    }
    res.json({ ok: true, data: { ...data, agent_sync: agentSync } })
  } catch (err) { next(err) }
})

export default router
