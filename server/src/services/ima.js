// ima 云端知识库只读代理（F15 / SPEC 3.6）
// 只读调用腾讯 ima OpenAPI：列知识库 / 浏览条目 / 库内搜索；不做任何写入类接口。
// 内容零落盘：不写 data/、不进向量库；仅允许进程内 TTL 缓存（IMA_CACHE_TTL_MS，默认 60s，0=关闭）。
// 凭据：IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY（server/.env，不入库）。
// 上游契约（官方 skill 文档 + 2026-10-05 真实链路实调）：
//   - 全部 POST {IMA_BASE_URL}/openapi/wiki/v1/*，JSON body；
//   - 统一响应壳 {code, msg, data}（文档曾写 retcode/errmsg，实测线上已统一为 code/msg，双壳都认）；
//   - 分页游标：cursor 首次传 ""，用返回的 next_cursor 续页，is_end=true 到头；
//   - search_knowledge 单库最多返回约 100 条（静默截断）→ 命中数 >=100 时标记 truncated；
//   - 实测字段名：库列表用 kb_id/kb_name（文档写的是 id/name，对不上，以实调为准）。
// 2026-10-05 实测：search_knowledge_base 一次就带回 description/member_count/content_count，
//   无需再调 get_knowledge_base 补全（计划里原定的第二跳已取消）。
import { fail } from './errors.js'

const CACHE_MAX = 200 // 缓存条数上限（FIFO 驱逐）
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_TTL_MS = 60_000
const LIMIT_MAX = 50 // ima limit 参数上限（上游文档：1-50；探针实测 search_knowledge_base 实际接受上限是 20）
// 上游部分端点（实测 search_knowledge_base；get_knowledge_list 文档写 50 但未验证）真实上限是 20。
// 我方的对外口径不变（1-50），内部在发出上游请求时夹紧到上游真上限，分页交给 next_cursor。
const LIMIT_UPSTREAM_CAP = 20
const Q_MAX = 200 // buddy 侧对搜索词的本地限制
const KB_ID_MAX = 128
const TRUNCATED_AT = 100 // 单库搜索返回条数达到此值视为可能被截断

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

export function imaConfigured() {
  return Boolean(env('IMA_OPENAPI_CLIENTID') && env('IMA_OPENAPI_APIKEY'))
}

function baseUrl() {
  return env('IMA_BASE_URL', 'https://ima.qq.com').replace(/\/+$/, '')
}

function timeoutMs() {
  return Number(env('IMA_HTTP_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS))) || DEFAULT_TIMEOUT_MS
}

function ttlMs() {
  // Number('bogus')=NaN 会落回缺省；显式 0 = 关闭缓存
  const n = Number(env('IMA_CACHE_TTL_MS', String(DEFAULT_TTL_MS)))
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

// ---------- 进程内 TTL 缓存（只进不出，不落盘；重启即失）----------
const cache = new Map() // key → { value, expiresAt }

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key, value) {
  if (ttlMs() <= 0) return
  if (cache.size >= CACHE_MAX) {
    // Map 保持插入序：最旧的先删
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs() })
}

/** 统一上游调用：超时中止 + 双壳信封解析 → 中文错误 */
async function call(path, body) {
  if (!imaConfigured()) {
    throw fail('IMA_NOT_CONFIGURED', 'ima 未配置（缺少 IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY）', 503)
  }
  let res
  try {
    res = await fetch(`${baseUrl()}/${path}`, {
      method: 'POST',
      headers: {
        'ima-openapi-clientid': env('IMA_OPENAPI_CLIENTID'),
        'ima-openapi-apikey': env('IMA_OPENAPI_APIKEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? '请求超时' : '服务不可达'
    throw fail('IMA_UPSTREAM_FAILED', `ima ${reason}（${baseUrl()}）`, 503)
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok) {
    const upstreamMsg = json?.errmsg || json?.msg || ''
    throw fail('IMA_UPSTREAM_FAILED', `ima 返回 HTTP ${res.status}${upstreamMsg ? `：${upstreamMsg}` : ''}`, 503)
  }

  // 双壳兼容：业务层 {retcode, errmsg} / 网关层 {code, msg}；实测线上业务层也统一为 code/msg
  const retcode = json?.retcode ?? json?.code
  if (retcode !== 0) {
    const upstreamMsg = json?.errmsg || json?.msg || `retcode=${retcode}`
    throw fail('IMA_UPSTREAM_FAILED', `ima 返回错误：${upstreamMsg}`, 503)
  }
  return json.data ?? {}
}

/** 只读调用入口：成功响应进 TTL 缓存 */
async function callCached(path, body) {
  const key = `${path}|${JSON.stringify(body)}`
  const hit = cacheGet(key)
  if (hit !== undefined) return hit
  const data = await call(path, body)
  cacheSet(key, data)
  return data
}

// ---------- 参数校验 ----------

function limitParam(raw, fallback = 20, cap = LIMIT_MAX) {
  if (raw === undefined || raw === '') return Math.min(fallback, cap)
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) {
    throw fail('VALIDATION_FAILED', `limit 需为 1–${LIMIT_MAX} 的整数`, 400)
  }
  // 超上游上限就夹紧（文档写 1-50 不实，但上游接口对部分端点拒收 >20）
  return Math.min(n, cap)
}

function required(value, label, max = Q_MAX) {
  const s = String(value ?? '').trim()
  if (!s) throw fail('VALIDATION_FAILED', `${label} 不能为空`, 400)
  if (s.length > max) throw fail('VALIDATION_FAILED', `${label} 过长（超过 ${max} 字）`, 400)
  return s
}

// ---------- 字段规整 ----------

// highlight_content 可能带 HTML 标记：默认剥离成纯文本（永不注入前端 DOM）。
// TODO(板块1实调定案)：若确认上游只用 <em>/<mark>，可改为白名单高亮，并同步 SPEC。
function stripTags(html) {
  return String(html).replace(/<[^>]+>/g, '').trim()
}

// knowledge_list 混两类条目：文件（media_id/title）与文件夹（folder_id/name），统一成 {kind, id, name, ...}
function normalizeEntry(raw) {
  if (raw && typeof raw === 'object' && raw.media_id === undefined && raw.folder_id !== undefined) {
    return {
      kind: 'folder',
      id: String(raw.folder_id ?? ''),
      name: String(raw.name ?? ''),
      parent_folder_id: String(raw.parent_folder_id ?? ''),
      file_number: Number(raw.file_number ?? 0),
      folder_number: Number(raw.folder_number ?? 0),
    }
  }
  return {
    kind: 'entry',
    id: String(raw?.media_id ?? ''),
    name: String(raw?.title ?? raw?.name ?? ''),
    parent_folder_id: String(raw?.parent_folder_id ?? ''),
    media_type: raw?.media_type === undefined ? null : Number(raw.media_type),
  }
}

function normalizeSearchItem(raw) {
  if (raw && typeof raw === 'object' && raw.media_id === undefined && raw.folder_id !== undefined) {
    return {
      kind: 'folder',
      id: String(raw.folder_id ?? ''),
      name: String(raw.name ?? ''),
      parent_folder_id: String(raw.parent_folder_id ?? ''),
      highlight: '',
    }
  }
  return {
    kind: 'entry',
    id: String(raw?.media_id ?? ''),
    name: String(raw?.title ?? ''),
    parent_folder_id: String(raw?.parent_folder_id ?? ''),
    highlight: stripTags(raw?.highlight_content ?? ''),
  }
}

function ensureConfigured() {
  if (!imaConfigured()) {
    throw fail('IMA_NOT_CONFIGURED', 'ima 未配置（缺少 IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY）', 503)
  }
}

// ---------- 对外三个只读动作 ----------

/** 知识库列表：search_knowledge_base 一次返回 {kb_id,kb_name,cover_url,description,...}，无需再补 */
export async function listKbs({ q = '', cursor = '', limit } = {}) {
  ensureConfigured()
  const data = await callCached('openapi/wiki/v1/search_knowledge_base', {
    query: String(q ?? '').trim().slice(0, Q_MAX),
    cursor: String(cursor ?? ''),
    limit: limitParam(limit, 20, LIMIT_UPSTREAM_CAP),
  })
  const items = (data.info_list ?? []).map((raw) => ({
    id: String(raw?.kb_id ?? raw?.id ?? ''),
    name: String(raw?.kb_name ?? raw?.name ?? ''),
    cover_url: String(raw?.cover_url ?? ''),
    description: String(raw?.description ?? ''),
    recommended_questions: Array.isArray(raw?.recommended_questions) ? raw.recommended_questions.map(String) : [],
    member_count: raw?.member_count === undefined ? null : Number(raw.member_count),
    content_count: raw?.content_count === undefined ? null : Number(raw.content_count),
    role_type: String(raw?.role_type ?? ''),
    base_type: String(raw?.base_type ?? ''),
  }))
  return { items, next_cursor: String(data.next_cursor ?? ''), has_more: data.is_end === false }
}

/** 浏览知识库条目：文件与文件夹混排，附 current_path 面包屑 */
export async function listItems({ kb_id, folder_id = '', cursor = '', limit } = {}) {
  ensureConfigured()
  const kbId = required(kb_id, 'kb_id', KB_ID_MAX)
  const data = await callCached('openapi/wiki/v1/get_knowledge_list', {
    knowledge_base_id: kbId,
    cursor: String(cursor ?? ''),
    limit: limitParam(limit, 20, LIMIT_UPSTREAM_CAP),
    ...(folder_id ? { folder_id: String(folder_id) } : {}),
  })
  return {
    items: (data.knowledge_list ?? []).map(normalizeEntry),
    // current_path 里包含 file_number/folder_number，前端可在面包屑上显示条目数
    current_path: (data.current_path ?? []).map((f) => ({
      folder_id: String(f?.folder_id ?? ''),
      name: String(f?.name ?? ''),
      file_number: Number(f?.file_number ?? 0),
      folder_number: Number(f?.folder_number ?? 0),
    })),
    next_cursor: String(data.next_cursor ?? ''),
    has_more: data.is_end === false,
  }
}

/** 库内搜索：ima 静默截断在 ~100 条 → length>=100 置 truncated；命中片段剥离 HTML 标签 */
export async function searchItems({ kb_id, q, cursor = '' } = {}) {
  ensureConfigured()
  const kbId = required(kb_id, 'kb_id', KB_ID_MAX)
  const query = required(q, 'q')
  const data = await callCached('openapi/wiki/v1/search_knowledge', {
    knowledge_base_id: kbId,
    query,
    cursor: String(cursor ?? ''),
  })
  const list = data.info_list ?? []
  return {
    items: list.map(normalizeSearchItem),
    truncated: list.length >= TRUNCATED_AT,
    next_cursor: String(data.next_cursor ?? ''),
    has_more: data.is_end === false,
  }
}
