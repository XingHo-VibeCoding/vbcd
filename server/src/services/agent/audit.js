// agent 调用审计：每次循环内动作追加一行 JSONL 到 data/.runtime/agent/runs.jsonl。
// 字段设计借 LibreChat toolTiming/activity：谁(session)何时(ts)第几步(step)做了什么(type)、
// 工具名/参数/耗时/成败——「调用审计留痕」铁律的落点。
// JSONL 追加写（非整份重写）：高频小写场景，读侧由 GET /api/agent/runs 按行解析。

import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { RUNTIME_DIR } from '../../storage/tasks.js'

const AGENT_DIR = path.join(RUNTIME_DIR, 'agent')
const RUNS_FILE = path.join(AGENT_DIR, 'runs.jsonl')

async function ensureReady() {
  await mkdir(AGENT_DIR, { recursive: true })
}

/** 追加一条审计记录；写失败只记日志不抛错（审计不能反过来打死业务） */
export async function audit(entry) {
  try {
    await ensureReady()
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry })
    await appendFile(RUNS_FILE, `${line}\n`, 'utf8')
  } catch (err) {
    console.error('[agent:audit] 写入失败:', err.message)
  }
}

/** 读最近 N 条（倒序）：供 GET /api/agent/runs 用 */
export async function listRuns(limit = 100) {
  await ensureReady()
  try {
    const text = await readFile(RUNS_FILE, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    const items = []
    for (let i = lines.length - 1; i >= 0 && items.length < limit; i--) {
      try {
        items.push(JSON.parse(lines[i]))
      } catch {
        /* 坏行跳过 */
      }
    }
    return items
  } catch {
    return []
  }
}
