import { request } from './client.js'

export function getPlanning({ from, to, planStatus, scheduleStatus, q, type, id } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (planStatus) params.set('plan_status', planStatus)
  if (scheduleStatus) params.set('schedule_status', scheduleStatus)
  if (q) params.set('q', q)
  if (type) params.set('type', type)
  if (id) params.set('id', id)
  return request(`/api/planning?${params}`)
}

export function proposePlanningChange(input) {
  return request('/api/planning/drafts', { method: 'POST', body: input })
}

export function getPlanningDraft(id) {
  return request(`/api/planning/drafts/${encodeURIComponent(id)}`)
}

export function decidePlanningDraft(id, decision, reviewToken) {
  return request(`/api/planning/drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: { decision, review_token: reviewToken },
  })
}
