// API 与 Agent 共用输入结构，避免工具过滤掉关联字段；业务校验仍由服务层执行。
import { z } from 'zod'
const id = z.string().min(1)
const target = z.object({ type: z.enum(['plan','schedule','project_task']), id }).strict()
const patch = z.object({
  title: z.string().optional(), description: z.string().optional(),
  start_at: z.string().nullable().optional(), due_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(), priority: z.number().int().optional(),
  status: z.enum(['todo','doing','blocked']).optional(), all_day: z.boolean().optional(),
  plan_id: id.nullable().optional(), task_id: id.nullable().optional(),
  depends_on: z.array(id).max(50).optional(),
}).strict()
const change = z.object({ action: z.enum(['update','complete','cancel']), target, patch: patch.optional() }).strict()
export const planningInputSchema = z.object({
  operation: z.enum(['create','update','complete','cancel']).optional(), target: target.optional(), patch: patch.optional(),
  changes: z.array(change).min(1).max(50).optional(),
  reorder: z.object({ plan_id: id, task_ids: z.array(id).min(1).max(50) }).strict().optional(),
  plan: z.object({ title: z.string(), description: z.string().optional(), start_at: z.string().nullable().optional(), due_at: z.string().nullable().optional(), priority: z.number().int().optional(), status: z.enum(['todo','doing']).optional() }).strict().optional(),
  project_tasks: z.array(z.object({
    ref: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), title: z.string(), description: z.string().optional(),
    plan_id: id.optional(), due_at: z.string().nullable().optional(),
    depends_on: z.array(z.union([z.object({ id }).strict(), z.object({ ref: id }).strict()])).max(50).optional(),
  }).strict()).max(50).optional(),
  schedules: z.array(z.object({ title: z.string(), start_at: z.string(), end_at: z.string().nullable().optional(), all_day: z.boolean().optional(), plan_id: id.nullable().optional(), task_id: id.nullable().optional(), task_ref: id.optional() }).strict()).max(50).optional(),
}).strict()
