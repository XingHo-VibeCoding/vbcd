// 只读工具：按 id 读一条资料全文与元数据。
// 复用 index-store 定位 + noteStore 读内容（与 GET /api/notes/:id 同路径）。
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { fail } from '../../errors.js'
import { loadIndex } from '../../index-store.js'
import * as noteStore from '../../../storage/note-store.js'

export function getNoteTool() {
  return tool(
    async ({ id }) => {
      const { items: index } = await loadIndex()
      const entry = index.find((it) => it.id === id)
      if (!entry) throw fail('NOT_FOUND', `资料不存在：${id}`, 404)
      // noteStore.getDb 走库路径；文件路径的资料走 files.js 的 get——两者由 index 的 path 区分
      // 简化：索引里有 path 的按文件读，没 path 的按库读（Day 18 后库行无 path）
      let content
      if (entry.path) {
        const files = await import('../../../storage/files.js')
        content = await files.get(entry.path)
      } else {
        const row = await noteStore.getDb(id)
        if (!row) throw fail('NOT_FOUND', `资料不存在：${id}`, 404)
        content = row.content
      }
      return JSON.stringify({ id, title: entry.title, category: entry.category, date: entry.date, tags: entry.tags, content })
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
