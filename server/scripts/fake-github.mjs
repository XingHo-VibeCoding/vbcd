// 假 GitHub（冒烟桩）：实现 F15 用到的 3 个上游端点的最小可用版。
// 用法：GH_PORT=8096 node scripts/fake-github.mjs
//   REST  http://127.0.0.1:8096/users/:login            → 假 profile
//   REST  http://127.0.0.1:8096/users/:login/events     → 假事件流（含一条白名单外噪音类型）
//   GQL   http://127.0.0.1:8096/graphql                 → 假 53 周贡献日历（计数器见 /counts）
// /counts 供冒烟断言「TTL 内第二次请求不再打上游」；/counts/reset 归零。
import { createServer } from 'node:http'

const PORT = Number(process.env.GH_PORT || 8096)
const counts = { profile: 0, events: 0, graphql: 0, repos: 0 }

function weeks() {
  // 53 周 × 7 格；count 取 (col+row)%4，level 同档——够前端四档色阶渲染
  const out = []
  const start = new Date('2025-10-06T00:00:00Z') // 周一
  for (let col = 0; col < 53; col += 1) {
    const days = []
    for (let row = 0; row < 7; row += 1) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + col * 7 + row)
      const count = (col + row) % 4
      days.push({
        date: d.toISOString().slice(0, 10),
        contributionCount: count,
        contributionLevel: ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE'][count],
      })
    }
    out.push({ contributionDays: days })
  }
  return out
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  if (url.pathname === '/counts') return send(counts)
  if (url.pathname === '/counts/reset') {
    counts.profile = 0; counts.events = 0; counts.graphql = 0; counts.repos = 0
    return send({ ok: true })
  }

  const m = /^\/users\/([^/]+)(\/events)?$/.exec(url.pathname)
  if (m && !m[2]) {
    counts.profile += 1
    return send({
      login: m[1], avatar_url: 'https://example.com/a.png', bio: 'fake bio',
      followers: 42, public_repos: 7, html_url: `https://github.com/${m[1]}`,
    })
  }
  if (m && m[2]) {
    counts.events += 1
    return send([
      { type: 'PushEvent', repo: { name: 'bird-z/vbcd' }, payload: { size: 3 }, created_at: '2026-10-09T10:00:00Z' },
      { type: 'WatchEvent', repo: { name: 'bird-z/vbcd' }, payload: {}, created_at: '2026-10-09T09:00:00Z' },
      { type: 'IssuesEvent', repo: { name: 'bird-z/vbcd' }, payload: { action: 'opened', issue: { title: '假 issue', html_url: 'https://example.com/i/1' } }, created_at: '2026-10-08T08:00:00Z' },
    ])
  }
  const repoPath = /^\/users\/([^/]+)\/repos$/.exec(url.pathname)
  if (repoPath) {
    counts.repos += 1
    const login = repoPath[1]
    const makeRepo = (id, overrides = {}) => ({ id, name: `repo-${id}`, full_name: `${login}/repo-${id}`, description: 'fake repository', language: 'JavaScript', topics: [], archived: false, fork: false, private: false, updated_at: '2026-10-12T10:00:00Z', pushed_at: '2026-10-12T10:00:00Z', html_url: `https://github.com/${login}/repo-${id}`, ...overrides })
    const page = Number(url.searchParams.get('page') || 1)
    return send(page === 1
      ? Array.from({ length: 100 }, (_, index) => makeRepo(index + 1, index === 0 ? { fork: true, topics: ['focus'] } : index === 1 ? { private: true } : {}))
      : [makeRepo(101, { name: 'focus-repo', full_name: `${login}/focus-repo`, topics: ['focus'], archived: true })])
  }
  if (url.pathname === '/graphql' && req.method === 'POST') {
    counts.graphql += 1
    let body = ''
    for await (const c of req) body += c
    send({ data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 123, weeks: weeks() } } } } })
    return
  }
  res.writeHead(404); res.end('nf')
})

server.listen(PORT, '127.0.0.1', () => console.log(`fake-github 启动于 127.0.0.1:${PORT}`))
