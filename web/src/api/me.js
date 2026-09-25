// 个人主页接口封装
import { request } from './client.js'

/** 个人信息 + 日程：{ profile: { nickname, avatar, bio }, schedule: [{ date, time, title }] } */
export async function getMe() {
  return request('/api/me')
}
