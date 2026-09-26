// 确认记录（Confirmation）存储适配层（SPEC 第 2.4 节）
// 位置：DATA_DIR/.runtime/confirmations.json —— 与任务清单共用一个运行时目录（RUNTIME_DIR 只定义一处）。
// 字段严格按 SPEC 2.4：id / task_id / action / summary / requested_at / decision / confirmed_at。
// 设计约束（产品铁律）：**不记录"谁"**，单人使用；只留"何时、确认了什么"。
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { RUNTIME_DIR } from './tasks.js'

export const CONFIRMATIONS_FILE = path.join(RUNTIME_DIR, 'confirmations.json')

const SCHEMA_VERSION = 1

/** 确保运行时目录存在（与任务存储共用同一目录，重复调用无副作用） */
export async function ensureReady() {
  await mkdir(RUNTIME_DIR, { recursive: true })
}

function storageError(message) {
  return Object.assign(new Error(message), { status: 503, code: 'STORAGE_FAILED' })
}

// 文件不存在、被手改坏、写完一半 —— 一律当空清单（运行时数据可再生）
async function readAll() {
  await ensureReady()
  try {
    const parsed = JSON.parse(await readFile(CONFIRMATIONS_FILE, 'utf8'))
    if (parsed?.schema_version !== SCHEMA_VERSION || !Array.isArray(parsed.confirmations)) return []
    return parsed.confirmations
  } catch {
    return []
  }
}

// 临时文件 + 原子重命名（与 tasks.js / files.js 同一套做法）
async function writeAll(confirmations) {
  await ensureReady()
  const tmp = `${CONFIRMATIONS_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    const body = JSON.stringify({ schema_version: SCHEMA_VERSION, confirmations }, null, 2)
    await writeFile(tmp, `${body}\n`, 'utf8')
    await rename(tmp, CONFIRMATIONS_FILE)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw storageError(`写入确认记录失败：${err.message}`)
  }
}

/** 全部确认记录（不排序与过滤，交给业务层） */
export async function list() {
  return readAll()
}

/** 按 id 取一条；不存在返回 null */
export async function get(id) {
  const confirmations = await readAll()
  return confirmations.find((item) => item.id === id) ?? null
}

/** 按 id 落盘：已存在整条替换，否则追加 */
export async function put(confirmation) {
  const confirmations = await readAll()
  const at = confirmations.findIndex((item) => item.id === confirmation.id)
  if (at === -1) confirmations.push(confirmation)
  else confirmations[at] = confirmation
  await writeAll(confirmations)
  return confirmation
}
