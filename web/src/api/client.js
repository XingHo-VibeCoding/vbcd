// 统一 HTTP 出口：所有接口请求都走这里。
// 成功时返回后端响应的 data 字段；失败时抛出带 code/status 的 Error，页面据此提示或跳登录。
//
// 鉴权错误码（SPEC §5.6.7）：两类 401 都回到登录页，并保留当前路径。
let authRedirectStarted = false

export function redirectOnAuthError(code, status = 401) {
  if (status !== 401 || !['AUTH_REQUIRED', 'AUTH_WRITE_REQUIRED'].includes(code)) return
  if (typeof window === 'undefined' || window.location.pathname === '/login' || authRedirectStarted) return
  const from = `${window.location.pathname}${window.location.search}${window.location.hash}`
  authRedirectStarted = true
  window.location.assign(`/login?from=${encodeURIComponent(from || '/')}`)
}

export async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'include', // 带上会话 Cookie（登录态）
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw Object.assign(new Error('无法连接后端服务，请确认它已启动'), { code: 'NETWORK', status: 0 })
  }

  if (res.status === 204) return null // 登出等无返回体的成功

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok || data?.ok === false) {
    const code = data?.error?.code || (res.status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL')
    const message = data?.error?.message || `请求失败（HTTP ${res.status}）`
    redirectOnAuthError(code, res.status)
    throw Object.assign(new Error(message), { code, status: res.status })
  }

  return data?.data
}
