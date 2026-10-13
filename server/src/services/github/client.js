// GitHub 抓取层（F15）：profile（REST）+ contributions（GraphQL）+ events（REST）。
// 三个函数各自独立失败，由 github.js 聚合时决定降级粒度。
// 纯 fetch、不写文件；GITHUB_API_BASE / GITHUB_GRAPHQL_BASE 可注入（fake-github 桩用）。
import { fail } from '../errors.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const REST_BASE = env('GITHUB_API_BASE', 'https://api.github.com').replace(/\/+$/, '')
const GRAPHQL_BASE = env('GITHUB_GRAPHQL_BASE', 'https://api.github.com/graphql')
const TIMEOUT_MS = Number(env('GITHUB_TIMEOUT_MS', '10000')) || 10000
const USER_AGENT = 'buddy-github/0.1 (+https://github.com/bird-z/vbcd)'

function headers(token) {
  const h = { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

// 上游不可达/超时/非 2xx 统一归到 GITHUB_UPSTREAM（502），不往外漏 fetch 裸错
async function getJson(url, token) {
  let resp
  try {
    resp = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw fail('GITHUB_UPSTREAM', `GitHub 不可达：${e.message}`, 502)
  }
  if (!resp.ok) throw fail('GITHUB_UPSTREAM', `GitHub 请求失败：${resp.status}`, 502)
  return resp.json()
}

/** REST /users/:login → 卡片字段（不需要 token；有 token 时限额更宽） */
export async function fetchProfile(login, token) {
  const u = await getJson(`${REST_BASE}/users/${encodeURIComponent(login)}`, token)
  return {
    login: u.login,
    avatarUrl: u.avatar_url,
    bio: u.bio || '',
    followers: u.followers ?? 0,
    publicRepos: u.public_repos ?? 0,
    htmlUrl: u.html_url || `https://github.com/${login}`,
  }
}

/** GraphQL contributionsCollection → 贡献日历（必须 token；REST 没有等价端点）。
 *  返回 { totalContributions, weeks[53][7] }，每周 7 格 {date,count,level}（level 0–4 四档）。 */
export async function fetchCalendar(login, token) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`
  let resp
  try {
    resp = await fetch(GRAPHQL_BASE, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw fail('GITHUB_UPSTREAM', `GitHub 不可达：${e.message}`, 502)
  }
  if (!resp.ok) throw fail('GITHUB_UPSTREAM', `GitHub GraphQL 失败：${resp.status}`, 502)
  const body = await resp.json()
  const cal = body?.data?.user?.contributionsCollection?.contributionCalendar
  if (!cal) throw fail('GITHUB_UPSTREAM', 'GitHub GraphQL 返回结构异常', 502)
  const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }
  return {
    totalContributions: cal.totalContributions,
    weeks: cal.weeks.map((w) =>
      w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] ?? 0 })),
    ),
  }
}

// 前端有意义渲染的类型白名单；其余（WatchEvent 等噪音）静默丢弃
const EVENT_TYPES = new Set(['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'CreateEvent', 'ReleaseEvent'])

function describeEvent(e) {
  const repo = e.repo?.name || ''
  const p = e.payload || {}
  switch (e.type) {
    case 'PushEvent':
      // payload.size 在 REST events 里不可靠（实测常见 0），不写具体数字避免假精确
      return { title: `向 ${repo} 推送了提交`, url: `https://github.com/${repo}` }
    case 'PullRequestEvent': {
      const pr = p.pull_request
      return { title: `${p.action === 'opened' ? '发起' : p.action === 'closed' && pr?.merged ? '合并' : '更新'} PR：${pr?.title || repo}`, url: pr?.html_url || `https://github.com/${repo}` }
    }
    case 'IssuesEvent': {
      const issue = p.issue
      return { title: `${p.action === 'opened' ? '提出' : '更新'} Issue：${issue?.title || repo}`, url: issue?.html_url || `https://github.com/${repo}` }
    }
    case 'CreateEvent':
      return { title: `创建了 ${p.ref_type === 'repository' ? '仓库' : '分支'} ${p.ref_type === 'repository' ? repo : `${p.ref}@${repo}`}`, url: `https://github.com/${repo}` }
    case 'ReleaseEvent':
      return { title: `发布 ${repo} ${p.release?.tag_name || ''}`.trim(), url: p.release?.html_url || `https://github.com/${repo}` }
    default:
      return null
  }
}

/** REST /users/:login/events → 归一化时间线条目（≤10 条、只留白名单类型） */
export async function fetchEvents(login, token, limit = 10) {
  const list = await getJson(`${REST_BASE}/users/${encodeURIComponent(login)}/events?per_page=30`, token)
  const out = []
  for (const e of Array.isArray(list) ? list : []) {
    if (!EVENT_TYPES.has(e.type)) continue
    const d = describeEvent(e)
    if (!d) continue
    out.push({ type: e.type, repo: e.repo?.name || '', title: d.title, url: d.url, createdAt: e.created_at })
    if (out.length >= limit) break
  }
  return out
}

/** 公开、非 Fork 仓库；逐页读完后再筛选，避免漏掉后续页的 focus 项目。 */
export async function fetchRepositories(login, token) {
  const repositories = new Map()
  for (let page = 1; ; page += 1) {
    const rows = await getJson(`${REST_BASE}/users/${encodeURIComponent(login)}/repos?type=owner&sort=full_name&per_page=100&page=${page}`, token)
    if (!Array.isArray(rows)) throw fail('GITHUB_UPSTREAM', 'GitHub 仓库列表返回结构异常', 502)
    for (const repo of rows) {
      if (repo.private || repo.fork) continue
      repositories.set(String(repo.id), {
        id: String(repo.id), name: repo.name, fullName: repo.full_name,
        description: repo.description || '', language: repo.language || null,
        topics: Array.isArray(repo.topics) ? repo.topics : [],
        archived: Boolean(repo.archived), updatedAt: repo.updated_at || null,
        pushedAt: repo.pushed_at || null, htmlUrl: repo.html_url,
      })
    }
    if (rows.length < 100) break
  }
  return [...repositories.values()].sort((a, b) => (b.pushedAt || '').localeCompare(a.pushedAt || '') || a.fullName.localeCompare(b.fullName))
}
