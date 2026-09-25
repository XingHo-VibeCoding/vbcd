// 知识库问答（RAG）服务（SPEC「知识库问答」小节）
// 索引：扫 data/ 下全部 .md → 中文优先切分 → Embedding → Chroma collection "buddy-notes"；
//      增量依据本地清单 data/.kb-manifest.json（note_id → {hash, chunk_ids}），hash 不变不重建。
// 问答：问题向量化 → Top-K 检索 → 严格基于上下文的中文 prompt → 流式/一次性生成 + 来源列表。
// 向量库直连 chromadb 官方 JS 客户端（不传 embeddingFunction，向量由我们自己算好）；
// 这样不必引入 @langchain/community（其 peer 依赖与本项目 dotenv@18 冲突）。
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { ChromaClient, ChromaConnectionError } from 'chromadb'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import * as storage from '../storage/files.js'
import { fail } from './errors.js'
import { getChatModel, getEmbeddings, kbConfigured } from './llm.js'

export const COLLECTION = 'buddy-notes'
export const MANIFEST_FILE = path.join(storage.DATA_DIR, '.kb-manifest.json')

const K_MAX = 10
const Q_MAX = 500
const NO_HIT_ANSWER = '资料库里没有找到相关内容，请先收录相关资料后再问我。'

// 中文优先的切分：先段落、再换行、再按中英文句读，最后才硬切字符
const SPLIT_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', '']
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
  separators: SPLIT_SEPARATORS,
})

let client = null
let collectionPromise = null

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function topK(reqK) {
  const k = Number(reqK ?? env('KB_TOP_K', '3'))
  if (!Number.isInteger(k) || k < 1 || k > K_MAX) {
    throw fail('VALIDATION_FAILED', `k 必须是 1 到 ${K_MAX} 之间的整数`)
  }
  return k
}

function ensureConfigured() {
  if (!kbConfigured()) {
    throw fail('KB_NOT_CONFIGURED', '知识库问答未配置：请设置 OPENAI_API_KEY 与 CHROMA_URL', 503)
  }
}

/** Chroma 客户端：CHROMA_URL 形如 http://47.85.210.76:8000；token 走 X-Chroma-Token 头 */
function getClient() {
  if (!client) {
    const url = new URL(env('CHROMA_URL', 'http://localhost:8000'))
    const token = env('CHROMA_AUTH_TOKEN')
    client = new ChromaClient({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 8000)),
      ssl: url.protocol === 'https:',
      headers: token ? { 'X-Chroma-Token': token } : undefined,
    })
  }
  return client
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = getClient()
      .getOrCreateCollection({ name: COLLECTION, embeddingFunction: null })
      .catch((err) => {
        collectionPromise = null // 失败不缓存，下次重连
        throw chromaError(err)
      })
  }
  return collectionPromise
}

function chromaError(err) {
  if (err instanceof ChromaConnectionError || err?.cause?.code === 'ECONNREFUSED' || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(err?.message || '')) {
    return fail('CHROMA_UNAVAILABLE', `向量库连不上（${env('CHROMA_URL')}）：${err.message}`, 503)
  }
  return fail('CHROMA_UNAVAILABLE', `向量库异常：${err.message}`, 503)
}

function llmError(err) {
  if (err?.code) return err
  const status = err?.status ?? err?.response?.status
  const raw = String(err?.message || '未知错误')
  if (status === 401 || status === 403) {
    return fail('LLM_FAILED', '模型服务鉴权失败：请检查 OPENAI_API_KEY 是否有效', 503)
  }
  if (status === 404) {
    return fail('LLM_FAILED', `模型或接口路径不存在：请检查 LLM_MODEL / EMBED_MODEL 与 OPENAI_BASE_URL（原始：${raw}）`, 503)
  }
  if (status === 429) {
    return fail('LLM_FAILED', '模型服务限流或额度不足，请稍后重试', 503)
  }
  if (/connection error|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout/i.test(raw)) {
    return fail('LLM_FAILED', '连不上模型服务：请检查 OPENAI_BASE_URL 与网络是否可达', 503)
  }
  return fail('LLM_FAILED', `模型服务异常：${raw}`, 503)
}

// ---------- 索引 ----------

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'))
    if (parsed?.schema_version !== 1 || typeof parsed.notes !== 'object' || !parsed.notes) return {}
    return parsed.notes
  } catch {
    return {} // 文件不存在/损坏都当空清单：下一次按全量处理
  }
}

async function writeManifest(notes) {
  const tmp = `${MANIFEST_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify({ schema_version: 1, rebuilt_at: new Date().toISOString(), notes }, null, 2)}\n`, 'utf8')
    await rename(tmp, MANIFEST_FILE)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw fail('STORAGE_FAILED', `写入索引清单失败：${err.message}`, 503)
  }
}

function docHashOf(item) {
  return createHash('sha256').update(`${item.title}\n${item.content}`, 'utf8').digest('hex')
}

async function deleteChunks(collection, ids, noteId) {
  try {
    if (ids?.length) await collection.delete({ ids })
    else await collection.delete({ where: { note_id: noteId } }) // 清单缺 ids 的兜底
  } catch (err) {
    throw chromaError(err)
  }
}

/**
 * 增量索引：新增/修改/删除只动受影响的 chunks。
 * 返回 { added, updated, removed, unchanged, chunks }（SPEC 第 3 章接口 9）。
 */
export async function reindex() {
  ensureConfigured()
  const collection = await getCollection()
  const { items, warnings } = await storage.list()
  for (const w of warnings) console.warn(`[kb] ${w}`)

  const manifest = await readManifest()
  const nextManifest = {}
  const stats = { added: 0, updated: 0, removed: 0, unchanged: 0, chunks: 0 }

  const seen = new Set()
  const toEmbed = [] // { item, hash, chunks[] }

  for (const item of items) {
    if (!item.content?.trim()) continue // 空正文不向量化
    seen.add(item.id)
    const hash = docHashOf(item)
    const prev = manifest[item.id]
    if (prev?.hash === hash) {
      stats.unchanged += 1
      nextManifest[item.id] = prev
      continue
    }
    // 标题拼进正文一起切分：检索到的 chunk 自带出处语境
    const chunks = await splitter.splitText(`# ${item.title}\n\n${item.content}`)
    if (prev) {
      stats.updated += 1
      await deleteChunks(collection, prev.chunk_ids, item.id)
    } else {
      stats.added += 1
    }
    toEmbed.push({ item, hash, chunks })
  }

  for (const [noteId, prev] of Object.entries(manifest)) {
    if (seen.has(noteId)) continue
    stats.removed += 1
    await deleteChunks(collection, prev?.chunk_ids, noteId)
  }

  for (const { item, hash, chunks } of toEmbed) {
    let vectors
    try {
      vectors = await getEmbeddings().embedDocuments(chunks)
    } catch (err) {
      throw llmError(err)
    }
    const ids = chunks.map((_, i) => `${item.id}::${i}`)
    try {
      await collection.add({
        ids,
        embeddings: vectors,
        documents: chunks,
        metadatas: chunks.map((_, i) => ({
          note_id: item.id,
          title: item.title,
          path: item.path,
          chunk_index: i,
          hash,
        })),
      })
    } catch (err) {
      throw chromaError(err)
    }
    stats.chunks += chunks.length
    nextManifest[item.id] = { hash, chunk_ids: ids, path: item.path }
  }

  await writeManifest(nextManifest)
  return stats
}

// ---------- 检索 ----------

/** 问题 → Top-K 命中。返回 [{ note_id, title, path, chunk_index, score, text }]（score=距离，越小越像） */
async function retrieve(q, k) {
  const collection = await getCollection()
  let vector
  try {
    vector = await getEmbeddings().embedQuery(q)
  } catch (err) {
    throw llmError(err)
  }

  let result
  try {
    result = await collection.query({
      queryEmbeddings: [vector],
      nResults: k,
      include: ['metadatas', 'distances', 'documents'],
    })
  } catch (err) {
    throw chromaError(err)
  }

  const maxDistance = Number(env('KB_MAX_DISTANCE', 'NaN'))
  const hits = []
  const ids = result.ids?.[0] ?? []
  for (let i = 0; i < ids.length; i += 1) {
    const meta = result.metadatas?.[0]?.[i] ?? {}
    const distance = result.distances?.[0]?.[i]
    if (Number.isFinite(maxDistance) && Number.isFinite(distance) && distance > maxDistance) continue
    hits.push({
      note_id: String(meta.note_id ?? ''),
      title: String(meta.title ?? ''),
      path: String(meta.path ?? ''),
      chunk_index: Number(meta.chunk_index ?? 0),
      score: distance,
      text: String(result.documents?.[0]?.[i] ?? ''),
    })
  }
  return hits
}

function buildPrompt(q, hits) {
  const context = hits
    .map((h, i) => `【资料${i + 1}】文件：${h.path}（第 ${h.chunk_index + 1} 段）\n${h.text}`)
    .join('\n\n')
  return [
    new SystemMessage(
      '你是个人知识库助手。只根据下面给出的资料回答用户的问题；' +
        '资料不足以回答时，明确说"资料库里没有相关内容"，不要编造、不要引入外部知识。' +
        '回答末尾用"来源："行列出你实际用到的文件名。',
    ),
    new HumanMessage(`资料：\n${context}\n\n问题：${q}`),
  ]
}

function toSources(hits) {
  return hits.map(({ note_id, title, path: p, chunk_index, score }) => ({
    note_id,
    title,
    path: p,
    chunk_index,
    score,
  }))
}

function validateQuery(q) {
  const text = String(q ?? '').trim()
  if (!text) throw fail('VALIDATION_FAILED', '问题不能为空')
  if ([...text].length > Q_MAX) throw fail('VALIDATION_FAILED', `问题最多 ${Q_MAX} 字`)
  return text
}

/** 普通问答（POST /api/kb/query）：返回 { answer, sources[] } */
export async function query(q, k) {
  ensureConfigured()
  const question = validateQuery(q)
  const hits = await retrieve(question, topK(k))
  if (!hits.length) return { answer: NO_HIT_ANSWER, sources: [] }

  let res
  try {
    res = await getChatModel().invoke(buildPrompt(question, hits))
  } catch (err) {
    throw llmError(err)
  }
  const answer = typeof res.content === 'string' ? res.content : res.content.map((c) => c.text || '').join('')
  return { answer, sources: toSources(hits) }
}

/**
 * 流式问答（GET /api/kb/stream）：
 * 先返回 hits（路由立刻推 sources 事件），再返回逐 token 的异步迭代器。
 * 无命中时迭代器只吐固定话术，不走模型。
 */
export async function prepareStream(q, k) {
  ensureConfigured()
  const question = validateQuery(q)
  const hits = await retrieve(question, topK(k))

  if (!hits.length) {
    return {
      sources: [],
      tokens: (async function* () {
        yield NO_HIT_ANSWER
      })(),
    }
  }

  let stream
  try {
    stream = await getChatModel().stream(buildPrompt(question, hits))
  } catch (err) {
    throw llmError(err)
  }
  return {
    sources: toSources(hits),
    tokens: (async function* () {
      try {
        for await (const chunk of stream) {
          const text = typeof chunk.content === 'string' ? chunk.content : (chunk.content ?? []).map((c) => c.text || '').join('')
          if (text) yield text
        }
      } catch (err) {
        throw llmError(err)
      }
    })(),
  }
}
