// organize（收敛链接）任务类型：抓链接 → 提取正文 → LLM 整理 → createNote 归档（F14 / SPEC 3.5）。
// 口径与 transcribe_url 一致：提交即异步执行；执行失败落 failed 任务写中文原因，
// 不把执行失败当请求失败（F5 进度可见）；归档是 F1 同级写操作，不设确认闸门。
import { fail } from './errors.js'
import { getChatModel } from './llm.js'
import { fetchArticle } from './link.js'
import { CATEGORIES, createNote, nowShanghai } from './notes.js'
import { findNoteBySourceUrl, truncateForLlm } from './transcribe.js'
import * as taskStore from '../storage/tasks.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const NOTE_LLM_TIMEOUT_MS = Number(env('NOTE_LLM_TIMEOUT_MS', '120000')) || 120000
const EXCERPT_CHARS = Number(env('ORGANIZE_EXCERPT_CHARS', '8000')) || 8000
const LLM_MAX_CHARS = Number(env('LLM_TRANSCRIPT_MAX_CHARS', '12000')) || 12000

const STAGE_LABELS = {
  fetch: '正在抓取网页',
  parse: '正在提取正文',
  organize: '正在让模型整理',
  archive: '正在归档资料',
}

// 单飞：同一任务只会被一条执行链推进（提交触发与兜底轮询共用）
const IN_FLIGHT = new Set()
export function organizeInFlight(id) {
  return IN_FLIGHT.has(id)
}

/** 校验 payload 并规范化；不合法抛 VALIDATION_FAILED（不落任务） */
export function validateOrganizePayload(payload) {
  const url = String(payload?.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) {
    throw fail('VALIDATION_FAILED', 'organize（收敛）需要 http/https 的 payload.url')
  }
  const category = String(payload?.category ?? 'learning').trim() || 'learning'
  if (!CATEGORIES.includes(category)) {
    throw fail('VALIDATION_FAILED', `分类必须是 ${CATEGORIES.join(' / ')} 之一`)
  }
  const tags = Array.isArray(payload?.tags)
    ? payload.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : []
  return { url, category, tags }
}

/**
 * 提交入口（createTask 调用）：校验 → 置 doing + task.organize → 异步触发执行。
 * 响应即时返回任务；执行结果由 runOrganizeTask 回写（F5 日志页可见进度）。
 */
export async function startOrganizeTask(task) {
  const parsed = validateOrganizePayload(task.payload)
  task.payload = { ...task.payload, ...parsed }

  const { iso } = nowShanghai()
  task.status = 'doing'
  task.result = '已提交，正在抓取链接'
  task.organize = { stage: 'fetch', attempts: (task.organize?.attempts ?? 0) + 1, started_at: iso, last_error: '' }
  const saved = await taskStore.put(task)

  void runOrganizeTask(saved).catch(() => {}) // 单飞与异常兜底都在函数内部
  return saved
}

async function touch(task) {
  task.updated_at = nowShanghai().iso
  await taskStore.put(task)
}

async function mark(task, stage) {
  task.status = 'doing'
  task.result = `正在整理链接：${STAGE_LABELS[stage] ?? stage}`
  task.organize = { ...(task.organize || {}), stage, last_error: '' }
  await touch(task)
}

async function finishDone(task, result) {
  task.status = 'done'
  task.result = result
  if (task.organize) task.organize.last_error = ''
  await touch(task)
}

async function finishFail(task, reason, code = '') {
  task.status = 'failed'
  task.result = reason
  if (task.organize) task.organize.last_error = code || String(reason).slice(0, 120)
  await touch(task)
}

/**
 * 执行主体：查重 → 抓取 → 提取 → 再查重（最终 URL）→ LLM 整理 → createNote。
 * 任何错误都收敛到 finishFail（落 failed 任务），绝不外抛。
 */
export async function runOrganizeTask(taskOrId) {
  const id = typeof taskOrId === 'string' ? taskOrId : taskOrId.id
  if (IN_FLIGHT.has(id)) return
  IN_FLIGHT.add(id)
  try {
    const task = typeof taskOrId === 'string' ? await taskStore.get(taskOrId) : taskOrId
    if (!task || !['todo', 'doing'].includes(task.status)) return

    try {
      // ① 提交 URL 先查一次重：已在资料库里就不再抓取（「不重复处理」铁律 + 省请求）
      const url = String(task.payload?.url ?? '')
      const pre = await findNoteBySourceUrl(url)
      if (pre) return await finishDone(task, `已归档过 ${pre.path}`)

      // ② 抓取（含 SSRF 闸门与逐跳重定向）＋正文提取
      await mark(task, 'fetch')
      const { fetched, article } = await fetchArticle(url)

      await mark(task, 'parse')
      // 最终地址再查一次：短链/规范化/跳转到已归档的同一页
      const post = await findNoteBySourceUrl(fetched.url)
      if (post) return await finishDone(task, `已归档过 ${post.path}`)

      // ③ LLM 整理摘要/要点；失败走回退模板，不落 failed（与转写链路同口径）
      await mark(task, 'organize')
      let llmResult = null
      let llmError = ''
      try {
        llmResult = await summarizeArticle(article.text, article.title)
      } catch (err) {
        llmError = err?.message || '模型调用失败'
      }

      // ④ 组装资料并归档；createNote 的 DUPLICATE（同内容）也算「归档过」
      await mark(task, 'archive')
      try {
        const note = buildLinkNote(task, { fetched, article }, { llmResult, llmError })
        const created = await createNote(note)
        return await finishDone(task, `已归档到 ${created.path}`)
      } catch (err) {
        if (err.code === 'DUPLICATE') {
          return await finishDone(task, `已归档过：${err.message}`)
        }
        return await finishFail(task, `归档失败：${err.message || '未知原因'}`, err.code || 'STORAGE_FAILED')
      }
    } catch (err) {
      return await finishFail(task, err.message || '整理链接失败', err.code)
    }
  } finally {
    IN_FLIGHT.delete(id)
  }
}

/** LLM 整理摘要与要点（与转写链路同款口径）：返回 {summary, points, model, truncated}；失败抛错由调用方回退。 */
export async function summarizeArticle(text, title) {
  if (!env('OPENAI_API_KEY')) {
    throw new Error('未配置 OPENAI_API_KEY')
  }
  const model = getChatModel(NOTE_LLM_TIMEOUT_MS)
  const { text: input, truncated } = truncateForLlm(text)
  const resp = await model.invoke([
    {
      role: 'system',
      content:
        '你是资料整理助手。只根据用户给的网页正文输出 JSON，不要编造原文没有的内容。' +
        '严格输出 {"summary":"3到5句的摘要","points":["要点1","要点2",...]}，要点 3 到 7 条。',
    },
    {
      role: 'user',
      content: `标题：${title}\n\n网页正文：\n${input}`,
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

/** 组装成 createNote 的入参（全文始终来自抓取的网页，不由 LLM 编造）。 */
export function buildLinkNote(task, { fetched, article }, { llmResult = null, llmError = '' } = {}) {
  const payload = task.payload ?? {}
  const { date } = nowShanghai()
  const finalUrl = String(fetched.url)
  const submitted = String(payload.url || '')
  const title = String(article.title || `网页-${article.siteName || '未命名'}`).slice(0, 80)

  const head = [
    `# ${title}`,
    '',
    `> 来源：${submitted}${finalUrl && finalUrl !== submitted ? `（重定向到 ${finalUrl}）` : ''}` +
      `｜站点：${article.siteName || '未知'}｜抓取：${date}`,
  ]
  if (article.byline) head.push(`> 作者：${article.byline}`)
  if (article.isVideo) {
    head.push('> 💡 这是视频链接：如需逐句时间戳与完整转写，请改用「视频转写」。')
  }
  head.push(
    `> 本笔记由链接收敛链路自动生成：正文为网页提取文本（节选约 ${Math.min(article.text.length, EXCERPT_CHARS)} 字），` +
      (llmResult ? `摘要与要点由 ${llmResult.model} 整理。` : '未做模型整理。'),
  )

  let mid
  if (llmResult) {
    mid = [
      '## 摘要',
      '',
      llmResult.summary || '（空）',
      '',
      '## 要点',
      '',
      ...(llmResult.points?.length ? llmResult.points.map((p) => `- ${p}`) : ['- （无）']),
    ]
    if (llmResult.truncated) {
      mid.push('', `> ⚠️ 正文过长，模型只读了首尾 ${LLM_MAX_CHARS} 字，摘要可能遗漏中间内容。`)
    }
  } else {
    mid = [`> ⚠️ 本次未做模型整理（原因：${llmError || '模型未配置'}），以下为网页提取正文。`]
  }

  const excerptLabel = `## 原文节选${fetched.truncated ? `（网页过大已截断，仅前 ${EXCERPT_CHARS} 字）` : `（前 ${EXCERPT_CHARS} 字）`}`
  const content = [...head, '', ...mid, '', excerptLabel, '', article.excerpt, ''].join('\n')
  return {
    title,
    content,
    category: payload.category || 'learning',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    source_url: submitted || finalUrl,
  }
}
