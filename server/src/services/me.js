// 个人主页数据（个人主页接口的数据源）：
//   data/profile.md   frontmatter 取 nickname / avatar / bio 三个字段
//   data/schedule.md  正文逐行一条日程：- YYYY-MM-DD [HH:mm] 事项
// 两个文件都在 data/ 根级而非子目录——files.js:list() 只遍历子目录，不会进资料索引。
// 文件缺失或为空不抛错：返回空 profile / 空 schedule，由前端降级展示。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from '../storage/files.js'

const PROFILE_FILE = path.join(DATA_DIR, 'profile.md')
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.md')

// 日程行：- 2026-09-26 14:00 训练营打卡（HH:mm 可省略）
const SCHEDULE_LINE = /^-\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s+(.+)$/

/** 读文件，不存在或读失败时返回空串（个人主页不该因数据文件问题报错） */
async function readOrEmpty(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

/** 只取 frontmatter 里关心的三个字段；没有 frontmatter 视为空 profile */
function parseProfile(raw) {
  const profile = { nickname: '', avatar: '', bio: '' }
  if (!raw.startsWith('---')) return profile
  const close = raw.indexOf('\n---', 3)
  if (close === -1) return profile

  for (const line of raw.slice(3, close).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(':')
    if (at === -1) continue
    const key = trimmed.slice(0, at).trim()
    const value = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, '') // 去掉可选的引号
    if (key in profile) profile[key] = value
  }
  return profile
}

/** 逐行解析日程；不合法的行静默跳过；按 日期+时间 升序 */
function parseSchedule(raw) {
  return raw
    .split('\n')
    .map((line) => SCHEDULE_LINE.exec(line.trim()))
    .filter(Boolean)
    .map(([, date, time, title]) => ({ date, time: time || '', title: title.trim() }))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

/** 个人主页接口数据：{ profile, schedule } */
export async function getMe() {
  const [profileRaw, scheduleRaw] = await Promise.all([readOrEmpty(PROFILE_FILE), readOrEmpty(SCHEDULE_FILE)])
  return { profile: parseProfile(profileRaw), schedule: parseSchedule(scheduleRaw) }
}
