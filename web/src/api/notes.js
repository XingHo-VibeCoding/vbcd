// 资料接口封装：函数签名与页面调用约定保持一致，内部走统一 client。
// Day 8 起由 localStorage 适配层改为真实 HTTP（SPEC 第 3 章 3–5 接口）。
import { request } from './client.js'

/** 列表与检索（F2/F3）：返回 { total, items[], rebuilt, rebuiltAt, rebuiltInMs } */
export async function listNotes({ q = '', category = '' } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  const qs = params.toString()
  const data = await request(`/api/notes${qs ? `?${qs}` : ''}`)
  return {
    total: data.total,
    rebuilt: data.rebuilt,
    rebuiltAt: data.rebuilt_at,
    rebuiltInMs: data.rebuilt_in_ms,
    items: data.items,
  }
}

/** 读原文（F2）：返回 { meta: {...}, content } */
export async function getNote(id) {
  return request(`/api/notes/${encodeURIComponent(id)}`)
}

/** 新建资料（F1）：返回 { id, path, hash } */
export async function createNote(payload) {
  return request('/api/notes', { method: 'POST', body: payload })
}
