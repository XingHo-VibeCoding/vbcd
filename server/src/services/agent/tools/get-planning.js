import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { getPlanning } from '../../planning.js'

export function getPlanningTool() {
  return tool(
    async ({ from, to, plan_status, schedule_status, q, type, id }) => JSON.stringify(await getPlanning({ from, to, planStatus: plan_status, scheduleStatus: schedule_status, q, type, id })),
    {
      name: 'get_planning',
      description: '读取计划和日程，包括完成/取消历史。修改、完成或取消前先用关键词或 type+id 查到真实记录，不猜测 id。日期范围只筛日程。',
      schema: z.object({
        from: z.string().optional().describe('ISO 开始时间，含时区'),
        to: z.string().optional().describe('ISO 结束时间，含时区'),
        plan_status: z.enum(['active','all','todo','doing','done','cancelled']).optional().describe('计划状态，默认 active；历史用 all/done/cancelled'),
        schedule_status: z.enum(['all','scheduled','completed','cancelled']).optional().describe('日程状态，默认 all'),
        q: z.string().max(200).optional().describe('按标题关键词搜索；计划也搜索说明'),
        type: z.enum(['plan','schedule']).optional().describe('按 id 查询时必填的对象类型'),
        id: z.string().optional().describe('从查询结果取得的真实 id，与 type 同时提供'),
      }),
    },
  )
}
