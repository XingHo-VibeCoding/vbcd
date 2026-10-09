// 只读工具：检索个人资料库条目。
// 复用 index-store 的 loadIndex + queryEntries（与 GET /api/notes 同一套检索语义）。
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { loadIndex, queryEntries } from '../../index-store.js'

export function searchNotesTool() {
  return tool(
    async ({ q, category, limit }) => {
      const { items: index } = await loadIndex()
      const { total, items } = queryEntries(index, { q, category, limit: limit ?? 10, sort: 'date_desc' })
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
        category: z.enum(['learning', 'life', 'work']).optional().describe('限定分类'),
        limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 10'),
      }),
    },
  )
}
