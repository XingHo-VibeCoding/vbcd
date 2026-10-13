// 只读工具：按 id 读一条资料全文与元数据。
// 复用主站详情读取当前权威来源。
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { fail } from '../../errors.js'
import { getNote } from '../../notes.js'

export function getNoteTool() {
  return tool(
    async ({ id }) => {
      const note = await getNote(id)
      if (!note) throw fail('NOT_FOUND', `资料不存在：${id}`, 404)
      const { meta, content } = note
      return JSON.stringify({ id, title: meta.title, category: meta.category, date: meta.date, tags: meta.tags, content })
    },
    {
      name: 'get_note',
      description: '按 id 读取一条资料的全文（Markdown）与元数据。id 来自 search_notes 的返回。',
      schema: z.object({
        id: z.string().min(1).max(120).describe('资料 id（YYYY-MM-DD-slug 形式）'),
      }),
    },
  )
}
