// 个人主页（替换原 / 首页）：左个人卡（头像/昵称/简介）+ 右日历卡（当月月历 + 近期日程）。
// 数据来自 GET /api/me → data/profile.md + data/schedule.md；文件缺失时各项有默认值，不报错。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../api/me.js'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

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

export default function HomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [avatarBroken, setAvatarBroken] = useState(false) // 头像加载失败 → 降级首字母色块

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
    return () => {
      alive = false
    }
  }, [navigate])

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

  return (
    <div className="home-grid">
      <section className="card profile-card">
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
      </section>

      <section className="card cal-card">
        <h2 className="cal-title">
          {today.getFullYear()} 年 {today.getMonth() + 1} 月
        </h2>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="cal-cell" />
            const ds = dateStr(new Date(today.getFullYear(), today.getMonth(), d))
            const cls = [
              'cal-cell',
              ds === todayStr ? 'cal-cell--today' : '',
              eventDays.has(ds) ? 'cal-cell--has-event' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={i} className={cls}>
                {d}
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
      </section>
    </div>
  )
}
