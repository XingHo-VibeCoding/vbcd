// 个人主页（设计改版 · 定稿 2026-10-11）：
//   布局：第一行 左宽(个人卡)右窄(热点轮播) / 第二行 左窄(日历日程卡)右宽(任务卡) —— 宽度错落、同排同高对齐
//   底部：项目大卡(介绍轮播+项目列表联动) + 独立主题小卡
// 数据：GET /api/me → { profile, schedule, site }；GET /api/tasks → 待办。
//   site.json 提供 stats/social/hotspots/projects；缺省项各有降级。
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMe } from '../api/me.js'
import { listTasks } from '../api/tasks.js'
import { getTheme, toggleTheme, watchOtherTabs, watchSystemTheme } from '../theme.js'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const STATUS_LABEL = { todo: '待办', doing: '进行中', done: '已完成', failed: '失败', attention: '需确认' }
const TASK_ICON = { note: '📝', remind: '⏰', organize: '🔗', transcribe_url: '🎬', delete_note: '🗑️' }

function taskSummary(task) {
  const p = task.payload ?? {}
  if (task.type === 'note') return p.title || '(无标题)'
  if (task.type === 'remind') return p.text || '(空提醒)'
  if (task.type === 'organize' || task.type === 'transcribe_url') return p.url || '(空链接)'
  if (task.type === 'delete_note') return `删除资料 ${p.note_id ?? ''}`
  return task.type
}

function StatusBadge({ status }) {
  const map = {
    todo: 'bg-info/15 text-info',
    doing: 'bg-warning/15 text-amber-600 dark:text-amber-400',
    done: 'bg-success/15 text-emerald-600 dark:text-emerald-400',
    failed: 'bg-danger/15 text-danger',
    attention: 'bg-danger/15 text-danger',
  }
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-widest ${map[status] || 'bg-slate-500/15 text-slate-500'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

const dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function weekDates(base) {
  const offset = (base.getDay() + 6) % 7
  const monday = new Date(base)
  monday.setDate(base.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

// 玻璃卡通用类（所有大卡共用）
const GLASS = 'site-glass-card'

/**
 * 轮播卡：热点与项目共用。
 * items: [{tag,title,subtitle|desc,image,url}]
 * height: Tailwind 高度类
 */
function Carousel({ items, height = 'h-44', gradient = 'from-brand via-purple-500 to-pink-500' }) {
  const [idx, setIdx] = useState(0)
  const timer = useRef(null)
  const n = items.length

  const go = (i) => setIdx(((i % n) + n) % n)
  // 自动轮播（4.5s）；手动切换后重置计时
  useEffect(() => {
    if (n <= 1) return undefined
    timer.current = setInterval(() => go(idx + 1), 4500)
    return () => clearInterval(timer.current)
  }, [idx, n])

  if (!items.length) return null
  const item = items[idx] || items[0]

  const content = (
    <div className={`relative overflow-hidden rounded-2xl ${height} bg-gradient-to-br ${gradient}`}>
      {/* 背景图（site.json image 有值时覆盖渐变） */}
      {item.image ? (
        <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col justify-end p-5 text-white">
        {item.tag ? (
          <span className="mb-2 self-start rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black tracking-widest backdrop-blur-sm">
            {item.tag}
          </span>
        ) : null}
        <div className="text-lg font-black leading-snug drop-shadow">{item.title}</div>
        {item.subtitle || item.desc ? (
          <div className="mt-1 text-xs opacity-85">{item.subtitle || item.desc}</div>
        ) : null}
      </div>
      {n > 1 && (
        <>
          <div className="absolute right-3 top-3 flex gap-1.5">
            {['‹', '›'].map((s, i) => (
              <button
                key={s}
                type="button"
                aria-label={i === 0 ? '上一张' : '下一张'}
                onClick={(e) => { e.stopPropagation(); go(idx + (i === 0 ? -1 : 1)) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/35"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="absolute bottom-3.5 right-4 flex gap-1">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`第 ${i + 1} 张`}
                onClick={(e) => { e.stopPropagation(); go(i) }}
                className={`h-1 rounded-full transition-all ${i === idx ? 'w-5 bg-white' : 'w-3.5 bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="block">{content}</a>
  ) : content
}

export default function HomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [theme, setTheme] = useState(getTheme)
  const [projIdx, setProjIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    getMe().then((d) => !cancelled && setData(d)).catch((e) => !cancelled && setError(e.message || '加载失败'))
    listTasks().then((d) => !cancelled && setTasks(d.items || [])).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const s1 = watchSystemTheme(setTheme)
    const s2 = watchOtherTabs(setTheme)
    return () => { s1(); s2() }
  }, [])

  const profile = data?.profile ?? {}
  const site = data?.site ?? {}
  const schedule = data?.schedule ?? []
  const nickname = profile.nickname || 'buddy'
  const initial = nickname.trim().charAt(0).toUpperCase() || 'B'
  const isDark = theme === 'dark'

  const today = new Date()
  const todayStr = dateStr(today)
  const eventDays = new Set(schedule.map((s) => s.date))
  const week = weekDates(today)

  const pendingTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'failed').slice(0, 5)

  // site.json 数据降级
  const stats = [
    ['资料', site?.stats?.notes ?? '—'],
    ['任务', site?.stats?.tasks ?? pendingTasks.length],
    ['连续天', site?.stats?.days ?? '—'],
  ]
  const social = site?.social ?? []
  const hotspots = site?.hotspots ?? []
  const projects = site?.projects ?? []
  const curProject = projects[projIdx] || projects[0]

  if (error) {
    return <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-sm text-danger">{error}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ===== 第一行：左宽(个人卡) 右窄(热点轮播) ===== */}
      <div className="grid items-stretch gap-4 md:grid-cols-[1.25fr_.75fr]">
        {/* 个人卡 */}
        <Link to="/about" className={`group flex flex-col gap-3 p-4 ${GLASS}`}>
          <div className="flex items-center gap-4">
            {profile.avatar && !avatarBroken ? (
              <img
                className="h-[54px] w-[54px] rounded-2xl border-2 border-white/60 object-cover shadow-lg dark:border-white/10"
                src={profile.avatar}
                alt={`${nickname} 的头像`}
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <div className="flex h-[54px] w-[54px] items-center justify-center rounded-2xl border-2 border-white/60 bg-gradient-to-br from-indigo-300 to-pink-300 text-2xl font-black text-indigo-800 shadow-lg dark:border-white/10 dark:from-brand dark:to-fuchsia-600 dark:text-white">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">{nickname}</h2>
              <p className="mt-0.5 text-[11px] font-bold text-brand dark:text-brand-dark-text">
                {profile.github ? `@${profile.github}` : '个人主页'} · {site?.site?.subtitle || '会成长的个人助手'}
              </p>
            </div>
            <span className="ml-auto text-xs font-bold text-slate-400 transition-transform group-hover:translate-x-1">关于 →</span>
          </div>
          {profile.bio ? <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{profile.bio}</p> : null}
          <div className="flex gap-2.5">
            {stats.map(([label, val]) => (
              <div key={label} className="flex-1 rounded-xl border border-white/50 bg-white/40 px-3 py-2 text-center dark:border-white/10 dark:bg-white/5">
                <b className="block text-lg font-black text-slate-900 dark:text-slate-100">{val}</b>
                <span className="text-[10.5px] tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
              </div>
            ))}
          </div>
          {social.length ? (
            <div className="flex gap-2">
              {social.map((s) =>
                s.url ? (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand/10 bg-brand/10 text-sm transition-all hover:-translate-y-0.5 hover:bg-brand"
                  >
                    {s.icon || '🔗'}
                  </a>
                ) : (
                  <span
                    key={s.label}
                    title={`${s.label}（未配置）`}
                    className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-xl border border-slate-300/40 bg-slate-100/50 text-sm opacity-50 dark:border-white/10 dark:bg-white/5"
                  >
                    {s.icon || '🔗'}
                  </span>
                )
              )}
            </div>
          ) : null}
        </Link>

        {/* 热点轮播（窄） */}
        <section className={`flex flex-col p-3 ${GLASS}`}>
          <h2 className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-black text-slate-900 dark:text-slate-100">
            🔥 热点 <span className="ml-auto font-sans text-[10px] font-semibold tracking-widest text-brand">HOT</span>
          </h2>
          {hotspots.length ? (
            <Carousel items={hotspots} height="h-full min-h-[150px]" />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-brand/30 text-xs text-slate-400">
              site.json 配 hotspots 后展示
            </div>
          )}
        </section>
      </div>

      {/* ===== 第二行：左窄(日历日程卡) 右宽(任务卡) ===== */}
      <div className="grid items-stretch gap-4 md:grid-cols-[.75fr_1.25fr]">
        {/* 日历日程合并卡（窄） */}
        <section className={`flex flex-col p-4 ${GLASS}`}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-slate-100">
            📅 本周
            <span className="ml-auto font-sans text-[10px] font-semibold tracking-widest text-brand">
              {today.getFullYear()} · {today.getMonth() + 1}月
            </span>
          </h2>
          <div className="mb-3 grid grid-cols-7 gap-1">
            {week.map((d) => {
              const ds = dateStr(d)
              const isToday = ds === todayStr
              const hasEvent = eventDays.has(ds)
              return (
                <div
                  key={ds}
                  className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 ${
                    isToday ? 'bg-brand' : 'bg-white/40 dark:bg-white/5'
                  }`}
                >
                  <span className={`text-[9px] font-black ${isToday ? 'text-white' : 'text-slate-400'}`}>
                    {WEEKDAYS[(d.getDay() + 6) % 7]}
                  </span>
                  <span className={`text-sm font-black ${isToday ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                    {d.getDate()}
                  </span>
                  {hasEvent && <span className={`h-1 w-1 rounded-full ${isToday ? 'bg-white' : 'bg-brand'}`} />}
                </div>
              )
            })}
          </div>
          <div className="mb-3 h-px bg-brand/10" />
          <div className="flex flex-col gap-1.5">
            {schedule.length ? (
              schedule.slice(0, 4).map((s, i) => (
                <div
                  key={`${s.date}-${s.time}-${i}`}
                  className={`flex items-center gap-2.5 rounded-lg bg-white/35 px-2.5 py-1.5 dark:bg-white/5 ${
                    s.date < todayStr ? 'opacity-45' : ''
                  }`}
                >
                  <span className="min-w-[52px] whitespace-nowrap font-mono text-[10px] font-bold text-brand">
                    {s.date.slice(5)}{s.time ? ` ${s.time}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-slate-200">{s.title}</span>
                </div>
              ))
            ) : (
              <p className="py-2 text-center text-xs text-slate-400">暂无日程</p>
            )}
          </div>
        </section>

        {/* 任务卡（宽） */}
        <section className={`flex flex-col p-4 ${GLASS}`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
              ✅ 任务
              {pendingTasks.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                  {pendingTasks.length}
                </span>
              )}
            </h2>
            <Link to="/log" className="text-xs font-bold text-brand hover:text-brand-hover dark:text-brand-dark-text">全部 →</Link>
          </div>
          {pendingTasks.length ? (
            <ul className="flex flex-col gap-2">
              {pendingTasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => navigate(t.status === 'attention' ? `/tasks/${t.id}/confirm` : '/log')}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/50 bg-white/35 px-3.5 py-2.5 text-left transition-all hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-sm">
                      {TASK_ICON[t.type] || '📌'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{taskSummary(t)}</span>
                    <StatusBadge status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">
              暂无待办任务 · <Link to="/log" className="font-bold text-brand dark:text-brand-dark-text">去日志页记一条</Link>
            </p>
          )}
        </section>
      </div>

      {/* ===== 底部：项目大卡(轮播+列表) + 主题小卡 ===== */}
      <div className="grid items-stretch gap-4 md:grid-cols-[1.5fr_.5fr]">
        {/* 项目大卡 */}
        <section className={`flex flex-col p-3 ${GLASS}`}>
          <h2 className="mb-3 flex items-center gap-1.5 px-1 text-sm font-black text-slate-900 dark:text-slate-100">
            🧩 项目 <span className="ml-auto font-sans text-[10px] font-semibold tracking-widest text-brand">PROJECTS</span>
          </h2>
          {projects.length ? (
            <div className="grid flex-1 gap-4 md:grid-cols-[1.3fr_.7fr]">
              {/* 左：项目轮播（跟随 projIdx） */}
              <div className="relative isolate min-h-48 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-brand">
                {curProject.image ? (
                  <img src={curProject.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
                ) : null}
                <div className="absolute inset-0 -z-0 bg-gradient-to-tr from-slate-950/85 via-slate-950/20 to-transparent" />
                <div className="absolute inset-0 z-10 flex flex-col items-start justify-end p-5 text-white">
                  {curProject.tag ? (
                    <span className="mb-2 self-start rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black tracking-widest">
                      {curProject.tag}
                    </span>
                  ) : null}
                  <div className="max-w-[78%] text-lg font-black leading-snug drop-shadow">{curProject.name} · {curProject.desc}</div>
                </div>
                {projects.length > 1 && (
                  <div className="absolute right-3 top-3 flex gap-1">
                    {projects.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`项目 ${i + 1}`}
                        onClick={() => setProjIdx(i)}
                        className={`h-1.5 rounded-full transition-all ${i === projIdx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/40'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* 右：项目列表（联动轮播） */}
              <div className="flex flex-col gap-1.5">
                {projects.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setProjIdx(i)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-all ${
                      i === projIdx
                        ? 'border-brand/20 bg-brand/10 text-brand dark:text-brand-dark-text'
                        : 'border-transparent text-slate-500 hover:bg-brand/5 dark:text-slate-400'
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-brand/30 py-10 text-xs text-slate-400">
              site.json 配 projects 后展示
            </div>
          )}
        </section>

        {/* 主题小卡 */}
        <button
          type="button"
          onClick={() => setTheme(toggleTheme())}
          aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
          className={`flex flex-col items-center justify-center gap-2.5 p-4 ${GLASS} active:scale-95`}
        >
          <span className="text-3xl" aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
          <span className="text-[10.5px] font-black tracking-wider text-slate-500 dark:text-slate-400">
            {isDark ? '日间模式' : '夜间模式'}
          </span>
        </button>
      </div>
    </div>
  )
}
