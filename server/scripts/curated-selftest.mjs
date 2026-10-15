// 使用临时目录和注入数据，不连接真实数据库、GitHub，也不修改站点资料。
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const dir = await mkdtemp(path.join(tmpdir(), 'buddy-curated-'))
process.env.DATA_DIR = dir
process.env.AUTH_ENABLED = '0'
const { validateCurated, resolveSelections } = await import('../src/services/curated.js')
const { buildHome } = await import('../src/services/home.js')
const { selectAboutProjects } = await import('../../web/src/lib/curated-projects.js')
const { createApp } = await import('../src/app.js')
const item = (source, id, extra = {}) => ({ source, id, image: '', visible: true, order: 1, ...extra })
const config = (hotspots = [], projects = [], enabled = true) => ({ hotspots: { enabled: enabled && hotspots.length > 0, items: hotspots }, projects: { enabled: enabled && projects.length > 0, items: projects } })
let count = 0
function check(label, run) { run(); count++; console.log(`PASS ${label}`) }
const notes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, title: `档案${i}`, excerpt: '当前摘要', category: 'work', tags: ['焦点'], created_at: '2026-10-14T00:00:00Z' }))
const repos = ['1', '2', '3'].map(id => ({ id, fullName: `owner/repo${id}`, description: '当前描述', htmlUrl: `https://github.com/owner/repo${id}`, topics: ['focus'] }))
const home = curated => buildHome({ me: { profile: {}, site: { site: { curated }, hotspots: [{ id: 'legacy', title: '旧卡片' }] } }, notes, planning: { plans: [], schedules: [] }, github: { state: 'fresh', items: repos }, date: '2026-10-14', now: new Date('2026-10-14T00:00:00Z'), sources: {} })
check('引用不存标题，顺序归一', () => {
  const result = validateCurated(config([item('note', 'n0', { order: 5 }), item('note', 'n1', { order: 2 })]))
  assert.deepEqual(result.hotspots.items.map(i => i.id), ['n1', 'n0'])
  assert.equal(result.hotspots.items[0].order, 1)
  assert.equal(result.hotspots.items[0].title, undefined)
})
for (const [label, value] of [
  ['同组重复', config([item('note', 'n0'), item('note', 'n0')])],
  ['跨区重复（含隐藏）', config([item('github', '1', { visible: false })], [item('github', '1')])],
  ['项目不接受档案', config([], [item('note', 'n0')])],
  ['热点超过4项', config(Array.from({ length: 5 }, (_, i) => item('note', `n${i}`)))],
  ['空列表不能启用', { ...config(), hotspots: { enabled: true, items: [] } }],
  ['禁止内容副本', config([{ ...item('note', 'n0'), title: '副本' }])],
  ['封面路径校验', config([item('note', 'n0', { image: 'javascript:alert(1)' })])],
]) check(label, () => assert.throws(() => validateCurated(value), e => e.code === 'VALIDATION_FAILED'))
check('项目超过50项不设硬上限', () => assert.equal(validateCurated(config([], Array.from({ length: 51 }, (_, i) => item('github', String(i + 1))))).projects.items.length, 51))
check('来源更新、失效、隐藏与封面', () => {
  const group = config([item('note', 'n0', { image: '/images/cover.png' }), item('note', 'missing'), item('github', '1', { visible: false })]).hotspots
  const rows = resolveSelections(group, [{ ...notes[0], title: '更新标题' }], repos)
  assert.equal(rows.length, 1); assert.equal(rows[0].title, '更新标题'); assert.equal(rows[0].image, '/images/cover.png')
})
check('旧模式回退和既有配额', () => { const result = home(undefined); assert.equal(result.focus.mode, 'automatic'); assert.equal(result.focus.items.length, 4) })
check('精选4条档案不受旧2条配额限制、不混入旧卡片', () => {
  const result = home(config(notes.map((n, order) => item('note', n.id, { order: order + 1 }))))
  assert.equal(result.focus.mode, 'curated'); assert.equal(result.focus.items.length, 4); assert.ok(result.focus.items.every(i => i.source_type === 'note'))
})
check('启用精选后来源失效不自动补位', () => assert.equal(home(config([item('note', 'missing')])).focus.items.length, 0))
check('项目精选排除自动热点（包括隐藏项目）', () => {
  const result = home(config([], [item('github', '1', { visible: false })]))
  assert.ok(!result.focus.items.some(i => i.key === 'github:1'))
})
check('关于页按精选顺序保留跨归档排序、封面、隐藏和失效规则', () => {
  const group = config([], [item('github', '2', { order: 1, image: '/images/cover.png' }), item('github', '1', { order: 2 }), item('github', '3', { visible: false }), item('github', '999')]).projects
  const result = selectAboutProjects(group, repos.map(repo => ({ ...repo, archived: repo.id === '2' })))
  assert.deepEqual(result.map(repo => repo.id), ['2', '1'])
  assert.equal(result[0].cover, '/images/cover.png')
  assert.equal(selectAboutProjects({ ...group, enabled: false }, repos), repos)
})
check('GitHub改名继续按稳定仓库ID解析', () => {
  const result = selectAboutProjects(config([], [item('github', '1')]).projects, [{ ...repos[0], fullName: 'owner/renamed' }])
  assert.equal(result[0].fullName, 'owner/renamed')
})
await mkdir(path.join(dir, 'images'))
await writeFile(path.join(dir, 'images', 'cover.png'), Buffer.from('fixture'))
const legacy = { site: { title: '原站点' }, hotspots: [{ id: 'old', title: '旧热点' }], projects: [{ id: 'old-project', name: '旧项目' }] }
await writeFile(path.join(dir, 'site.json'), JSON.stringify(legacy))
const server = createApp().listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
async function patch(body) { return fetch(`${base}/api/admin/site`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
try {
  let response = await patch({ site: { title: '新站点' } })
  assert.equal(response.status, 200)
  let stored = JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8'))
  check('普通设置不启用精选', () => assert.equal(stored.site.curated, undefined))
  response = await patch({ site: { curated: config([item('note', 'n0', { image: '/images/cover.png' })]) } })
  assert.equal(response.status, 200)
  const data = (await response.json()).data
  stored = JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8'))
  check('保存/读回契约及保留旧数据', () => { assert.equal(data.site.curated.hotspots.enabled, true); assert.deepEqual(stored.hotspots, legacy.hotspots); assert.deepEqual(stored.projects, legacy.projects) })
  response = await fetch(`${base}/api/admin/images`)
  const assets = (await response.json()).data
  check('精选封面真实引用可扫描', () => { assert.equal(assets.items[0].used, true); assert.ok(assets.items[0].references.some(ref => ref.path.includes('curated.hotspots'))) })
  response = await fetch(`${base}/api/admin/images/cover.png`, { method: 'DELETE' })
  check('精选封面删除保护', () => assert.equal(response.status, 409))
  response = await patch({ site: { curated: config([item('github', '1')], [item('github', '1')]) } })
  check('接口拒绝跨区重复且不改已有配置', () => assert.equal(response.status, 400))
  assert.equal(JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8')).site.curated.hotspots.items[0].id, 'n0')
  process.env.AUTH_ENABLED = '1'
  response = await patch({ site: { title: '无登录修改' } })
  check('沿用隐私模式登录保护', () => assert.equal(response.status, 401))
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
}
console.log(`精选自测 ${count}/${count} 通过`)
