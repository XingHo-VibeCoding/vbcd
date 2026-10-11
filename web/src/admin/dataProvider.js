// Refine dataProvider：把 Refine 的资源调用翻译成 buddy 的 { ok, data } 契约。
// 复用 api/client.js 的 request() —— 它已统一了 fetch、Cookie、错误归一（code/message）。
import { request } from '../api/client.js'

// Refine 期望 list 返回 { data, total }；buddy 列表接口返回 { total, items } 或数组。
// 这里做统一归一。
function toListResult(data) {
  if (Array.isArray(data)) return { data, total: data.length }
  if (data && Array.isArray(data.items)) {
    return { data: data.items, total: data.total ?? data.items.length }
  }
  return { data: [], total: 0 }
}

export const dataProvider = {
  getList: async ({ resource, pagination, filters, sorters }) => {
    const params = new URLSearchParams()
    // Refine 分页：current/pageSize → 后端 offset/limit
    const current = pagination?.current ?? 1
    const pageSize = pagination?.pageSize ?? 20
    if (pagination?.mode !== 'off') {
      params.set('limit', String(pageSize))
      params.set('offset', String((current - 1) * pageSize))
    }
    // 简单筛选：把 Refine filters 里的 {field,operator:'eq'|'contains',value} 透成 ?field=
    for (const f of filters ?? []) {
      if (f.operator === 'eq' || f.operator === 'contains') {
        params.set(f.field, String(f.value))
      } else if (f.operator === 'eq' && f.field === 'q') {
        params.set('q', String(f.value))
      }
    }
    const qs = params.toString()
    const data = await request(`/api/${resource}${qs ? `?${qs}` : ''}`)
    return toListResult(data)
  },

  getOne: async ({ resource, id }) => {
    const data = await request(`/api/${resource}/${id}`)
    return { data }
  },

  create: async ({ resource, variables }) => {
    const data = await request(`/api/${resource}`, { method: 'POST', body: variables })
    return { data }
  },

  update: async ({ resource, id, variables }) => {
    const data = await request(`/api/${resource}/${id}`, { method: 'PATCH', body: variables })
    return { data }
  },

  deleteOne: async ({ resource, id }) => {
    const data = await request(`/api/${resource}/${id}`, { method: 'DELETE' })
    return { data }
  },

  getApiUrl: () => '/api',
}
