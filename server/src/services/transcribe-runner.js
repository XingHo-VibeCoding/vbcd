// transcribe_url 任务的后台轮询器（SPEC 3.4 小节）：
// 每 ASR_POLL_INTERVAL_MS 扫一轮 type=transcribe_url 且 status in (todo,doing) 的任务，
// 单进程单飞、一次只推进一个任务；任何异常不外抛（后台任务绝不把服务搞挂）。
import * as taskStore from '../storage/tasks.js'
import { asrConfigured, deleteJob, getJob } from './asr.js'
import { archiveTranscript, progressText, submitTranscribeTask } from './transcribe.js'
import { nowShanghai } from './notes.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const POLL_MS = Number(env('ASR_POLL_INTERVAL_MS', '5000')) || 5000
const MAX_WAIT_MINUTES = Number(env('ASR_JOB_MAX_WAIT_MINUTES', '60')) || 60

let running = false

function expired(task) {
  const submitted = task.asr?.submitted_at
  if (!submitted) return false
  const t = Date.parse(submitted)
  if (Number.isNaN(t)) return false
  return Date.now() - t > MAX_WAIT_MINUTES * 60 * 1000
}

async function touch(task) {
  task.updated_at = nowShanghai().iso
  await taskStore.put(task)
}

/** 终态归档：succeeded → 全量；failed 带 partial → 部分转写（正文顶部告警）。返回任务是否完结。 */
async function finishWithArchive(task, result, { partial = false } = {}) {
  try {
    const archived = await archiveTranscript(task, result, { partial })
    task.status = 'done'
    task.result = archived.reused
      ? `已归档过 ${archived.path}${partial ? '（部分转写）' : ''}`
      : `已归档到 ${archived.path}${partial ? '（部分转写）' : ''}`
  } catch (err) {
    task.status = 'failed'
    task.result = `归档失败：${err.message || '未知原因'}`
  }
  task.asr = task.asr ? { ...task.asr, last_error: '' } : task.asr
  await touch(task)
}

async function advanceOne(task) {
  // ① todo 且没有 job_id：重提交流程（failed→todo 重试会清空 asr，由这里重新提交）
  if (task.status === 'todo' && !task.asr?.job_id) {
    task.status = 'todo' // submitTranscribeTask 内部会置 doing / failed
    await submitTranscribeTask(task)
    return
  }

  const jobId = task.asr?.job_id
  if (!jobId) return

  if (expired(task)) {
    task.status = 'failed'
    task.result = `转写超过 ${MAX_WAIT_MINUTES} 分钟仍未完成，已判超时；可把任务退回待办重试`
    if (task.asr) task.asr.last_error = 'TIMEOUT'
    await touch(task)
    await deleteJob(jobId)
    return
  }

  let job
  try {
    job = await getJob(jobId)
  } catch (err) {
    if (err.code === 'JOB_NOT_FOUND' || err.status === 404) {
      task.status = 'failed'
      task.result = '转写 job 已不存在（服务重启或超期被清理）；可把任务退回待办重试'
      if (task.asr) task.asr.last_error = 'JOB_NOT_FOUND'
      await touch(task)
      return
    }
    // 服务暂时不可达：这轮不算失败，记 last_error 等下一轮（避免一次抖动就判死）
    if (task.asr) {
      task.asr.last_error = err.message || '查询失败'
      await touch(task)
    }
    return
  }

  const progress = job.progress ?? {}
  if (job.status === 'succeeded') {
    await finishWithArchive(task, job.result ?? {})
    await deleteJob(jobId)
    return
  }
  if (job.status === 'failed') {
    const partial = job.error?.details?.partial
    if (partial && String(partial.text ?? '').trim()) {
      await finishWithArchive(task, { ...job.result, ...partial, source: job.result?.source ?? {} }, { partial: true })
    } else {
      task.status = 'failed'
      task.result = `转写失败：${job.error?.message || '未知原因'}；可把任务退回待办重试`
      if (task.asr) task.asr.last_error = job.error?.code || 'ASR_FAILED'
      await touch(task)
    }
    await deleteJob(jobId)
    return
  }

  // queued / running：刷新进度文案与 asr 字段
  task.result = progressText(progress)
  if (task.asr) {
    task.asr = {
      ...task.asr,
      stage: progress.stage ?? task.asr.stage,
      done: progress.done ?? task.asr.done,
      total: progress.total ?? task.asr.total,
      percent: progress.percent ?? task.asr.percent,
      last_error: '',
    }
  }
  await touch(task)
}

async function tick() {
  if (running) return // 单飞：上一轮没跑完就跳过这轮
  running = true
  try {
    const tasks = await taskStore.list()
    const candidates = tasks.filter(
      (t) => t.type === 'transcribe_url' && (t.status === 'todo' || t.status === 'doing'),
    )
    if (!candidates.length) return
    await advanceOne(candidates[0]) // 一轮只推进一个，节奏可控
  } catch (err) {
    console.error('[transcribe-runner] 本轮异常（已吞掉，不影响服务）：', err?.message || err)
  } finally {
    running = false
  }
}

/** 只在 index.js 启动时调用：未配置 ASR_SERVICE_URL 时不启动定时器（功能静默缺席） */
export function startTranscribeRunner() {
  if (!asrConfigured()) {
    console.log('转写轮询器未启动（ASR_SERVICE_URL 未配置）')
    return
  }
  const timer = setInterval(() => {
    tick().catch(() => {})
  }, POLL_MS)
  timer.unref() // 不阻止进程退出
  console.log(`转写轮询器已启动（每 ${POLL_MS}ms，单飞）`)
}
