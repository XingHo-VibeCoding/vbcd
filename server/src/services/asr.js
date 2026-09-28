// ASR 转写微服务的 HTTP 客户端（SPEC 3.4 小节）。
// 只做三件事：提交转写 / 查 job / 删 job；失败统一转成带 code 的中文错误，由调用方落进任务 result。
// 服务契约见 asr/（PLAN §3）：POST /v1/transcribe、GET|DELETE /v1/jobs/{id}、Bearer 鉴权。
import { fail } from './errors.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

export function asrConfigured() {
  return Boolean(env('ASR_SERVICE_URL'))
}

function baseUrl() {
  return env('ASR_SERVICE_URL').replace(/\/+$/, '')
}

function timeoutMs() {
  return Number(env('ASR_HTTP_TIMEOUT_MS', '15000')) || 15000
}

/** 统一 fetch：超时中止 + 服务侧错误信封 → 中文 ServiceError */
async function call(method, path, body) {
  if (!asrConfigured()) {
    throw fail('ASR_NOT_CONFIGURED', '转写服务未配置（缺少 ASR_SERVICE_URL）', 503)
  }
  const headers = {}
  const token = env('ASR_SERVICE_TOKEN')
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? '请求超时' : '服务不可达'
    throw fail('ASR_UNAVAILABLE', `转写服务${reason}（${baseUrl()}）`, 503)
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok) {
    const remote = json?.error
    const message = remote?.message || `转写服务返回 HTTP ${res.status}`
    const err = fail(remote?.code || 'ASR_FAILED', message, res.status)
    err.retryable = Boolean(remote?.retryable)
    err.details = remote?.details ?? null
    throw err
  }
  return json
}

/** 提交转写：wait_seconds=0 → 立即 202 返回 job 信封 {job_id, status, ...} */
export function submitTranscribe({ url, language, part } = {}) {
  return call('POST', '/v1/transcribe', {
    source: url,
    wait_seconds: 0,
    ...(language ? { language } : {}),
    ...(part ? { part: Number(part) } : {}),
  })
}

/** 查 job 信封；job 不存在时上游返回 404 JOB_NOT_FOUND（错误对象的 code 原样透出） */
export function getJob(jobId) {
  return call('GET', `/v1/jobs/${encodeURIComponent(jobId)}`)
}

/** 立即清理 job 的临时文件与状态（终态后调用，best-effort） */
export async function deleteJob(jobId) {
  try {
    await call('DELETE', `/v1/jobs/${encodeURIComponent(jobId)}`)
  } catch {
    // 清理失败不阻塞主链路：job 有 TTL，GC 会兜底
  }
}
