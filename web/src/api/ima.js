// ima 云端知识库只读接口封装（F15 / SPEC 3.6）：三个 GET，全部只读，经统一 client 出口。
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
export function listImaKbs({ q = '', cursor = '', limit = 50 } = {}) {
  return request(`/api/ima/kbs${qs({ q, cursor, limit })}`)
}

/** 浏览条目：文件与文件夹混排（kind 区分），返回 { items, current_path, next_cursor, has_more } */
export function listImaItems({ kb_id, folder_id = '', cursor = '', limit = 50 } = {}) {
  return request(`/api/ima/items${qs({ kb_id, folder_id, cursor, limit })}`)
}

/** 库内搜索：返回 { items:[{kind,id,name,parent_folder_id,highlight}], truncated, next_cursor, has_more } */
export function searchImaKb({ kb_id, q, cursor = '' } = {}) {
  return request(`/api/ima/search${qs({ kb_id, q, cursor })}`)
}
