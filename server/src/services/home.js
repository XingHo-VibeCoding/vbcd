// 首页是业务数据的派生视图；精选开启时解析来源引用，关闭时兼容旧焦点聚合。
import { getMe } from './me.js'
import { getGithubProjects } from './github.js'
import { listAllDbNotes } from '../db/notes.js'
import { planningSnapshot } from '../db/planning.js'
import { fail } from './errors.js'
import { resolveSelections } from './curated.js'

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
    id: note.id, title: note.title, subtitle: note.excerpt, summary: note.excerpt, tag: note.category, image: '',
    url: `/notes/${encodeURIComponent(note.id)}`, source_type: 'note', source_label: '档案',
    visible: true, order: null, updated_at: note.updated_at, created_at: note.created_at,
  }
}

function siteFocusView(item, type, index) {
  const isProject = type === 'project'
  return {
    id: `${type}:${item.id || item.title || item.name || index}`,
    title: String(item.title ?? item.name ?? '').trim(),
    subtitle: String(item.subtitle ?? item.desc ?? '').trim(),
    summary: String(item.subtitle ?? item.desc ?? '').trim(),
    tag: String(item.tag ?? '').trim(),
    image: String(item.image ?? '').trim(),
    url: String(item.url ?? '').trim(),
    visible: item.visible !== false,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : null,
    icon: item.icon || '',
    source_type: `site_${type}`,
    source_label: isProject ? '站点项目' : '站点热点',
    updated_at: item.updated_at || null,
  }
}

function sortFocus(items) {
  return items
    .filter(item => item.visible !== false && item.title)
    .sort((a, b) => {
      const ao = a.order == null ? Infinity : a.order
      const bo = b.order == null ? Infinity : b.order
      return ao - bo || new Date(b.updated_at || 0) - new Date(a.updated_at || 0) || a.id.localeCompare(b.id)
    })
}

function focusQuotaKey(item) {
  if (item.source_type === 'note') return 'note'
  if (item.source_type === 'github') return 'github'
  if (item.source_type === 'site_hotspot' || item.source_type === 'site_project') return 'site'
  return 'other'
}

// 首页焦点区块保持来源多样性：资料最多 2 条、GitHub 最多 1 条、站点卡片最多 1 条。
// 配额是严格上限；某类不足时宁可少展示，也不让单一来源占满区块。
function selectFocus(items, limit = 4) {
  const quotas = { note: 2, github: 1, site: 1 }
  const counts = { note: 0, github: 0, site: 0, other: 0 }
  const selected = []
  for (const item of items) {
    const key = focusQuotaKey(item)
    if (key !== 'other' && counts[key] >= quotas[key]) continue
    selected.push(item)
    counts[key] += 1
    if (selected.length >= limit) break
  }
  return selected
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
  const curated = me.site?.site?.curated
  const selectedProjects = new Set(curated?.projects?.enabled ? curated.projects.items.map(item => `github:${item.id}`) : [])
  const projectUrls = new Set((github?.items || []).filter(repo => selectedProjects.has(`github:${repo.id}`)).map(repo => repo.htmlUrl))
  const focus = curated?.hotspots?.enabled ? resolveSelections(curated.hotspots, notes, github?.items) : sortFocus([
    ...(notes || []).filter(note => note.category !== 'essay' && note.tags?.includes('焦点')).map(note => ({ ...noteView(note), key: `note:${note.id}` })),
    ...(github?.items || []).filter(repo => repo.topics.includes('focus')).map(repo => ({
      key: `github:${repo.id}`, id: `github:${repo.id}`, title: repo.fullName,
      subtitle: repo.description || '', summary: repo.description || '', tag: 'focus', image: repo.avatarUrl || '',
      source_type: 'github', source_label: 'GitHub 项目', url: repo.htmlUrl,
      visible: true, order: null, updated_at: repo.updatedAt, pushed_at: repo.pushedAt, archived: repo.archived,
    })),
    ...(me.site?.hotspots || []).map((item, index) => siteFocusView(item, 'hotspot', index)),
    ...(me.site?.projects || []).map((item, index) => siteFocusView(item, 'project', index)),
  ]).filter(item => !selectedProjects.has(item.key || item.id) && !projectUrls.has(item.url))
  const needsNotes = !curated?.hotspots?.enabled || curated.hotspots.items.some(item => item.visible !== false && item.source === 'note')
  const needsGithub = !curated?.hotspots?.enabled || curated.hotspots.items.some(item => item.visible !== false && item.source === 'github')
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
    focus: { total: focus.length, items: curated?.hotspots?.enabled ? focus.slice(0, 4) : selectFocus(focus), mode: curated?.hotspots?.enabled ? 'curated' : 'automatic', partial: (needsNotes && notes === null) || (needsGithub && ['unavailable', 'stale', 'unconfigured'].includes(github?.state)) },
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
