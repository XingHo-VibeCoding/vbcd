// Refine authProvider：后台门禁。
// 后台要求鉴权功能开启（全站隐私模式或读写分离模式）且已登录；完全公开模式下提示未启用。
import { request } from '../api/client.js'

export const authProvider = {
  // check 决定能否进后台：两种鉴权开关都关闭 → 拒绝；任一开启则由受保护接口验证 session。
  check: async () => {
    try {
      const health = await request('/api/health')
      if (!health?.auth_enabled && !health?.auth_write_required) {
        return {
          authenticated: false,
          error: { message: '后台未启用：鉴权未开启，后台控制台需要登录态', name: 'AdminDisabled' },
          redirectTo: '/admin',
        }
      }
      // 已开启：探一下登录态。/api/me 在读写分离模式下是公开读口，不能用它判断会话。
      // 后台总览始终挂 requireAuthForWrite，游客会在这里得到 AUTH_WRITE_REQUIRED。
      await request('/api/admin/overview')
      return { authenticated: true }
    } catch (err) {
      return {
        authenticated: false,
        error: { message: err?.message || '未登录或后台不可用', name: err?.code || 'AuthError' },
        redirectTo: '/login',
      }
    }
  },

  login: async ({ username, password }) => {
    await request('/api/login', { method: 'POST', body: { username, password } })
    return { success: true, redirectTo: '/admin' }
  },

  logout: async () => {
    try {
      await request('/api/logout', { method: 'POST' })
    } catch {
      // 登出失败不阻塞
    }
    return { success: true, redirectTo: '/login' }
  },

  getIdentity: async () => {
    const me = await request('/api/me')
    return me
  },

  onError: async (error) => {
    if (error?.status === 401) return { logout: true, redirectTo: '/login' }
    return {}
  },
}
