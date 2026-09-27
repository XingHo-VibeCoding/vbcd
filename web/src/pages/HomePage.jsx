// 个人主页（替换原 / 首页）：左个人卡（头像/昵称/简介）+ 右日历卡（当月月历 + 近期日程）。
// 数据来自 GET /api/me → data/profile.md + data/schedule.md；文件缺失时各项有默认值，不报错。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../api/me.js'
import { listTasks } from '../api/tasks.js'
import { getTheme, toggleTheme, watchOtherTabs, watchSystemTheme } from '../theme.js'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

// 与任务页同一套状态文案与徽标色（badge--* 已在全局样式里定义）
const STATUS_LABEL = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  failed: '失败',
  attention: '需确认',
}

/** 任务摘要（与任务页 summaryOf 同一口径，payload 保留服务端 snake_case） */
function taskSummary(task) {
  const payload = task.payload ?? {}
  if (task.type === 'note') return payload.title || '(无标题)'
  if (task.type === 'remind') return payload.text || '(空提醒)'
  if (task.type === 'organize') return payload.url || '(空链接)'
  if (task.type === 'delete_note') return `删除资料 ${payload.note_id ?? ''}`
  return task.type
}

/** 本地时区的 YYYY-MM-DD（不用 toISOString，避免时区把今天推到昨天） */
function dateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 当月月历格子：周一开头的一维数组，null 为月外占位 */
function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // 周日 getDay()=0 → 排第 7 格
  const days = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7) cells.push(null) // 补齐整周
  return cells
}

/** 本周 7 天（周一开头）：返回 Date 数组 */
function weekDates(base) {
  const offset = (base.getDay() + 6) % 7 // 周一 = 0
  const monday = new Date(base)
  monday.setDate(base.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

/** 主题方格的图标：纯线条、无装饰底，颜色继承 .theme-tile-icon 的 currentColor */
function NightIcon() {
  return (
    <svg className="theme-tile-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" />
    </svg>
  )
}

function DayIcon() {
  return (
    <svg className="theme-tile-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')
  const [avatarBroken, setAvatarBroken] = useState(false) // 头像加载失败 → 降级首字母色块
  // 主题（F10）：初值取首屏脚本已写好的 <html data-theme>
  const [theme, setTheme] = useState(getTheme)

  // 日历视图：缺省为周视图（7 列），?cal=month 才是月视图 —— 与 /notes?view=dir 同一套做法：
  // 写进地址栏而不是 state，刷新、前进后退、把链接发到手机都能保持同一个视图。
  const [searchParams, setSearchParams] = useSearchParams()
  const isMonthView = searchParams.get('cal') === 'month'

  function setCal(view) {
    const next = new URLSearchParams(searchParams)
    if (view === 'week') next.delete('cal') // 默认视图不写参数，地址栏保持干净
    else next.set('cal', view)
    setSearchParams(next)
  }

  useEffect(() => {
    let alive = true
    getMe()
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/', { replace: true })
        else setError(err.message || '加载失败')
      })
    // 任务列表独立加载：主页核心是资料/日程，任务拉取失败不应拖垮整页
    listTasks()
      .then((d) => {
        if (alive) setTasks(d.items || [])
      })
      .catch(() => {}) // 任务接口失败时主页照常显示，列表区给出空状态
    return () => {
      alive = false
    }
  }, [navigate])

  // 主题同步：未保存过选择时跟随系统；其他标签页切换后本页也跟随（见 theme.js）
  useEffect(() => {
    const stopWatchingSystem = watchSystemTheme(setTheme)
    const stopWatchingTabs = watchOtherTabs(setTheme)
    return () => {
      stopWatchingSystem()
      stopWatchingTabs()
    }
  }, [])

  if (error) return <div className="error-bar">{error}</div>
  if (!data) return <div className="loading">载入中…</div>

  const profile = data.profile || {}
  const schedule = data.schedule || []
  const nickname = profile.nickname || 'buddy'
  const initial = nickname.slice(0, 1).toUpperCase()

  const today = new Date()
  const todayStr = dateStr(today)
  const cells = monthCells(today.getFullYear(), today.getMonth())
  const eventDays = new Set(schedule.map((s) => s.date))
  const week = weekDates(today)

  const rangeLabel = isMonthView
    ? `${today.getFullYear()} 年 ${today.getMonth() + 1} 月`
    : `${week[0].getMonth() + 1} 月 ${week[0].getDate()} 日 – ${week[6].getMonth() + 1} 月 ${week[6].getDate()} 日`

  const isDark = theme === 'dark'

  // 主页任务列表只显示「还要做的事」：已完成的在 /tasks 里翻
  const pendingTasks = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'failed')
    .slice(0, 5)

  return (
    <div className="home-grid">
      {/* 个人卡整块可点：点进去就是「关于」页（F11） */}
      <Link className="card profile-card" to="/about" aria-label="查看关于页">
        {profile.avatar && !avatarBroken ? (
          <img
            className="profile-avatar"
            src={profile.avatar}
            alt={`${nickname} 的头像`}
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
            {initial}
          </div>
        )}
        <div className="profile-text">
          <h2 className="profile-name">{nickname}</h2>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
        </div>
        <span className="profile-card-cta" aria-hidden="true">
          关于 →
        </span>
      </Link>

      <section className="card cal-card">
        <div className="cal-head">
          <h2 className="cal-title">{rangeLabel}</h2>
          <div className="view-switch" role="group" aria-label="日历视图">
            <button
              type="button"
              className={isMonthView ? 'tab' : 'tab active'}
              aria-pressed={!isMonthView}
              onClick={() => setCal('week')}
            >
              周
            </button>
            <button
              type="button"
              className={isMonthView ? 'tab active' : 'tab'}
              aria-pressed={isMonthView}
              onClick={() => setCal('month')}
            >
              月
            </button>
          </div>
        </div>

        {/* 两个视图共用同一套格子：月视图 item=日期数字/null，周视图 item=Date。
            日历只做查看（日期 + 「有安排」小圆点），信息统一由下方列表承载。 */}
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}

          {(isMonthView ? cells : week).map((item, i) => {
            if (item === null) return <div key={`blank-${i}`} className="cal-cell" />
            const ds = isMonthView
              ? dateStr(new Date(today.getFullYear(), today.getMonth(), item))
              : dateStr(item)
            const cls = [
              'cal-cell',
              ds === todayStr ? 'cal-cell--today' : '',
              eventDays.has(ds) ? 'cal-cell--has-event' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={ds} className={cls}>
                {isMonthView ? item : item.getDate()}
              </div>
            )
          })}
        </div>

        {schedule.length ? (
          <ul className="agenda">
            {schedule.map((s, i) => (
              <li key={`${s.date}-${s.time}-${i}`} className={s.date < todayStr ? 'agenda-item agenda-item--past' : 'agenda-item'}>
                <span className="agenda-date">
                  {s.date.slice(5)} {s.time || '全天'}
                </span>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="agenda-empty">暂无日程，去 data/schedule.md 里记一条吧</p>
        )}

        <h3 className="home-task-title">任务</h3>
        {pendingTasks.length ? (
          <ul className="agenda">
            {pendingTasks.map((t) => (
              <li key={t.id} className="task-row">
                <span className={`badge badge--${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
                <span className="task-row-summary">{taskSummary(t)}</span>
                {t.status === 'attention' ? (
                  <Link className="task-row-act" to={`/tasks/${t.id}/confirm`}>
                    去处理
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="agenda-empty">暂无待办任务，去「任务」页记一条吧</p>
        )}
        <p className="agenda-more">
          <Link to="/tasks">全部任务 →</Link>
        </p>
      </section>

      {/* 主题方格（F10）：文案写的是「点下去会变成什么」，不是当前状态 */}
      <button
        type="button"
        className="theme-tile"
        aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
        onClick={() => setTheme(toggleTheme())}
      >
        {isDark ? <DayIcon /> : <NightIcon />}
        <span className="theme-tile-text">
          <span className="theme-tile-title">{isDark ? '日间模式' : '夜间模式'}</span>
          <span className="theme-tile-sub">{isDark ? '阳光洒满的窗台' : '流萤飞舞的深空'}</span>
        </span>
      </button>
    </div>
  )
}
