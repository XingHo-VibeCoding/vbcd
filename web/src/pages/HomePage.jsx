// 首页：只展示来自真实业务源的个人状态、焦点、今日日程、长期计划与随笔。
// 统一入口 GET /api/home；旧 site.json.stats/hotspots/projects 不再作为业务数据使用。
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHome } from '../api/home.js'
import { getTheme, toggleTheme, watchOtherTabs, watchSystemTheme } from '../theme.js'

// 主卡保持统一磨砂；静态容器不使用可点击式悬停阴影。
const GLASS = 'site-glass-card min-w-0 hover:shadow-card'
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const TIME_LABEL = { ended: '已结束', ongoing: '进行中', upcoming: '未开始' }
const PLAN_LABEL = { overdue: '逾期', doing: '进行中', upcoming: '未开始', unscheduled: '待安排' }
const STATUS_STYLE = {
  ended: 'bg-slate-500/15 text-slate-500', ongoing: 'bg-warning/15 text-amber-600 dark:text-amber-400', upcoming: 'bg-info/15 text-info',
  overdue: 'bg-danger/15 text-danger', doing: 'bg-warning/15 text-amber-600 dark:text-amber-400', unscheduled: 'bg-slate-500/15 text-slate-500',
}

function formatDateTime(iso, options = {}) {
  if (!iso) return '未设置'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...options }).format(date)
}

function formatTimeRange(item) {
  if (item.all_day) return '全天'
  const startDate = shanghaiDay(new Date(item.start_at))
  const endDate = shanghaiDay(new Date(item.end_at))
  const options = startDate === endDate ? { hour: '2-digit', minute: '2-digit' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  return `${formatDateTime(item.start_at, options)}–${formatDateTime(item.end_at, options)}`
}

function shanghaiDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function weekOf(value) {
  const base = new Date(`${value}T12:00:00Z`)
  const offset = (base.getUTCDay() + 6) % 7
  base.setUTCDate(base.getUTCDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base)
    date.setUTCDate(base.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function SourceLine({ source, children }) {
  const stale = source?.state === 'stale'
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs text-slate-400 dark:text-slate-500">
      <span>{children}</span>
      {source?.read_at ? <span>读取于 {formatDateTime(source.read_at, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> : null}
      {source?.synced_at ? <span className={stale ? 'text-amber-600 dark:text-amber-400' : ''}>{stale ? '缓存于' : '同步于'} {formatDateTime(source.synced_at, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> : null}
    </div>
  )
}

function Badge({ label, tone = 'upcoming' }) {
  return <span className={`shrink-0 rounded-full px-2 py-1 font-sans text-[11px] font-black tracking-wide ${STATUS_STYLE[tone] || STATUS_STYLE.upcoming}`}>{label}</span>
}

function FocusCard({ item }) {
  const external = /^https?:\/\//i.test(item.url || '')
  const internal = /^\//.test(item.url || '')
  const content = (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-white/50 bg-white/40 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
      {item.image ? <img src={item.image} alt="" className="h-28 w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : null}
      <div className="flex flex-1 flex-col justify-between p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-xs font-black tracking-widest text-brand">{item.tag || '焦点'} · {item.source_label}</span>
          {item.archived ? <Badge label="已归档" tone="ended" /> : null}
        </div>
        <h3 className="mt-2 line-clamp-2 text-base md:text-lg font-black leading-snug text-slate-900 dark:text-slate-100">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.subtitle || item.summary || '暂无摘要'}</p>
      </div>
      <div className="mt-2 font-sans text-xs text-slate-400">{item.source_label || item.source_type}{item.updated_at ? <> · 更新于 {formatDateTime(item.updated_at, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</> : null}{external && item.pushed_at ? <span className="block">最近推送 {formatDateTime(item.pushed_at, { year: 'numeric', month: 'numeric', day: 'numeric' })}</span> : null}</div>
      </div>
    </div>
  )
  if (external) return <a href={item.url} target="_blank" rel="noreferrer">{content}</a>
  if (internal) return <Link to={item.url}>{content}</Link>
  return content
}

function TodaySchedule({ today, onDateChange }) {
  const date = today?.date || ''
  const week = date ? weekOf(date) : []
  const items = today?.items || []
  const unavailable = today?.items === null
  const grouped = ['ended', 'ongoing', 'upcoming'].map(state => ({ state, items: items.filter(item => item.time_state === state) })).filter(group => group.items.length)
  return (
    <section className={`flex flex-col p-4 ${GLASS}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">📅 今日日程</h2>
          <p className="mt-1 font-sans text-xs text-slate-400">北京时间 · {date || '—'} · <Link className="inline-flex min-h-11 items-center text-sm text-brand hover:underline" to="/planning?tab=schedules">查看日程</Link></p>
        </div>
        <div className="flex gap-1">
          <button type="button" className="min-h-11 rounded-xl px-3 font-sans text-sm text-brand hover:bg-brand/10" onClick={() => onDateChange(shanghaiDay())}>今天</button>
          <button type="button" className="min-h-11 min-w-11 rounded-xl px-2 py-1 font-sans text-sm text-brand hover:bg-brand/10" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="前一天">‹</button>
          <button type="button" className="min-h-11 min-w-11 rounded-xl px-2 py-1 font-sans text-sm text-brand hover:bg-brand/10" onClick={() => onDateChange(shiftDate(date, 1))} aria-label="后一天">›</button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-7 gap-1">
        {week.map((day, index) => (
          <button key={day} type="button" onClick={() => onDateChange(day)} className={`min-h-11 min-w-0 rounded-xl py-1 font-sans text-center ${day === date ? 'bg-brand text-white' : 'bg-white/40 text-slate-500 dark:bg-white/5 dark:text-slate-300'}`}>
            <span className="block text-[11px] font-black">{WEEKDAYS[index]}</span><span className="text-sm font-bold tabular-nums">{day.slice(8)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {unavailable ? <p role="alert" className="py-6 text-center text-sm text-danger">日程读取失败，不代表当天没有安排。</p> : grouped.length ? grouped.map(group => (
          <div key={group.state}>
            <div className="mb-2 font-sans text-xs font-black tracking-widest text-slate-400">{TIME_LABEL[group.state]}</div>
            <div className="flex flex-col gap-2">
              {group.items.map(item => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl bg-white/40 px-3 py-2 dark:bg-white/5">
                  <span className="min-w-[76px] font-sans tabular-nums text-xs font-bold text-brand">{formatTimeRange(item)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-200">{item.title}</span>
                  <Badge label={item.completion_state === 'completed' ? '已完成' : '未完成'} tone={item.completion_state === 'completed' ? 'doing' : group.state} />
                </div>
              ))}
            </div>
          </div>
        )) : <p className="py-6 text-center text-sm text-slate-400">这一天暂无日程</p>}
      </div>
      <SourceLine source={{ read_at: today?.read_at }}>来源：PostgreSQL 规划</SourceLine>
    </section>
  )
}

function PlansCard({ plans }) {
  return (
    <section className={`flex flex-col p-4 ${GLASS}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">🧭 长期计划</h2><p className="mt-1 font-sans text-xs text-slate-400">不显示即时运行日志</p></div><Link to="/planning" className="inline-flex min-h-11 shrink-0 items-center font-sans text-sm font-bold text-brand hover:underline">查看全部计划 →</Link></div>
      {plans === null ? <p className="py-6 text-center text-sm text-slate-400">计划暂不可用</p> : plans.items.length ? <ul className="flex flex-col gap-2">{plans.items.map(plan => <li key={plan.id} className="rounded-xl border border-white/50 bg-white/40 px-3 py-3 dark:border-white/10 dark:bg-white/5"><div className="flex items-start gap-2"><span className="min-w-0 flex-1 text-base md:text-lg font-black leading-snug text-slate-900 dark:text-slate-100">{plan.title}</span><Badge label={PLAN_LABEL[plan.group]} tone={plan.group} /></div><div className="mt-1 font-sans text-xs text-slate-400">{plan.due_at ? `截止 ${formatDateTime(plan.due_at, { year: 'numeric', month: 'numeric', day: 'numeric' })}` : plan.start_at ? `开始 ${formatDateTime(plan.start_at, { year: 'numeric', month: 'numeric', day: 'numeric' })}` : '尚未安排日期'}{plan.description ? ` · ${plan.description}` : ''}</div></li>)}</ul> : <p className="py-6 text-center text-sm text-slate-400">暂无未完成计划 · 去 agent 生成一个草案</p>}
      {plans ? <SourceLine source={{ read_at: plans.read_at }}>来源：PostgreSQL 计划 · 共 {plans.total} 条未完成</SourceLine> : null}
    </section>
  )
}

export function EssaysCard({ essays }) {
  return (
    <section className={`flex flex-col p-4 ${GLASS}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">✒️ 随笔</h2><p className="mt-1 font-sans text-xs text-slate-400">最近写下的思考</p></div><Link to="/notes?category=essay" className="inline-flex min-h-11 shrink-0 items-center font-sans text-sm font-bold text-brand hover:underline">查看全部随笔 →</Link></div>
      {essays === null ? <p className="py-6 text-center text-sm text-slate-400">随笔暂不可用</p> : essays.length ? <div className="flex flex-col gap-2">{essays.map(item => <Link key={item.id} to={item.url} className="rounded-xl border border-white/50 bg-white/40 px-3 py-3 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"><div className="truncate text-base md:text-lg font-black leading-snug text-slate-900 dark:text-slate-100">{item.title}</div><div className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.summary || '打开阅读这篇随笔'}</div><div className="mt-1 font-sans text-xs text-slate-400">创建于 {formatDateTime(item.created_at, { year: 'numeric', month: 'numeric', day: 'numeric' })} · 来源：个人档案</div></Link>)}</div> : <p className="py-6 text-center text-sm text-slate-400">暂无随笔档案</p>}
    </section>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [date, setDate] = useState(shanghaiDay)
  const [followToday, setFollowToday] = useState(true)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(getTheme)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestSequence = useRef(0)

  function changeDate(value) {
    setFollowToday(value === shanghaiDay())
    setDate(value)
  }

  useEffect(() => {
    let alive = true
    setError('')
    async function refresh() {
      if (followToday && date !== shanghaiDay()) { setDate(shanghaiDay()); return }
      const sequence = ++requestSequence.current
      try {
        const value = await getHome(date)
        if (alive && sequence === requestSequence.current) { setData(value); setError('') }
      } catch (err) {
        if (alive && sequence === requestSequence.current) {
          if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/', { replace: true })
          else setError(err.message || '首页数据加载失败')
        }
      }
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    return () => { alive = false; clearInterval(timer) }
  }, [date, followToday, navigate, retry])

  useEffect(() => { const a = watchSystemTheme(setTheme); const b = watchOtherTabs(setTheme); return () => { a(); b() } }, [])

  if (error && !data) return <div className="error-bar" role="alert">{error} · 每分钟自动重试 <button type="button" className="min-h-11 rounded-xl px-3 font-sans text-sm font-bold hover:bg-brand/10" onClick={() => setRetry(value => value + 1)}>立即重试</button></div>
  if (!data) return <div className="loading">首页数据载入中…</div>

  const profile = data.profile || {}
  const site = data.site || {}
  const nickname = profile.nickname || 'buddy'
  const initial = nickname.trim().charAt(0).toUpperCase() || 'B'
  const projectsState = data.sources?.github
  const stats = data.stats
  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="error-bar flex items-center justify-between gap-3" role="alert"><span>刷新失败，显示上次成功读取的数据（{formatDateTime(data.generated_at, { hour: '2-digit', minute: '2-digit' })}）。</span><button type="button" className="min-h-11 rounded-xl px-3 font-sans text-sm font-bold hover:bg-brand/10" onClick={() => setRetry(value => value + 1)}>立即重试</button></p> : null}
      {data.sources.notes.state === 'unavailable' ? <p className="error-bar" role="alert">档案读取失败：统计、随笔和档案焦点暂不可用。</p> : null}
      {data.sources.planning.state === 'unavailable' ? <p className="error-bar" role="alert">规划读取失败：日程和计划暂不可用。</p> : null}
      <div className="grid items-stretch gap-4 md:grid-cols-[1.25fr_.75fr]">
        <section className={`group flex flex-col gap-3 p-4 ${GLASS}`}>
          <div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-300 to-pink-300 text-2xl font-black text-indigo-800 shadow-lg">{profile.avatar && !avatarBroken ? <img className="h-full w-full rounded-xl object-cover" src={profile.avatar} onError={() => setAvatarBroken(true)} alt={`${nickname} 的头像`} /> : initial}</div><div className="min-w-0"><h2 className="truncate text-lg md:text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">{nickname}</h2><p className="mt-0.5 font-sans text-xs font-bold text-brand">{profile.github ? `@${profile.github}` : '个人主页'} · {site.site?.subtitle || '会成长的个人助手'}</p></div><Link to="/about" className="ml-auto min-h-11 flex shrink-0 items-center font-sans text-sm hover:underline font-bold text-slate-400">关于 →</Link></div>
          {profile.bio ? <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{profile.bio}</p> : null}
          <div className="flex gap-2">{[['档案总数', stats?.notes_total ?? '—'], ['近 7 天新增', stats?.notes_added_7d ?? '—']].map(([label, value]) => <div key={label} className="flex-1 rounded-xl border border-white/50 bg-white/40 px-3 py-2 text-center dark:border-white/10 dark:bg-white/5"><b className="block font-sans tabular-nums text-lg font-black text-slate-900 dark:text-slate-100">{value}</b><span className="font-sans text-xs tracking-wider text-slate-500 dark:text-slate-400">{label}</span></div>)}</div>
          <SourceLine source={data.sources?.notes}>统计来源：PostgreSQL 档案 · 随笔计入总数 · 近 7 天含今天</SourceLine>
          {site.social?.length ? <div className="flex flex-wrap gap-2">{site.social.map(item => item.url ? <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-brand/10 px-3 py-2 font-sans text-sm hover:bg-brand/15 text-brand">{item.icon || '↗'} {item.label}</a> : <span key={item.label} className="rounded-xl px-3 py-2 text-xs text-slate-400">{item.label}（未配置）</span>)}</div> : null}
        </section>
        <section className={`flex flex-col p-4 ${GLASS}`}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">◎ 焦点</h2><Link to="/about#projects" className="min-h-11 flex shrink-0 items-center font-sans text-sm hover:underline font-semibold text-brand">GitHub 项目 →</Link></div>{data.focus.items.length ? <div className="grid flex-1 gap-2">{data.focus.items.map(item => <FocusCard item={item} key={item.key || item.id} />)}</div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-brand/30 px-4 text-center text-sm text-slate-400">{data.focus.partial ? '暂无可展示焦点，部分来源尚未核实' : data.focus.mode === 'curated' ? '暂无可展示的精选热点，请检查显示状态及来源' : '没有带“焦点”标签的项目或档案'}</div>}<SourceLine source={projectsState}>{data.focus.mode === 'curated' ? '后台精选 · 来源实时读取' : 'GitHub Topic + 档案标签'} · {data.focus.partial ? '目前可读' : '共'} {data.focus.total} 条</SourceLine>{data.sources.notes.state === 'unavailable' ? <p role="status" className="mt-2 text-xs text-amber-600">档案焦点暂不可用。</p> : null}{projectsState?.state === 'stale' ? <p role="status" className="mt-2 text-xs text-amber-600">GitHub 项目来自缓存，可能已过期。</p> : null}</section>
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-[.9fr_1.1fr]"><TodaySchedule today={data.today} onDateChange={changeDate} /><PlansCard plans={data.plans} /></div>
      <div className="grid items-stretch gap-4 md:grid-cols-[1.5fr_.5fr]"><EssaysCard essays={data.essays} /><button type="button" onClick={() => setTheme(toggleTheme())} aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'} className={`flex min-h-11 flex-col items-center justify-center gap-2 p-4 ${GLASS} hover:bg-brand/10 active:scale-95`}><span className="text-3xl" aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span><span className="font-sans text-xs font-black tracking-wider text-slate-500 dark:text-slate-400">{theme === 'dark' ? '日间模式' : '夜间模式'}</span></button></div>
      {projectsState?.state === 'unconfigured' ? <p className="text-center text-sm text-slate-400">GitHub 来源未配置，焦点区只显示档案。</p> : projectsState?.state === 'unavailable' ? <p role="alert" className="text-center text-xs text-danger">GitHub 项目暂不可用，没有可用缓存；其他数据照常展示。</p> : projectsState?.state === 'stale' ? <p role="status" className="text-center text-xs text-amber-600 dark:text-amber-400">GitHub 刷新失败，显示上次同步的项目，可能已过期。</p> : null}
    </div>
  )
}
