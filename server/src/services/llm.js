// LLM 与 Embedding 装配（SPEC「知识库问答」小节）
// 统一走 OpenAI 兼容端点：Chat 与 Embedding 各用一组 BASE_URL/API_KEY，
// 缺省共用 OPENAI_*；DeepSeek 这类没有 /embeddings 的端点可给 Embedding 单独配一套。
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { fail } from './errors.js'

let chatModel = null
let embedModel = null

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

/** 未配置 key 时不让进程崩溃，只在真正调用时给出中文错误（路由会转成统一错误响应） */
export function kbConfigured() {
  return Boolean(env('OPENAI_API_KEY') && env('CHROMA_URL'))
}

/** 聊天模型：支持 DeepSeek / Qwen / Ollama 等，只要改 OPENAI_BASE_URL + LLM_MODEL */
export function getChatModel() {
  if (!env('OPENAI_API_KEY')) {
    throw fail('KB_NOT_CONFIGURED', '知识库问答未配置：缺少 OPENAI_API_KEY', 503)
  }
  if (!chatModel) {
    chatModel = new ChatOpenAI({
      model: env('LLM_MODEL', 'gpt-4o-mini'),
      apiKey: env('OPENAI_API_KEY'),
      streaming: true,
      configuration: { baseURL: env('OPENAI_BASE_URL', 'https://api.openai.com/v1') },
    })
  }
  return chatModel
}

/** Embedding 模型：缺省与 Chat 同端点；可用 EMBED_BASE_URL / EMBED_API_KEY 独立配置 */
export function getEmbeddings() {
  const apiKey = env('EMBED_API_KEY') || env('OPENAI_API_KEY')
  if (!apiKey) {
    throw fail('KB_NOT_CONFIGURED', '知识库问答未配置：缺少 OPENAI_API_KEY', 503)
  }
  if (!embedModel) {
    embedModel = new OpenAIEmbeddings({
      model: env('EMBED_MODEL', 'text-embedding-3-small'),
      apiKey,
      configuration: {
        baseURL: env('EMBED_BASE_URL') || env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
      },
    })
  }
  return embedModel
}
