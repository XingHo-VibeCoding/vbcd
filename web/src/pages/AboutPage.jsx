// 关于页（F11）：纯前端展示，数据走现有 GET /api/me 与 GET /api/notes，后端零改动。
// 布局照参考图：纯色横幅 + 压在横幅下沿的圆形头像 + 大标题/英文副标题 + 右侧页签。
// 研究动态 = 贡献热力图（按资料 date 聚合的真实数据）+ 资料时间线（最新 8 条）。
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../api/me.js'
import { listNotes } from '../api/notes.js'
import { getGithubActivity } from '../api/github.js'

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
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

/** GitHub 资料卡（自我介绍页签内嵌）：头像走 github.com/<login>.png 公开端点，无需 token。
    login 为空（profile.md 未配 github 字段）时整块不渲染。 */
function GitHubCard({ login }) {
  const [broken, setBroken] = useState(false)
  const url = `https://github.com/${login}`
  return (
    <a className="gh-card" href={url} target="_blank" rel="noreferrer">
      {!broken ? (
        <img
          className="gh-card-avatar"
          src={`${url}.png?size=96`}
          alt=""
          aria-hidden="true"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="gh-card-avatar gh-card-avatar-fallback" aria-hidden="true">
          {login.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="gh-card-body">
        <span className="gh-card-login">@{login}</span>
        <span className="gh-card-desc">在 GitHub 上关注我</span>
      </span>
      <span className="gh-card-arrow" aria-hidden="true">→</span>
    </a>
  )
}

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

/** 贡献热力图：本周一往前推 52 周，共 53 列 × 7 行（col-major 扁平数组）；null = 还没到的那一天。
 *  F16：ghCounts 是 GitHub 日历的 Map<date,count>——同一天资料条数与 commit 数加总成一格。 */
function contribCells(items, ghCounts = new Map()) {
  const counts = new Map()
  for (const n of items) {
    if (!n.date) continue
    counts.set(n.date, (counts.get(n.date) || 0) + 1)
  }
  for (const [date, count] of ghCounts) {
    counts.set(date, (counts.get(date) || 0) + count)
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
      const count = counts.get(ds) || 0
      cells.push({ date: ds, month: d.getMonth(), count, level: levelOf(count) })
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
    // GitHub 端 cell 没有 month 字段，从 date（YYYY-MM-DD）解析；资料端有 month 直接用
    const m = first ? (first.month ?? Number(first.date.slice(5, 7)) - 1) : -1
    labels.push(first && m !== prevMonth ? `${m + 1}月` : '')
    if (first) prevMonth = m
  }
  return labels
}

/** 贡献档：0 空 / 1 条 / 2–3 条 / 4–6 条 / ≥7 条（GitHub 四档非空，与图例 5 格一致） */
function levelOf(count) {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

/** 热力图骨架：传入 53×7 的格子扁平数组（col-major，null=未来），渲染月份/星期/格子/图例。
 *  GitHub 版直接喂 calendar.weeks 拍平；资料版喂 contribCells() 的输出。 */
function ContribGraph({ cells, title, legendUnit }) {
  const labels = monthLabels(cells)
  return (
    <section className="contrib-card">
      <p className="contrib-title">{title}</p>
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
                  className={`contrib-cell contrib-cell--${c ? c.level : 0}`}
                  title={c ? `${c.date}：${c.count} ${legendUnit}` : undefined}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="contrib-legend">
          Less
          <span className="contrib-cell" aria-hidden="true" />
          <span className="contrib-cell contrib-cell--1" aria-hidden="true" />
          <span className="contrib-cell contrib-cell--2" aria-hidden="true" />
          <span className="contrib-cell contrib-cell--3" aria-hidden="true" />
          <span className="contrib-cell contrib-cell--4" aria-hidden="true" />
          More
        </div>
      </div>
    </section>
  )
}

export default function AboutPage() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState('')
  const [notes, setNotes] = useState(null) // null = 加载中
  const [notesError, setNotesError] = useState('')
  const [gh, setGh] = useState(null) // null = 加载中；{configured:false} 或 {profile,calendar,events}
  const [ghError, setGhError] = useState('')
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
        if (alive) setNotesError('资料列表拉取失败，资料动态暂不可用')
      })
    getGithubActivity()
      .then((d) => {
        if (alive) setGh(d)
      })
      .catch(() => {
        if (alive) setGhError('GitHub 动态拉取失败')
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
  // GitHub 日历 → Map<date,count>（calendar 为 null 时传空 map，等价于只有资料）
  const ghCounts = new Map()
  if (gh?.calendar?.weeks) {
    for (const week of gh.calendar.weeks) {
      for (const d of week) {
        if (d.date && d.count) ghCounts.set(d.date, d.count)
      }
    }
  }
  const cells = contribCells(items, ghCounts)
  const total = cells.reduce((sum, c) => sum + (c ? c.count : 0), 0)
  // 分报数：GitHub 贡献总数直接用上官方的 totalContributions；资料总数 = 合并总量 - GitHub 格子里实际叠加的量
  // （ghCounts 的 key 可能与 cells 窗口不完全对齐——53 周外的不计入 total，用格子 count 反推才一致）
  const ghCellSum = [...ghCounts.keys()]
    .filter((d) => cells.some((c) => c && c.date === d))
    .reduce((s, d) => s + ghCounts.get(d), 0)
  const noteTotal = total - ghCellSum
  const ghTotal = gh?.calendar?.totalContributions ?? null

  // 混排时间线：资料更新 + GitHub 事件按时间 desc 合并；日期粒度不同（YYYY-MM-DD vs ISO），取前 10 位对齐
  const timeline = [
    ...items.map((n) => ({ kind: 'note', date: n.date || '', title: n.title || n.id, url: `/notes/${n.id}`, id: `n-${n.id}` })),
    ...(gh?.events || []).map((e) => ({ kind: 'gh', date: (e.createdAt || '').slice(0, 10), title: e.title, url: e.url, id: `g-${e.createdAt}-${e.title}` })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, TIMELINE_COUNT)

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
          // notes 挂了只影响资料数据源；GitHub 热力图与时间线照常渲染
          notes === null && gh === null && !notesError && !ghError ? (
            <div className="loading">载入中…</div>
          ) : (
            <>
              {notesError ? <p className="activity-empty">{notesError}</p> : null}
              {ghError ? (
                <p className="activity-empty">{ghError}（仅显示资料数据）</p>
              ) : gh === null ? (
                <div className="loading">GitHub 动态载入中…</div>
              ) : gh.configured === false ? (
                <p className="activity-empty">GitHub 动态未配置（server/.env 加 GITHUB_USERNAME 后生效）；热力图仅含资料数据</p>
              ) : gh.calendar === null ? (
                <p className="activity-empty">GitHub 贡献日历不可用（需配置 GITHUB_TOKEN）；热力图仅含资料数据</p>
              ) : null}
              <ContribGraph
                cells={cells}
                title={
                  ghTotal !== null
                    ? `过去一年共 ${ghCellSum} 次 GitHub 贡献 + ${noteTotal} 条资料`
                    : `过去一年共 ${total} 条资料`
                }
                legendUnit="次动态"
              />

              {timeline.length ? (
                <ul className="activity-list">
                  {timeline.map((it) => (
                    <li className="activity-item" key={it.id}>
                      <span className="activity-dot" aria-hidden="true" />
                      <div className="activity-card">
                        {it.kind === 'gh' ? (
                          <span className="activity-badge activity-badge-gh">GitHub</span>
                        ) : (
                          <span className="activity-badge">资料</span>
                        )}
                        {it.kind === 'gh' ? (
                          <a className="activity-title" href={it.url} target="_blank" rel="noreferrer">
                            {it.title}
                          </a>
                        ) : (
                          <Link className="activity-title" to={it.url}>
                            {it.title}
                          </Link>
                        )}
                        <span className="activity-date">{it.date}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="activity-empty">最近一年还没有动态，去主页「归档」或在 GitHub 上提交一笔吧</p>
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
                {i === 0 && profile.github ? <GitHubCard login={profile.github} /> : null}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
