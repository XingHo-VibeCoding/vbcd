// 只读工具：向量知识库问答（语义检索 + LLM 作答，带来源）。
// 复用 services/kb.js 的 query()——与 /api/kb/query 同一链路。
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import * as kb from '../../kb.js'

export function askKbTool() {
  return tool(
    async ({ q }) => {
      const { answer, sources } = await kb.query(q, 4)
      return JSON.stringify({ answer, sources })
    },
    {
      name: 'ask_kb',
      description:
        '基于向量索引的知识库问答：适合「我资料里关于 X 是怎么说的」这类语义问题。返回答案与来源条目。需要 OPENAI_API_KEY + CHROMA_URL 已配置。',
      schema: z.object({
        q: z.string().min(1).max(500).describe('要问答的问题'),
      }),
    },
  )
}
