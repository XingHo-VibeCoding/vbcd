// 任务（Task）运行时数据存储适配层（SPEC 第 2.3 节）
// 位置：DATA_DIR/.runtime/tasks.json —— 运行时数据独立成目录，一类数据一个文件，
// 便于第 3 周迁移数据库时只扫这一个目录；本目录不入公开仓（.gitignore 已按 /data/ 根锚定覆盖）。
// 与 files.js 同属适配层：对外只暴露 list / get / put，业务代码不直接碰文件系统。
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { DATA_DIR } from './files.js'

export const RUNTIME_DIR = path.join(DATA_DIR, '.runtime')
export const TASKS_FILE = path.join(RUNTIME_DIR, 'tasks.json')

const SCHEMA_VERSION = 1

/** 确保运行时目录存在（目录被删也能自愈） */
export async function ensureReady() {
  await mkdir(RUNTIME_DIR, { recursive: true })
}

function storageError(message) {
  return Object.assign(new Error(message), { status: 503, code: 'STORAGE_FAILED' })
}

// 读取整份清单；文件不存在、被手改坏、写完一半 —— 一律当空清单（运行时数据可再生，不阻塞服务）
async function readAll() {
  await ensureReady()
  try {
    const parsed = JSON.parse(await readFile(TASKS_FILE, 'utf8'))
    if (parsed?.schema_version !== SCHEMA_VERSION || !Array.isArray(parsed.tasks)) return []
    return parsed.tasks
  } catch {
    return []
  }
}

// 整份重写：临时文件 + 原子重命名，避免读到半截 JSON（与 files.js:put 同一套做法）
async function writeAll(tasks) {
  await ensureReady()
  const tmp = `${TASKS_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    const body = JSON.stringify({ schema_version: SCHEMA_VERSION, tasks }, null, 2)
    await writeFile(tmp, `${body}\n`, 'utf8')
    await rename(tmp, TASKS_FILE)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw storageError(`写入任务失败：${err.message}`)
  }
}

/** 全部任务（不做排序与过滤，交给业务层决定） */
export async function list() {
  return readAll()
}

/** 按 id 取一条任务；不存在返回 null */
export async function get(id) {
  const tasks = await readAll()
  return tasks.find((task) => task.id === id) ?? null
}

/** 按 id 落盘一条任务：已存在则整条替换，否则追加；返回落盘后的对象 */
export async function put(task) {
  const tasks = await readAll()
  const at = tasks.findIndex((item) => item.id === task.id)
  if (at === -1) tasks.push(task)
  else tasks[at] = task
  await writeAll(tasks)
  return task
}
