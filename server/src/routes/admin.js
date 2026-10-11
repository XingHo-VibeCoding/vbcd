// 后台运维聚合接口：/api/admin/*。
// 第一期板块②：GET /api/admin/overview —— 一次返回"系统总览"，
// 供后台仪表盘渲染四服务健康灯、关键计数、最近任务，避免前端逐个接口拼。
import { Router } from 'express'
import { listTasks } from '../services/tasks.js'
import { dbConfigured, query as dbQuery } from '../db/pool.js'
import * as storage from '../storage/files.js'

const router = Router()

// 单个服务探测：带超时，返回 { ok, latencyMs, ... }
async function probe(fn, timeoutMs = 3000) {
  const t0 = Date.now()
  try {
    const detail = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ])
    return { ok: true, latencyMs: Date.now() - t0, ...(detail || {}) }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: err?.message || String(err) }
  }
}

// asr 探活：配了 ASR_SERVICE_URL 就 GET {base}/healthz；未配置 configured:false（跳过，不误报红）
async function probeAsr() {
  const base = process.env.ASR_SERVICE_URL
  if (!base) return { configured: false }
  const token = process.env.ASR_SERVICE_TOKEN
  const res = await fetch(`${base.replace(/\/+$/, '')}/healthz`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(3000),
  })
  return { configured: true, status: res.status }
}

// pg 探活：配了 DATABASE_URL 才 SELECT 1；未配置 configured:false
async function probePg() {
  if (!dbConfigured()) return { configured: false }
  await dbQuery('SELECT 1')
  return { configured: true }
}

// chroma 探活：配了 CHROMA_URL 才 GET /api/v2/heartbeat（直连轻量端点，不引重客户端）
async function probeChroma() {
  const base = process.env.CHROMA_URL
  if (!base) return { configured: false }
  const token = process.env.CHROMA_AUTH_TOKEN
  const res = await fetch(`${base.replace(/\/+$/, '')}/api/v2/heartbeat`, {
    headers: token ? { 'X-Chroma-Token': token } : {},
    signal: AbortSignal.timeout(3000),
  })
  return { configured: true, status: res.status }
}

// 计数：notes 数（文件索引 list）、任务数（含按状态细分）
async function buildCounts() {
  const counts = {}
  try {
    const tasks = await listTasks({})
    const byStatus = {}
    for (const t of tasks.items) byStatus[t.status] = (byStatus[t.status] || 0) + 1
    counts.tasks = { total: tasks.total, byStatus }
  } catch (err) {
    counts.tasks = { error: err?.message }
  }
  try {
    const { items } = await storage.list()
    counts.notes = { total: items.length }
  } catch (err) {
    counts.notes = { error: err?.message }
  }
  return counts
}

router.get('/overview', async (req, res, next) => {
  try {
    const [asr, pg, chroma, counts, tasksData] = await Promise.all([
      probe(probeAsr),
      probe(probePg),
      probe(probeChroma),
      buildCounts(),
      listTasks({}).catch(() => ({ items: [] })),
    ])

    res.json({
      ok: true,
      data: {
        services: [
          { name: 'server', ok: true, latencyMs: 0 }, // 能走到这里即活
          { name: 'asr', ...asr },
          { name: 'postgres', ...pg },
          { name: 'chroma', ...chroma },
        ],
        counts,
        recentTasks: (tasksData.items || []).slice(0, 8),
        time: new Date().toISOString(),
        auth_enabled: process.env.AUTH_ENABLED === '1',
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
