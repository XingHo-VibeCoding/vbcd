// 关于页（F11）：纯前端展示，数据走现有 GET /api/me 与 GET /api/notes，后端零改动。
// 布局照参考图：纯色横幅 + 压在横幅下沿的圆形头像 + 大标题/英文副标题 + 右侧页签。
// 研究动态 = 贡献热力图（按资料 date 聚合的真实数据）+ 资料时间线（最新 8 条）。
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../api/me.js'
import { listNotes } from '../api/notes.js'
import { getGithubActivity, getGithubProjects } from '../api/github.js'
import { selectAboutProjects } from '../lib/curated-projects.js'

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const TIMELINE_COUNT = 8

/** 项目与贡献日历分开加载：仓库列表无需贡献日历成功，也不从静态配置补位。 */
function GitHubProjects({ curated }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setError('')
    getGithubProjects().then(value => { if (alive) setData(value) }).catch(err => { if (alive) setError(err.message || 'GitHub 项目暂不可用') })
    return () => { alive = false }
  }, [retry])
  const enabled = curated?.projects?.enabled === true
  const selected = selectAboutProjects(curated?.projects, data?.items || [])
  const format = iso => iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无记录'
  return (
    <section id="projects" className="mt-6 border-t border-brand/15 pt-5">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">GitHub 项目</h2><button type="button" className="min-h-11 rounded-xl px-3 text-sm text-brand" onClick={() => setRetry(value => value + 1)}>重新检查</button></div>
      {error ? <p role="alert" className="error-bar">{error} · 已有列表如仍显示，则是上次读取的数据。</p> : null}
      {!data && !error ? <p className="loading">项目载入中…</p> : null}
      {data?.state === 'unconfigured' ? <p className="activity-empty">GitHub 项目来源尚未配置</p> : null}
      {data?.state === 'unavailable' ? <p role="alert" className="activity-empty">项目暂不可用，没有可用缓存。</p> : null}
      {data?.state === 'stale' ? <p role="status" className="activity-empty">刷新失败，正在显示上次成功数据，可能已过期。</p> : null}
      {data?.synced_at ? <p className="mt-2 text-xs text-slate-400">更新时间：{new Date(data.synced_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p> : null}
      {data && !['unconfigured', 'unavailable'].includes(data.state) && !selected.length ? <p className="activity-empty">{enabled ? '暂无可展示的精选项目，所选项目可能已隐藏或来源不可用' : '没有符合条件的公开项目'}</p> : null}
      {data ? (enabled ? [null] : [false, true]).map(archived => {
        const repos = enabled ? selected : selected.filter(repo => repo.archived === archived)
        if (!repos.length) return null
        return <div className="mt-4" key={String(archived)}><h3 className="mb-2 text-base font-black md:text-lg">{enabled ? '精选项目' : archived ? '已归档项目' : '公开项目'}</h3><div className="grid gap-3 sm:grid-cols-2">{repos.map(repo => <a key={repo.id} className="about-project-card min-w-0 rounded-xl border border-brand/15 bg-white/30 p-4 transition hover:bg-brand/5 dark:bg-white/5" href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.cover ? <img src={repo.cover} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" loading="lazy" /> : null}<div className="flex items-start justify-between gap-2"><strong className="break-all text-base font-black md:text-lg">{repo.fullName}</strong>{repo.topics.includes('focus') ? <span className="shrink-0 rounded-full bg-brand/10 px-2 py-1 text-[11px] text-brand">焦点</span> : null}</div><p className="mt-2 text-sm leading-relaxed text-slate-500">{repo.description || '仓库未填写简介'}</p><p className="mt-2 text-xs text-slate-400">{repo.language || '未标注语言'} · 最近推送 {format(repo.pushedAt)}</p></a>)}</div></div>
      }) : null}
    </section>
  )
}

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
        <span className="gh-card-desc">查看公开代码与项目动态</span>
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
  const location = useLocation()
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState('')
  const [notes, setNotes] = useState(null) // null = 加载中
  const [notesError, setNotesError] = useState('')
  const [gh, setGh] = useState(null) // null = 加载中；{configured:false} 或 {profile,calendar,events}
  const [ghError, setGhError] = useState('')
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [brokenCover, setBrokenCover] = useState('')

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

  useEffect(() => {
    if (!me || isActivity || location.hash !== '#projects') return
    document.getElementById('projects')?.scrollIntoView({ block: 'start' })
  }, [me, isActivity, location.hash])

  if (meError) return <div className="error-bar">{meError}</div>
  if (!me) return <div className="loading">载入中…</div>

  const profile = me.profile || {}
  const nickname = profile.nickname || 'buddy'
  const initial = nickname.slice(0, 1).toUpperCase()
  const en = englishName(nickname)
  const bio = typeof profile.bio === 'string' ? profile.bio.trim() : ''
  const cover = me.site?.cover?.default || '/images/bg-l1.jpg'

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
      <div className="about-banner" aria-hidden="true">
        {brokenCover !== cover ? (
          <img className="about-banner-image" src={cover} alt="" onError={() => setBrokenCover(cover)} />
        ) : null}
      </div>
      <div className="site-glass-card about-card">
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
            <h1 className="about-name">{nickname}</h1>
            <p className="about-sub">{en}</p>
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
          <>
          <section className={`about-intro ${profile.github ? 'has-github' : ''}`}>
            <div className="about-bio-panel">
              <span className="about-section-label">ABOUT ME</span>
              <h2>你好，我是 {nickname}</h2>
              {bio ? <p>{bio}</p> : <p className="about-bio-empty">还没有填写个人简介。</p>}
            </div>
            {profile.github ? (
              <aside className="about-links">
                <span className="about-section-label">FIND ME</span>
                <GitHubCard login={profile.github} />
              </aside>
            ) : null}
          </section>
          <GitHubProjects curated={me?.site?.site?.curated} />
          </>
        )}
      </div>
    </div>
  )
}
