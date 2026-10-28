// 工具清单（manifest 与实现分离，借 LibreChat manifest.json 思路）
// 每个条目声明：name / description / risk / authFields / build。
//   risk: 'readonly'       → 循环内直接执行
//   risk: 'needs-confirm'  → 不执行，生成 Confirmation 后挂起循环（428 闸门，铁律 1）
//   authFields             → 该工具依赖的环境变量名（未配置时工具不进白名单，前端可灰显）
// build() 返回 langchain tool() 实例；延迟到 registry 里按需调用，避免 import 即连外部服务。

import { searchNotesTool } from './tools/search-notes.js'
import { getNoteTool } from './tools/get-note.js'
import { askKbTool } from './tools/ask-kb.js'
import { archiveNoteTool } from './tools/archive-note.js'
import { getPlanningTool } from './tools/get-planning.js'
import { proposePlanningTool } from './tools/propose-planning.js'

export const TOOL_MANIFEST = [
  {
    name: 'get_planning',
    description: '查询计划、项目子任务、依赖与日程及完成/取消历史，定位已有记录并检查安排',
    risk: 'readonly',
    authFields: [],
    build: getPlanningTool,
  },
  {
    name: 'propose_planning',
    description: '生成新增、修改、完成或取消规划的草案，确认后才生效',
    risk: 'needs-confirm',
    authFields: [],
    build: proposePlanningTool,
  },
  {
    name: 'search_notes',
    description: '在个人资料库中按关键词检索资料条目，返回标题/分类/日期/标签/摘要列表',
    risk: 'readonly',
    authFields: [],
    build: searchNotesTool,
  },
  {
    name: 'get_note',
    description: '按 id 读取一条资料的全文与元数据',
    risk: 'readonly',
    authFields: [],
    build: getNoteTool,
  },
  {
    name: 'ask_kb',
    description: '基于向量索引的知识库问答，返回带来源的答案（覆盖资料全文语义检索）',
    risk: 'readonly',
    authFields: ['OPENAI_API_KEY', 'CHROMA_URL'],
    build: askKbTool,
  },
  {
    name: 'archive_note',
    description: '把一段内容整理成资料归档（生成标题/分类/标签草案，经用户确认后写入）',
    risk: 'needs-confirm',
    authFields: [],
    build: archiveNoteTool,
  },
]
