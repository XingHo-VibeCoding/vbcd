// 假 ASR 服务（冒烟桩）：实现 PLAN §3 的 4 个端点的最小可用版。
// 用法：ASR_PORT=8099 node scripts/fake-asr.mjs  （token 用 FAKE_TOKEN 或 SERVICE_TOKEN 控制）
//
// 场景由 URL 内容触发（冒烟脚本据此覆盖各种链路）：
//   url 含 "partial" → job 终态 failed 且 error.details.partial 带已完成片段
//   url 含 "gone"    → job 先 running，之后 GET 返回 404 JOB_NOT_FOUND（模拟超期清理）
//   url 含 "stuck"   → job 永远 running（配合 ASR_JOB_MAX_WAIT_MINUTES 测超时判负）
//   url 含 "retry"   → 该 URL 第一次提交 job 失败，第二次提交成功（测退回重试）
//   其他             → job 两拍后 succeeded，返回带 segments 的转写包
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.ASR_PORT || 8099)
const TOKEN = process.env.FAKE_TOKEN || 'fake-token'

const jobs = new Map()
const submitCounts = new Map()  // source → 提交次数（retry 场景用）
const STAGE_AFTER_POLLS = 2

function envelope(id, status, extra = {}) {
  return {
    job_id: id,
    status,
    progress: { stage: 'transcribe', done: status === 'succeeded' ? 1 : 0, total: 1, percent: status === 'succeeded' ? 100 : 45 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: null,
    error: null,
    ...extra,
  }
}

function resultFor(source) {
  return {
    source: {
      kind: 'page_url', input: source, platform: 'bilibili', id: 'BV-FAKE',
      title: '假转写视频标题', uploader: 'up主', duration_sec: 95,
      webpage_url: source, thumbnail: '', part: null,
    },
    language: 'zh',
    text: '第一句内容。第二句内容。第三句内容。',
    segments: [
      { i: 0, start: 0.0, end: 3.0, text: '第一句内容。', speaker: null },
      { i: 1, start: 3.2, end: 6.4, text: '第二句内容。', speaker: null },
      { i: 2, start: 9.0, end: 12.0, text: '第三句内容。', speaker: null },
    ],
    timestamp_granularity: 'sentence',
    stats: { chunks: 1, download_ms: 10, ffmpeg_ms: 5, asr_ms: 20, total_ms: 35 },
    warnings: [],
  }
}

function partialFor() {
  return {
    text: '只转写成功的第一段。',
    segments: [{ i: 0, start: 0, end: 2.5, text: '只转写成功的第一段。', speaker: null }],
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://x`)
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (url.pathname === '/healthz') {
    return send(200, { ok: true, ffmpeg: true, ffprobe: true, ytdlp: true, provider_configured: true, jobs_dir_writable: true, version: 'fake' })
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(401, { error: { code: 'AUTH_FAILED', message: '缺少或错误的 Bearer Token', retryable: false, hint: null } })
  }

  if (req.method === 'POST' && url.pathname === '/v1/transcribe') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const source = String(JSON.parse(body || '{}').source ?? '')
      if (!/^https?:\/\//.test(source)) {
        return send(400, { error: { code: 'INVALID_SOURCE', message: 'source 必须是 http/https', retryable: false, hint: null } })
      }
      const id = randomBytes(8).toString('hex')
      submitCounts.set(source, (submitCounts.get(source) || 0) + 1)
      jobs.set(id, { source, polls: 0, attempt: submitCounts.get(source) })
      return send(202, envelope(id, 'queued', { progress: { stage: 'download', done: 0, total: 0, percent: 0 } }))
    })
    return
  }

  const m = /^\/v1\/jobs\/([\w-]+)$/.exec(url.pathname)
  if (m && req.method === 'GET') {
    const job = jobs.get(m[1])
    if (!job) {
      return send(404, { error: { code: 'JOB_NOT_FOUND', message: `job ${m[1]} 不存在`, retryable: false, hint: null } })
    }
    job.polls += 1
    const src = job.source
    if (src.includes('gone') && job.polls >= 2) {
      jobs.delete(m[1])
      return send(404, { error: { code: 'JOB_NOT_FOUND', message: 'job 已被清理', retryable: false, hint: null } })
    }
    if (src.includes('stuck')) {
      return send(200, envelope(m[1], 'running'))
    }
    if (job.polls < STAGE_AFTER_POLLS) {
      return send(200, envelope(m[1], 'running'))
    }
    if (src.includes('retry') && job.attempt === 1) {
      return send(200, envelope(m[1], 'failed', {
        error: { code: 'ASR_FAILED', message: '模拟首次失败', retryable: false, hint: null },
      }))
    }
    if (src.includes('partial')) {
      return send(200, envelope(m[1], 'failed', {
        error: {
          code: 'ASR_FAILED', message: '第 2 片持续失败', retryable: false, hint: null,
          details: { partial: partialFor() },
        },
        result: { source: resultFor(src).source },
      }))
    }
    if (src.includes('fail')) {
      return send(200, envelope(m[1], 'failed', {
        error: { code: 'ASR_FAILED', message: '上游拒绝请求', retryable: false, hint: null },
      }))
    }
    return send(200, envelope(m[1], 'succeeded', { result: resultFor(src) }))
  }

  if (m && req.method === 'DELETE') {
    if (!jobs.has(m[1])) {
      return send(404, { error: { code: 'JOB_NOT_FOUND', message: '不存在', retryable: false, hint: null } })
    }
    jobs.delete(m[1])
    return send(200, { deleted: true })
  }

  send(404, { error: { code: 'JOB_NOT_FOUND', message: 'not found', retryable: false, hint: null } })
})

server.listen(PORT, () => console.log(`fake-asr 听于 http://127.0.0.1:${PORT}（token=${TOKEN}）`))
