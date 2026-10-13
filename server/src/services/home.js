// 首页是业务数据的派生视图，不读旧热点、项目清单或手填统计。
import { getMe } from './me.js'
import { getGithubProjects } from './github.js'
import { listAllDbNotes } from '../db/notes.js'
import { planningSnapshot } from '../db/planning.js'
import { fail } from './errors.js'

const DAY = 24 * 60 * 60 * 1000
const TZ = 'Asia/Shanghai'
const groups = ['overdue', 'doing', 'upcoming', 'unscheduled']

export function shanghaiDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function dayWindow(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw fail('VALIDATION_FAILED', 'date 必须为 YYYY-MM-DD')
  const start = new Date(`${date}T00:00:00+08:00`)
  if (!Number.isFinite(start.getTime()) || shanghaiDate(start) !== date) throw fail('VALIDATION_FAILED', 'date 不是有效日期')
  return { from: start.toISOString(), to: new Date(start.getTime() + DAY).toISOString() }
}

function noteView(note) {
  return {
    id: note.id, title: note.title, summary: note.excerpt, category: note.category,
    url: `/notes/${encodeURIComponent(note.id)}`, source_type: 'note', source_label: '档案',
    updated_at: note.updated_at, created_at: note.created_at,
  }
}

function planGroup(plan, now) {
  if (plan.due_at && new Date(plan.due_at) < now) return 'overdue'
  if (plan.status === 'doing') return 'doing'
  return plan.start_at || plan.due_at ? 'upcoming' : 'unscheduled'
}

// 纯聚合函数供边界测试使用；失败与空集合是两种不同状态。
export function buildHome({ me, notes, planning, github, date, now, sources }) {
  const window = dayWindow(date)
  const statsWindow = dayWindow(shanghaiDate(now))
  const recentFrom = new Date(new Date(statsWindow.from).getTime() - 6 * DAY)
  const focus = [
    ...(notes || []).filter(note => note.category !== 'essay' && note.tags?.includes('焦点')).map(note => ({ ...noteView(note), key: `note:${note.id}` })),
    ...(github?.items || []).filter(repo => repo.topics.includes('focus')).map(repo => ({
      key: `github:${repo.id}`, id: repo.id, title: repo.fullName, summary: repo.description,
      source_type: 'github', source_label: 'GitHub 项目', url: repo.htmlUrl,
      updated_at: repo.updatedAt, pushed_at: repo.pushedAt, archived: repo.archived,
    })),
  ].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0) || a.key.localeCompare(b.key))
  const essays = notes === null ? null : notes.filter(note => note.category === 'essay')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || a.id.localeCompare(b.id))
    .slice(0, 3).map(noteView)
  const plans = planning === null ? null : planning.plans.filter(plan => !['done', 'cancelled'].includes(plan.status))
    .map(plan => ({ ...plan, group: planGroup(plan, now), source_label: '长期计划' }))
    .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || b.priority - a.priority ||
      (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity) || a.id.localeCompare(b.id))
  const schedules = planning === null ? null : planning.schedules.filter(item => item.status !== 'cancelled')
    .filter(item => {
      const end = item.end_at ? new Date(item.end_at) : new Date(new Date(item.start_at).getTime() + DAY)
      return new Date(item.start_at) < new Date(window.to) && end > new Date(window.from)
    }).map(item => {
      const start = new Date(item.start_at)
      const end = item.end_at ? new Date(item.end_at) : new Date(start.getTime() + DAY)
      return { ...item, time_state: now < start ? 'upcoming' : now < end ? 'ongoing' : 'ended',
        completion_state: item.status === 'completed' ? 'completed' : 'incomplete', source_label: '日程' }
    }).sort((a, b) => new Date(a.start_at) - new Date(b.start_at) || a.id.localeCompare(b.id))
  // 仅透传视觉和社交配置，旧业务展示字段不进入新首页。
  const { stats: _oldStats, hotspots: _oldHotspots, projects: _oldProjects, ...site } = me.site || {}
  return {
    timezone: TZ, generated_at: now.toISOString(), profile: me.profile, site,
    stats: notes === null ? null : {
      notes_total: notes.length,
      notes_added_7d: notes.filter(note => new Date(note.created_at) >= recentFrom && new Date(note.created_at) < new Date(statsWindow.to)).length,
      from: recentFrom.toISOString(), to: statsWindow.to,
    },
    focus: { total: focus.length, items: focus.slice(0, 4), partial: notes === null || ['unavailable', 'stale', 'unconfigured'].includes(github?.state) },
    today: { date, ...window, items: schedules, read_at: planning ? now.toISOString() : null },
    plans: plans === null ? null : { total: plans.length, items: plans.slice(0, 5), read_at: now.toISOString() },
    essays, sources,
  }
}

export async function getHome({ date, now = new Date() } = {}, dependencies = {}) {
  const selectedDate = date || shanghaiDate(now)
  const window = dayWindow(selectedDate)
  const deps = { getMe, listNotes: listAllDbNotes, planningSnapshot, getGithubProjects, ...dependencies }
  const [me, notes, planning, github] = await Promise.allSettled([
    deps.getMe(), deps.listNotes(), deps.planningSnapshot(window), deps.getGithubProjects(),
  ])
  if (me.status === 'rejected') throw me.reason
  const localSource = (result, label) => result.status === 'fulfilled'
    ? { label, state: 'fresh', read_at: now.toISOString() }
    : { label, state: 'unavailable', read_at: null, error: { code: result.reason?.code || 'INTERNAL', message: `${label}暂不可用，请稍后重试` } }
  const projects = github.status === 'fulfilled' ? github.value : { state: 'unavailable', items: [], synced_at: null, error: { code: github.reason?.code || 'GITHUB_UPSTREAM', message: 'GitHub 项目暂不可用' } }
  const noteData = notes.status === 'fulfilled' ? notes.value : null
  const planningData = planning.status === 'fulfilled' ? planning.value : null
  return buildHome({
    me: me.value, notes: noteData, planning: planningData,
    github: projects, date: selectedDate, now,
    sources: {
      profile: { label: '个人资料', state: 'fresh', read_at: now.toISOString() },
      notes: localSource(notes, 'PostgreSQL 档案'), planning: localSource(planning, 'PostgreSQL 规划'),
      github: { label: 'GitHub', state: projects.state, synced_at: projects.synced_at, error: projects.error || null },
    },
  })
}
