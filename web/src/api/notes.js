// 资料接口封装：函数签名与页面调用约定保持一致，内部走统一 client。
// Day 8 起由 localStorage 适配层改为真实 HTTP（SPEC 第 3 章 3–5 接口）。
import { request } from './client.js'

/** 列表与检索（F2/F3）：返回 { total, items[], rebuilt, rebuiltAt, rebuiltInMs }。
 * Day 17：数据源由文件索引（/api/notes）切换为 Postgres（/api/db/notes）；
 * db 接口不返回 rebuilt* 字段，前端以缺省值兜底（不再显示索引耗时行）。
 * 若需回退到文件版：把下面两个 /api/db/notes 改回 /api/notes 即可。
 */
export async function listNotes({ q = '', category = '' } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  const qs = params.toString()
  const data = await request(`/api/db/notes${qs ? `?${qs}` : ''}`)
  return {
    total: data.total,
    rebuilt: data.rebuilt ?? false,
    rebuiltAt: data.rebuilt_at ?? '',
    rebuiltInMs: data.rebuilt_in_ms ?? 0,
    items: data.items,
  }
}

/** 读原文（F2）：返回 { meta: {...}, content } */
export async function getNote(id) {
  return request(`/api/db/notes/${encodeURIComponent(id)}`)
}

/** 新建资料（F1）：返回 { id, path, hash } */
export async function createNote(payload) {
  return request('/api/notes', { method: 'POST', body: payload })
}
