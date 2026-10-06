// 假 ima 服务（冒烟桩）：实现 F15 三个只读端点的最小可用版。
// 用法：IMA_PORT=8097 node scripts/fake-ima.mjs
//   后端以 IMA_BASE_URL=http://127.0.0.1:8097 IMA_OPENAPI_CLIENTID=fake-cid IMA_OPENAPI_APIKEY=fake-key 启动。
//
// 场景由请求内容触发（smoke 据此覆盖各种链路）：
//   search_knowledge_base  → 返回 3 个固定库（kb-a / kb-b / kb-c）；带 query 则按名称过滤
//   get_knowledge_list     → kb-err 返回 code=110012（模拟上游业务错误）；其余返回 1 文件夹 + 1 文件
//   search_knowledge       → query="截断" 时返回 100 条（触发 truncated）；其余返回 2 条带 <em> 高亮
//   list_note              → 返回 2 篇固定笔记（平铺字段；note-1 的 summary 含 <mark>）
//   get_doc_content        → 返回 Markdown（含 <mark> 与一张图片）；未知 note_id 返回 210006
//   GET /counts            → 返回各上游路径被调用的次数（验证 IMA_CACHE_TTL_MS 缓存）
//   其他路径               → { code: 110012, msg: '接口无效' }
import { createServer } from 'node:http'

const PORT = Number(process.env.IMA_PORT || 8097)
const counts = {}

const KBS = [
  { kb_id: 'kb-a', kb_name: '课程笔记', cover_url: '', description: '高数/线代', recommended_questions: [], member_count: '1', content_count: '4', role_type: '创建者', base_type: '个人知识库' },
  { kb_id: 'kb-b', kb_name: '技术收藏', cover_url: '', description: '', recommended_questions: [], member_count: '1', content_count: '9', role_type: '创建者', base_type: '个人知识库' },
  { kb_id: 'kb-c', kb_name: '生活百科', cover_url: '', description: '', recommended_questions: [], member_count: '2', content_count: '0', role_type: '成员', base_type: '共享知识库' },
]

const NOTES = [
  { note_id: 'note-1', title: '测试笔记', summary: '这是一个<mark>测试</mark>文档', create_time: '1791201478100', modify_time: '1791201489831', cover_image: '', note_ext_info: { folder_id: '', folder_name: '' } },
  { note_id: 'note-2', title: '指南', summary: 'ima 笔记可以帮助你随时随地记录想法', create_time: '1791077219711', modify_time: '1791203945641', cover_image: '', note_ext_info: { folder_id: 'f-x', folder_name: '工作' } },
]

const NOTE_MD = [
  '# 测试笔记',
  '',
  '这是一个<mark>测试</mark>文档。',
  '',
  '![示意图](https://fake.example/x.png?t=expired&sign=dead)',
  '',
  '第二段。',
  '',
].join('\n')

const srv = createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  counts[req.url] = (counts[req.url] ?? 0) + 1
  const send = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
  let json = {}
  try { json = JSON.parse(body || '{}') } catch { json = {} }

  if (req.url === '/counts' && req.method === 'GET') {
    return send({ counts })
  }

  if (req.url === '/openapi/wiki/v1/search_knowledge_base') {
    const { query = '', cursor = '', limit = 20 } = json
    const all = KBS.filter((k) => !query || k.kb_name.includes(query))
    return send({ code: 0, msg: 'success', data: { info_list: all.slice(0, limit), is_end: true, next_cursor: '' } })
  }

  if (req.url === '/openapi/wiki/v1/get_knowledge_base') {
    const infos = {}
    for (const id of json.ids ?? []) {
      const kb = KBS.find((k) => k.kb_id === id)
      if (kb) infos[id] = { id, name: kb.kb_name, cover_url: '', description: kb.description, recommended_questions: [] }
    }
    return send({ code: 0, msg: 'success', data: { infos } })
  }

  if (req.url === '/openapi/wiki/v1/get_knowledge_list') {
    const { knowledge_base_id, folder_id = '', cursor = '', limit = 20 } = json
    if (knowledge_base_id === 'kb-err') {
      return send({ code: 110012, msg: '接口无效', data: {} })
    }
    const atRoot = !folder_id
    const list = atRoot
      ? [
          { folder_id: 'f-1', name: '第一章', file_number: '2', folder_number: '0', parent_folder_id: '001aa', is_top: false },
          { media_id: 'm-1', title: '微积分讲义', parent_folder_id: '001aa', media_type: 1 },
        ]
      : [{ media_id: 'm-2', title: '第一章习题', parent_folder_id: folder_id, media_type: 1 }]
    return send({
      code: 0, msg: 'success',
      data: {
        knowledge_list: list.slice(0, limit),
        is_end: true,
        next_cursor: '',
        current_path: [{ folder_id: '001aa', name: '根目录', file_number: '2', folder_number: '0', parent_folder_id: '', is_top: false }],
      },
    })
  }

  if (req.url === '/openapi/wiki/v1/search_knowledge') {
    const { query = '', cursor = '' } = json
    const n = query === '截断' ? 100 : 2
    return send({
      code: 0, msg: 'success',
      data: {
        info_list: Array.from({ length: n }, (_, i) => ({
          media_id: `m-${i}`,
          title: `命中${i}`,
          parent_folder_id: '001aa',
          highlight_content: `前文<em>${query}</em>命中${i}后文`,
        })),
        is_end: true,
        next_cursor: '',
      },
    })
  }

  if (req.url === '/openapi/note/v1/list_note') {
    const { cursor = '', limit = 20 } = json
    return send({ code: 0, msg: 'success', data: { note_book_list: NOTES.slice(0, limit), is_end: true, next_cursor: '' } })
  }

  if (req.url === '/openapi/note/v1/get_doc_content') {
    const { note_id } = json
    if (!NOTES.some((n) => n.note_id === note_id)) {
      return send({ code: 210006, msg: 'NOTE_IS_DELETE', data: {} })
    }
    return send({ code: 0, msg: 'success', data: { content: NOTE_MD } })
  }

  return send({ code: 110012, msg: '接口无效', data: {} })
})

srv.listen(PORT, '127.0.0.1', () => console.log(`fake-ima 听于 http://127.0.0.1:${PORT}`))
