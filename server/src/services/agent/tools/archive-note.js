// 写工具（needs-confirm）：把一段内容整理成资料归档。
// 铁律 1：不直接写盘——handler 只负责生成「待确认草案」，真正的写入发生在
// 用户在确认链路里点「同意」之后（428 闸门复用现有 tasks+confirmations 机制）。
// 本 handler 做的事：校验草案 → 建 Confirmation(action='agent_archive_note') +
// attention 任务 → 返回「已生成待确认」给循环，循环据此挂起。

import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { randomBytes } from 'node:crypto'
import { nowShanghai, CATEGORIES } from '../../notes.js'
import * as taskStore from '../../../storage/tasks.js'
import * as confirmationStore from '../../../storage/confirmations.js'

function newId() {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`
}

export function archiveNoteTool() {
  return tool(
    async ({ title, category, content, tags, source_url }) => {
      const { iso } = nowShanghai()
      const tagList = Array.isArray(tags) ? tags : []

      // 先建任务（attention = 待确认），再挂 Confirmation——与 delete_note 同套路
      const task = await taskStore.put({
        id: newId(),
        type: 'note',
        status: 'attention',
        origin: 'agent',
        payload: { title, category, content, tags: tagList, source_url },
        result: '等待确认后归档（未确认前不写入任何资料）',
        created_at: iso,
        updated_at: iso,
        schema_version: 1,
      })

      const confirmation = await confirmationStore.put({
        id: newId(),
        task_id: task.id,
        action: 'agent_archive_note',
        summary:
          `将把以下内容归档为 ${category} 类资料《${title}》` +
          `${tagList.length ? `（标签：${tagList.join('、')}）` : ''}` +
          `${source_url ? `，来源 ${source_url}` : ''}。正文 ${[...content].length} 字。` +
          '确认后写入资料库，取消则不产生任何改动。',
        requested_at: iso,
        decision: '',
        confirmed_at: '',
        schema_version: 1,
      })

      return JSON.stringify({
        pending_confirmation: true,
        confirmation_id: confirmation.id,
        task_id: task.id,
        draft: { title, category, tags: tagList, source_url, content, content_length: [...content].length },
        message: '已生成归档草案，尚未保存；请在对话中确认或拒绝。',
      })
    },
    {
      name: 'archive_note',
      description:
        '把一段内容归档为个人资料。需提供标题、分类、正文；可选标签与来源链接。这是写操作：调用后只生成草案并等待用户确认，不会直接写入。',
      schema: z.object({
        title: z.string().min(1).max(80).describe('资料标题（≤80 字）'),
        category: z.enum(CATEGORIES).describe('分类：learning 学习 / life 生活 / work 事务 / essay 随笔（个人写作与思考）'),
        content: z.string().min(1).describe('Markdown 正文'),
        tags: z.array(z.string().max(30)).max(10).optional().describe('标签'),
        source_url: z.string().url().optional().describe('来源链接（须 http/https）'),
      }),
    },
  )
}
