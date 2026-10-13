import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { proposePlanning } from '../../planning.js'

export function proposePlanningTool({ sessionId = null } = {}) {
  return tool(
    async (input) => {
      const draft = await proposePlanning(input, sessionId)
      return JSON.stringify({ pending_confirmation: true, confirmation_id: draft.confirmation.id, draft_id: draft.id, draft, message: '已生成规划草案，等待确认；确认前不会新增或修改计划和日程。' })
    },
    {
      name: 'propose_planning',
      description: '先查询，再生成规划草案。create 新增计划/日程；update 修改已有记录；complete 标记完成；cancel 取消并保留历史。后三种需要真实 target，update 还需 patch。确认前不写业务数据。',
      schema: z.object({
        operation: z.enum(['create','update','complete','cancel']).optional().describe('默认 create'),
        target: z.object({ type: z.enum(['plan','schedule']), id: z.string().min(1) }).optional().describe('已有记录，必须先通过 get_planning 查询'),
        patch: z.object({
          title: z.string().min(1).optional(), description: z.string().optional(),
          start_at: z.string().nullable().optional(), due_at: z.string().nullable().optional(),
          end_at: z.string().nullable().optional(), priority: z.number().int().optional(),
          status: z.enum(['todo','doing']).optional().describe('仅未完成计划可切换；完成/取消使用对应 operation'),
          all_day: z.boolean().optional(), plan_id: z.string().nullable().optional(),
        }).optional().describe('只填要修改的字段；时间需带时区'),
        plan: z.object({ title: z.string().min(1), description: z.string().optional(), start_at: z.string().optional(), due_at: z.string().optional(), priority: z.number().int().optional(), status: z.enum(['todo','doing']).optional() }).optional().describe('仅 create 使用'),
        schedules: z.array(z.object({ title: z.string().min(1), start_at: z.string(), end_at: z.string().optional(), all_day: z.boolean().optional() })).max(50).optional().describe('仅 create 使用；只创建计划时可省略'),
      }),
    },
  )
}
