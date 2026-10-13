// 只读工具：检索个人资料库条目。
// 复用主站资料列表，始终读取当前权威来源。
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { listNotes, CATEGORIES } from '../../notes.js'

export function searchNotesTool() {
  return tool(
    async ({ q, category, limit }) => {
      const { total, items } = await listNotes({ q, category, limit: limit ?? 10, sort: 'date_desc' })
      return JSON.stringify({
        total,
        items: items.map((it) => ({
          id: it.id,
          title: it.title,
          category: it.category,
          date: it.date,
          tags: it.tags,
          path: it.path,
        })),
      })
    },
    {
      name: 'search_notes',
      description:
        '在个人资料库中按关键词检索资料条目。输入关键词（可空=最新）与可选分类，返回标题/分类/日期/标签列表（不含正文，正文用 get_note 取）。',
      schema: z.object({
        q: z.string().max(200).optional().describe('关键词，匹配标题/正文/标签；留空返回最新'),
        category: z.enum(CATEGORIES).optional().describe('限定分类：learning 学习 / life 生活 / work 事务 / essay 随笔'),
        limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 10'),
      }),
    },
  )
}
