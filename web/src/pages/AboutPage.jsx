// 关于页（F11）：纯前端展示，数据走现有 GET /api/me 与 GET /api/notes，后端零改动。
// 布局照参考图：纯色横幅 + 压在横幅下沿的圆形头像 + 大标题/英文副标题 + 右侧页签。
// 研究动态 = 贡献热力图（按资料 date 聚合的真实数据）+ 资料时间线（最新 8 条）。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../api/me.js'
import { listNotes } from '../api/notes.js'

const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '']
const TIMELINE_COUNT = 8

// F11 占位文案：正式使用前把这段换成使用者自己的介绍（改这一个常量即可）
const INTRO_SECTIONS = [
  {
    heading: '个人简介',
    paras: ['你好，我是 buddy 的建设者。', '这里是「关于」页的占位介绍，等真文案到位后只改这一个常量。'],
  },
  {
    heading: '这个项目',
    paras: ['buddy 是一期「会成长的个人助手」：个人数据库 + 手机端联动。'],
    bullets: [
      '资料录入：网页端新建 Markdown，落到 data/ 目录',
      '列表检索与知识库问答（RAG）',
      '手机端发起任务，风险动作经确认页后执行',
    ],
  },
  {
    heading: '',
    paras: ['欢迎各位朋友联系交流~'],
  },
]

/** 本地时区的 YYYY-MM-DD（与 HomePage 的 dateStr 同一口径） */
function dateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 英文副标题：取昵称里的字母并大写；取不到（纯中文/emoji）时回退 BUDDY */
function englishName(nickname) {
  const letters = (nickname || '')
    .replace(/[^A-Za-z]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return letters ? letters.toUpperCase() : 'BUDDY'
}

/** 贡献热力图：本周一往前推 52 周，共 53 列 × 7 行（col-major 扁平数组）；null = 还没到的那一天 */
function contribCells(items) {
  const counts = new Map()
  for (const n of items) {
    if (!n.date) continue
    counts.set(n.date, (counts.get(n.date) || 0) + 1)
  }

  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)) // 今天所在周的周一
  const start = new Date(monday)
  start.setDate(monday.getDate() - 52 * 7) // 含本周共 53 周

  const cells = []
  for (let col = 0; col < 53; col++) {
    for (let row = 0; row < 7; row++) {
      const d = new Date(start)
      d.setDate(start.getDate() + col * 7 + row)
      if (d > today) {
        cells.push(null)
        continue
      }
      const ds = dateStr(d)
      cells.push({ date: ds, month: d.getMonth(), count: counts.get(ds) || 0 })
    }
  }
  return cells
}

/** 月份标签：某列首日与上一列不同月份时标「X月」（与 GitHub 贡献图的标注口径一致） */
function monthLabels(cells) {
  const labels = []
  let prevMonth = -1
  for (let col = 0; col < 53; col++) {
    const first = cells.slice(col * 7, col * 7 + 7).find(Boolean)
    labels.push(first && first.month !== prevMonth ? `${first.month + 1}月` : '')
    if (first) prevMonth = first.month
  }
  return labels
}

/** 贡献档：0 空 / 1 条 / 2 条 / ≥3 条（与图例四档一致） */
function levelOf(count) {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  return 3
}

export default function AboutPage() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState('')
  const [notes, setNotes] = useState(null) // null = 加载中
  const [notesError, setNotesError] = useState('')
  const [avatarBroken, setAvatarBroken] = useState(false)

  // 页签状态写进地址栏（?tab=activity），与 ?cal=month / ?view=dir 同一套约定
  const [searchParams, setSearchParams] = useSearchParams()
  const isActivity = searchParams.get('tab') === 'activity'

  function setTab(tab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'intro') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next)
  }

  useEffect(() => {
    let alive = true
    getMe()
      .then((d) => {
        if (alive) setMe(d)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'AUTH_REQUIRED') navigate('/login?from=/about', { replace: true })
        else setMeError(err.message || '加载失败')
      })
    // 资料列表独立拉取：失败只影响「研究动态」页签，自我介绍照常
    listNotes()
      .then((d) => {
        if (alive) setNotes(d.items || [])
      })
      .catch(() => {
        if (alive) setNotesError('资料列表拉取失败，研究动态暂不可用')
      })
    return () => {
      alive = false
    }
  }, [navigate])

  if (meError) return <div className="error-bar">{meError}</div>
  if (!me) return <div className="loading">载入中…</div>

  const profile = me.profile || {}
  const nickname = profile.nickname || 'buddy'
  const initial = nickname.slice(0, 1).toUpperCase()
  const en = englishName(nickname)

  const items = notes || []
  const cells = contribCells(items)
  const labels = monthLabels(cells)
  const total = cells.reduce((sum, c) => sum + (c ? c.count : 0), 0)
  const recent = items.slice(0, TIMELINE_COUNT)

  return (
    <div className="about">
      <div className="about-banner" aria-hidden="true" />
      <div className="card about-card">
        <div className="about-head">
          {profile.avatar && !avatarBroken ? (
            <img
              className="about-avatar"
              src={profile.avatar}
              alt={`${nickname} 的头像`}
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <div className="about-avatar about-avatar-fallback" aria-hidden="true">
              {initial}
            </div>
          )}
          <div className="about-title">
            <h2 className="about-name">关于我</h2>
            <p className="about-sub">HELLO WORLD, I'M {en}</p>
          </div>
          <div className="view-switch about-tabs" role="group" aria-label="关于页内容">
            <button
              type="button"
              className={isActivity ? 'tab' : 'tab active'}
              aria-pressed={!isActivity}
              onClick={() => setTab('intro')}
            >
              自我介绍
            </button>
            <button
              type="button"
              className={isActivity ? 'tab active' : 'tab'}
              aria-pressed={isActivity}
              onClick={() => setTab('activity')}
            >
              研究动态
            </button>
          </div>
        </div>

        <hr className="about-divider" />

        {isActivity ? (
          notesError ? (
            <p className="activity-empty">{notesError}</p>
          ) : notes === null ? (
            <div className="loading">载入中…</div>
          ) : (
            <>
              <section className="contrib-card">
                <p className="contrib-title">过去一年共 {total} 条资料</p>
                <div className="contrib-scroll">
                  <div className="contrib-graph">
                    <div className="contrib-months" aria-hidden="true">
                      {labels.map((label, i) => (
                        <span key={i}>{label}</span>
                      ))}
                    </div>
                    <div className="contrib-body">
                      <div className="contrib-weekdays" aria-hidden="true">
                        {WEEKDAY_LABELS.map((w, i) => (
                          <span key={i}>{w}</span>
                        ))}
                      </div>
                      <div className="contrib-cells">
                        {cells.map((c, i) => (
                          <span
                            key={i}
                            className={`contrib-cell contrib-cell--${c ? levelOf(c.count) : 0}`}
                            title={c ? `${c.date}：${c.count} 条资料` : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="contrib-legend">
                    少
                    <span className="contrib-cell" aria-hidden="true" />
                    <span className="contrib-cell contrib-cell--1" aria-hidden="true" />
                    <span className="contrib-cell contrib-cell--2" aria-hidden="true" />
                    <span className="contrib-cell contrib-cell--3" aria-hidden="true" />
                    多
                  </div>
                </div>
              </section>

              {recent.length ? (
                <ul className="activity-list">
                  {recent.map((n) => (
                    <li className="activity-item" key={n.id}>
                      <span className="activity-dot" aria-hidden="true" />
                      <div className="activity-card">
                        {profile.avatar && !avatarBroken ? (
                          <img
                            className="activity-avatar"
                            src={profile.avatar}
                            alt=""
                            aria-hidden="true"
                            onError={() => setAvatarBroken(true)}
                          />
                        ) : (
                          <span className="activity-avatar activity-avatar-fallback" aria-hidden="true">
                            {initial}
                          </span>
                        )}
                        <span className="activity-name">{nickname}</span>
                        <span className="activity-act">更新了资料</span>
                        <Link className="activity-title" to={`/notes/${n.id}`}>
                          {n.title || n.id}
                        </Link>
                        <span className="activity-date">{n.date}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="activity-empty">最近一年还没有资料，去「新建资料」记一条吧</p>
              )}
            </>
          )
        ) : (
          <section className="about-intro">
            {INTRO_SECTIONS.map((s, i) => (
              <div className="intro-sec" key={i}>
                {s.heading ? <h3>{s.heading}</h3> : null}
                {(s.paras || []).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                {s.bullets ? (
                  <ul>
                    {s.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
