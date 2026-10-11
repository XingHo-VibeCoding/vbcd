// 站点业务配置（PLAN-admin §3 D10 配置分层）
//
// 存放：data/site.json —— 绑定挂载进容器，server 进程可读写真本；
// Obsidian 远程连 data/ 也能看到（配置即数据）。
// 定位：跑 "网页可改、热生效" 的业务配置；密钥与基础设施仍走 .env（本服务不碰）。
// 读取优先级（调用方负责）：site.json 值 > process.env > 默认值。
// 热生效：进程内缓存 + 每次读前按 mtime 失效——改了文件下次读即新值，无需重启。

import { readFile, writeFile, rename, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { DATA_DIR } from '../storage/files.js'
import { fail } from './errors.js'

const SITE_FILE = path.join(DATA_DIR, 'site.json')

// 允许通过网页管理的业务配置白名单——不在列的字段 PATCH 拒绝，
// 防止后台变成任意 JSON 写入口（最小攻击面）。
const SCHEMA = {
  llm: {
    model: 'string',       // 覆盖 process.env.LLM_MODEL
    base_url: 'string',    // 覆盖 process.env.OPENAI_BASE_URL（非密钥，URL 可网页改）
  },
  site: {
    avatar: 'string',      // 头像图片（data/images/ 内相对路径或 URL）
    background: 'string',  // 主站背景
    title: 'string',       // 站点标题
    subtitle: 'string',    // 副标题
  },
  limits: {
    kb_top_k: 'number',    // 知识库召回条数
    task_page_size: 'number',
  },
}

let cache = null
let cacheMtime = 0

// 读 site.json；mtime 变了才重新解析（别的写者改了也能读到新值）
async function readConfig() {
  let st
  try {
    st = await stat(SITE_FILE)
  } catch (err) {
    if (err.code === 'ENOENT') { cache = {}; cacheMtime = 0; return cache }
    throw fail('SETTINGS_READ_FAILED', `读取站点配置失败：${err.message}`, 503)
  }
  if (cache && st.mtimeMs === cacheMtime) return cache
  let parsed
  try {
    parsed = JSON.parse(await readFile(SITE_FILE, 'utf8') || '{}')
  } catch (err) {
    if (err instanceof SyntaxError) throw fail('SETTINGS_CORRUPT', 'data/site.json 不是合法 JSON', 500)
    throw fail('SETTINGS_READ_FAILED', `读取站点配置失败：${err.message}`, 503)
  }
  cache = parsed
  cacheMtime = st.mtimeMs
  return cache
}

/** GET /api/admin/settings：当前业务配置 + schema（供表单回填/校验） */
export async function getSettings() {
  const settings = await readConfig()
  return { settings, schema: SCHEMA, file: 'data/site.json' }
}

/** PATCH /api/admin/settings：白名单字段写回，原子写 + 热生效。 */
export async function patchSettings(input) {
  const conf = await readConfig()
  const patch = input?.settings ?? input ?? {}

  for (const [section, fields] of Object.entries(patch)) {
    if (!SCHEMA[section]) {
      throw fail('VALIDATION_FAILED', `不认识的配置段「${section}」（允许：${Object.keys(SCHEMA).join(' / ')}）`)
    }
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (!(k in SCHEMA[section])) {
        throw fail('VALIDATION_FAILED', `不认识的配置项「${section}.${k}」`)
      }
      const want = SCHEMA[section][k]
      const ok = want === 'number' ? typeof v === 'number' : typeof v === 'string'
      if (!ok) throw fail('VALIDATION_FAILED', `${section}.${k} 类型应为 ${want}`)
    }
  }

  const next = { ...conf }
  for (const [section, fields] of Object.entries(patch)) {
    next[section] = { ...(next[section] || {}), ...(fields || {}) }
  }

  const tmp = `${SITE_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
    await rename(tmp, SITE_FILE)
  } catch (err) {
    throw fail('SETTINGS_WRITE_FAILED', `写入站点配置失败：${err.message}`, 503)
  }
  cache = next
  cacheMtime = Date.now()
  console.log('[settings] site.json 已更新（热生效）')
  return { settings: next, appliedAt: new Date().toISOString() }
}
