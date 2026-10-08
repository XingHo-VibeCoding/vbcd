// notes 表的存取实现（Day 17 读 / Day 18 写 / Day 19 归位为纯数据访问层）
// 本文件只做「给条件就查、给对象就存」：参数校验与业务封装在 services/notes.js，
// 上层调用入口统一走 storage/note-store.js。
// 响应字段与文件版 GET /api/notes 对齐（id/title/category/date/tags/hash），
// 方便前端零改动切换数据源，也方便两边接口对照。
import { query, execute } from './pool.js'
import { fail } from '../services/errors.js'

// 摘要截取口径与 storage/files.js 的 excerptOf 一致：空白压缩、120 字截断、超限加省略号
const EXCERPT_LEN = 120

/**
 * /api/db/notes 的列表查询：按 date 倒序、id 兜底排序；
 * 支持 q（标题+正文+标签 模糊）、category（精确）、limit、offset，全部参数化防注入。
 * 过滤口径向文件版 queryEntries 看齐（索引层在内存里 includes，这里用 ILIKE 等价物）。
 *
 * Day 19 起入参已归一化：limit/offset/q/category 由 services/notes.js 校验后传入，
 * 本函数不再做 VALIDATION_FAILED——给它什么条件就查什么条件。
 */
export async function listDbNotes({ limit, offset = 0, q = '', category = '' } = {}) {

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

/**
 * 查重：按 hash 找已有行（Day 18 写库，服务层防重复提交用）。
 * 走 query() 而非 execute()：SELECT 不需要分辨错误码，连接错误按惯例包 DB_UNAVAILABLE。
 * 注意 hash 列上没有唯一索引，这一查只是「先一步友好拦截」，并发重发仍可能同时穿透。
 */
export async function findDbNoteByHash(hash) {
  const rows = await query(
    `SELECT id, category, title FROM notes WHERE hash = $1`,
    [hash],
  )
  return rows[0] ?? null
}

// id 撞车（同日同标题不同正文）时的重试上限：对齐文件版 put() 的 -2/-3 自动退后缀策略，
// 超出说明撞串异常密集（基本只会在并发风暴里出现），如实报错不再硬凑
const MAX_ID_RETRIES = 10

/**
 * INSERT 一条资料进 notes 表（Day 18：POST /api/notes 的落库路径）。
 * 入参是 services/notes.js 组装好的 note 对象（字段对齐 SPEC §2.1）。
 *
 * id 撞车策略：直接 INSERT，捕到主键冲突（SQLSTATE 23505 + notes_pkey）就换
 * -2、-3 … 后缀重试——主键约束本身兜底了并发，不用「先 SELECT 再 INSERT」两次往返。
 * 走 execute() 拿原始错误码；非主键类错误一律转成 DB_UNAVAILABLE（503）。
 *
 * 返回值与文件版 put() 同构 { id, path, hash }：path 由 category/id 派生，
 * 只是契约字段（SPEC §3 响应形状），不代表真有这么个文件。
 */
export async function insertDbNote(note) {
  let lastError = null
  for (let suffix = 0; suffix <= MAX_ID_RETRIES; suffix += 1) {
    const id = suffix === 0 ? note.id : `${note.id}-${suffix + 1}`
    try {
      await execute(
        `INSERT INTO notes (id, title, category, date, tags, source_url,
                            created_at, updated_at, hash, schema_version, body)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, note.title, note.category, note.date, note.tags,
         note.source_url || null, note.created_at, note.updated_at,
         note.hash, note.schema_version, note.content],
      )
      // 落库成功留一行日志：排障时能直接对上「哪个请求写了哪行」，不用翻 pg
      console.log(`[db] notes 写入成功 id=${id} category=${note.category} hash=${note.hash.slice(0, 12)}`)
      return { id, path: `${note.category}/${id}.md`, hash: note.hash }
    } catch (err) {
      // 只把「撞主键」当成可重试；其余错误（含 23505 撞别的约束）原样转 503
      if (err.code === '23505' && err.constraint === 'notes_pkey' && suffix < MAX_ID_RETRIES) {
        lastError = err
        continue
      }
      console.error(`[db] 写入 notes 失败${err.code ? `（${err.code}）` : ''}：${err.message}`)
      throw fail('DB_UNAVAILABLE', '数据库暂时不可用，请稍后再试', 503)
    }
  }
  console.error(`[db] id 撞车重试 ${MAX_ID_RETRIES} 次仍失败：${lastError?.message}`)
  throw fail('DB_UNAVAILABLE', '生成资料编号失败，请稍后再试', 503)
}
