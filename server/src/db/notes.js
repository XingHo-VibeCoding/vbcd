// notes 表的只读查询（Day 17）
// 只实现读，不写：写入走 SPEC §7.3 的双写阶段，不在本文件。
// 响应字段与文件版 GET /api/notes 对齐（id/title/category/date/tags/hash），
// 方便前端零改动切换数据源，也方便两边接口对照。
import { query } from './pool.js'
import { fail } from '../services/errors.js'

const MAX_LIMIT = 500 // 与 index-store.js 的 limit 上限一致
// 不传 limit 时给 MAX_LIMIT（而非更小值）：与文件版「默认返回全部」语义一致，
// 本期数据量 ≤500，等价于不限；真要分页时调用方显式传小 limit
const DEFAULT_LIMIT = MAX_LIMIT

// 摘要截取口径与 storage/files.js 的 excerptOf 一致：空白压缩、120 字截断、超限加省略号
const EXCERPT_LEN = 120

/**
 * GET /api/db/notes 的查询：按 date 倒序、id 兜底排序；
 * 支持 q（标题+正文+标签 模糊）、category（精确）、limit、offset，全部参数化防注入。
 * 过滤口径向文件版 queryEntries 看齐（索引层在内存里 includes，这里用 ILIKE 等价物）。
 */
export async function listDbNotes(params = {}) {
  const limit = params.limit === undefined || params.limit === '' ? DEFAULT_LIMIT : Number(params.limit)
  const offset = params.offset === undefined || params.offset === '' ? 0 : Number(params.offset)
  const q = String(params.q ?? '').trim()
  const category = String(params.category ?? '').trim()

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw fail('VALIDATION_FAILED', `limit 必须是 1 到 ${MAX_LIMIT} 之间的整数`)
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw fail('VALIDATION_FAILED', 'offset 必须是不小于 0 的整数')
  }

  // WHERE 条件按传入参数拼装：值全部走 $N 占位，不存在字符串拼接注入
  const where = []
  const values = []
  if (q) {
    values.push(`%${q}%`)
    // 标题+正文+标签拼一行查——ILIKE 大小写不敏感，中文标签/正文同样生效
    where.push(`(title || ' ' || body || ' ' || array_to_string(tags, ' ')) ILIKE $${values.length}`)
  }
  if (category) {
    values.push(category)
    where.push(`category = $${values.length}`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // 总条数与当前页分开两条 SQL：数据量小（本期 ≤1000），可读性优先
  const [{ count }] = await query(`SELECT count(*)::int AS count FROM notes ${whereSql}`, values)
  const rows = await query(
    `SELECT id, title, category, to_char(date, 'YYYY-MM-DD') AS date,
            tags, source_url, hash, created_at, updated_at,
            -- 与文件版同口径：正文空白压缩后截 ${EXCERPT_LEN} 字，超限补省略号
            CASE WHEN length(regexp_replace(body, '\\s+', ' ', 'g')) > ${EXCERPT_LEN}
                 THEN left(regexp_replace(body, '\\s+', ' ', 'g'), ${EXCERPT_LEN}) || '…'
                 ELSE regexp_replace(body, '\\s+', ' ', 'g')
            END AS excerpt,
            -- path 从 category/id 派生，与文件版 files.js 的 <dir>/<id>.md 一致
            category || '/' || id || '.md' AS path
       FROM notes
      ${whereSql}
      ORDER BY date DESC, id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  )
  return { total: count, items: rows }
}

/**
 * GET /api/db/notes/:id：查不到返回 null，由路由层统一 404。
 * 响应结构与文件版完全同构 { meta: {...}, content } —— 详情页消费 meta.xxx 与 content，
 * 两版契约对齐前端才能一行不改直接换数据源。
 */
export async function getDbNote(id) {
  const rows = await query(
    `SELECT id, title, category, to_char(date, 'YYYY-MM-DD') AS date,
            tags, source_url, hash, body, created_at, updated_at,
            category || '/' || id || '.md' AS path
       FROM notes
      WHERE id = $1`,
    [id],
  )
  const r = rows[0]
  if (!r) return null
  const { body, ...meta } = r
  return { meta, content: body }
}
