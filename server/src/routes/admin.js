// 后台运维聚合接口：/api/admin/*。
// 第一期板块②：GET /api/admin/overview —— 一次返回"系统总览"，
// 供后台仪表盘渲染四服务健康灯、关键计数、最近任务，避免前端逐个接口拼。
import { Router } from 'express'
import { listTasks } from '../services/tasks.js'
import { dbConfigured, query as dbQuery } from '../db/pool.js'
import * as noteStore from '../storage/note-store.js'
import { listEnv } from '../services/env.js'
import { getSettings, patchSettings } from '../services/settings.js'
import { listImages, getImage } from '../services/images.js'
import { getSiteProfile, patchSiteProfile } from '../services/site-profile.js'

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
    // 探活失败原因只进服务端日志；响应只给中文短句（Day 23 三类错误：② 网络/接口错）
    console.error(`[admin] probe failed: ${err?.message || String(err)}`)
    const reason = err?.message === 'timeout' ? '连接超时' : '连接失败'
    return { ok: false, latencyMs: Date.now() - t0, error: reason }
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

// 计数：当前资料权威来源、任务数（含按状态细分）
async function buildCounts() {
  const counts = {}
  try {
    const tasks = await listTasks({})
    const byStatus = {}
    for (const t of tasks.items) byStatus[t.status] = (byStatus[t.status] || 0) + 1
    counts.tasks = { total: tasks.total, byStatus }
  } catch (err) {
    // 原始原因只进日志，响应只给中文短句（不把 fs/Node 英文抛给前端）
    console.error(`[admin] counts.tasks failed: ${err?.message || String(err)}`)
    counts.tasks = { error: '统计任务数失败' }
  }
  try {
    const { items } = await noteStore.list()
    counts.notes = { total: items.length }
  } catch (err) {
    console.error(`[admin] counts.notes failed: ${err?.message || String(err)}`)
    counts.notes = { error: '统计资料数失败' }
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

// env 只读总览（配置分层：基础设施秘密网页只读不编辑）
router.get('/env', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await listEnv() })
  } catch (err) {
    next(err)
  }
})

// 站点业务配置：读/写 data/site.json（热生效、容器可达）
router.get('/settings', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await getSettings() })
  } catch (err) {
    next(err)
  }
})

router.patch('/settings', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await patchSettings(req.body ?? {}) })
  } catch (err) {
    next(err)
  }
})

// 站点信息与个人信息：统一后台表单，底层分别写 site.json/profile.md。
router.get('/site', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await getSiteProfile() })
  } catch (err) {
    next(err)
  }
})

router.patch('/site', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await patchSiteProfile(req.body ?? {}) })
  } catch (err) {
    next(err)
  }
})

// 图片资产只读扫描：文件元数据 + 实际引用位置；本阶段不提供上传/删除。
router.get('/images', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await listImages() })
  } catch (err) {
    next(err)
  }
})

router.get('/images/:id', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await getImage(req.params.id) })
  } catch (err) {
    next(err)
  }
})

export default router
