// Refine authProvider：后台门禁。
// 规则（PLAN-admin §3 D4）：后台要求 AUTH_ENABLED=1 且已登录；公开模式下后台提示未启用。
import { request } from '../api/client.js'

export const authProvider = {
  // check 决定能否进后台：AUTH 未开启 → 拒绝并给提示；开启了则要求已登录（request 会抛 AUTH_REQUIRED）
  check: async () => {
    try {
      const health = await request('/api/health')
      if (!health?.auth_enabled) {
        return {
          authenticated: false,
          error: { message: '后台未启用：隐私模块关闭（AUTH_ENABLED=0），后台控制台需要登录态', name: 'AdminDisabled' },
          redirectTo: '/admin',
        }
      }
      // 已开启：探一下登录态（调一个轻量鉴权接口）
      await request('/api/me')
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
