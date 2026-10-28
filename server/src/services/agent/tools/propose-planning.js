import { planningInputSchema } from '../../planning-schema.js'
import { tool } from '@langchain/core/tools'
import { proposePlanning } from '../../planning.js'

export function proposePlanningTool({ sessionId = null } = {}) {
  return tool(
    async (input) => {
      const draft = await proposePlanning(input, sessionId, 'agent')
      return JSON.stringify({ pending_confirmation: true, confirmation_id: draft.confirmation.id, draft_id: draft.id, draft, message: '已生成规划草案，等待确认；确认前不会新增或修改计划和日程。' })
    },
    {
      name: 'propose_planning',
      description: '先查询，再生成规划草案。create 新增计划/子任务/日程（ref 仅限同草案）；update 修改、批量 changes 或 reorder 活跃任务；complete 标记完成；cancel 取消并保留历史。单目标修改需真实 target；批量 changes 和 reorder 是互斥的独立请求，不混合 create。确认前不写业务数据。',
      schema: planningInputSchema,
    },
  )
}
