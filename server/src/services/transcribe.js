// transcribe_url 任务类型：payload 校验 + 提交 ASR + 把转写包组装成 Markdown 资料。
// 归档走与 F1 相同的 createNote()（同级写操作，故不设确认闸门——高风险外部动作规则不变）。
import * as storage from '../storage/files.js'
import { asrConfigured, submitTranscribe } from './asr.js'
import { fail } from './errors.js'
import { getChatModel } from './llm.js'
import { CATEGORIES, createNote, nowShanghai } from './notes.js'
import * as taskStore from '../storage/tasks.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const NOTE_LLM_TIMEOUT_MS = Number(env('NOTE_LLM_TIMEOUT_MS', '120000')) || 120000
const LLM_TRANSCRIPT_MAX_CHARS = Number(env('LLM_TRANSCRIPT_MAX_CHARS', '12000')) || 12000

const STAGE_LABELS = {
  download: '正在下载',
  normalize: '音频处理',
  chunk: '正在切片',
  transcribe: '正在转写',
  merge: '正在合并',
}

/** 校验 payload 并返回规范化字段；不合法抛 VALIDATION_FAILED（不落任务） */
export function validatePayload(payload) {
  const url = String(payload?.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) {
    throw fail('VALIDATION_FAILED', 'transcribe_url 需要 http/https 的 payload.url')
  }
  const category = String(payload?.category ?? 'learning').trim() || 'learning'
  if (!CATEGORIES.includes(category)) {
    throw fail('VALIDATION_FAILED', `分类必须是 ${CATEGORIES.join(' / ')} 之一`)
  }
  const tags = Array.isArray(payload?.tags)
    ? payload.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : []
  const part = payload?.part === undefined || payload?.part === null ? null : Number(payload.part)
  if (part !== null && (!Number.isInteger(part) || part < 1)) {
    throw fail('VALIDATION_FAILED', 'part 必须是 ≥1 的整数（B 站分 P 序号）')
  }
  const language = String(payload?.language ?? '').trim() || null
  return { url, category, tags, language, part }
}

/**
 * 提交转写任务（createTask 入口）。口径与 note 执行器一致：
 * 服务不可达 / 未配置 / 4xx 都落一条 failed 任务写清中文原因，绝不把执行失败当请求失败（F5 进度可见）。
 */
export async function submitTranscribeTask(task) {
  let parsed
  try {
    parsed = validatePayload(task.payload)
  } catch (err) {
    if (err.code === 'VALIDATION_FAILED') throw err
    throw err
  }
  task.payload = { ...task.payload, ...parsed }

  const { iso } = nowShanghai()
  if (!asrConfigured()) {
    task.status = 'failed'
    task.result = '转写服务未配置：请先在 server/.env 设置 ASR_SERVICE_URL'
    return taskStore.put(task)
  }

  let job
  try {
    job = await submitTranscribe(parsed)
  } catch (err) {
    task.status = 'failed'
    task.result = `提交转写失败：${err.message || '未知原因'}`
    return taskStore.put(task)
  }

  task.status = 'doing'
  task.result = '已提交转写，等待结果'
  task.asr = {
    job_id: job.job_id,
    stage: job.progress?.stage ?? 'download',
    done: job.progress?.done ?? 0,
    total: job.progress?.total ?? 0,
    percent: job.progress?.percent ?? 0,
    submitted_at: iso,
    last_error: '',
  }
  return taskStore.put(task)
}

/** 轮询器用：把 ASR job 进度刷进 task.asr 与 result 文案 */
export function progressText(progress = {}) {
  const stage = STAGE_LABELS[progress.stage] ?? '排队中'
  if (!progress.total) return `转写中：${stage}`
  return `转写中：${stage}（${progress.done}/${progress.total}，${progress.percent ?? 0}%）`
}

/** 查重：按 source_url 找已归档的资料（对应 AC4「同一 URL 不写第二份文件」） */
export async function findNoteBySourceUrl(url) {
  const { items } = await storage.list()
  return items.find((item) => item.source_url && item.source_url === url) ?? null
}

function fmtDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '未知时长'
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function fmtTs(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h
    ? `[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`
    : `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`
}

/** 全文段：相邻 segment 间隔 < 2 秒合并成一段，每段一行带起始时间戳 */
export function segmentsToTranscript(segments = []) {
  const blocks = []
  for (const seg of segments) {
    const text = String(seg?.text ?? '').trim()
    if (!text) continue
    const prev = blocks[blocks.length - 1]
    if (prev && Number(seg.start) - prev.end < 2) {
      prev.text += text
      prev.end = Math.max(prev.end, Number(seg.end) || prev.end)
    } else {
      blocks.push({ start: Number(seg.start) || 0, end: Number(seg.end) || 0, text })
    }
  }
  return blocks.map((b) => `${fmtTs(b.start)} ${b.text}`).join('\n')
}

/** LLM 输入截断：超长时保留头 2/3 + 尾 1/3，并在正文里注明 */
export function truncateForLlm(text) {
  const max = LLM_TRANSCRIPT_MAX_CHARS
  if (text.length <= max) return { text, truncated: false }
  const head = Math.floor((max * 2) / 3)
  const tail = max - head
  return {
    text: `${text.slice(0, head)}\n\n……（中间 ${text.length - max} 字已省略）……\n\n${text.slice(-tail)}`,
    truncated: true,
  }
}

/**
 * 用 LLM 整理摘要与要点。返回 {summary, points, model, truncated}；
 * 模型未配置 / 调用失败 / 返回不可解析 → 抛出带中文原因的错（由调用方决定回退）。
 */
export async function summarize(transcriptText, title) {
  if (!env('OPENAI_API_KEY')) {
    throw new Error('未配置 OPENAI_API_KEY')
  }
  const model = getChatModel(NOTE_LLM_TIMEOUT_MS)
  const { text, truncated } = truncateForLlm(transcriptText)
  const resp = await model.invoke([
    {
      role: 'system',
      content:
        '你是资料整理助手。只根据用户给的转写原文输出 JSON，不要编造原文没有的内容。' +
        '严格输出 {"summary":"3到5句的摘要","points":["要点1","要点2",...]}，要点 3 到 7 条。',
    },
    {
      role: 'user',
      content: `标题：${title}\n\n转写原文：\n${text}`,
    },
  ])
  const raw = String(resp?.content ?? '').trim()
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('模型未返回 JSON')
  let parsed
  try {
    parsed = JSON.parse(m[0])
  } catch {
    throw new Error('模型返回的 JSON 无法解析')
  }
  const summary = String(parsed.summary ?? '').trim()
  const points = (Array.isArray(parsed.points) ? parsed.points : [])
    .map((p) => String(p).trim())
    .filter(Boolean)
  if (!summary && !points.length) throw new Error('模型返回为空')
  return { summary, points, model: env('LLM_MODEL', 'gpt-4o-mini'), truncated }
}

/**
 * 把 ASR 转写包（含可选 partial 标记）组装成 createNote 的入参。
 * partial=true 时正文顶部加告警块；llmResult 为 null 时走「原文模板」回退。
 */
export function buildNote(task, result, { partial = false, llmResult = null, llmError = '' } = {}) {
  const src = result?.source ?? {}
  const payload = task.payload ?? {}
  const title = String(src.title || `${src.platform || 'video'}-${src.id || 'unknown'}`).slice(0, 80)
  const { date } = nowShanghai()

  const head = [
    `# ${title}`,
    '',
    `> 来源：${payload.url}｜平台：${src.platform || '未知'}｜时长：${fmtDuration(src.duration_sec)}｜转写：${date}`,
  ]
  if (partial) {
    head.push('> ⚠️ 部分转写：ASR 报告有片段失败，以下仅含已成功片段的内容。')
  }
  const transcript = segmentsToTranscript(result?.segments) || String(result?.text ?? '').trim()

  let mid
  if (llmResult) {
    head.push(`> 本笔记由转写链路自动生成：全文来自 fun-asr，摘要与要点由 ${llmResult.model} 整理。`)
    const summaryBlock = ['## 摘要', '', llmResult.summary || '（空）', '', '## 要点', '']
    if (llmResult.points?.length) {
      summaryBlock.push(...llmResult.points.map((p) => `- ${p}`))
    } else {
      summaryBlock.push('- （无）')
    }
    mid = summaryBlock
    if (llmResult.truncated) {
      mid.push('', `> ⚠️ 转写过长，模型只读了首尾 ${LLM_TRANSCRIPT_MAX_CHARS} 字，摘要可能遗漏中间内容。`)
    }
  } else {
    head.push(`> 本笔记由转写链路自动生成：全文来自 fun-asr。`)
    mid = [`> ⚠️ 本次未做模型整理（原因：${llmError || '模型未配置'}），以下为转写原文。`]
  }

  const content = [...head, '', ...mid, '', '## 全文（带时间戳）', '', transcript, ''].join('\n')
  return {
    title,
    content,
    category: payload.category || 'learning',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    source_url: payload.url,
  }
}

/**
 * 终态归档入口（轮询器调用）：查重 → LLM 整理（失败回退原文模板）→ createNote。
 * 返回 { path, reused }；reused=true 表示同 URL 已归档过，没有再写文件。
 */
export async function archiveTranscript(task, result, { partial = false } = {}) {
  const url = String(task.payload?.url ?? '')
  const existing = await findNoteBySourceUrl(url)
  if (existing) return { path: existing.path, reused: true }

  let llmResult = null
  let llmError = ''
  const transcriptForLlm = String(result?.text ?? '')
  try {
    llmResult = await summarize(transcriptForLlm, result?.source?.title || url)
  } catch (err) {
    llmError = err?.message || '模型调用失败'
  }

  const note = buildNote(task, result, { partial, llmResult, llmError })
  try {
    const created = await createNote(note)
    return { path: created.path, reused: false }
  } catch (err) {
    if (err.code === 'DUPLICATE') {
      // 与查重并发的极端情况：哈希撞车视为已归档（内容一致），不再写第二份
      return { path: url, reused: true, message: err.message }
    }
    throw err
  }
}
