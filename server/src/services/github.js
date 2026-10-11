// GitHub 聚合服务（F15）：profile + calendar + events 一个出口，进程内 TTL 缓存。
// 降级口径（与前端灰条约定）：
//   未配 GITHUB_USERNAME → { configured:false }
//   已配用户名、抓 profile/events 成功但 calendar 失败（如未配 token）→ configured:true + calendar 为 null
//   整体抓不到（用户名错/网络断）→ 抛 GITHUB_UPSTREAM 502，由前端按 notesError 同款灰条处理
import { fetchProfile, fetchCalendar, fetchEvents } from './github/client.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const TTL_MS = Number(env('GITHUB_CACHE_TTL_MS', String(30 * 60 * 1000))) || 30 * 60 * 1000

let cache = null // { at, data }
let inflight = null // 单飞：TTL 过期瞬间并发请求只触发一次上游抓取

export function githubConfigured() {
  return Boolean(env('GITHUB_USERNAME'))
}

// TTL=0 → 关闭缓存（每次重新拉）；供冒烟/本机调试绕过
const cacheOn = () => TTL_MS > 0

async function load() {
  const login = env('GITHUB_USERNAME')
  const token = env('GITHUB_TOKEN')

  const profile = await fetchProfile(login, token)
  // calendar 必须 token；未配/失败都按「该块不可用」降级，不拖垮整卡
  const [calendar, events] = await Promise.all([
    token ? fetchCalendar(login, token).catch(() => null) : Promise.resolve(null),
    fetchEvents(login, token).catch(() => []),
  ])
  return { configured: true, profile, calendar, events }
}

/** 对外唯一入口：{ configured, profile?, calendar?, events? } */
export async function getGithubActivity() {
  if (!githubConfigured()) return { configured: false }
  const now = Date.now()
  if (cacheOn() && cache && now - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = load()
    .then((data) => {
      cache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
