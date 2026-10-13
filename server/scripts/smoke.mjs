// 端到端冒烟测试（零依赖，用 Node 18+ 自带 fetch）
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
// 首页专项：纯聚合 + 本机假 GitHub，不读取/写入真实数据库，也不调用真实模型。
// node server/scripts/smoke.mjs --home-selftest
if (process.argv.includes('--home-selftest')) {
  const { default: assert } = await import('node:assert/strict')
  let upstreamFails = false
  let failPage = null
  const pages = []
  const repo = (id, extra = {}) => ({ id, name: `repo-${id}`, full_name: `fake-user/repo-${id}`, html_url: `https://github.com/fake-user/repo-${id}`, topics: [], description: '测试仓库', language: 'JavaScript', private: false, fork: false, archived: false, updated_at: '2026-10-12T10:00:00Z', pushed_at: '2026-10-12T10:00:00Z', ...extra })
  const upstream = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (upstreamFails) { res.writeHead(503); res.end('{}'); return }
    const page = Number(url.searchParams.get('page') || '1')
    if (page === failPage) { res.writeHead(503); res.end('{}'); return }
    pages.push(page)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(page === 1 ? Array.from({ length: 100 }, (_, i) => repo(i + 1, i === 0 ? { fork: true, topics: ['focus'] } : i === 1 ? { private: true } : {})) : [repo(101, { topics: ['focus'], archived: true })]))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  process.env.GITHUB_API_BASE = `http://127.0.0.1:${upstream.address().port}`
  process.env.GITHUB_USERNAME = 'fake-user'
  process.env.GITHUB_TOKEN = ''
  process.env.GITHUB_CACHE_TTL_MS = '0'
  const { buildHome, getHome, dayWindow, shanghaiDate } = await import('../src/services/home.js')
  const { getGithubProjects } = await import('../src/services/github.js')
  let n = 0
  const verify = (title, fn) => { fn(); n++; console.log(`  ✅ h${n} ${title}`) }
  try {
    const now = new Date('2026-10-13T14:30:00+08:00')
    const note = (id, category = 'learning', tags = [], created_at = '2026-10-12T10:00:00+08:00', updated_at = created_at) => ({ id, title: id, category, tags, created_at, updated_at, excerpt: '测试摘要' })
    const notes = [note('focus-note', 'learning', ['焦点']), note('not-focus'), note('old-essay', 'essay', ['焦点'], '2026-10-01T12:00:00+08:00', '2026-10-13T12:00:00+08:00'), note('new-essay', 'essay', [], '2026-10-13T12:00:00+08:00'), note('mid-essay', 'essay', [], '2026-10-10T12:00:00+08:00'), note('latest-essay', 'essay', [], '2026-10-13T13:00:00+08:00'), note('boundary', 'life', [], '2026-10-07T00:00:00+08:00'), note('outside', 'life', [], '2026-10-06T23:59:59+08:00')]
    const schedule = (id, start, end, status = 'scheduled') => ({ id, title: id, start_at: start, end_at: end, status, all_day: false })
    const planning = {
      plans: [
        { id: 'overdue', title: '逾期', priority: 0, status: 'todo', due_at: '2026-10-12T12:00:00+08:00' },
        { id: 'doing', title: '进行中', priority: 0, status: 'doing' },
        { id: 'upcoming', title: '未开始', priority: 0, status: 'todo', start_at: '2026-10-15T12:00:00+08:00' },
        ...Array.from({ length: 4 }, (_, i) => ({ id: `undated-${i}`, title: '待安排', priority: i, status: 'todo' })),
        { id: 'done', title: '完成', priority: 10, status: 'done' },
      ],
      schedules: [
        schedule('ended', '2026-10-13T09:00:00+08:00', '2026-10-13T10:00:00+08:00'),
        schedule('ongoing', '2026-10-13T14:00:00+08:00', '2026-10-13T15:00:00+08:00'),
        schedule('future-complete', '2026-10-13T20:00:00+08:00', '2026-10-13T21:00:00+08:00', 'completed'),
        schedule('cross-midnight', '2026-10-12T23:30:00+08:00', '2026-10-13T00:30:00+08:00'),
        schedule('cancelled', '2026-10-13T10:00:00+08:00', '2026-10-13T11:00:00+08:00', 'cancelled'),
        schedule('tomorrow', '2026-10-14T00:00:00+08:00', '2026-10-14T01:00:00+08:00'),
        { id: 'all-day', title: '全天', start_at: '2026-10-13T00:00:00+08:00', end_at: null, status: 'scheduled', all_day: true },
      ],
    }
    const github = { state: 'fresh', items: [{ id: 'gh', fullName: 'fake-user/focus', description: '', topics: ['focus'], updatedAt: '2026-10-13T13:00:00+08:00', htmlUrl: 'https://github.com/fake-user/focus' }] }
    const me = { profile: { nickname: '测试' }, site: { site: { title: 'buddy' }, stats: { notes: 999 }, hotspots: [{ title: '旧热点' }], projects: [{ name: '旧项目' }] } }
    const input = { me, notes, planning, github, date: '2026-10-13', now, sources: {} }
    const home = buildHome(input)
    verify('北京时间日期不依赖宿主时区', () => assert.equal(shanghaiDate(new Date('2026-10-12T17:00:00Z')), '2026-10-13'))
    verify('非法日历日期被拒绝', () => assert.throws(() => dayWindow('2026-02-30'), { code: 'VALIDATION_FAILED' }))
    verify('统计来自资料，不读手填 999', () => assert.equal(home.stats.notes_total, 8))
    verify('近七个自然日含今天，边界正确', () => assert.equal(home.stats.notes_added_7d, 6))
    verify('只有焦点标签入选，随笔即使有标签也排除', () => assert.deepEqual(home.focus.items.map(x => x.key), ['github:gh', 'note:focus-note']))
    verify('焦点最多四条，总数不被截断', () => { const result = buildHome({ ...input, notes: [...notes, ...Array.from({ length: 5 }, (_, i) => note(`extra-${i}`, 'work', ['焦点']))] }); assert.equal(result.focus.items.length, 4); assert.equal(result.focus.total, 7) })
    verify('随笔最近三篇按创建时间，不按修改时间', () => assert.deepEqual(home.essays.map(x => x.id), ['latest-essay', 'new-essay', 'mid-essay']))
    verify('计划总数与展示五条分开', () => { assert.equal(home.plans.total, 7); assert.equal(home.plans.items.length, 5) })
    verify('计划逾期、进行中、未开始、待安排排序', () => assert.deepEqual(home.plans.items.slice(0, 4).map(x => x.group), ['overdue', 'doing', 'upcoming', 'unscheduled']))
    verify('三种时间位置计算正确', () => assert.deepEqual(['ended', 'ongoing', 'future-complete'].map(id => home.today.items.find(x => x.id === id).time_state), ['ended', 'ongoing', 'upcoming']))
    verify('时间结束不等于完成；提前完成不改变时间位置', () => { assert.equal(home.today.items.find(x => x.id === 'ended').completion_state, 'incomplete'); assert.equal(home.today.items.find(x => x.id === 'future-complete').completion_state, 'completed') })
    verify('跨午夜在当天可见，取消和明天日程被排除', () => { assert(home.today.items.some(x => x.id === 'cross-midnight')); assert(!home.today.items.some(x => ['cancelled', 'tomorrow'].includes(x.id))) })
    verify('全天日程按实际一天判断', () => assert.equal(home.today.items.find(x => x.id === 'all-day').time_state, 'ongoing'))
    verify('旧展示配置不再透传到首页', () => { assert.equal(home.site.stats, undefined); assert.equal(home.site.hotspots, undefined); assert.equal(home.site.projects, undefined) })
    const empty = buildHome({ ...input, notes: [], planning: { plans: [], schedules: [] }, github: { state: 'fresh', items: [] } })
    verify('真实空库返回零和空列表', () => { assert.equal(empty.stats.notes_total, 0); assert.equal(empty.plans.total, 0); assert.deepEqual(empty.today.items, []) })
    const degraded = await getHome({ date: '2026-10-13', now }, { getMe: async () => me, listNotes: async () => { throw Object.assign(new Error('隐藏裸错'), { code: 'DB_UNAVAILABLE' }) }, planningSnapshot: async () => { throw new Error('隐藏裸错') }, getGithubProjects: async () => github })
    verify('数据库失败不是零条，其他来源正常', () => { assert.equal(degraded.stats, null); assert.equal(degraded.essays, null); assert.equal(degraded.plans, null); assert.equal(degraded.today.items, null); assert.equal(degraded.focus.items.length, 1); assert.equal(degraded.sources.notes.state, 'unavailable') })
    const projects = await getGithubProjects()
    verify('GitHub 完整分页，过滤 Fork 和私有仓库', () => { assert.deepEqual(pages, [1, 2]); assert.equal(projects.items.length, 99); assert(projects.items.some(x => x.id === '101')); assert(!projects.items.some(x => ['1', '2'].includes(x.id))) })
    process.env.GITHUB_CACHE_TTL_MS = '60000'
    const cached = await getGithubProjects()
    verify('TTL 内命中缓存，同步时间不造新', () => { assert.equal(cached.state, 'cached'); assert.equal(cached.synced_at, projects.synced_at); assert.equal(pages.length, 2) })
    process.env.GITHUB_CACHE_TTL_MS = '-5'
    const badTtl = await getGithubProjects()
    verify('非法 TTL 使用安全默认缓存，不会意外关闭缓存', () => { assert.equal(badTtl.state, 'cached'); assert.equal(pages.length, 2) })
    process.env.GITHUB_CACHE_TTL_MS = '0'
    failPage = 2
    const stale = await getGithubProjects()
    verify('第二页失败不发布部分新列表，保留完整上次数据', () => { assert.equal(stale.state, 'stale'); assert.equal(stale.items.length, 99); assert.equal(stale.synced_at, projects.synced_at) })
    process.env.GITHUB_USERNAME = 'another-user'
    const unavailable = await getGithubProjects()
    verify('无对应缓存失败时不冒用其他账号项目', () => { assert.equal(unavailable.state, 'unavailable'); assert.equal(unavailable.items.length, 0); assert.equal(unavailable.synced_at, null) })
    process.env.GITHUB_USERNAME = ''
    const unconfigured = await getGithubProjects()
    verify('未配置态与上游失败区分', () => assert.equal(unconfigured.state, 'unconfigured'))
    console.log(`首页专项：${n}/${n} 通过（未触碰真实数据库或模型）`)
  } finally { await new Promise(resolve => upstream.close(resolve)) }
  process.exit(0)
}

// 规划确认专项：自动建立隔离 PostgreSQL 容器和会话目录，不使用外部模型或正式数据。
// node server/scripts/smoke.mjs --planning-selftest 或 --essay-selftest（需本机已有 postgres:18-alpine 镜像）
if (process.argv.includes('--source-selftest') || process.argv.includes('--planning-selftest') || process.argv.includes('--essay-selftest') || process.argv.includes('--planning-lifecycle-selftest')) {
  const sourceMode = process.argv.includes('--source-selftest')
  const lifecycleMode = process.argv.includes('--planning-lifecycle-selftest')
  const essayMode = process.argv.includes('--essay-selftest')
  const { default: assert } = await import('node:assert/strict')
  const { execFileSync } = await import('node:child_process')
  const { readFile, mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { default: path } = await import('node:path')
  const container = `buddy-${essayMode ? 'essay' : 'planning'}-test-${process.pid}-${Date.now()}`
  const directory = await mkdtemp(path.join(tmpdir(), 'buddy-planning-test-'))
  let started = false
  let appServer
  let closePool
  let fakeAsrChild
  let essayVite
  let n = 0
  const docker = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
  const verify = async (title, work) => { await work(); console.log(`  ✅ ${essayMode ? 'e' : 'p'}${++n} ${title}`) }
  try {
    docker(['run', '-d', '--pull=never', '--rm', '--name', container, '-e', 'POSTGRES_USER=planning_test', '-e', 'POSTGRES_PASSWORD=local-test-only', '-e', 'POSTGRES_DB=planning_test', '-p', '127.0.0.1::5432', 'postgres:18-alpine'])
    started = true
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        docker(['exec', container, 'psql', '-X', '-h', '127.0.0.1', '-U', 'planning_test', '-d', 'planning_test', '-t', '-A', '-c', 'SELECT 1'])
        ready = true
        break
      } catch { await new Promise(resolve => setTimeout(resolve, 200)) }
    }
    assert(ready, '隔离 PostgreSQL 未就绪')
    const sql = (essayMode || lifecycleMode || sourceMode ? (await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8') + '\n' + await readFile(new URL('../../db/migrations/003_notes_source_part.sql', import.meta.url), 'utf8')) : '') + '\n' + await readFile(new URL('../../db/migrations/002_planning.sql', import.meta.url), 'utf8')
    docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'planning_test', '-d', 'planning_test'], sql)
    const port = docker(['port', container, '5432/tcp']).trim().split(':').at(-1)
    Object.assign(process.env, {
      DATABASE_URL: `postgres://planning_test:local-test-only@127.0.0.1:${port}/planning_test`,
      DATA_DIR: directory, AUTH_ENABLED: '0', OPENAI_API_KEY: '', CHROMA_URL: '',
      ASR_SERVICE_URL: '', GITHUB_USERNAME: '', IMA_OPENAPI_CLIENTID: '', IMA_OPENAPI_APIKEY: '',
    })
    const db = await import('../src/db/pool.js')
    closePool = db.closePool
    const { query } = db
    const { proposePlanning, getDraft } = await import('../src/services/planning.js')
    const { newSession, saveSession, loadSession } = await import('../src/services/agent/state.js')
    const { resumeAfterDecision, runTurn } = await import('../src/services/agent/loop.js')
    const { AIMessage, HumanMessage, ToolMessage } = await import('@langchain/core/messages')
    const { createApp } = await import('../src/app.js')
    appServer = createApp().listen(0, '127.0.0.1')
    await new Promise(resolve => appServer.once('listening', resolve))
    const base = `http://127.0.0.1:${appServer.address().port}`
    const send = async (draft, decision = 'approved', token = draft.review_token) => {
      const response = await fetch(`${base}/api/planning/drafts/${draft.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_token: token }),
      })
      return { status: response.status, ...await response.json() }
    }
    const counts = async () => (await query(`SELECT
      (SELECT count(*)::int FROM plans) AS plans,
      (SELECT count(*)::int FROM schedules) AS schedules,
      (SELECT count(*)::int FROM planning_changes) AS changes`))[0]
    let slotIndex = 0
    const slot = () => {
      const start = new Date(Date.UTC(2027, 0, 1 + slotIndex++, 1))
      return { start_at: start.toISOString(), end_at: new Date(start.getTime() + 3600000).toISOString() }
    }
    const makePayload = (title, time = slot()) => ({ plan: { title }, schedules: [{ title: `${title}-日程`, ...time }] })
    const linkSession = async (draft, session) => {
      session.pendingConfirmationId = draft.confirmation.id
      session.messages = [
        new HumanMessage('请生成规划草案').toDict(),
        new AIMessage({ content: '', tool_calls: [{ id: `call-${draft.id}`, name: 'propose_planning', args: draft.payload, type: 'tool_call' }] }).toDict(),
        new ToolMessage({ name: 'propose_planning', tool_call_id: `call-${draft.id}`, content: JSON.stringify({ pending_confirmation: true, confirmation_id: draft.confirmation.id, draft_id: draft.id }) }).toDict(),
      ]
      await saveSession(session)
    }
    const linked = async (title, payload = makePayload(title)) => {
      const session = newSession()
      const draft = await proposePlanning(payload, session.id)
      await linkSession(draft, session)
      return { draft, session }
    }
    const assertUndecided = async draft => {
      const row = await getDraft(draft.id)
      assert.equal(row.status, 'pending')
      assert.equal(row.confirmation.decision, null)
      assert.equal(row.confirmation.confirmed_at, null)
    }

    async function lifecycleChecks() {
      const api = async (method, url, body) => {
        const response = await fetch(`${base}${url}`, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: response.status, ...await response.json() }
      }
      const item = async (type, id) => (await api('GET', `/api/planning?type=${type}&id=${encodeURIComponent(id)}`)).data.item
      const change = async (operation, type, id, patch) => {
        const response = await api('POST', '/api/planning/drafts', { operation, target: { type, id }, ...(patch ? { patch } : {}) })
        assert.equal(response.status, 201)
        return response.data
      }
      const seed = await proposePlanning({ plan: { title: '生命周期计划', description: '原说明' }, schedules: [
        { title: '第一条日程', start_at: '2027-01-01T10:00:13+08:00', end_at: '2027-01-01T11:00:13+08:00' },
        { title: '第二条日程', start_at: '2027-01-01T12:00:00+08:00', end_at: '2027-01-01T13:00:00+08:00' },
      ] })
      assert.equal((await send(seed)).data.status, 'approved')
      const original = (await api('GET', '/api/planning?plan_status=all')).data
      const plan = original.plans[0], first = original.schedules[0], second = original.schedules[1]
      let preview
      await verify('完成操作只生成变更草案，确认前原状态保持', async () => {
        preview = await change('complete', 'schedule', first.id)
        assert.equal(preview.payload.changes[0].before.status, 'scheduled')
        assert.equal(preview.payload.changes[0].after.status, 'completed')
        assert.equal((await item('schedule',first.id)).status,'scheduled')
      })
      await verify('拒绝变更草案不修改状态，也不写完成时间', async () => {
        await send(preview,'rejected')
        const record=await item('schedule',first.id)
        assert.equal(record.status,'scheduled'); assert.equal(record.completed_at,null)
      })
      await verify('agent 工具能查询记录并提出已有计划的修改', async () => {
        const {getPlanningTool}=await import('../src/services/agent/tools/get-planning.js')
        const {proposePlanningTool}=await import('../src/services/agent/tools/propose-planning.js')
        const found=JSON.parse(await getPlanningTool().invoke({type:'plan',id:plan.id}))
        assert.equal(found.item.id,plan.id); assert(found.item.version)
        const result=JSON.parse(await proposePlanningTool().invoke({operation:'update',target:{type:'plan',id:plan.id},patch:{status:'doing'}}))
        assert(result.pending_confirmation && result.draft.payload.changes)
        assert.equal((await send(result.draft)).data.status,'approved')
        assert.equal((await item('plan',plan.id)).status,'doing')
      })
      await verify('编辑标题保留 id、创建时间和未编辑字段', async () => {
        const draft=await change('update','plan',plan.id,{title:'改名计划',priority:3})
        assert.equal((await send(draft)).data.status,'approved')
        const record=await item('plan',plan.id)
        assert.equal(record.id,plan.id); assert.equal(record.created_at,plan.created_at)
        assert.equal(record.description,'原说明'); assert.equal(record.priority,3)
      })
      await verify('变更留痕保存真实 before/after 及操作类型', async () => {
        const rows=await query("SELECT * FROM planning_changes WHERE object_id=$1 AND action='update' ORDER BY id DESC",[plan.id])
        assert.equal(rows[0].before_data.title,'生命周期计划')
        assert.equal(rows[0].after_data.title,'改名计划')
        assert.equal(rows[0].after_data.priority,3)
      })
      await verify('草案生成后记录被其他操作修改，先刷新差异不批准', async () => {
        const draft=await change('update','plan',plan.id,{description:'准备修改的说明'})
        await query('UPDATE plans SET priority=99,updated_at=now() WHERE id=$1',[plan.id])
        const response=await send(draft)
        assert.equal(response.status,409); await assertUndecided(draft)
        assert.equal(response.data.payload.changes[0].before.priority,99)
        assert.equal(response.data.payload.changes[0].after.priority,99)
        assert.equal((await item('plan',plan.id)).description,'原说明')
        const fresh=await getDraft(draft.id)
        assert.equal((await send(fresh)).data.status,'approved')
        assert.equal((await item('plan',plan.id)).priority,99)
        assert.equal((await item('plan',plan.id)).description,'准备修改的说明')
      })
      await verify('禁止修改 id/创建来源等不可编辑字段', async () => {
        const response=await api('POST','/api/planning/drafts',{operation:'update',target:{type:'plan',id:plan.id},patch:{id:'fake-id'}})
        assert.equal(response.status,400)
        assert.equal((await item('plan',plan.id)).id,plan.id)
      })
      await verify('不能混合新增和既有记录变更', async () => {
        const response=await api('POST','/api/planning/drafts',{operation:'complete',target:{type:'plan',id:plan.id},plan:{title:'多余新增'}})
        assert.equal(response.status,400)
      })
      await verify('修改日程时排除自身冲突，秒数保持真实', async () => {
        const draft=await change('update','schedule',first.id,{title:'第一条改名日程'})
        assert.equal(draft.conflicts.length,0)
        assert.equal((await send(draft)).data.status,'approved')
        assert.equal((await item('schedule',first.id)).start_at,first.start_at)
      })
      await verify('调整日程时间会显示与其他安排的真实冲突', async () => {
        const draft=await change('update','schedule',first.id,{start_at:'2027-01-01T12:15:00+08:00',end_at:'2027-01-01T12:45:00+08:00'})
        assert.equal(draft.conflicts.length,1)
        assert.equal(draft.conflicts[0].existing_id,second.id)
        await send(draft,'rejected')
        assert.equal((await item('schedule',first.id)).start_at,first.start_at)
      })
      let completedDraft
      await verify('确认完成日程，记录实际完成时间且不完成计划', async () => {
        completedDraft=await change('complete','schedule',first.id)
        const response=await send(completedDraft)
        assert.equal(response.data.status,'approved')
        const record=await item('schedule',first.id)
        assert.equal(record.status,'completed'); assert(record.completed_at)
        assert.equal((await item('plan',plan.id)).status,'doing')
        assert.equal((await item('schedule',second.id)).status,'scheduled')
      })
      await verify('重复确认不重写完成时间和变更历史', async () => {
        const before=await item('schedule',first.id)
        const auditBefore=(await query('SELECT count(*)::int AS n FROM planning_changes'))[0].n
        await send(completedDraft)
        assert.equal((await item('schedule',first.id)).completed_at,before.completed_at)
        assert.equal((await query('SELECT count(*)::int AS n FROM planning_changes'))[0].n,auditBefore)
      })
      await verify('时间位置与完成状态独立：未来日程可提前完成', async () => {
        const response=await api('GET','/api/planning?from=2027-01-01T00:00:00%2B08:00&to=2027-01-02T00:00:00%2B08:00')
        const record=response.data.schedules.find(record=>record.id===first.id)
        assert.equal(record.time_state,'upcoming'); assert.equal(record.completion_state,'completed')
      })
      await verify('取消计划后保留历史，关联日程不自动取消', async () => {
        const draft=await change('cancel','plan',plan.id)
        assert.equal((await send(draft)).data.status,'approved')
        assert.equal((await item('plan',plan.id)).status,'cancelled')
        assert.equal((await item('schedule',second.id)).status,'scheduled')
        assert(!(await api('GET','/api/planning')).data.plans.some(record=>record.id===plan.id))
        assert((await api('GET','/api/planning?plan_status=cancelled')).data.plans.some(record=>record.id===plan.id))
      })
      await verify('取消日程保留记录，首页日程排除已取消事项', async () => {
        const draft=await change('cancel','schedule',second.id)
        await send(draft)
        const history=await api('GET','/api/planning?schedule_status=cancelled')
        assert(history.data.schedules.some(record=>record.id===second.id))
        assert.equal((await query('SELECT count(*)::int AS n FROM schedules'))[0].n,2)
        const home=(await api('GET','/api/home?date=2027-01-01')).data
        assert(!home.today.items.some(record=>record.id===second.id))
        assert(home.today.items.some(record=>record.id===first.id && record.completion_state==='completed'))
      })
      const seed2=await proposePlanning(makePayload('待完成的第二计划'))
      await send(seed2)
      const secondPlan=(await api('GET','/api/planning')).data.plans[0]
      const secondDay=(await api('GET','/api/planning')).data.schedules.find(record=>record.plan_id===secondPlan.id)
      await verify('完成计划不连带完成日程，历史可由 agent 查询',async()=>{
        await send(await change('complete','plan',secondPlan.id))
        assert.equal((await item('plan',secondPlan.id)).status,'done')
        assert.equal((await item('schedule',secondDay.id)).status,'scheduled')
        const {getPlanningTool}=await import('../src/services/agent/tools/get-planning.js')
        const response=JSON.parse(await getPlanningTool().invoke({plan_status:'all'}))
        assert(response.plans.some(record=>record.id===secondPlan.id && record.status==='done'))
      })
      await verify('修改已有记录失败时回滚，原内容和审计均不变',async()=>{
        await query(`CREATE FUNCTION fail_lifecycle_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='故障测试标题' THEN RAISE EXCEPTION 'test-only'; END IF; RETURN NEW; END $$`)
        await query('CREATE TRIGGER fail_lifecycle_update BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION fail_lifecycle_update()')
        const before=await item('schedule',secondDay.id)
        const auditBefore=(await query('SELECT count(*)::int AS n FROM planning_changes'))[0].n
        const draft=await change('update','schedule',secondDay.id,{title:'故障测试标题'})
        const response=await send(draft)
        assert.equal(response.data.status,'failed'); assert.equal(response.data.confirmation.decision,'approved')
        assert.equal((await item('schedule',secondDay.id)).title,before.title)
        assert.equal((await query('SELECT count(*)::int AS n FROM planning_changes'))[0].n,auditBefore)
        await query('DROP TRIGGER fail_lifecycle_update ON schedules'); await query('DROP FUNCTION fail_lifecycle_update()')
      })
      await verify('目标在确认前被删除，不重建它或制造批准事实',async()=>{
        const initial=await proposePlanning({plan:{title:'可删除测试目标'}});await send(initial)
        const record=(await api('GET','/api/planning')).data.plans[0]
        const draft=await change('complete','plan',record.id)
        await query('DELETE FROM plans WHERE id=$1',[record.id])
        assert.equal((await send(draft)).status,404);await assertUndecided(draft)
      })
      await verify('无效查询状态/时间范围返回明确校验错误',async()=>{
        assert.equal((await api('GET','/api/planning?plan_status=unknown')).status,400)
        assert.equal((await api('GET','/api/planning?from=2027-01-02&to=2027-01-01')).status,400)
      })
      const {createServer}=await import('../../web/node_modules/vite/dist/node/index.js')
      const {createRequire}=await import('node:module')
      essayVite=await createServer({root:fileURLToPath(new URL('../../web/',import.meta.url)),configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'})
      const requireWeb=createRequire(new URL('../../web/package.json',import.meta.url))
      const React=requireWeb('react'),{renderToStaticMarkup}=requireWeb('react-dom/server'),{MemoryRouter}=requireWeb('react-router-dom')
      const {PlanningChangesPreview}=await essayVite.ssrLoadModule('/src/agent/ToolFallback.jsx')
      const {default:PlanningPage}=await essayVite.ssrLoadModule('/src/pages/PlanningPage.jsx')
      await verify('确认预览真实渲染修改前后状态，不再误显示为新增',async()=>{
        const html=renderToStaticMarkup(React.createElement(PlanningChangesPreview,{changes:completedDraft.payload.changes}))
        assert(html.includes('标记完成') && html.includes('原：已安排') && html.includes('改为：已完成'))
      })
      await verify('规划页能渲染计划/日程视图与历史筛选入口',async()=>{
        for(const path of ['/planning','/planning?tab=schedules']){
          const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(PlanningPage)))
          assert(html.includes('让 agent 安排') && html.includes('计划') && html.includes('日程'))
          assert(html.includes('已完成') && html.includes('已取消'))
        }
      })
    }

    if (sourceMode) {
      const { spawn } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { createNote, updateNote } = await import('../src/services/notes.js')
      const store = await import('../src/storage/note-store.js')
      const files = await import('../src/storage/files.js')
      const tasks = await import('../src/storage/tasks.js')
      const { submitTranscribeTask, archiveTranscript } = await import('../src/services/transcribe.js')
      const { runOrganizeTask } = await import('../src/services/organize.js')
      fakeAsrChild = spawn(process.execPath, [fileURLToPath(new URL('./fake-asr.mjs', import.meta.url))], {
        env: { ...process.env, ASR_PORT: '0', FAKE_TOKEN: 'source-test-only' }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      const asrBase = await new Promise((resolve, reject) => {
        let output = ''
        const timer = setTimeout(() => reject(new Error('假 ASR 未就绪')), 10000)
        fakeAsrChild.once('error', err => { clearTimeout(timer); reject(err) })
        fakeAsrChild.stdout.on('data', chunk => {
          output += chunk
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
          if (match) { clearTimeout(timer); resolve(match[0]) }
        })
      })
      process.env.ASR_SERVICE_URL = asrBase
      process.env.ASR_SERVICE_TOKEN = 'source-test-only'
      const counts = async () => (await fetch(`${asrBase}/__test/counts`, { headers: { Authorization: 'Bearer source-test-only' } })).json()
      let serial = 0
      const makeTask = (url, part = null, extra = {}) => ({ id: `source-${++serial}`, type: 'transcribe_url', payload: { url, part, category: 'learning', prefer_subtitles: true, ...extra }, status: 'todo', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      const origin = 'https://source-test.invalid/video/subok'
      let old, first, second
      await verify('数据库来源元数据写入、读取和列表一致', async () => {
        old = await createNote({ title: '旧档案', content: '未记录分 P 的旧内容', category: 'learning', source_url: origin })
        assert.equal((await store.get(old.id)).meta.source_part, null)
        assert.equal((await store.list()).items.find(row => row.id === old.id).source_part, null)
      })
      await verify('数据库已有档案在字幕和转写之前命中，返回真实 id', async () => {
        const before = await counts(), task = await submitTranscribeTask(makeTask(origin))
        assert.equal(task.status, 'done'); assert.equal(task.note_id, old.id)
        assert.deepEqual(await counts(), before)
      })
      await verify('旧档案的未知分 P 不冒充 P1', async () => {
        assert.equal(await store.findBySource(origin, 1), null)
        first = await submitTranscribeTask(makeTask(origin, 1))
        assert.equal(first.status, 'done'); assert.notEqual(first.note_id, old.id)
        assert.equal((await store.get(first.note_id)).meta.source_part, 1)
      })
      await verify('重复相同分 P 跳过字幕和 ASR', async () => {
        const before = await counts(), repeated = await submitTranscribeTask(makeTask(origin, 1))
        assert.equal(repeated.note_id, first.note_id); assert.deepEqual(await counts(), before)
      })
      await verify('不同分 P 即使转写文本相同也独立归档', async () => {
        second = await submitTranscribeTask(makeTask(origin, 2))
        assert.equal(second.status, 'done'); assert.notEqual(second.note_id, first.note_id)
        const note = await store.get(second.note_id)
        assert.equal(note.meta.source_url, origin); assert.equal(note.meta.source_part, 2)
        assert(note.content.includes('分 P：2'))
      })
      await verify('原始 URL 精确比较，不擅自认定别名相同', async () => {
        assert.equal(await store.findBySource(origin + '?alias=1', 1), null)
      })
      await verify('终态归档复查数据库，返回已有档案且不新增', async () => {
        const before = (await query('SELECT count(*)::int AS n FROM notes'))[0].n
        const archived = await archiveTranscript(makeTask(origin, 2), { text: '新的处理结果' })
        assert.equal(archived.reused, true); assert.equal(archived.id, second.note_id)
        assert.equal((await query('SELECT count(*)::int AS n FROM notes'))[0].n, before)
      })
      await verify('不同来源相同内容的哈希查重返回实际档案 id', async () => {
        const result = { source: { title: '内容查重', platform: 'test' }, text: '原文', segments: [] }
        const a = await archiveTranscript(makeTask('https://source-test.invalid/hash', null), result)
        await query('UPDATE notes SET source_url=$2 WHERE id=$1', [a.id, 'https://source-test.invalid/moved'])
        const b = await archiveTranscript(makeTask('https://source-test.invalid/hash', null), result)
        assert.equal(b.reused, true); assert.equal(b.id, a.id); assert.equal(b.path, a.path)
      })
      await verify('编辑资料保留来源分 P', async () => {
        const existing = await store.get(first.note_id)
        await updateNote(first.note_id, { title: existing.meta.title, content: existing.content + '\n编辑正文', category: 'work', tags: [] })
        const edited = await store.get(first.note_id)
        assert.equal(edited.meta.source_part, 1); assert.equal(edited.meta.source_url, origin)
      })
      await verify('网页处理从同一权威库提前查重并给出档案引用', async () => {
        const task = makeTask(origin); task.type = 'organize'; await tasks.put(task)
        await runOrganizeTask(task)
        const saved = await tasks.get(task.id)
        assert.equal(saved.status, 'done'); assert.equal(saved.note_id, old.id)
      })
      await verify('无字幕时正常提交 ASR，明确分 P 透传到上游', async () => {
        const task = await submitTranscribeTask(makeTask('https://source-test.invalid/no-subtitles', 15))
        assert.equal(task.status, 'doing')
        const { getJob } = await import('../src/services/asr.js')
        await getJob(task.asr.job_id)
        const job = await getJob(task.asr.job_id)
        assert.equal(job.result.source.part, 15)
        process.env.ASR_POLL_INTERVAL_MS = '50'
        const { startTranscribeRunner } = await import('../src/services/transcribe-runner.js')
        startTranscribeRunner()
        let saved
        for (let attempt = 0; attempt < 100; attempt++) {
          saved = await tasks.get(task.id)
          if (saved.status === 'done' || saved.status === 'failed') break
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        assert.equal(saved.status, 'done'); assert(saved.note_id)
        assert.equal((await store.get(saved.note_id)).meta.source_part, 15)
      })
      await verify('非法来源分 P 被拒绝，不写资料', async () => {
        for (const part of [0, -1, 1.5, '2']) await assert.rejects(createNote({ title: '非法', content: '内容', category: 'learning', source_url: origin, source_part: part }), err => err.code === 'VALIDATION_FAILED')
      })
      await verify('文件序列化保留数值/null，非法分 P 不当成未知', async () => {
        const meta = { id: 'fixture', title: '文件测试', category: 'learning', date: '2026-10-13', source_url: origin, source_part: 15 }
        assert.equal(files.parseNote(files.serializeNote(meta, '正文'), meta.id).meta.source_part, 15)
        assert.equal(files.parseNote(files.serializeNote({ ...meta, source_part: null }, '正文'), meta.id).meta.source_part, null)
        assert.equal(files.parseNote(files.serializeNote({ ...meta, source_part: '坏值' }, '正文'), meta.id), null)
      })
      let imported
      await verify('文件模式查询同样按明确分 P，编辑后保留来源', async () => {
        const connection = process.env.DATABASE_URL
        try {
          process.env.DATABASE_URL = ''
          imported = await createNote({ title: '待导入档案', content: '待导入正文', category: 'learning', source_url: 'https://source-test.invalid/import', source_part: 3 })
          assert.equal((await store.findBySource('https://source-test.invalid/import', 3)).id, imported.id)
          assert.equal(await store.findBySource('https://source-test.invalid/import'), null)
          await updateNote(imported.id, { title: '待导入档案', content: '已编辑正文', category: 'learning', tags: [] })
          assert.equal((await store.get(imported.id)).meta.source_part, 3)
        } finally { process.env.DATABASE_URL = connection }
      })
      await verify('独立导入脚本保留分 P，同 hash 的来源变更也能同步', async () => {
        const script = fileURLToPath(new URL('./sync-to-db.mjs', import.meta.url))
        const runImport = () => new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [script], { cwd: directory, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
          let error = ''; child.stderr.on('data', chunk => { error += chunk })
          child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(error)))
        })
        await runImport()
        assert.equal((await store.get(imported.id)).meta.source_part, 3)
        const file = path.join(directory, imported.path)
        const parsed = files.parseNote(await readFile(file, 'utf8'), imported.id)
        await writeFile(file, files.serializeNote({ ...parsed.meta, source_part: 4 }, parsed.content))
        await runImport()
        assert.equal((await store.get(imported.id)).meta.source_part, 4)
      })
      await verify('日志真实组件从服务端 note_id 渲染可点击档案地址', async () => {
        const { createServer } = await import('../../web/node_modules/vite/dist/node/index.js')
        const { createRequire } = await import('node:module')
        essayVite = await createServer({ root: fileURLToPath(new URL('../../web/', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
        const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url))
        const React = requireWeb('react'), { renderToStaticMarkup } = requireWeb('react-dom/server'), { MemoryRouter } = requireWeb('react-router-dom')
        const { ArchiveNoteLink } = await essayVite.ssrLoadModule('/src/pages/LogPage.jsx')
        const { toTask } = await essayVite.ssrLoadModule('/src/api/tasks.js')
        const task = toTask({ status: 'done', note_id: first.note_id })
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ArchiveNoteLink, { task })))
        assert(html.includes(`/notes/${encodeURIComponent(first.note_id)}`)); assert(html.includes('查看归档资料'))
        assert.equal(renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ArchiveNoteLink, { task: { ...task, status: 'failed' } }))), '')
      })
      await verify('字幕已取得但归档查询失败时不回落 ASR', async () => {
        const connection = process.env.DATABASE_URL, realFetch = globalThis.fetch, before = await counts()
        globalThis.fetch = async (...args) => {
          const response = await realFetch(...args)
          if (String(args[0]).endsWith('/v1/subtitles')) {
            await db.closePool()
            process.env.DATABASE_URL = 'postgres://planning_test:local-test-only@127.0.0.1:1/planning_test'
          }
          return response
        }
        try {
          const task = await submitTranscribeTask(makeTask('https://source-test.invalid/subok-storage-failure'))
          assert.equal(task.status, 'failed'); assert(task.result.includes('字幕归档失败'))
          const after = await counts()
          assert.equal(after.transcribe, before.transcribe)
          assert.equal(after.subtitles, before.subtitles + 1)
        } finally {
          globalThis.fetch = realFetch; await db.closePool(); process.env.DATABASE_URL = connection
        }
      })
      await verify('数据库不可达如实失败，不回退文件也不请求字幕或 ASR', async () => {
        const connection = process.env.DATABASE_URL, before = await counts()
        await db.closePool()
        process.env.DATABASE_URL = 'postgres://planning_test:local-test-only@127.0.0.1:1/planning_test'
        try {
          const task = await submitTranscribeTask(makeTask('https://source-test.invalid/import', 4))
          assert.equal(task.status, 'failed'); assert(task.result.includes('数据库暂时不可用'))
          assert.equal(task.note_id, undefined); assert.deepEqual(await counts(), before)
          const web = makeTask(origin); web.type = 'organize'; await tasks.put(web); await runOrganizeTask(web)
          assert.equal((await tasks.get(web.id)).status, 'failed')
        } finally { await db.closePool(); process.env.DATABASE_URL = connection }
      })
    } else if (lifecycleMode) {
      await lifecycleChecks()
    } else if (essayMode) {
      const api = async (method, url, body) => {
        const response = await fetch(`${base}${url}`, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: response.status, ...await response.json() }
      }
      const payload = { title: '手动随笔测试', content: '# 随笔\n\n一次值得记录的思考。', category: 'essay', tags: ['写作'] }
      let manual, other, agentNote
      await verify('手动新建随笔，201 并真实写入 PostgreSQL', async () => {
        manual = (await api('POST', '/api/notes', payload)).data
        assert(manual.id && manual.hash)
        const rows = await query('SELECT category,body FROM notes WHERE id=$1', [manual.id])
        assert.equal(rows[0].category, 'essay'); assert.equal(rows[0].body, payload.content)
      })
      await verify('详情读取原文与随笔分类一致', async () => {
        const detail = await api('GET', `/api/notes/${encodeURIComponent(manual.id)}`)
        assert.equal(detail.status, 200); assert.equal(detail.data.meta.category, 'essay'); assert.equal(detail.data.content, payload.content)
      })
      await verify('随笔筛选排除普通资料', async () => {
        other = (await api('POST', '/api/notes', { title: '待改分类普通资料', content: '普通资料正文', category: 'learning' })).data
        const list = await api('GET', '/api/notes?category=essay')
        assert.equal(list.data.total, 1); assert.equal(list.data.items[0].id, manual.id)
      })
      await verify('仍拒绝未知分类，不放宽所有分类校验', async () => {
        const response = await api('POST', '/api/notes', { ...payload, category: 'unknown' })
        assert.equal(response.status, 400); assert.equal(response.error.code, 'VALIDATION_FAILED')
      })
      await verify('重复随笔仍按内容查重，不重复入库', async () => {
        const response = await api('POST', '/api/notes', payload)
        assert.equal(response.status, 409); assert.equal(response.error.code, 'DUPLICATE')
      })
      await verify('后台编辑随笔及焦点标签，保留创建时间', async () => {
        const before = (await api('GET', `/api/notes/${encodeURIComponent(manual.id)}`)).data.meta.created_at
        const response = await api('PATCH', `/api/notes/${encodeURIComponent(manual.id)}`, { ...payload, tags: ['焦点'] })
        assert.equal(response.status, 200)
        const after = (await api('GET', `/api/notes/${encodeURIComponent(manual.id)}`)).data.meta
        assert.equal(after.created_at, before); assert.equal(after.category, 'essay'); assert.deepEqual(after.tags, ['焦点'])
      })
      await verify('已有档案可以改为随笔分类', async () => {
        const response = await api('PATCH', `/api/notes/${encodeURIComponent(other.id)}`, { title: '待改分类普通资料', content: '普通资料正文', category: 'essay' })
        assert.equal(response.status, 200)
        assert.equal((await api('GET', '/api/notes?category=essay')).data.total, 2)
      })
      const { archiveNoteTool } = await import('../src/services/agent/tools/archive-note.js')
      const { searchNotesTool } = await import('../src/services/agent/tools/search-notes.js')
      const registry = { tools: new Map([['archive_note', archiveNoteTool()]]), meta: new Map([['archive_note', { risk: 'needs-confirm' }]]) }
      const createEssayDraft = async title => {
        const events = []
        const result = await runTurn({ message: '请生成一篇随笔草案', emit: (event, data) => events.push({ event, data }), registry,
          model: { invoke: async () => new AIMessage({ content: '随笔草案尚未保存', tool_calls: [{ id: 'essay-call', name: 'archive_note', args: { title, content: '来自 agent 的随笔测试正文', category: 'essay', tags: ['焦点'] } }] }) } })
        return { ...result, pending: events.find(item => item.event === 'confirmation_required')?.data }
      }
      const approveDraft = await createEssayDraft('agent 待批准随笔')
      await verify('agent 接受随笔分类，但确认前不新增档案', async () => {
        assert(approveDraft.suspended && approveDraft.pending)
        assert.equal(approveDraft.pending.draft.category, 'essay')
        assert.equal((await query('SELECT count(*)::int AS n FROM notes'))[0].n, 2)
      })
      await verify('批准后随笔进入主库，会话恢复显示真实结果', async () => {
        const response = await api('PATCH', `/api/tasks/${approveDraft.pending.task_id}`, { decision: 'approved' })
        assert.equal(response.data.status, 'done')
        const list = await api('GET', `/api/notes?category=essay&q=${encodeURIComponent('agent 待批准随笔')}`)
        assert.equal(list.data.total, 1); agentNote = list.data.items[0]
        assert.equal((await loadSession(approveDraft.sessionId)).pendingConfirmationId, null)
      })
      const rejectDraft = await createEssayDraft('agent 待拒绝随笔')
      await verify('拒绝随笔草案，不保存正文', async () => {
        const response = await api('PATCH', `/api/tasks/${rejectDraft.pending.task_id}`, { decision: 'rejected' })
        assert.equal(response.data.status, 'failed')
        assert.equal((await api('GET', '/api/notes?category=essay')).data.total, 3)
      })
      await verify('agent 按 essay 检索只返回随笔', async () => {
        const result = JSON.parse(await searchNotesTool().invoke({ category: 'essay' }))
        assert.equal(result.total, 3); assert(result.items.every(item => item.category === 'essay'))
      })
      const oldest = (await api('POST', '/api/notes', { title: '旧随笔最近被修改', content: '旧随笔正文', category: 'essay' })).data
      const now = Date.now()
      for (const [id, days] of [[manual.id, 3], [other.id, 2], [agentNote.id, 1], [oldest.id, 60]]) {
        await query('UPDATE notes SET created_at=$2,updated_at=$3 WHERE id=$1', [id, new Date(now - days * 86400000).toISOString(), new Date(now).toISOString()])
      }
      await api('POST', '/api/notes', { title: '普通焦点资料', content: '普通焦点正文', category: 'learning', tags: ['焦点'] })
      const home = (await api('GET', '/api/home')).data
      await verify('首页最近三篇按创建时间排序，旧文修改不置顶', async () => {
        assert.deepEqual(home.essays.map(item => item.id), [agentNote.id, other.id, manual.id])
        assert(!home.essays.some(item => item.id === oldest.id))
      })
      await verify('带焦点标签的随笔也不进入焦点区', async () => {
        assert.equal(home.focus.items.length, 1)
        assert(home.focus.items.every(item => item.category !== 'essay'))
      })
      await verify('随笔计入档案总数，仍保留全部随笔列表', async () => {
        assert.equal(home.stats.notes_total, 5)
        assert.equal((await api('GET', '/api/notes?category=essay')).data.total, 4)
      })
      await verify('数据库模式不偷偷写一份 Markdown 副本', async () => {
        const files = await import('../src/storage/files.js')
        assert.equal((await files.list()).items.length, 0)
      })
      await verify('删除随笔后，列表和首页随笔区同步排除', async () => {
        assert.equal((await api('DELETE', `/api/notes/${encodeURIComponent(agentNote.id)}`)).status, 200)
        assert.equal((await api('GET', '/api/notes?category=essay')).data.total, 3)
        assert(!(await api('GET', '/api/home')).data.essays.some(item => item.id === agentNote.id))
      })
      const { createServer } = await import('../../web/node_modules/vite/dist/node/index.js')
      const { createRequire } = await import('node:module')
      essayVite = await createServer({ root: fileURLToPath(new URL('../../web/', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
      const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url))
      const React = requireWeb('react')
      const { renderToStaticMarkup } = requireWeb('react-dom/server')
      const { MemoryRouter } = requireWeb('react-router-dom')
      const render = (Component, url = '/notes', props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Component, props)))
      const Form = (await essayVite.ssrLoadModule('/src/components/NoteArchiveForm.jsx')).default
      const List = (await essayVite.ssrLoadModule('/src/pages/NoteListPage.jsx')).default
      const Files = (await essayVite.ssrLoadModule('/src/components/NoteFileList.jsx')).default
      const { EssaysCard } = await essayVite.ssrLoadModule('/src/pages/HomePage.jsx')
      await verify('手动表单真实渲染“随笔”选项', async () => assert(render(Form, '/archive').includes('value="essay">随笔</option>')))
      await verify('分类链接刷新后仍选中随笔，并与目录视图兼容', async () => {
        for (const url of ['/notes?category=essay', '/notes?view=dir&category=essay']) {
          assert(render(List, url).includes('资料分类：随笔'))
        }
        assert(render(List, '/notes?category=unknown').includes('资料分类：全部'))
      })
      await verify('目录分组用中文“随笔”显示', async () => {
        assert(render(Files, '/notes?view=dir', { items: [{ id: manual.id, title: '目录随笔', category: 'essay', path: `essay/${manual.id}.md` }] }).includes('随笔'))
      })
      await verify('首页“全部随笔”链接指向已筛选档案', async () => {
        const html = render(EssaysCard, '/', { essays: home.essays })
        assert(html.includes('href="/notes?category=essay"') && html.includes('查看全部随笔'))
      })
    } else {
    await verify('无审阅凭据的批准不修改记录', async () => {
      const { draft } = await linked('缺少凭据')
      const before = await counts()
      assert.equal((await send(draft, 'approved', null)).status, 400)
      await assertUndecided(draft)
      assert.deepEqual(await counts(), before)
    })
    await verify('非法决定不伪造批准', async () => {
      const { draft, session } = await linked('非法决定')
      assert.equal((await send(draft, 'anything')).status, 400)
      await assertUndecided(draft)
      assert.equal((await loadSession(session.id)).pendingConfirmationId, draft.confirmation.id)
    })
    await verify('不存在的草案返回 404，不创建确认事实', async () => {
      const before = (await query('SELECT count(*)::int AS n FROM confirmations'))[0].n
      assert.equal((await send({ id: 'missing-draft', review_token: '0'.repeat(64) })).status, 404)
      assert.equal((await query('SELECT count(*)::int AS n FROM confirmations'))[0].n, before)
    })
    await verify('不匹配的审阅凭据保持待确认', async () => {
      const { draft } = await linked('旧凭据')
      const response = await send(draft, 'approved', '0'.repeat(64))
      assert.equal(response.status, 409)
      assert.equal(response.error.code, 'PLANNING_REVIEW_REQUIRED')
      await assertUndecided(draft)
    })

    const accepted = await linked('并发批准')
    await verify('同一草案并发批准只写一组业务记录', async () => {
      const before = await counts()
      const responses = await Promise.all([send(accepted.draft), send(accepted.draft)])
      assert(responses.every(response => response.status === 200 && response.data.status === 'approved'))
      assert.deepEqual(await counts(), { plans: before.plans + 1, schedules: before.schedules + 1, changes: before.changes + 2 })
    })
    await verify('并发恢复只记录一次结果，并保留模型工具消息配对', async () => {
      const restored = await loadSession(accepted.session.id)
      assert.equal(restored.pendingConfirmationId, null)
      assert.deepEqual(restored.resolvedConfirmations, [accepted.draft.confirmation.id])
      assert.equal(restored.messages.filter(message => message.type === 'tool').length, 1)
      const tool = restored.messages.find(message => message.type === 'tool').data
      assert.equal(tool.tool_call_id, `call-${accepted.draft.id}`)
      assert(tool.content.includes('规划已保存'))
      assert.equal(restored.messages.filter(message => message.type === 'ai' && message.data.content.includes('规划已保存')).length, 1)
    })
    await verify('反向重复决定返回冲突，不改已批准结果', async () => {
      const response = await send(accepted.draft, 'rejected')
      assert.equal(response.status, 409)
      assert.equal(response.error.code, 'PLANNING_ALREADY_DECIDED')
      assert.equal((await getDraft(accepted.draft.id)).confirmation.decision, 'approved')
    })

    const conflictTime = slot()
    const changed = await linked('生成后出现冲突', makePayload('生成后出现冲突', conflictTime))
    const blocker = await proposePlanning(makePayload('后来新增的安排', conflictTime))
    assert.equal((await send(blocker)).data.status, 'approved')
    let refreshed
    await verify('生成草案后新增冲突，首次批准只刷新草案', async () => {
      const before = await counts()
      const response = await send(changed.draft)
      assert.equal(response.status, 409)
      assert.equal(response.error.code, 'PLANNING_REVIEW_REQUIRED')
      assert.equal(response.data.conflicts.length, 1)
      assert.notEqual(response.data.review_token, changed.draft.review_token)
      await assertUndecided(changed.draft)
      assert.equal((await loadSession(changed.session.id)).pendingConfirmationId, changed.draft.confirmation.id)
      assert.deepEqual(await counts(), before)
      refreshed = await getDraft(changed.draft.id)
    })
    await verify('另一标签页的旧凭据不能跳过新冲突', async () => {
      assert.equal((await send(changed.draft)).status, 409)
      await assertUndecided(changed.draft)
    })
    await verify('审阅新冲突后可明确保存重叠安排，JSON 字段顺序不导致循环重审', async () => {
      const response = await send(refreshed)
      assert.equal(response.status, 200)
      assert.equal(response.data.status, 'approved')
      assert.equal(response.data.agent_sync.state, 'synced')
    })
    await verify('两份重叠草案并发批准，后提交者必须重新审阅', async () => {
      const time = slot()
      const a = await proposePlanning(makePayload('并发不同草案 A', time))
      const b = await proposePlanning(makePayload('并发不同草案 B', time))
      const before = await counts()
      const responses = await Promise.all([send(a), send(b)])
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
      assert.deepEqual(await counts(), { plans: before.plans + 1, schedules: before.schedules + 1, changes: before.changes + 2 })
    })
    await verify('同一草案内部冲突也展示，首尾相接不算冲突', async () => {
      const time = slot()
      const start = new Date(time.start_at)
      const draft = await proposePlanning({ schedules: [
        { title: '内部 A', ...time },
        { title: '内部 B', ...time },
        { title: '接续', start_at: time.end_at, end_at: new Date(start.getTime() + 7200000).toISOString() },
      ] })
      assert.equal(draft.conflicts.length, 1)
      assert.equal(draft.conflicts[0].kind, 'draft')
    })
    await verify('冲突消失后也刷新快照，而非批准过期信息', async () => {
      const time = slot()
      const old = await proposePlanning(makePayload('可取消的安排', time))
      await send(old)
      const draft = await proposePlanning(makePayload('冲突消失', time))
      assert.equal(draft.conflicts.length, 1)
      await query("UPDATE schedules SET status='cancelled' WHERE title=$1", ['可取消的安排-日程'])
      const response = await send(draft)
      assert.equal(response.status, 409)
      assert.equal(response.data.conflicts.length, 0)
      await assertUndecided(draft)
    })
    await verify('过去日期及跨午夜冲突在生成草案时可见', async () => {
      const time = { start_at: '2025-01-01T23:30:00+08:00', end_at: '2025-01-02T00:30:00+08:00' }
      const old = await proposePlanning(makePayload('过去跨午夜', time))
      await send(old)
      const draft = await proposePlanning({ schedules: [{ title: '过去重叠', start_at: '2025-01-02T00:15:00+08:00', end_at: '2025-01-02T01:00:00+08:00' }] })
      assert.equal(draft.conflicts.length, 1)
    })

    await query(`CREATE FUNCTION force_schedule_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.title = '测试第二条失败' THEN RAISE EXCEPTION 'test-only forced failure'; END IF; RETURN NEW; END $$`)
    await query('CREATE TRIGGER force_schedule_failure BEFORE INSERT ON schedules FOR EACH ROW EXECUTE FUNCTION force_schedule_failure()')
    const failed = await linked('中途失败', { plan: { title: '中途失败' }, schedules: [
      { title: '测试第一条成功', ...slot() }, { title: '测试第二条失败', ...slot() },
    ] })
    await verify('第二条日程写失败，计划、第一条日程和变更记录全回滚', async () => {
      const before = await counts()
      const response = await send(failed.draft)
      assert.equal(response.status, 200)
      assert.equal(response.data.status, 'failed')
      assert.equal(response.data.confirmation.decision, 'approved')
      assert(response.data.confirmation.confirmed_at)
      assert(response.data.result.includes('你已批准'))
      assert(!response.data.result.includes('test-only forced failure'))
      assert.deepEqual(await counts(), before)
    })
    await verify('执行失败也解除 agent 挂起，保存失败结果而非成功提示', async () => {
      const restored = await loadSession(failed.session.id)
      assert.equal(restored.pendingConfirmationId, null)
      assert(restored.messages.some(message => message.type === 'ai' && message.data.content.includes('工具执行失败')))
      assert(!restored.messages.some(message => message.type === 'ai' && message.data.content.includes('规划已保存')))
      const response = await fetch(`${base}/api/planning/drafts/${failed.draft.id}`).then(response => response.json())
      assert.equal(response.data.status, 'failed')
      assert(response.data.result.includes('你已批准'))
    })
    await verify('失败草案重复批准只返回失败终态，不重复执行', async () => {
      const before = await counts()
      const response = await send(failed.draft)
      assert.equal(response.data.status, 'failed')
      assert.equal(response.data.agent_sync.state, 'synced')
      assert.deepEqual(await counts(), before)
    })
    await query('DROP TRIGGER force_schedule_failure ON schedules')
    await query('DROP FUNCTION force_schedule_failure()')

    await query(`CREATE FUNCTION force_rejection_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status = 'rejected' THEN RAISE EXCEPTION 'test-only rejection storage failure'; END IF; RETURN NEW; END $$`)
    await query('CREATE TRIGGER force_rejection_failure BEFORE UPDATE ON planning_drafts FOR EACH ROW EXECUTE FUNCTION force_rejection_failure()')
    const reject = await linked('拒绝失败')
    await verify('拒绝存储失败不被改写成批准，原决定仍为空', async () => {
      const before = await counts()
      const response = await send(reject.draft, 'rejected')
      assert.equal(response.status, 503)
      await assertUndecided(reject.draft)
      assert.equal((await loadSession(reject.session.id)).pendingConfirmationId, reject.draft.confirmation.id)
      assert.deepEqual(await counts(), before)
    })
    await query('DROP TRIGGER force_rejection_failure ON planning_drafts')
    await query('DROP FUNCTION force_rejection_failure()')
    await verify('恢复后拒绝成功，不写业务记录并恢复会话', async () => {
      const before = await counts()
      const response = await send(reject.draft, 'rejected')
      assert.equal(response.data.status, 'rejected')
      assert.equal(response.data.confirmation.decision, 'rejected')
      assert.equal(response.data.executed_at, null)
      assert.equal(response.data.agent_sync.state, 'synced')
      assert.deepEqual(await counts(), before)
    })
    await verify('拒绝幂等，不重复记录会话消息', async () => {
      const before = (await loadSession(reject.session.id)).messages.length
      assert.equal((await send(reject.draft, 'rejected')).data.status, 'rejected')
      assert.equal((await loadSession(reject.session.id)).messages.length, before)
    })
    await verify('损坏草案校验失败不制造批准事实', async () => {
      const draft = await proposePlanning(makePayload('损坏草案'))
      await query("UPDATE planning_drafts SET payload=jsonb_set(payload,'{plan,title}','\"\"'::jsonb) WHERE id=$1", [draft.id])
      const read = await getDraft(draft.id)
      const response = await send(read)
      assert.equal(response.status, 400)
      await assertUndecided(draft)
    })

    const missingSession = newSession()
    const detached = await proposePlanning(makePayload('业务成功但会话暂失'), missingSession.id)
    await verify('会话缺失不把已保存业务误报为失败', async () => {
      const response = await send(detached)
      assert.equal(response.status, 200)
      assert.equal(response.data.status, 'approved')
      assert.equal(response.data.agent_sync.state, 'pending')
      assert(response.data.agent_sync.message.includes('不会重复保存'))
    })
    await linkSession(detached, missingSession)
    await verify('重试仅同步恢复的会话，不新增计划、日程或审计', async () => {
      const before = await counts()
      const response = await send(detached)
      assert.equal(response.data.agent_sync.state, 'synced')
      assert.equal((await loadSession(missingSession.id)).pendingConfirmationId, null)
      assert.deepEqual(await counts(), before)
    })
    await verify('旧确认重复恢复不清除会话中的新待确认项', async () => {
      const session = await loadSession(missingSession.id)
      session.pendingConfirmationId = 'confirm-new-pending'
      await saveSession(session)
      await resumeAfterDecision({ sessionId: session.id, confirmationId: detached.confirmation.id, decision: 'approved', result: '旧结果' })
      assert.equal((await loadSession(session.id)).pendingConfirmationId, 'confirm-new-pending')
    })
    await verify('后续对话工具消息配对有效，使用注入假模型可继续', async () => {
      let invoked = false
      await runTurn({
        sessionId: accepted.session.id, message: '继续', registry: { tools: new Map(), meta: new Map() }, emit: () => {},
        model: { invoke: async history => {
          const callIds = new Set(history.flatMap(message => message.tool_calls ?? []).map(call => call.id))
          const tools = history.filter(message => message.getType() === 'tool')
          assert(tools.every(message => callIds.has(message.tool_call_id)))
          assert(tools.some(message => message.content.includes('规划已保存')))
          invoked = true
          return new AIMessage('可以继续安排。')
        } },
      })
      assert(invoked)
    })
    }
    console.log(`${sourceMode ? '资料来源' : lifecycleMode ? '规划生命周期' : essayMode ? '随笔链路' : '规划确认'}专项：${n}/${n} 通过（独立 PostgreSQL 容器；临时数据将在退出时全部移除）`)
  } finally {
    if (fakeAsrChild) {
      const exited = new Promise(resolve => fakeAsrChild.once('exit', resolve))
      fakeAsrChild.kill(); await exited
    }
    if (essayVite) await essayVite.close()
    if (appServer) await new Promise(resolve => appServer.close(resolve))
    if (closePool) await closePool()
    if (started) docker(['rm', '-f', container])
    await rm(directory, { recursive: true, force: true })
  }
  process.exit(0)
}

// 对话确认专项：真实会话序列化、前端转换/渲染及确认动作；禁止调用外部模型。
// node server/scripts/smoke.mjs --agent-confirm-selftest
if (process.argv.includes('--agent-confirm-selftest')) {
  const { default: assert } = await import('node:assert/strict')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { createRequire } = await import('node:module')
  const directory = await mkdtemp(`${tmpdir()}/buddy-agent-confirm-`)
  Object.assign(process.env, { DATA_DIR: directory, DATABASE_URL: '', AUTH_ENABLED: '0', OPENAI_API_KEY: '', CHROMA_URL: '', ASR_SERVICE_URL: '', GITHUB_USERNAME: '' })
  const { sessionToView, pendingConfirmationView, loadSession } = await import('../src/services/agent/state.js')
  const { runTurn } = await import('../src/services/agent/loop.js')
  const { archiveNoteTool } = await import('../src/services/agent/tools/archive-note.js')
  const { list } = await import('../src/storage/files.js')
  const { AIMessage } = await import('@langchain/core/messages')
  const { createServer } = await import('../../web/node_modules/vite/dist/node/index.js')
  const vite = await createServer({ root: fileURLToPath(new URL('../../web/', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url))
  const React = requireWeb('react')
  const { renderToStaticMarkup } = requireWeb('react-dom/server')
  const { MemoryRouter } = requireWeb('react-router-dom')
  const nativeFetch = globalThis.fetch
  let appServer
  let n = 0
  const verify = async (title, work) => { await work(); console.log(`  ✅ ac${++n} ${title}`) }
  try {
    const { rowToLike, resolveConfirmation, AgentConfirmationContext } = await vite.ssrLoadModule('/src/agent/runtime.js')
    const { default: ToolFallback } = await vite.ssrLoadModule('/src/agent/ToolFallback.jsx')
    const convert = view => view.rows.map(rowToLike).flatMap(message => message.content).find(part => part.result?.__pendingConfirm)?.result
    const fullText = '完整内容'.repeat(400) + '正文末尾标记'
    const planDraft = { id: 'draft-repro', status: 'pending', review_token: 'a'.repeat(64), payload: { plan: { title: '演示长期计划', description: fullText }, schedules: [] }, conflicts: [] }
    const fixture = (name, args, out) => ({ id: 'session-repro', pendingConfirmationId: 'confirm-repro', messages: [
      { type: 'ai', data: { content: '', tool_calls: [{ id: 'call-repro', name, args }] } },
      { type: 'tool', data: { name, tool_call_id: 'call-repro', content: JSON.stringify({ pending_confirmation: true, confirmation_id: 'confirm-repro', ...out }) } },
    ] })
    const planningSession = fixture('propose_planning', {}, { draft_id: 'draft-repro', draft: planDraft })
    const archiveSession = fixture('archive_note', { title: '旧归档草案', category: 'learning', content: fullText }, { task_id: 'task-repro', draft: { title: '旧归档草案', category: 'learning', content_length: fullText.length } })
    const planning = convert(sessionToView(planningSession))
    const archive = convert(sessionToView(archiveSession))
    const renderCard = pending => renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(AgentConfirmationContext.Provider, { value: { working: false, generating: false, refresh: async () => {}, setWorking: () => {} } },
        React.createElement(ToolFallback, { toolName: 'confirmation', result: pending }))))
    await verify('规划工具摘要超过 500 字，刷新仍恢复完整草案和审阅凭据', async () => {
      assert.equal(planning.draft_id, 'draft-repro')
      assert.equal(planning.draft.payload.plan.description, fullText)
      assert.equal(planning.draft.review_token, planDraft.review_token)
    })
    await verify('旧归档草案从原工具参数恢复完整正文', async () => { assert.equal(archive.task_id, 'task-repro'); assert.equal(archive.draft.content, fullText) })
    await verify('规划卡直接显示计划名称、尚未保存及确认/拒绝按钮', async () => {
      const html = renderCard(planning)
      assert(html.includes('演示长期计划') && html.includes('正文末尾标记') && html.includes('草案尚未保存'))
      assert(html.includes('确认并保存') && html.includes('拒绝草案'))
    })
    await verify('归档卡展示完整正文，不要求先跳日志页', async () => {
      const html = renderCard(archive)
      assert(html.includes('正文末尾标记') && html.includes('确认并保存') && html.includes('拒绝草案'))
      assert(!html.includes('请到「日志'))
    })
    await verify('无待确认标记时，不把旧工具结果变成确认卡', async () => {
      assert.equal(convert(sessionToView({ ...planningSession, pendingConfirmationId: null })), undefined)
    })
    const replies = async (responses, work) => {
      const calls = []
      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
        const item = responses.shift()
        assert(item, `多发了请求：${url}`)
        if (item.throw) throw new TypeError('本机注入网络错误')
        return new Response(JSON.stringify(item.body), { status: item.status || 200, headers: { 'Content-Type': 'application/json' } })
      }
      try { await work(calls); assert.equal(responses.length, 0) } finally { globalThis.fetch = nativeFetch }
    }
    const approved = { ...planDraft, status: 'approved', result: '规划已保存', confirmation: { decision: 'approved' } }
    await verify('对话按钮提交实际展示版本的 review_token', async () => replies([{ body: { ok: true, data: approved } }], async calls => {
      const result = await resolveConfirmation(planning, 'approved', planDraft)
      assert.equal(result.status, 'approved')
      assert.equal(calls[0].body.review_token, planDraft.review_token)
      assert.equal(calls[0].method, 'PATCH')
    }))
    const updated = { ...planDraft, review_token: 'b'.repeat(64), conflicts: [{ existing_title: '新冲突' }] }
    await verify('409 冲突变化只重读草案，不自动再次批准', async () => replies([
      { status: 409, body: { ok: false, error: { code: 'PLANNING_REVIEW_REQUIRED', message: '需重审' } } },
      { body: { ok: true, data: updated } },
    ], async calls => {
      const result = await resolveConfirmation(planning, 'approved', planDraft)
      assert.equal(result.kind, 'review'); assert.equal(result.draft.review_token, updated.review_token)
      assert.deepEqual(calls.map(call => call.method), ['PATCH', 'GET'])
    }))
    await verify('对话拒绝返回未保存终态', async () => replies([{ body: { ok: true, data: { ...planDraft, status: 'rejected', result: '未保存' } } }], async () => {
      assert.equal((await resolveConfirmation(planning, 'rejected')).status, 'rejected')
    }))
    await verify('保存失败结果不显示为已保存', async () => replies([{ body: { ok: true, data: { ...planDraft, status: 'failed', result: '工具执行失败：未保存' } } }], async () => {
      const result = await resolveConfirmation(planning, 'approved')
      assert.equal(result.status, 'failed'); assert(result.result.includes('未保存'))
    }))
    await verify('批准响应丢失后只 GET 结果，不重复写入', async () => replies([{ throw: true }, { body: { ok: true, data: approved } }], async calls => {
      assert.equal((await resolveConfirmation(planning, 'approved')).status, 'approved')
      assert.deepEqual(calls.map(call => call.method), ['PATCH', 'GET'])
    }))
    await verify('旧草案已由其他页面决定时，展示真实终态', async () => replies([
      { status: 409, body: { ok: false, error: { code: 'PLANNING_REVIEW_REQUIRED', message: '需重读' } } },
      { body: { ok: true, data: approved } },
    ], async () => assert.equal((await resolveConfirmation(planning, 'approved')).kind, 'terminal')))
    const { createApp } = await import('../src/app.js')
    appServer = createApp().listen(0, '127.0.0.1')
    await new Promise(resolve => appServer.once('listening', resolve))
    const base = `http://127.0.0.1:${appServer.address().port}`
    globalThis.fetch = (url, options) => nativeFetch(String(url).startsWith('/') ? `${base}${url}` : url, options)
    const registry = { tools: new Map([['archive_note', archiveNoteTool()]]), meta: new Map([['archive_note', { risk: 'needs-confirm' }]]) }
    const generateArchive = async title => {
      const events = []
      const outcome = await runTurn({ message: '生成测试草案', emit: (event, data) => events.push({ event, data }), registry,
        model: { invoke: async () => new AIMessage({ content: '草案待确认，尚未保存', tool_calls: [{ id: 'archive-test-call', name: 'archive_note', args: { title, category: 'learning', content: fullText } }] }) } })
      return { ...outcome, pending: events.find(x => x.event === 'confirmation_required').data }
    }
    const first = await generateArchive('对话确认测试归档')
    await verify('真实归档工具先生成草案，未确认前没有档案', async () => {
      assert(first.suspended)
      assert.equal(first.pending.draft.content, fullText)
      assert.equal((await list()).items.length, 0)
    })
    await verify('对话确认调用真实 HTTP 闸门，保存后会话可读到真实结果', async () => {
      const result = await resolveConfirmation({ __pendingConfirm: true, ...first.pending }, 'approved')
      assert.equal(result.status, 'approved')
      assert.equal((await list()).items.length, 1)
      const view = await globalThis.fetch(`/api/agent/sessions/${first.sessionId}`).then(response => response.json())
      assert.equal(view.data.pending_confirmation_id, null)
      assert(view.data.rows.some(row => row.role === 'assistant' && row.text.includes('已归档到')))
      assert.equal(convert(view.data), undefined)
    })
    const second = await generateArchive('对话拒绝测试归档')
    await verify('对话拒绝真实归档草案，不新增档案', async () => {
      const result = await resolveConfirmation({ __pendingConfirm: true, ...second.pending }, 'rejected')
      assert.equal(result.status, 'rejected')
      assert.equal((await list()).items.length, 1)
      assert.equal((await loadSession(second.sessionId)).pendingConfirmationId, null)
    })
    await verify('模型同轮提出多个写工具时，只执行首个草案，保留工具响应配对', async () => {
      const outcome = await runTurn({ message: '多项草案', emit: () => {}, registry,
        model: { invoke: async () => new AIMessage({ content: '', tool_calls: [
          { id: 'first-write', name: 'archive_note', args: { title: '首个草案', category: 'learning', content: '首个' } },
          { id: 'second-write', name: 'archive_note', args: { title: '第二个草案', category: 'learning', content: '第二个' } },
        ] }) } })
      const session = await loadSession(outcome.sessionId)
      const responses = session.messages.filter(message => message.type === 'tool')
      assert.equal(responses.length, 2)
      assert(responses[1].data.content.includes('未执行'))
      assert.equal(pendingConfirmationView(session).draft.title, '首个草案')
    })
    console.log(`对话内确认专项：${n}/${n} 通过（仅临时数据、注入模型与真实前端渲染；无浏览器操作）`)
  } finally {
    globalThis.fetch = nativeFetch
    if (appServer) await new Promise(resolve => appServer.close(resolve))
    await vite.close()
    await rm(directory, { recursive: true, force: true })
  }
  process.exit(0)
}

// 用法：
//   1) 先起后端（可用独立数据目录，避免污染真实资料）：
//        公开模式（默认）：DATA_DIR=/tmp/buddy-smoke-data PORT=3000 npm run dev
//        隐私模式：再加 AUTH_ENABLED=1 与 PASSWORD_HASH（见 server/.env.example）
//   2) 跑本脚本：
//        公开：node scripts/smoke.mjs
//        隐私：SMOKE_PASSWORD="<口令>" node scripts/smoke.mjs
// 脚本会先读 /api/health 的 auth_enabled，自动适配断言。
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const PASSWORD = process.env.SMOKE_PASSWORD || ''
const UNIQ = `${Date.now()}` // 每次运行用唯一内容，避免与历史数据撞查重
// 转写链路冒烟：设 SMOKE_FAKE_ASR_PORT（如 8099）时，自动拉起 scripts/fake-asr.mjs 桩并跑转写断言；
// 需后端以 ASR_SERVICE_URL=http://127.0.0.1:<同一端口> ASR_SERVICE_TOKEN=fake-token ASR_POLL_INTERVAL_MS=1000 启动。
const FAKE_ASR_PORT = process.env.SMOKE_FAKE_ASR_PORT || ''
// ima 只读链路冒烟：设 SMOKE_FAKE_IMA_PORT（如 8097）时，自动拉起 scripts/fake-ima.mjs 桩并跑断言；
// 需后端以 IMA_BASE_URL=http://127.0.0.1:<同一端口> IMA_OPENAPI_CLIENTID=fake-cid IMA_OPENAPI_APIKEY=fake-key 启动。
// 不设 SMOKE_FAKE_IMA_PORT 时只做「未配置态」断言；后端配了真实凭据时会跳过一次真实只读调用。
// 笔记断言（im⑧–im⑪）覆盖：列表字段映射 / 详情 meta+Markdown 且 <mark> 已剥 / 404 / 隐私模式 401。
const FAKE_IMA_PORT = process.env.SMOKE_FAKE_IMA_PORT || ''
// GitHub 聚合冒烟：设 SMOKE_FAKE_GH_PORT（如 8096）时，自动拉起 scripts/fake-github.mjs 桩并跑断言；
// 需后端以 GITHUB_USERNAME=fake-user GITHUB_TOKEN=fake GITHUB_API_BASE=http://127.0.0.1:<同一端口>
//   GITHUB_GRAPHQL_BASE=http://127.0.0.1:<同一端口>/graphql GITHUB_CACHE_TTL_MS=60000 启动。
// 不设时只做「未配置态」断言（configured:false）。
const FAKE_GH_PORT = process.env.SMOKE_FAKE_GH_PORT || ''

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}${detail ? ` ｜ ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}${detail ? ` ｜ ${detail}` : ''}`)
  }
}

async function req(method, url, { body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let json = null
  const text = await res.text()
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' }
}

function sidFrom(setCookie) {
  const m = /sid=([^;]+)/.exec(setCookie)
  return m ? m[1] : null
}

console.log(`冒烟测试 → ${BASE}`)

// ===== 按需拉起假 ASR 服务（转写断言用）=====
let fakeAsr = null
async function startFakeAsr() {
  if (!FAKE_ASR_PORT) return false
  fakeAsr = spawn(process.execPath, [fileURLToPath(new URL('./fake-asr.mjs', import.meta.url))], {
    env: { ...process.env, ASR_PORT: FAKE_ASR_PORT, FAKE_TOKEN: 'fake-token' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${FAKE_ASR_PORT}/healthz`)
      if (r.ok) return true
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('fake-asr 未能启动')
  process.exit(2)
}
// ===== 按需拉起假 ima 服务（只读断言用）=====
let fakeIma = null
async function startFakeIma() {
  if (!FAKE_IMA_PORT) return false
  fakeIma = spawn(process.execPath, [fileURLToPath(new URL('./fake-ima.mjs', import.meta.url))], {
    env: { ...process.env, IMA_PORT: FAKE_IMA_PORT },
    stdio: 'ignore',
  })
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`)
      if (r.ok) return true
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('fake-ima 未能启动')
  process.exit(2)
}
// ===== 按需拉起假 GitHub（F16 聚合断言用）=====
let fakeGh = null
async function startFakeGh() {
  if (!FAKE_GH_PORT) return false
  fakeGh = spawn(process.execPath, [fileURLToPath(new URL('./fake-github.mjs', import.meta.url))], {
    env: { ...process.env, GH_PORT: FAKE_GH_PORT },
    stdio: 'ignore',
  })
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${FAKE_GH_PORT}/counts`)
      if (r.ok) return true
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('fake-github 未能启动')
  process.exit(2)
}
process.on('exit', () => { if (fakeAsr) fakeAsr.kill(); if (fakeIma) fakeIma.kill(); if (fakeGh) fakeGh.kill() })

/** 轮询任务直到终态（done/failed/attention）或超时；返回最后一次看到的任务对象。
 *  默认 60s：归档类任务可能含一次真实 LLM 整理（fallback 或慢端点都要打满等待预算）。 */
async function waitTask(id, cookie, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const res = await req('GET', '/api/tasks', { cookie })
    last = res.json?.data?.items?.find((t) => t.id === id) ?? null
    if (last && (last.status === 'done' || last.status === 'failed' || last.status === 'attention')) return last
    await new Promise((r) => setTimeout(r, 400))
  }
  return last
}

// ① 健康检查（公开），顺带读 auth_enabled
const health = await req('GET', '/api/health')
check('① GET /api/health → 200', health.status === 200 && health.json?.data?.status === 'ok', JSON.stringify(health.json?.data))
const authEnabled = Boolean(health.json?.data?.auth_enabled)
console.log(`   模式：${authEnabled ? '隐私（需登录）' : '公开（免登录）'}`)

const payload = { title: `冒烟测试-${UNIQ}`, category: 'work', tags: ['冒烟'], content: `# 冒烟\n\n内容 ${UNIQ}` }
let cookie = ''

if (authEnabled) {
  // ===== 隐私模式 =====
  const noAuth = await req('GET', '/api/notes')
  check('② 未登录 GET /api/notes → 401 AUTH_REQUIRED', noAuth.status === 401 && noAuth.json?.error?.code === 'AUTH_REQUIRED', noAuth.json?.error?.code)

  const badLogin = await req('POST', '/api/login', { body: { password: `wrong-${UNIQ}` } })
  check('③ 错误口令 → 401 AUTH_FAILED', badLogin.status === 401 && badLogin.json?.error?.code === 'AUTH_FAILED', badLogin.json?.error?.code)

  if (!PASSWORD) {
    console.error('隐私模式需要 SMOKE_PASSWORD（后端 PASSWORD_HASH 对应的口令）。')
    process.exit(2)
  }
  const login = await req('POST', '/api/login', { body: { password: PASSWORD } })
  const sid = sidFrom(login.setCookie)
  check('④ 登录 → 200 + Set-Cookie(sid)', login.status === 200 && !!sid, sid ? `sid=${sid.slice(0, 8)}…` : `status=${login.status} ${JSON.stringify(login.json)}`)
  if (!sid) {
    console.error('登录失败，无法继续；请确认 SMOKE_PASSWORD 与后端 PASSWORD_HASH 对应。')
    process.exit(1)
  }
  cookie = `sid=${sid}`
} else {
  // ===== 公开模式 =====
  const openList = await req('GET', '/api/notes')
  check('② 公开模式：无 Cookie 访问 /api/notes → 200', openList.status === 200 && openList.json?.ok === true, `total=${openList.json?.data?.total}`)
}

// ⑤ 新建 → 201 {id,path,hash}
const created = await req('POST', '/api/notes', { body: payload, cookie })
check('⑤ 新建 → 201 {id,path,hash}', created.status === 201 && created.json?.data?.id && created.json?.data?.path && created.json?.data?.hash, created.json?.data?.path)

// ⑥ 重复提交同一内容 → 409 DUPLICATE
const dup = await req('POST', '/api/notes', { body: payload, cookie })
check('⑥ 重复提交 → 409 DUPLICATE', dup.status === 409 && dup.json?.error?.code === 'DUPLICATE', dup.json?.error?.message)

// ⑦ 空标题 → 400 VALIDATION_FAILED
const bad = await req('POST', '/api/notes', { body: { ...payload, title: '  ' }, cookie })
check('⑦ 空标题 → 400 VALIDATION_FAILED', bad.status === 400 && bad.json?.error?.code === 'VALIDATION_FAILED', bad.json?.error?.message)

// ⑧ 列表 + 全文检索：能按唯一关键词搜到刚建的那条
const list = await req('GET', `/api/notes?q=${encodeURIComponent(UNIQ)}`, { cookie })
const hit = list.json?.data?.items?.find((i) => i.id === created.json.data.id)
check('⑧ 检索命中刚建的条目', list.status === 200 && !!hit, `total=${list.json?.data?.total}`)

// ⑨ 详情读回原文
const detail = await req('GET', `/api/notes/${created.json.data.id}`, { cookie })
check('⑨ 详情读回正文一致', detail.status === 200 && detail.json?.data?.content === payload.content)

// ⑩ 不存在的 id → 404 NOT_FOUND
const missing = await req('GET', `/api/notes/nope-${UNIQ}`, { cookie })
check('⑩ 不存在的 id → 404 NOT_FOUND', missing.status === 404 && missing.json?.error?.code === 'NOT_FOUND', missing.json?.error?.message)

// ===== KB 知识库问答（可选）：仅在 .env 配好 OPENAI_API_KEY + CHROMA_URL 时跑 =====
const kbIndex = await req('POST', '/api/kb/index', { cookie })
if (kbIndex.status === 503 && kbIndex.json?.error?.code === 'KB_NOT_CONFIGURED') {
  console.log('  ⏭️  KB 未配置（缺 OPENAI_API_KEY / CHROMA_URL），跳过问答冒烟')
} else if (authEnabled && kbIndex.status === 401) {
  check('KB 接口鉴权', false, '隐私模式下带会话仍 401，请检查 requireAuth 挂载')
} else {
  check('KB POST /api/kb/index → 增量索引统计', kbIndex.status === 200 && kbIndex.json?.ok === true, JSON.stringify(kbIndex.json?.data))

  const kbQ = await req('POST', '/api/kb/query', { body: { q: `冒烟 ${UNIQ} 讲了什么`, k: 3 }, cookie })
  check('KB POST /api/kb/query → 答案 + 来源', kbQ.status === 200 && typeof kbQ.json?.data?.answer === 'string' && Array.isArray(kbQ.json?.data?.sources), kbQ.json?.data?.answer?.slice(0, 40))

  const kbEmpty = await req('POST', '/api/kb/query', { body: { q: '  ' }, cookie })
  check('KB 空问题 → 400 VALIDATION_FAILED', kbEmpty.status === 400 && kbEmpty.json?.error?.code === 'VALIDATION_FAILED', kbEmpty.json?.error?.code)

  const streamRes = await fetch(`${BASE}/api/kb/stream?q=${encodeURIComponent('你好')}`, { headers: cookie ? { Cookie: cookie } : {} })
  const streamText = await streamRes.text()
  check('KB GET /api/kb/stream → SSE 事件流', streamRes.status === 200 && /event: (token|error|done)/.test(streamText), `status=${streamRes.status}`)
}

// ===== 任务与确认链路（F4 发起 / F5 进度 / F6 确认）=====
// 注意：⑳ 会真的删除文件，所以专建一条「待删」资料，不动前面的冒烟资料。

// ⑪ 建提醒类任务（本期无自动执行器）→ 201 待办
const taskTodo = await req('POST', '/api/tasks', {
  body: { type: 'remind', payload: { text: `冒烟提醒-${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑪ POST /api/tasks(remind) → 201 待办',
  taskTodo.status === 201 && taskTodo.json?.data?.status === 'todo' && taskTodo.json?.data?.origin === 'phone',
  taskTodo.json?.data?.result,
)

// ⑫ 建资料类任务 → 同步执行 → 完成
const taskNote = await req('POST', '/api/tasks', {
  body: { type: 'note', payload: { title: `任务建的资料-${UNIQ}`, category: 'life', content: `任务正文 ${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑫ POST /api/tasks(note) → 同步归档完成',
  taskNote.status === 201 && taskNote.json?.data?.status === 'done',
  taskNote.json?.data?.result,
)

// ⑬ 重复提交同一内容 → 落一条 failed 任务（不重复写入）
const taskDup = await req('POST', '/api/tasks', {
  body: { type: 'note', payload: { title: `任务建的资料-${UNIQ}`, category: 'life', content: `任务正文 ${UNIQ}` }, origin: 'phone' },
  cookie,
})
check(
  '⑬ 重复内容 → 任务 failed + 查重原因',
  taskDup.status === 201 && taskDup.json?.data?.status === 'failed' && /已存在/.test(taskDup.json?.data?.result ?? ''),
  taskDup.json?.data?.result,
)

// ⑭ 任务列表 + 按状态过滤
const taskList = await req('GET', '/api/tasks?status=todo', { cookie })
const todoHit = Boolean(taskList.json?.data?.items?.some((t) => t.id === taskTodo.json?.data?.id))
check(
  '⑭ GET /api/tasks?status=todo → 命中且只含 todo',
  taskList.status === 200 && todoHit && taskList.json?.data?.items?.every((t) => t.status === 'todo'),
  `total=${taskList.json?.data?.total}`,
)

// ⑮ 非法状态迁移（已完成 → 待办）→ 400
const badMove = await req('PATCH', `/api/tasks/${taskNote.json?.data?.id}`, { body: { status: 'todo' }, cookie })
check(
  '⑮ 已完成→待办 → 400 VALIDATION_FAILED',
  badMove.status === 400 && badMove.json?.error?.code === 'VALIDATION_FAILED',
  badMove.json?.error?.message,
)

// ⑯ 专建一条待删资料，发起删除 → 任务 attention（此时尚未删除）
const victim = await req('POST', '/api/notes', {
  body: { title: `待删资料-${UNIQ}`, category: 'work', content: `待删正文 ${UNIQ}` },
  cookie,
})
const victimId = victim.json?.data?.id
const delTask = await req('POST', '/api/tasks', {
  body: { type: 'delete_note', payload: { note_id: victimId }, origin: 'phone' },
  cookie,
})
check(
  '⑯ 发起删除 → 任务 attention（还没删）',
  delTask.status === 201 && delTask.json?.data?.status === 'attention',
  delTask.json?.data?.result,
)

// ⑰ 未确认就想改状态 → 428（确认前的闸门）
const bypass = await req('PATCH', `/api/tasks/${delTask.json?.data?.id}`, { body: { status: 'done' }, cookie })
check(
  '⑰ 未确认改状态 → 428 CONFIRM_REQUIRED',
  bypass.status === 428 && bypass.json?.error?.code === 'CONFIRM_REQUIRED',
  bypass.json?.error?.message?.slice(0, 30),
)

// ⑱ 确认留痕可读，且带大白话 summary
const confs = await req('GET', `/api/confirmations?task_id=${delTask.json?.data?.id}`, { cookie })
const pendingConf = confs.json?.data?.items?.[0]
check(
  '⑱ GET /api/confirmations → 待确认 + summary',
  confs.status === 200 && Boolean(pendingConf) && pendingConf.decision === '' && /永久删除/.test(pendingConf.summary ?? ''),
  pendingConf?.summary?.slice(0, 30),
)

// ⑲ 拒绝 → 任务 failed，且资料原封不动
const rejected = await req('PATCH', `/api/tasks/${delTask.json?.data?.id}`, { body: { decision: 'rejected' }, cookie })
const stillThere = await req('GET', `/api/notes/${encodeURIComponent(victimId)}`, { cookie })
check(
  '⑲ 拒绝执行 → failed 且资料仍在',
  rejected.status === 200 && rejected.json?.data?.status === 'failed' && stillThere.status === 200,
  rejected.json?.data?.result,
)

// ⑳ 重新发起并确认 → 资料才真正被删除
const delTask2 = await req('POST', '/api/tasks', {
  body: { type: 'delete_note', payload: { note_id: victimId }, origin: 'phone' },
  cookie,
})
const approved = await req('PATCH', `/api/tasks/${delTask2.json?.data?.id}`, { body: { decision: 'approved' }, cookie })
const gone = await req('GET', `/api/notes/${encodeURIComponent(victimId)}`, { cookie })
check(
  '⑳ 确认执行 → done 且资料已删除',
  approved.status === 200 && approved.json?.data?.status === 'done' && gone.status === 404,
  approved.json?.data?.result,
)

// ㉑ 重复确认 → 400（同一确认提交两次应被拒）
const again = await req('PATCH', `/api/tasks/${delTask2.json?.data?.id}`, { body: { decision: 'approved' }, cookie })
check(
  '㉑ 重复确认 → 400（已无待确认）',
  again.status === 400 && again.json?.error?.code === 'VALIDATION_FAILED',
  again.json?.error?.message,
)

// ===== 视频转写链路（F13，可选）=====
// 触发条件：SMOKE_FAKE_ASR_PORT 已设 且 health.asr_configured 为真。
if (FAKE_ASR_PORT) {
  const fakeUp = await startFakeAsr()
  const h2 = await req('GET', '/api/health')
  if (!h2.json?.data?.asr_configured) {
    console.log('  ⏭️  后端未配 ASR_SERVICE_URL，跳过转写断言（fake-asr 已起但未接入）')
  } else {
    check('转① health.asr_configured → true', h2.json?.data?.asr_configured === true)

    // ㉕ 成功链路：提交 → 轮询器归档 → 资料落盘（含摘要/要点区块或回退说明 + 带时间戳全文）
    const okUrl = `https://example.com/v/${UNIQ}-ok`
    const t1 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: okUrl, category: 'learning', tags: ['转写'] } },
      cookie,
    })
    const t1done = t1.status === 201 ? await waitTask(t1.json.data.id, cookie) : null
    check(
      '转② transcribe_url → done 且归档到 data/*.md',
      t1.status === 201 && t1done?.status === 'done' && /已归档到 .+\.md/.test(t1done?.result ?? ''),
      t1done?.result,
    )
    const notePath = /已归档到 (\S+\.md)/.exec(t1done?.result ?? '')?.[1]
    const noteId = notePath ? notePath.split('/').pop().replace(/\.md$/, '') : ''
    const noteDetail = noteId ? await req('GET', `/api/notes/${encodeURIComponent(noteId)}`, { cookie }) : null
    check(
      '转③ 归档资料含 frontmatter source_url + 带时间戳全文',
      noteDetail?.status === 200 &&
        noteDetail.json?.data?.meta?.source_url === okUrl &&
        /## 全文（带时间戳）/.test(noteDetail.json?.data?.content ?? '') &&
        /\[\d{2}:\d{2}\]/.test(noteDetail.json?.data?.content ?? ''),
      noteId,
    )

    // 转④ 同一 URL 二次提交：不写第二份文件，任务 done 且提示已归档过
    const t1b = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: okUrl, category: 'learning' } },
      cookie,
    })
    const t1bdone = t1b.status === 201 ? await waitTask(t1b.json.data.id, cookie) : null
    check(
      '转④ 同一 URL 二次提交 → done 且不再写文件',
      t1b.status === 201 && t1bdone?.status === 'done' && /已归档过/.test(t1bdone?.result ?? ''),
      t1bdone?.result,
    )

    // ㉘ partial：job failed 但带已完成片段 → 仍归档 + 部分转写告警
    const pUrl = `https://example.com/v/${UNIQ}-partial`
    const t2 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: pUrl } },
      cookie,
    })
    const t2done = t2.status === 201 ? await waitTask(t2.json.data.id, cookie) : null
    const pPath = /已归档到 (\S+\.md)|已归档过 (\S+\.md)/.exec(t2done?.result ?? '')
    const pNoteId = pPath ? (pPath[1] || pPath[2]).split('/').pop().replace(/\.md$/, '') : ''
    const pNote = pNoteId ? await req('GET', `/api/notes/${encodeURIComponent(pNoteId)}`, { cookie }) : null
    check(
      '转⑤ 带 partial 的失败 → 归档成功 + 部分转写告警块',
      t2.status === 201 && t2done?.status === 'done' && /部分转写/.test(t2done?.result ?? '') &&
        /部分转写/.test(pNote?.json?.data?.content ?? ''),
      t2done?.result,
    )

    // ㉙ 完全失败（无 partial）→ 任务 failed，不落资料
    const fUrl = `https://example.com/v/${UNIQ}-fail`
    const t3 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: fUrl } },
      cookie,
    })
    const t3done = t3.status === 201 ? await waitTask(t3.json.data.id, cookie) : null
    check(
      '转⑥ job 完全失败 → 任务 failed + 中文原因',
      t3.status === 201 && t3done?.status === 'failed' && /失败/.test(t3done?.result ?? ''),
      t3done?.result,
    )

    // 转⑦ job 消失（404）→ 任务 failed + 可重试提示
    const gUrl = `https://example.com/v/${UNIQ}-gone`
    const t4 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: gUrl } },
      cookie,
    })
    const t4done = t4.status === 201 ? await waitTask(t4.json.data.id, cookie) : null
    check(
      '转⑦ job 404 → 任务 failed 且提示可退回重试',
      t4.status === 201 && t4done?.status === 'failed' && /退回待办重试/.test(t4done?.result ?? ''),
      t4done?.result,
    )

    // ㉛ 退回重试：retry URL 首次 job 失败 → PATCH todo 重新提交 → 第二次成功归档
    const rUrl = `https://example.com/v/${UNIQ}-retry`
    const t5 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: rUrl } },
      cookie,
    })
    const t5fail = t5.status === 201 ? await waitTask(t5.json.data.id, cookie) : null
    const retry = t5fail?.status === 'failed'
      ? await req('PATCH', `/api/tasks/${t5fail.id}`, { body: { status: 'todo' }, cookie })
      : null
    const t5done = retry?.status === 200 ? await waitTask(t5fail.id, cookie) : null
    check(
      '转⑧ failed→todo 重试 → 重新提交并归档',
      t5.status === 201 && t5fail?.status === 'failed' && retry?.status === 200 &&
        t5done?.status === 'done' && /已归档/.test(t5done?.result ?? ''),
      `first=${t5fail?.status} retried=${retry?.status} final=${t5done?.status} ${t5done?.result ?? ''}`,
    )

    // 转⑨ 非法 payload → 400（不落任务）
    const bad = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: 'ftp://x' } },
      cookie,
    })
    check(
      '转⑨ 非 http(s) url → 400 VALIDATION_FAILED',
      bad.status === 400 && bad.json?.error?.code === 'VALIDATION_FAILED',
      bad.json?.error?.message,
    )

    // 转⑩ 先字幕：prefer_subtitles 命中字幕 → 同步归档（字幕）+ 正文含 srt 代码块
    const subUrl = `https://example.com/v/${UNIQ}-subok`
    const t6 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: subUrl, category: 'learning', prefer_subtitles: true, formats: ['text', 'segments', 'srt'] } },
      cookie,
    })
    const t6done = t6.status === 201 ? await waitTask(t6.json.data.id, cookie) : null
    const sPath = /已归档到 (\S+\.md)/.exec(t6done?.result ?? '')
    const sNoteId = sPath ? sPath[1].split('/').pop().replace(/\.md$/, '') : ''
    const sNote = sNoteId ? await req('GET', `/api/notes/${encodeURIComponent(sNoteId)}`, { cookie }) : null
    check(
      '转⑩ prefer_subtitles 命中字幕 → done（字幕）+ 正文含 srt 代码块',
      t6.status === 201 && t6done?.status === 'done' && /（字幕）/.test(t6done?.result ?? '') &&
        /## 字幕（srt）/.test(sNote?.json?.data?.content ?? '') && /```srt/.test(sNote?.json?.data?.content ?? ''),
      t6done?.result,
    )

    // 转⑪ 先字幕但无字幕 → 回落转写并归档（结果不含「字幕」字样）
    const subMissUrl = `https://example.com/v/${UNIQ}-nosub`
    const t7 = await req('POST', '/api/tasks', {
      body: { type: 'transcribe_url', payload: { url: subMissUrl, category: 'learning', prefer_subtitles: true } },
      cookie,
    })
    const t7done = t7.status === 201 ? await waitTask(t7.json.data.id, cookie) : null
    check(
      '转⑪ prefer_subtitles 无字幕 → 回落转写并归档',
      t7.status === 201 && t7done?.status === 'done' && /已归档到/.test(t7done?.result ?? '') && !/（字幕）/.test(t7done?.result ?? ''),
      t7done?.result,
    )
  }
}

// ===== 链接收敛链路（F14）：SSRF 闸门 + 本地 fake-org 抓取 → 归档 =====
// 收① 确定性断言：指向云元数据私网地址 → 任务 failed（不依赖任何环境变量）
{
  const metaUrl = 'http://169.254.169.254/latest/meta-data'
  const t8 = await req('POST', '/api/tasks', {
    body: { type: 'organize', payload: { url: metaUrl } },
    cookie,
  })
  const t8done = t8.status === 201 ? await waitTask(t8.json.data.id, cookie) : null
  check(
    '收① 内网/元数据地址 → failed + SSRF 拦截原因（逃生门只放回环，此处恒拦）',
    t8.status === 201 && t8done?.status === 'failed' && /内网|保留|阻止/.test(t8done?.result ?? ''),
    t8done?.result,
  )

  // 收② 起本地 fake-org（含正文 + 站点名）→ 走完整 抓取→整理→归档
  const orgServer = http.createServer((req2, res2) => {
    res2.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res2.end(
      '<!doctype html><html><head><title>冒烟-收敛-' + UNIQ + '</title>' +
        '<meta property="og:site_name" content="冒烟站"></head><body><article>' +
        `<p>${'这是供收敛链路抓取的文章正文，围绕一个主题说明来龙去脉。'.repeat(10)}</p>` +
        '</article></body></html>',
    )
  })
  await new Promise((r) => orgServer.listen(0, '127.0.0.1', r))
  const orgUrl = `http://127.0.0.1:${orgServer.address().port}/article-${UNIQ}`

  const t9 = await req('POST', '/api/tasks', {
    body: { type: 'organize', payload: { url: orgUrl, category: 'work', tags: ['收敛'] } },
    cookie,
  })
  const t9done = t9.status === 201 ? await waitTask(t9.json.data.id, cookie, 30000) : null

  if (t9done?.status === 'failed' && /内网|保留|阻止/.test(t9done?.result ?? '')) {
    console.log('  ⏭️  后端未开 ORGANIZE_ALLOW_LOOPBACK，跳过「收②/收③」的本地抓取断言（SSRF 按设计生效）')
  } else {
    const oPath = /已归档到 (\S+\.md)/.exec(t9done?.result ?? '')?.[1]
    const oNoteId = oPath ? oPath.split('/').pop().replace(/\.md$/, '') : ''
    const oNote = oNoteId ? await req('GET', `/api/notes/${encodeURIComponent(oNoteId)}`, { cookie }) : null
    check(
      '收② 本地页面 → done 且归档出带 source_url 的资料',
      t9.status === 201 && t9done?.status === 'done' && !!oPath &&
        oNote?.json?.data?.meta?.source_url === orgUrl &&
        /原文节选/.test(oNote?.json?.data?.content ?? ''),
      `${t9done?.status} ${t9done?.result ?? ''}`,
    )

    const t9b = await req('POST', '/api/tasks', {
      body: { type: 'organize', payload: { url: orgUrl } },
      cookie,
    })
    const t9bdone = t9b.status === 201 ? await waitTask(t9b.json.data.id, cookie, 30000) : null
    check(
      '收③ 同一 URL 二次收敛 → done 且提示已归档过（不写第二份）',
      t9b.status === 201 && t9bdone?.status === 'done' && /已归档过/.test(t9bdone?.result ?? ''),
      t9bdone?.result,
    )
  }
  orgServer.close()
}


// ===== ima 云端知识库只读代理（F15，可选）=====
// 分支逻辑：后端未配凭据 → 只验 503 IMA_NOT_CONFIGURED；设了 SMOKE_FAKE_IMA_PORT → 起桩跑全套；
// 后端配了真实凭据但没设桩端口 → 发一发 /kbs 看 200 就跳（不拿真实服务当断言对象）。
{
  const probe = await req('GET', '/api/ima/kbs', { cookie })
  if (probe.status === 503 && probe.json?.error?.code === 'IMA_NOT_CONFIGURED') {
    check('im⓪ 未配 Key → 503 IMA_NOT_CONFIGURED', true)
  } else if (!FAKE_IMA_PORT) {
    console.log(`  ⏭️  后端已配 ima（probe=${probe.status}）但未设 SMOKE_FAKE_IMA_PORT，跳过桩断言`)
  } else if (await startFakeIma()) {
    // 桩已起；用带 query 的 /kbs 验证真字段映射（kb_id/kb_name → id/name）
    const kbs = await req('GET', '/api/ima/kbs', { cookie })
    check(
      'im① GET /api/ima/kbs → 200 且字段映射正确',
      kbs.status === 200 && kbs.json?.data?.items?.some((i) => i.id === 'kb-a' && i.name === '课程笔记'),
      `items=${kbs.json?.data?.items?.length}`,
    )

    // 浏览：文件与文件夹混排，文件夹带 kind=folder
    const items = await req('GET', '/api/ima/items?kb_id=kb-a', { cookie })
    check(
      'im② GET /api/ima/items → 混排且 kind 正确',
      items.status === 200 &&
        items.json?.data?.items?.[0]?.kind === 'folder' &&
        items.json?.data?.items?.[1]?.kind === 'entry' &&
        Array.isArray(items.json?.data?.current_path),
      `items=${items.json?.data?.items?.length}`,
    )

    // 校验：缺 kb_id / 缺 q → 400
    const noKb = await req('GET', '/api/ima/items', { cookie })
    const noQ = await req('GET', '/api/ima/search?kb_id=kb-a', { cookie })
    check(
      'im③ 缺参数 → 400 VALIDATION_FAILED',
      noKb.status === 400 && noKb.json?.error?.code === 'VALIDATION_FAILED' &&
        noQ.status === 400 && noQ.json?.error?.code === 'VALIDATION_FAILED',
      '',
    )

    // 上游非 0 code → 503 IMA_UPSTREAM_FAILED（桩 kb-err 分支）
    const upstreamErr = await req('GET', '/api/ima/items?kb_id=kb-err', { cookie })
    check(
      'im④ 上游业务错误 → 503 IMA_UPSTREAM_FAILED 且透传 errmsg',
      upstreamErr.status === 503 && upstreamErr.json?.error?.code === 'IMA_UPSTREAM_FAILED' && /接口无效/.test(upstreamErr.json?.error?.message ?? ''),
      upstreamErr.json?.error?.message,
    )

    // 搜索：高亮剥标签；q=截断 桩返 100 条 → truncated=true
    const hit = await req('GET', `/api/ima/search?kb_id=kb-a&q=${encodeURIComponent('微积分')}`, { cookie })
    const trunc = await req('GET', `/api/ima/search?kb_id=kb-a&q=${encodeURIComponent('截断')}`, { cookie })
    check(
      'im⑤ 搜索命中 → highlight 剥标签；100 条 → truncated',
      hit.status === 200 && hit.json?.data?.items?.every((i) => !/</.test(i.highlight ?? '')) &&
        trunc.status === 200 && trunc.json?.data?.truncated === true && trunc.json?.data?.items?.length === 100,
      `hit=${hit.json?.data?.items?.length} trunc=${trunc.json?.data?.items?.length}`,
    )

    // 缓存：同参第二次调用，桩侧计数不增加（TTL 60s 内）
    const uniq = `cache-${UNIQ}`
    const c1 = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`).then((r) => r.json()).then((d) => d.counts?.['/openapi/wiki/v1/search_knowledge_base'] ?? 0)
    await req('GET', `/api/ima/kbs?q=${encodeURIComponent(uniq)}`, { cookie })
    await req('GET', `/api/ima/kbs?q=${encodeURIComponent(uniq)}`, { cookie })
    const c2 = await fetch(`http://127.0.0.1:${FAKE_IMA_PORT}/counts`).then((r) => r.json()).then((d) => d.counts?.['/openapi/wiki/v1/search_knowledge_base'] ?? 0)
    check('im⑥ 同参 60s 内第二次 → 命中缓存不再打上游', c2 - c1 === 1, `上游计数 ${c1}→${c2}`)

    // 隐私模式下未带 cookie 应 401（公开模式下这发是 200，不做断言）
    if (authEnabled) {
      const noAuth = await req('GET', '/api/ima/kbs')
      check('im⑦ 未登录访问 → 401 AUTH_REQUIRED', noAuth.status === 401 && noAuth.json?.error?.code === 'AUTH_REQUIRED', '')
    }

    // ===== ima 笔记只读（F15b）=====
    // 列表：平铺字段映射（note_id → id）
    const notes = await req('GET', '/api/ima/notes', { cookie })
    check(
      'im⑧ GET /api/ima/notes → 200 且字段映射正确',
      notes.status === 200 &&
        notes.json?.data?.items?.some((i) => i.id === 'note-1' && i.title === '测试笔记' && !/</.test(i.summary ?? '')),
      `items=${notes.json?.data?.items?.length}`,
    )

    // 详情：meta + Markdown 正文，正文里的 <mark> 由服务端剥掉
    const note = await req('GET', '/api/ima/notes/note-1', { cookie })
    check(
      'im⑨ GET /api/ima/notes/:id → meta + Markdown 且 <mark> 已剥',
      note.status === 200 &&
        note.json?.data?.meta?.id === 'note-1' &&
        note.json?.data?.meta?.title === '测试笔记' &&
        String(note.json?.data?.content ?? '').startsWith('# 测试笔记') &&
        !/<mark/.test(note.json?.data?.content ?? '') &&
        /这是一个测试文档/.test(note.json?.data?.content ?? ''),
      `content=${String(note.json?.data?.content ?? '').length} 字节`,
    )

    // 不存在的笔记 → 404 IMA_NOTE_NOT_FOUND（meta 在列表里扫不到）
    const missing = await req('GET', '/api/ima/notes/note-missing', { cookie })
    check(
      'im⑩ 不存在的笔记 → 404 IMA_NOTE_NOT_FOUND',
      missing.status === 404 && missing.json?.error?.code === 'IMA_NOTE_NOT_FOUND',
      missing.json?.error?.message,
    )

    // 隐私模式未带 cookie → 401
    if (authEnabled) {
      const noAuthNotes = await req('GET', '/api/ima/notes')
      check('im⑪ 未登录访问笔记 → 401 AUTH_REQUIRED', noAuthNotes.status === 401 && noAuthNotes.json?.error?.code === 'AUTH_REQUIRED', '')
    }
  }
}

// ===== agent 接口（F12）=====
// 断言不依赖真实 LLM：只验证路由形状、鉴权、SSE 骨架与审计落盘；
// 有 OPENAI_API_KEY + 可达端点时可另跑真实对话链路（见 RUN.md）。
{
  // ag① 工具清单：六个条目齐全、规划写工具与 archive_note 均为 needs-confirm
  const tools = await req('GET', '/api/agent/tools', { cookie })
  const list = tools.json?.data?.tools ?? []
  const byName = Object.fromEntries(list.map((t) => [t.name, t]))
  check(
    'ag① GET /api/agent/tools → 6 个工具且规划/归档写工具为 needs-confirm',
    tools.status === 200 &&
      ['get_planning', 'propose_planning', 'search_notes', 'get_note', 'ask_kb', 'archive_note'].every((n) => byName[n]) &&
      tools.json?.data?.tools?.length === 6 &&
      byName.propose_planning?.risk === 'needs-confirm' &&
      byName.archive_note?.risk === 'needs-confirm' &&
      byName.search_notes?.risk === 'readonly',
    `tools=${list.map((t) => `${t.name}:${t.enabled ? 'on' : 'off'}`).join(',')}`,
  )

  // ag② chat 空消息 → SSE 里 error VALIDATION_FAILED（不是 4xx：SSE 通道内错误走 event）
  const badChat = await fetch(`${BASE}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ message: '   ' }),
  })
  const badText = await badChat.text()
  check(
    'ag② POST /api/agent/chat 空消息 → SSE error VALIDATION_FAILED',
    badChat.status === 200 && /event: error/.test(badText) && /VALIDATION_FAILED/.test(badText),
    badText.slice(0, 80).replace(/\n/g, ' '),
  )

  // ag③ chat 不存在的 session → SSE error NOT_FOUND
  const noSess = await fetch(`${BASE}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ message: 'hi', session_id: 'sess-not-exist' }),
  })
  const noSessText = await noSess.text()
  check(
    'ag③ 不存在的 session_id → SSE error NOT_FOUND',
    /NOT_FOUND/.test(noSessText),
    noSessText.slice(0, 80).replace(/\n/g, ' '),
  )


  // ag⑥ 会话读回：先发一条消息让会话落盘（LLM 失败也会 saveSession），
  // 再 GET /api/agent/sessions/:id → 200 + rows 数组且首行是 human→user
  const seed = await fetch(`${BASE}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ message: 'smoke-恢复测试' }),
  })
  const seedText = await seed.text()
  const sid = /"session_id":"([a-f0-9-]+)"/.exec(seedText)?.[1]
  if (!sid) {
    check('ag⑥ POST /api/agent/chat → SSE done 含 session_id', false, seedText.slice(0, 100).replace(/\n/g, ' '))
  } else {
    const view = await req('GET', `/api/agent/sessions/${sid}`, { cookie })
    const rows = view.json?.data?.rows
    check(
      'ag⑥ GET /api/agent/sessions/:id → 200 且 rows 含 user 消息',
      view.status === 200 && Array.isArray(rows) && rows.some((r) => r.role === 'user' && r.text === 'smoke-恢复测试'),
      `rows=${rows?.length}`,
    )
  }

  // ag⑦ 读不存在的会话 → 404 NOT_FOUND
  const noView = await req('GET', '/api/agent/sessions/sess-not-exist', { cookie })
  check(
    'ag⑦ 不存在会话 → 404 NOT_FOUND',
    noView.status === 404 && noView.json?.error?.code === 'NOT_FOUND',
    `status=${noView.status}`,
  )

  // ag④ GET /api/agent/runs → 200 + items 数组（有 audit 记录或空均可）
  const runs = await req('GET', '/api/agent/runs?limit=5', { cookie })
  check(
    'ag④ GET /api/agent/runs → 200 且 items 为数组',
    runs.status === 200 && Array.isArray(runs.json?.data?.items),
    `items=${runs.json?.data?.items?.length}`,
  )

  // ag⑤ 隐私模式下未带 cookie → 401
  if (authEnabled) {
    const noAuth = await fetch(`${BASE}/api/agent/tools`)
    check('ag⑤ 隐私模式未登录 /api/agent/tools → 401', noAuth.status === 401, `status=${noAuth.status}`)
  }
}

// ===== GitHub 聚合（F16）=====
await startFakeGh()
const ghRes = await req('GET', '/api/github/activity', { cookie })
if (FAKE_GH_PORT) {
  check(
    'gh① GET /api/github/activity → configured + profile/calendar/events 齐',
    ghRes.status === 200 && ghRes.json?.data?.configured === true
      && ghRes.json?.data?.profile?.login === 'fake-user'
      && Array.isArray(ghRes.json?.data?.calendar?.weeks) && ghRes.json?.data?.calendar?.weeks.length === 53
      && Array.isArray(ghRes.json?.data?.events),
    `total=${ghRes.json?.data?.calendar?.totalContributions} events=${ghRes.json?.data?.events?.length}`,
  )
  check(
    'gh② events 过滤白名单外类型（WatchEvent 被丢）',
    ghRes.json?.data?.events?.every((e) => e.type !== 'WatchEvent') && ghRes.json?.data?.events?.length === 2,
    JSON.stringify(ghRes.json?.data?.events?.map((e) => e.type)),
  )
  const ghAgain = await req('GET', '/api/github/activity', { cookie })
  const counts = await fetch(`http://127.0.0.1:${FAKE_GH_PORT}/counts`).then((r) => r.json())
  check(
    'gh③ TTL 内第二次请求命中缓存（上游计数不再涨）',
    ghAgain.status === 200 && counts.profile === 1 && counts.graphql === 1 && counts.events === 1,
    JSON.stringify(counts),
  )
} else {
  check(
    'gh① 未配 GITHUB_USERNAME → configured:false 降级（不报错）',
    ghRes.status === 200 && ghRes.json?.data?.configured === false,
    `status=${ghRes.status} data=${JSON.stringify(ghRes.json?.data)}`,
  )
}

// ===== 首页聚合与 GitHub 项目（不为展示补造业务记录） =====
const projectsRes = await req('GET', '/api/github/projects', { cookie })
if (FAKE_GH_PORT) {
  const projects = projectsRes.json?.data?.items || []
  check('gh④ 项目分页、排除 Fork/私有、保留归档仓库', projectsRes.status === 200 && projects.length === 99 && !projects.some(repo => ['1', '2'].includes(repo.id)) && projects.some(repo => repo.id === '101' && repo.archived), `projects=${projects.length}`)
} else {
  check('gh④ 项目未配置态明确返回', projectsRes.status === 200 && projectsRes.json?.data?.state === 'unconfigured', '')
}
const homeRes = await req('GET', '/api/home?date=2026-10-13', { cookie })
const homeData = homeRes.json?.data
check('h① 首页时间、来源和独立计划接口', homeRes.status === 200 && homeData?.timezone === 'Asia/Shanghai' && homeData?.today?.date === '2026-10-13' && homeData?.sources?.notes && homeData?.sources?.planning && homeData?.sources?.github, '')
check('h② 首页不透传旧热点/项目/手填统计', homeData?.site?.hotspots === undefined && homeData?.site?.projects === undefined && homeData?.site?.stats === undefined, '')
if (FAKE_GH_PORT) {
  check('h③ 首页只收带 focus 的 GitHub 项目', homeData?.focus?.items?.some(item => item.key === 'github:101') && !homeData?.focus?.items?.some(item => item.key === 'github:1'), '')
}
const invalidDate = await req('GET', '/api/home?date=2026-02-30', { cookie })
check('h④ 非法日期 → 400 VALIDATION_FAILED', invalidDate.status === 400 && invalidDate.json?.error?.code === 'VALIDATION_FAILED', '')

if (authEnabled) {
  const noAuthHome = await req('GET', '/api/home')
  check('h⑤ 沿用现有隐私模块：首页未登录 401', noAuthHome.status === 401 && noAuthHome.json?.error?.code === 'AUTH_REQUIRED', '')
  // ㉒ 登出 → 204
  const logout = await req('POST', '/api/logout', { cookie })
  check('㉒ 登出 → 204', logout.status === 204, `status=${logout.status}`)

  // ㉓ 登出后旧会话失效 → 401
  const afterLogout = await req('GET', '/api/notes', { cookie })
  check('㉓ 登出后旧会话 → 401', afterLogout.status === 401, afterLogout.json?.error?.code)
}

console.log(`\n结果：✅ ${passed} 通过 ｜ ❌ ${failed} 失败`)
process.exit(failed ? 1 : 0)
