// 工具注册表：扫 manifest → 过滤（白名单 env + authFields 已配置）→ 建 langchain tool 实例。
// 借 Anything-LLM aibitat 的组织方式：注册 = 目录/manifest 驱动，白名单独立成模型。
// 约束（铁律 2）：模型只能调 registry 内工具；工具入参由 zod schema 校验，路径类参数由
// 各工具 handler 自行限制在 data/ 内——registry 层不再重复。

import { TOOL_MANIFEST } from './manifest.js'

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

/** AGENT_TOOLS="search_notes,get_note" 可收窄白名单；未设 = manifest 全量（过 authFields 过滤） */
function whitelist() {
  const raw = env('AGENT_TOOLS')
  if (!raw) return null // null = 不限
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
}

function authSatisfied(entry) {
  return entry.authFields.every((k) => Boolean(env(k)))
}

/** 构建当前可用工具集：返回 { tools: Map<name, langchainTool>, meta: Map<name, manifestEntry> } */
export function buildRegistry() {
  const wl = whitelist()
  const tools = new Map()
  const meta = new Map()
  for (const entry of TOOL_MANIFEST) {
    if (wl && !wl.has(entry.name)) continue
    if (!authSatisfied(entry)) continue
    tools.set(entry.name, entry.build())
    meta.set(entry.name, entry)
  }
  return { tools, meta }
}

/** 给 bindTools 用的数组形式 */
export function toolArray(registry) {
  return [...registry.tools.values()]
}

/** 供 manifest 展示/前端灰显：全部条目 + 各自可用状态（不过滤） */
export function manifestStatus() {
  const wl = whitelist()
  return TOOL_MANIFEST.map((e) => ({
    name: e.name,
    description: e.description,
    risk: e.risk,
    authFields: e.authFields,
    enabled: (!wl || wl.has(e.name)) && authSatisfied(e),
  }))
}
