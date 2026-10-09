// agent 会话状态存储：一个会话一个 JSON 文件，落 DATA_DIR/.runtime/agent/<sessionId>.json。
// 复用 storage/tasks.js 的「读全部→改→临时文件+原子重命名」模式（运行时数据可再生，
// 读坏/写半截一律回退为新会话，不阻塞服务）。
// 状态形状即 JSON 接缝：{id, messages[], step, pendingConfirmationId?, created_at, updated_at}
// —— 将来若迁 langgraph，迁的是「谁驱动状态转移」，这份数据不用改。

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { RUNTIME_DIR } from '../../storage/tasks.js'

export const AGENT_DIR = path.join(RUNTIME_DIR, 'agent')
export const RUNS_FILE = path.join(AGENT_DIR, 'runs.jsonl')

async function ensureReady() {
  await mkdir(AGENT_DIR, { recursive: true })
}

function storageError(message) {
  return Object.assign(new Error(message), { status: 503, code: 'STORAGE_FAILED' })
}

function sessionPath(id) {
  // sessionId 由服务端生成（hex），不直接拼外部输入——但仍防一手路径分隔符
  if (!/^[a-z0-9-]+$/i.test(id)) throw storageError('非法会话 id')
  return path.join(AGENT_DIR, `${id}.json`)
}

/** 新会话骨架 */
export function newSession(id = randomBytes(8).toString('hex')) {
  const now = new Date().toISOString()
  return {
    id,
    messages: [],          // langchain 消息序列化后的普通对象（role/content/tool_calls/tool_call_id/name）
    step: 0,
    pendingConfirmationId: null,
    created_at: now,
    updated_at: now,
  }
}

/** 读会话：不存在/损坏 → null（调用方决定是报错还是新建） */
export async function loadSession(id) {
  await ensureReady()
  try {
    const parsed = JSON.parse(await readFile(sessionPath(id), 'utf8'))
    if (!parsed || parsed.id !== id || !Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}

/** 写会话：临时文件 + 原子重命名 */
export async function saveSession(session) {
  await ensureReady()
  session.updated_at = new Date().toISOString()
  const file = sessionPath(session.id)
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw storageError(`写入会话状态失败：${err.message}`)
  }
}
