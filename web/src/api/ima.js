// ima 云端只读接口封装（F15 知识库 + F15b 笔记 / SPEC 3.6-3.7）：五个 GET，全部只读，经统一 client 出口。
import { request } from './client.js'

function qs(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** 列知识库：返回 { items:[{id,name,cover_url,description,recommended_questions,member_count,content_count,...}], next_cursor, has_more } */
// ima 上游 limit 实测上限 20（文档写 50 不实，服务端也会夹紧）；写大毫无意义
export function listImaKbs({ q = '', cursor = '', limit = 20 } = {}) {
  return request(`/api/ima/kbs${qs({ q, cursor, limit })}`)
}

/** 浏览条目：文件与文件夹混排（kind 区分），返回 { items, current_path, next_cursor, has_more } */
export function listImaItems({ kb_id, folder_id = '', cursor = '', limit = 20 } = {}) {
  return request(`/api/ima/items${qs({ kb_id, folder_id, cursor, limit })}`)
}

/** 库内搜索：返回 { items:[{kind,id,name,parent_folder_id,highlight}], truncated, next_cursor, has_more } */
export function searchImaKb({ kb_id, q, cursor = '' } = {}) {
  return request(`/api/ima/search${qs({ kb_id, q, cursor })}`)
}

/** 列 ima 笔记：返回 { items:[{id,title,summary,created_at,updated_at,folder_id,folder_name}], next_cursor, has_more } */
export function listImaNotes({ cursor = '', limit = 20 } = {}) {
  return request(`/api/ima/notes${qs({ cursor, limit })}`)
}

/** 单篇笔记：返回 { meta:{id,title,created_at,updated_at,folder_id,folder_name}, content } —— content 是 Markdown 字符串 */
export function getImaNote(id) {
  return request(`/api/ima/notes/${encodeURIComponent(id)}`)
}
