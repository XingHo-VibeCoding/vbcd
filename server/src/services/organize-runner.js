// organize（收敛）任务的兜底轮询器（SPEC 3.5）：
// 正常路径是「提交即执行」（startOrganizeTask 里异步触发），这里只兜两种残局：
//   ① todo 任务（如 failed→todo 重试）重新执行；
//   ② 进程重启后 stuck 在 doing 的任务：attempts 未到上限重跑，否则判 failed。
// 单进程单飞、一轮只处理一个；任何异常不外抛（后台任务绝不把服务搞挂）。
import * as taskStore from '../storage/tasks.js'
import { organizeInFlight, runOrganizeTask } from './organize.js'
import { nowShanghai } from './notes.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const SWEEP_MS = Number(env('ORGANIZE_SWEEP_INTERVAL_MS', '15000')) || 15000
const MAX_ATTEMPTS = Number(env('ORGANIZE_MAX_ATTEMPTS', '3')) || 3
// 「doing 多久没动算僵死」：必须大于一次完整执行的最坏时间（fetch 20s + LLM 120s + 余量）
const STALE_MS = Number(env('ORGANIZE_STALE_MS', '240000')) || 240000

let running = false

function stale(task) {
  const t = Date.parse(task.updated_at || '')
  return !Number.isNaN(t) && Date.now() - t > STALE_MS
}

async function sweepOne(task) {
  // ① todo：重新执行（failed→todo 清 organize 后落到这里；提交即执行的路径不经过这里）
  if (task.status === 'todo') {
    task.status = 'doing'
    task.result = '正在重新整理链接'
    task.organize = { ...(task.organize || {}), stage: 'fetch', attempts: (task.organize?.attempts ?? 0) + 1, last_error: '' }
    task.updated_at = nowShanghai().iso
    await taskStore.put(task)
    await runOrganizeTask(task) // 单飞/异常兜底在函数内部
    return
  }

  // ② doing 但长时间没动：进程重启留下的残局。未到上限重跑，否则判 failed 留给人工。
  if (task.status === 'doing' && stale(task) && !organizeInFlight(task.id)) {
    const attempts = Number(task.organize?.attempts || 1)
    if (attempts >= MAX_ATTEMPTS) {
      task.status = 'failed'
      task.result = '整理链接多次未完成（进程可能重启过），已放弃；可把任务退回待办再试'
      task.updated_at = nowShanghai().iso
      await taskStore.put(task)
      return
    }
    task.organize = {
      ...(task.organize || {}),
      stage: 'fetch',
      attempts: attempts + 1,
      last_error: 'STALE_RETRY',
    }
    task.result = `上次执行疑似中断（第 ${attempts} 次尝试），自动重试`
    task.updated_at = nowShanghai().iso
    await taskStore.put(task)
    await runOrganizeTask(task)
  }
}

async function tick() {
  if (running) return // 单飞：上一轮没跑完就跳过这轮
  running = true
  try {
    const tasks = await taskStore.list()
    const candidates = tasks.filter(
      (t) => t.type === 'organize' && (t.status === 'todo' || t.status === 'doing'),
    )
    if (!candidates.length) return
    await sweepOne(candidates[0]) // 一轮只处理一个，节奏可控
  } catch (err) {
    console.error('[organize-runner] 本轮异常（已吞掉，不影响服务）：', err?.message || err)
  } finally {
    running = false
  }
}

/** 只在 index.js 启动时调用：本地无副作用（没有候选任务时每轮只是扫一次 tasks.json）。 */
export function startOrganizeRunner() {
  const timer = setInterval(() => {
    tick().catch(() => {})
  }, SWEEP_MS)
  timer.unref() // 不阻止进程退出
  console.log(`收敛轮询器已启动（每 ${SWEEP_MS}ms，单飞）`)
}
