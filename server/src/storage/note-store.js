// 资料存储统一入口（Day 19：数据访问层重构，见 SPEC §7.3）
//
// 这是「存哪」知识的唯一持有者：配了 DATABASE_URL 走 notes 表（db/notes.js），
// 没配走 data/ Markdown 文件（storage/files.js）。上层（services/routes）只面对
// 本文件的四个函数，不再 import db/* 或感知 DATABASE_URL 的存在。
//
// 设计意图：把「文件 or 库」的判定从 services/notes.js 关进这里——换存储时
// 业务层一行不改；db/notes.js 与 files.js 都退化为「给条件就查/给对象就存」
// 的纯存取实现，不做业务判断。
//
// 迁移期特别说明：/api/db/* 是「必须读库」的平行数据源（Day 17 平行双源设计），
// 所以 list/get 的 db 侧不走 dbConfigured 自适应——它语义上就是「查库」，
// 未配库时由 db 层自己抛 DB_NOT_CONFIGURED，不静默退文件。
import * as files from './files.js'
import { dbConfigured } from '../db/pool.js'
import { listDbNotes, getDbNote, findDbNoteByHash, insertDbNote } from '../db/notes.js'

/**
 * 按内容哈希查重（服务层防重复提交用）。
 * 返回形状两边对齐：库行返回 { id, category, title }（无 path），
 * 文件项返回完整 item（含 path）——调用方用 `hit.path ?? category/id 派生` 取展示位。
 */
export async function findByHash(hash) {
  if (dbConfigured()) {
    return await findDbNoteByHash(hash)
  }
  const { items } = await files.list()
  return items.find((item) => item.hash && item.hash === hash) ?? null
}

/**
 * 写入一条资料（永不覆盖）：有库 → INSERT notes 表；无库 → 落 Markdown 文件。
 * 两侧都返回 { id, path, hash }，撞 id 时各自按 -2/-3 后缀退避。
 */
export async function put(note) {
  if (dbConfigured()) {
    return await insertDbNote(note)
  }
  return await files.put(note)
}

/**
 * 读库列表（/api/db/notes 专用）。语义是「查库」不是「自适应」——
 * 未配 DATABASE_URL 时 db/notes.js 内部抛 DB_NOT_CONFIGURED，如实暴露。
 */
export async function listDb(params) {
  return await listDbNotes(params)
}

/** 读库详情（/api/db/notes/:id 专用）：{ meta, content } 或 null。同上不走自适应。 */
export async function getDb(id) {
  return await getDbNote(id)
}
