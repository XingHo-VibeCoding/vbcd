// assistant-ui 的 ExternalStoreAdapter：把项目现有 SSE 流（streamAgentChat）
// 翻译成它要的 ThreadMessageLike 数组。
// 我们持有的"原始消息"形状就是自己拼的 ThreadMessageLike，
// convertMessage 直接透传。

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useExternalStoreRuntime } from '@assistant-ui/react'
import { getAgentSession, streamAgentChat } from '../api/agent.js'
import { getPlanningDraft, decidePlanningDraft } from '../api/planning.js'
import { decideTask } from '../api/tasks.js'

export const AgentConfirmationContext = createContext(null)

/** 对话内确认走现有后端闸门；冲突变化只读新草案，不自动再次批准。 */
export async function resolveConfirmation(pending, decision, draft = pending.draft) {
  if (pending.planning && pending.draft_id) {
    try {
      const value = await decidePlanningDraft(pending.draft_id, decision, draft?.review_token)
      return { kind: 'terminal', draft: value, status: value.status, result: value.result, agent_sync: value.agent_sync }
    } catch (err) {
      if (err.code === 'PLANNING_REVIEW_REQUIRED') {
        const value = await getPlanningDraft(pending.draft_id)
        if (value.status !== 'pending') return { kind: 'terminal', draft: value, status: value.status, result: value.result }
        return { kind: 'review', draft: value, result: '安排或冲突有变化，尚未批准或保存。请审阅新草案后再次确认。' }
      }
      // 网络中断可能发生在事务提交后：重新读终态，不盲目重发写入。
      const value = await getPlanningDraft(pending.draft_id).catch(() => null)
      if (value && value.status !== 'pending') return { kind: 'terminal', draft: value, status: value.status, result: value.result }
      throw err
    }
  }
  if (!pending.task_id) throw new Error('缺少待确认任务，请重新读取会话')
  const task = await decideTask(pending.task_id, decision)
  return { kind: 'terminal', draft, status: decision === 'rejected' ? 'rejected' : task.status === 'done' ? 'approved' : 'failed', result: task.result }
}

const SESSION_KEY = 'buddy.agent.sessionId'

let uid = 0
const nid = () => `m${++uid}`

/**
 * buddy agent 的 ExternalStoreAdapter。
 * @returns {{runtime: import('@assistant-ui/react').AssistantRuntime, sessionId: string|null, reset: ()=>void, busy: boolean}}
 */
export function useBuddyAgentRuntime() {
  const [messages, setMessages] = useState([]) // ThreadMessageLike[]
  const [sessionId, setSessionIdState] = useState(() => localStorage.getItem(SESSION_KEY))
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const currentSession = useRef(sessionId)
  const abortRef = useRef(null)
  const inFlightRef = useRef(false)  // 同步守卫：state 异步更新追不上双触发的 send
  const restoredRef = useRef(false)

  const setSessionId = useCallback((id) => {
    currentSession.current = id
    setSessionIdState(id)
    if (id) localStorage.setItem(SESSION_KEY, id)
    else localStorage.removeItem(SESSION_KEY)
  }, [])

  const applyView = useCallback(view => {
    setMessages((view.rows ?? []).map(rowToLike))
    setPendingConfirmation(view.pending_confirmation_id ?? null)
  }, [])

  const refreshConversation = useCallback(async () => {
    const id = currentSession.current
    if (!id) throw new Error('会话仍在生成，请稍后再确认')
    const view = await getAgentSession(id)
    if (currentSession.current === id) applyView(view)
    return view
  }, [applyView])

  // 进页面时若有 sessionId，拉历史还原成 ThreadMessageLike[]
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!sessionId) return
    getAgentSession(sessionId)
      .then((res) => {
        // request() 已把后端 { ok, data } 解包成 data → res 即 { session_id, rows, ... }
        const rows = res?.rows
        if (!Array.isArray(rows) || currentSession.current !== sessionId) return
        applyView(res)
      })
      .catch((err) => {
        // 仅 404（会话文件真没了）才清 sessionId；
        // 网络抖动/502/超时保留 id——下次进页面还能再试，不丢历史
        if (err?.status === 404 || err?.code === 'NOT_FOUND') setSessionId(null)
      })
  }, [sessionId, setSessionId, applyView])

  const send = useCallback(
    async (text) => {
      if (!text.trim() || busy || confirming || pendingConfirmation || inFlightRef.current) return
      inFlightRef.current = true
      abortRef.current?.abort()
      setBusy(true)

      const userMsg = {
        id: nid(),
        role: 'user',
        content: [{ type: 'text', text }],
        createdAt: new Date(),
        metadata: {},
      }
      const assistantId = nid()
      const assistantMsg = {
        id: assistantId,
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        createdAt: new Date(),
        status: { type: 'running' },
        metadata: {},
      }
      setMessages((prev) => [...prev, userMsg, assistantMsg])

      abortRef.current = streamAgentChat(text, {
        sessionId,
        onEvent: (ev) => {
          if (ev.type === 'token') {
            patchAssistant(assistantId, (c) =>
              c.map((p) => (p.type === 'text' ? { ...p, text: (p.text || '') + (ev.text ?? '') } : p)),
            )
          } else if (ev.type === 'tool_call') {
            appendPart(assistantId, {
              type: 'tool-call',
              toolCallId: `tc-${ev.step}-${ev.name}-${Date.now()}`,
              toolName: ev.name,
              args: ev.args ?? {},
              argsText: JSON.stringify(ev.args ?? {}),
            })
          } else if (ev.type === 'tool_result') {
            // 回填最后一个 pending 的同名 tool-call
            patchAssistant(assistantId, (c) => {
              const idx = [...c].reverse().findIndex(
                (p) => p.type === 'tool-call' && p.toolName === ev.name && p.result === undefined,
              )
              if (idx === -1) return c
              const real = c.length - 1 - idx
              const next = [...c]
              next[real] = {
                ...next[real],
                result: ev.result,
                isError: ev.ok === false,
              }
              return next
            })
          } else if (ev.type === 'confirmation_required') {
            setPendingConfirmation(ev.confirmation_id)
            // 不用 assistant-ui 的 interrupt/approval 字段（会触发它内置审批 UI 渲染两遍）。
            // 塞自定义字段由 ToolFallback 识别。
            appendPart(assistantId, {
              type: 'tool-call',
              toolCallId: `confirm-${ev.confirmation_id}`,
              toolName: 'confirmation_required',
              args: ev.draft ?? {},
              argsText: JSON.stringify(ev.draft ?? {}),
              result: { __pendingConfirm: true, confirmation_id: ev.confirmation_id, task_id: ev.task_id, draft_id: ev.draft_id, planning: ev.planning, draft: ev.draft, note: ev.note },
            })
          }
        },
        onError: (err) => {
          patchAssistant(assistantId, (c) => [
            ...c,
            { type: 'text', text: `\n\n⚠️ ${err.message || '对话失败'}` },
          ])
          markDone(assistantId)
          setBusy(false)
          inFlightRef.current = false
        },
        onDone: (info) => {
          if (info?.session_id) setSessionId(info.session_id)
          markDone(assistantId)
          setBusy(false)
          inFlightRef.current = false
        },
      })
    },
    [busy, confirming, pendingConfirmation, sessionId, setSessionId],
  )

  function appendPart(mid, part) {
    setMessages((prev) =>
      prev.map((m) => (m.id === mid ? { ...m, content: [...m.content, part] } : m)),
    )
  }
  function patchAssistant(mid, fn) {
    setMessages((prev) =>
      prev.map((m) => (m.id === mid ? { ...m, content: fn(m.content) } : m)),
    )
  }
  function markDone(mid) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === mid ? { ...m, status: { type: 'complete', reason: 'stop' } } : m,
      ),
    )
  }

  const reset = useCallback(() => {
    abortRef.current?.abort()
    inFlightRef.current = false
    setMessages([])
    setSessionId(null)
    setBusy(false)
    setPendingConfirmation(null)
  }, [setSessionId])

  const adapter = useMemo(
    () => ({
      messages,
      setMessages,
      isRunning: busy,
      onNew: async (msg) => {
        const text =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content?.map((p) => p?.text || '').join('') || ''
        await send(text)
      },
      onCancel: async () => {
        abortRef.current?.abort()
        setBusy(false)
        inFlightRef.current = false
      },
    }),
    [messages, busy, send],
  )

  const runtime = useExternalStoreRuntime(adapter)
  const confirmationActions = useMemo(() => ({
    refresh: refreshConversation, setWorking: setConfirming, working: confirming, generating: busy,
  }), [refreshConversation, confirming, busy])
  return { runtime, sessionId, reset, busy, confirming, pendingConfirmation, confirmationActions }
}

/** 后端 GET /api/agent/sessions/:id 的 row → ThreadMessageLike */
export function rowToLike(row, i) {
  if (row.role === 'user') {
    return {
      id: `r${i}-u`,
      role: 'user',
      content: [{ type: 'text', text: row.text ?? '' }],
      metadata: {},
    }
  }
  if (row.role === 'assistant') {
    return {
      id: `r${i}-a`,
      role: 'assistant',
      content: [{ type: 'text', text: row.text ?? '' }],
      status: { type: 'complete', reason: 'stop' },
      metadata: {},
    }
  }
  // tool 行 → tool-call part 塞到最近一个 assistant 消息上？
  // sessionToView 里 tool 行是独立 row，但 ThreadMessageLike 要求 part 挂在 message 里。
  // 这里我们直接把 tool row 转成一个独立的 assistant 消息只含 tool-call part。
  return {
    id: `r${i}-t`,
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: `r${i}-tc`,
        toolName: row.toolName ?? 'tool',
        args: row.toolArgs ?? {},
        argsText: JSON.stringify(row.toolArgs ?? {}),
        result: row.confirm ? { __pendingConfirm: true, ...row.confirm } : row.toolResult,
        isError: row.toolOk === false,
      },
    ],
    status: { type: 'complete', reason: 'stop' },
    metadata: {},
  }
}
