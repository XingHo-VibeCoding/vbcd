import { createHash, randomBytes } from 'node:crypto'
import { query, withTransaction } from './pool.js'
import { fail } from '../services/errors.js'

function newId(prefix) {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}`
}

function rowPlan(row) {
  return row ? { ...row, priority: Number(row.priority) } : null
}

function rowSchedule(row) {
  if (!row) return null
  return { ...row, all_day: Boolean(row.all_day) }
}

const TABLES = { plan: 'plans', schedule: 'schedules' }

export async function getPlanningRecord(type, id) {
  const table = TABLES[type]
  if (!table) throw fail('VALIDATION_FAILED', '目标类型必须是 plan / schedule')
  const rows = await query(`SELECT * FROM ${table} WHERE id=$1`, [id])
  return rows[0] ?? null
}

export async function planningSnapshot({ from, to, planStatus = 'active', scheduleStatus = 'all', q = '' } = {}) {
  const planValues = [], scheduleValues = [], planWhere = [], scheduleWhere = []
  if (planStatus === 'active') planWhere.push("status NOT IN ('done','cancelled')")
  else if (planStatus !== 'all') { planValues.push(planStatus); planWhere.push(`status=$${planValues.length}`) }
  if (scheduleStatus !== 'all') { scheduleValues.push(scheduleStatus); scheduleWhere.push(`status=$${scheduleValues.length}`) }
  if (from) { scheduleValues.push(from); scheduleWhere.push(`(CASE WHEN all_day THEN start_at + interval '1 day' ELSE end_at END)>$${scheduleValues.length}::timestamptz`) }
  if (to) { scheduleValues.push(to); scheduleWhere.push(`start_at<$${scheduleValues.length}::timestamptz`) }
  if (q) {
    planValues.push(`%${q}%`); planWhere.push(`(title || ' ' || description) ILIKE $${planValues.length}`)
    scheduleValues.push(`%${q}%`); scheduleWhere.push(`title ILIKE $${scheduleValues.length}`)
  }
  const where = clauses => clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const [plans, schedules] = await Promise.all([
    query(`SELECT * FROM plans ${where(planWhere)} ORDER BY priority DESC,due_at NULLS LAST,updated_at DESC,id`, planValues),
    query(`SELECT * FROM schedules ${where(scheduleWhere)} ORDER BY start_at,id`, scheduleValues),
  ])
  // When a schedule matches a query but its parent plan title/description does not,
  // still include that parent as relationship context for schedule views and tools.
  const planById = new Map(plans.map(plan => [plan.id, plan]))
  const missingPlanIds = [...new Set(schedules.map(schedule => schedule.plan_id).filter(id => id && !planById.has(id)))]
  if (missingPlanIds.length) {
    const relatedWhere = ['id = ANY($1::text[])']
    const relatedValues = [missingPlanIds]
    if (planStatus === 'active') relatedWhere.push("status NOT IN ('done','cancelled')")
    else if (planStatus !== 'all') {
      relatedValues.push(planStatus)
      relatedWhere.push(`status=$${relatedValues.length}`)
    }
    const related = await query(`SELECT * FROM plans WHERE ${relatedWhere.join(' AND ')}`, relatedValues)
    for (const plan of related) planById.set(plan.id, plan)
  }
  return {
    plans: [...planById.values()].map(rowPlan),
    schedules: schedules.map(rowSchedule),
  }
}

// 审阅凭据覆盖用户看到的草案内容和冲突；不依赖毫秒时间戳的精度。
function stableJson(value) {
  const sorted = input => input instanceof Date ? input.toISOString() : Array.isArray(input) ? input.map(sorted)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map(key => [key, sorted(input[key])]))
      : input
  return JSON.stringify(sorted(value))
}

export function recordVersion(record) {
  return createHash('sha256').update(stableJson(record)).digest('hex')
}

function reviewToken(draft) {
  return createHash('sha256').update(stableJson([draft.id, draft.operation, draft.payload, draft.conflicts])).digest('hex')
}

function draftView(row) {
  if (!row) return null
  const draft = {
    id: row.id, operation: row.operation, payload: row.payload, summary: row.summary,
    conflicts: row.conflicts, status: row.status, source_session_id: row.source_session_id,
    created_at: row.created_at, updated_at: row.updated_at, executed_at: row.executed_at, error: row.error,
    confirmation: {
      id: row.confirmation_id, action: row.action, summary: row.confirmation_summary,
      decision: row.decision, requested_at: row.requested_at, confirmed_at: row.confirmed_at,
    },
  }
  return { ...draft, review_token: reviewToken(draft) }
}

const DRAFT_SELECT = `SELECT d.*, c.id AS confirmation_id, c.action,
       c.summary AS confirmation_summary, c.decision, c.requested_at, c.confirmed_at
  FROM planning_drafts d JOIN confirmations c ON c.draft_id = d.id WHERE d.id = $1`

export async function getDraft(id) {
  const rows = await query(DRAFT_SELECT, [id])
  return draftView(rows[0])
}

export async function createDraft({ operation = 'create', payload, summary, conflicts = [], sourceSessionId = null }) {
  const draftId = newId('draft')
  const confirmationId = newId('confirm')
  await withTransaction(async tx => {
    await tx(`INSERT INTO planning_drafts (id,operation,payload,summary,conflicts,source_session_id) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6)`, [draftId, operation, JSON.stringify(payload), summary, JSON.stringify(conflicts), sourceSessionId])
    await tx(`INSERT INTO confirmations (id,draft_id,action,summary) VALUES ($1,$2,$3,$4)`, [confirmationId, draftId, 'planning_draft', summary])
  })
  return getDraft(draftId)
}

/** 同一事务中记录决定与结果；仅业务写入用保存点回滚，避免异常分支伪造批准。 */
export async function decideDraft(id, decision, { reviewToken: reviewed, review } = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw fail('VALIDATION_FAILED', 'decision 只能是 approved / rejected')
  if (decision === 'approved' && !/^[a-f0-9]{64}$/.test(reviewed || '')) {
    throw fail('VALIDATION_FAILED', '批准前必须读取并审阅当前草案')
  }
  try {
    return await withTransaction(async tx => {
      // 包括空日程范围在内的并发写入也需串行检查；普通 INSERT 同样会被此锁阻挡。
      // 总是先锁日程表再锁草案，避免两份草案同时批准时形成反向等待。
      if (decision === 'approved') {
        await tx('LOCK TABLE schedules IN SHARE ROW EXCLUSIVE MODE')
        await tx('LOCK TABLE plans IN SHARE ROW EXCLUSIVE MODE')
      }
      const { rows } = await tx(`${DRAFT_SELECT} FOR UPDATE OF d,c`, [id])
      const draft = rows[0]
      if (!draft) throw fail('NOT_FOUND', '这个规划草案不存在', 404)
      if (draft.status !== 'pending' || draft.decision) {
        if (draft.decision === decision && ['approved', 'rejected', 'failed'].includes(draft.status)) {
          return draftView(draft) // 幂等返回终态，也允许只重试会话同步。
        }
        throw fail('PLANNING_ALREADY_DECIDED', '草案已作出不同决定，请重新读取结果', 409)
      }

      const readCurrent = async () => draftView((await tx(DRAFT_SELECT, [id])).rows[0])
      if (decision === 'rejected') {
        await tx(`UPDATE confirmations SET decision='rejected',confirmed_at=now() WHERE id=$1`, [draft.confirmation_id])
        await tx(`UPDATE planning_drafts SET status='rejected',updated_at=now(),error=NULL WHERE id=$1`, [id])
        return readCurrent()
      }
      if (reviewed !== reviewToken(draft)) return { ...draftView(draft), needs_review: true }
      if (!['create', 'update', 'cancel'].includes(draft.operation)) throw fail('VALIDATION_FAILED', '不支持的规划操作')

      const current = await tx(`SELECT id,title,start_at,end_at,all_day,status,updated_at
        FROM schedules WHERE status <> 'cancelled' ORDER BY start_at,id`)
      const targets = []
      for (const change of draft.payload.changes ?? []) {
        const table = TABLES[change.target?.type]
        if (!table) throw fail('VALIDATION_FAILED', '无效的规划目标类型')
        const result = await tx(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [change.target.id])
        if (!result.rows[0]) throw fail('NOT_FOUND', '目标记录已不存在，请拒绝旧草案后重新安排', 404)
        targets.push(result.rows[0])
      }
      const checked = review(draft.payload, current.rows, targets)
      if (checked.operation !== draft.operation) throw fail('VALIDATION_FAILED', '草案操作与内容不一致')
      if (stableJson(checked.conflicts) !== stableJson(draft.conflicts) || stableJson(checked.payload) !== stableJson(draft.payload)) {
        await tx(`UPDATE planning_drafts SET conflicts=$2::jsonb,summary=$3,payload=$4::jsonb,updated_at=now() WHERE id=$1`,
          [id, JSON.stringify(checked.conflicts), checked.summary, JSON.stringify(checked.payload)])
        await tx('UPDATE confirmations SET summary=$2 WHERE id=$1', [draft.confirmation_id, checked.summary])
        return { ...await readCurrent(), needs_review: true }
      }

      await tx(`UPDATE confirmations SET decision='approved',confirmed_at=now() WHERE id=$1`, [draft.confirmation_id])
      await tx('SAVEPOINT planning_write')
      try {
        if (checked.payload.changes) {
          for (const change of checked.payload.changes) {
            const item = change.after
            let saved
            if (change.target.type === 'plan') {
              saved = await tx(`UPDATE plans SET title=$2,description=$3,start_at=$4,due_at=$5,priority=$6,status=$7,
                updated_at=now(),completed_at=CASE WHEN $7='done' THEN COALESCE(completed_at,now()) ELSE completed_at END
                WHERE id=$1 RETURNING *`, [item.id,item.title,item.description,item.start_at,item.due_at,item.priority,item.status])
            } else {
              saved = await tx(`UPDATE schedules SET title=$2,start_at=$3,end_at=$4,all_day=$5,plan_id=$6,status=$7,
                updated_at=now(),completed_at=CASE WHEN $7='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END
                WHERE id=$1 RETURNING *`, [item.id,item.title,item.start_at,item.end_at,item.all_day,item.plan_id,item.status])
            }
            await tx(`INSERT INTO planning_changes (draft_id,object_type,object_id,action,before_data,after_data)
              VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
              [id,change.target.type,item.id,change.action,JSON.stringify(change.before),JSON.stringify(saved.rows[0])])
          }
        } else {
        const plan = checked.payload.plan
        let planId = null
        if (plan) {
          planId = newId('plan')
          const inserted = await tx(`INSERT INTO plans (id,title,description,start_at,due_at,priority,status,source)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'agent') RETURNING *`,
            [planId, plan.title, plan.description, plan.start_at, plan.due_at, plan.priority, plan.status])
          await tx(`INSERT INTO planning_changes (draft_id,object_type,object_id,action,after_data)
            VALUES ($1,'plan',$2,'create',$3::jsonb)`, [id, planId, JSON.stringify(inserted.rows[0])])
        }
        for (const item of checked.payload.schedules) {
          const scheduleId = newId('schedule')
          const inserted = await tx(`INSERT INTO schedules (id,plan_id,title,start_at,end_at,all_day,source)
            VALUES ($1,$2,$3,$4,$5,$6,'agent') RETURNING *`,
            [scheduleId, item.plan_id ?? planId, item.title, item.start_at, item.end_at, item.all_day])
          await tx(`INSERT INTO planning_changes (draft_id,object_type,object_id,action,after_data)
            VALUES ($1,'schedule',$2,'create',$3::jsonb)`, [id, scheduleId, JSON.stringify(inserted.rows[0])])
        }
        }
        await tx(`UPDATE planning_drafts SET status='approved',updated_at=now(),executed_at=now(),error=NULL WHERE id=$1`, [id])
        await tx('RELEASE SAVEPOINT planning_write')
      } catch (err) {
        // 计划、日程和变更记录一起撤销；批准决定仍在当前事务中，明确留下执行失败。
        await tx('ROLLBACK TO SAVEPOINT planning_write')
        await tx('RELEASE SAVEPOINT planning_write')
        const message = err.code === '23503'
          ? '关联计划已不存在，本次变更全部撤销。请重新生成草案。'
          : '保存失败，本次变更全部撤销。请稍后重新生成草案。'
        console.warn(`[planning] 草案执行失败 id=${id} code=${err.code || 'UNKNOWN'}`)
        await tx(`UPDATE planning_drafts SET status='failed',error=$2,updated_at=now(),executed_at=now() WHERE id=$1`, [id, message])
      }
      return readCurrent()
    })
  } catch (err) {
    // 校验、拒绝或连接失败不更改批准事实；无法确认事务结果时由客户端重新读取。
    if (err.status) throw err
    console.warn(`[planning] 确认事务失败 code=${err.code || 'UNKNOWN'}`)
    throw fail('DB_UNAVAILABLE', '无法确认规划保存结果，请重新读取草案后再试', 503)
  }
}

export { newId }
