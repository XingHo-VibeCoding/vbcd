// 登录/登出接口封装（SPEC 第 3 章 1–2）
import { request } from './client.js'

export function login(password) {
  return request('/api/login', { method: 'POST', body: { password } })
}

export function logout() {
  return request('/api/logout', { method: 'POST' })
}
