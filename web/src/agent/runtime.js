// assistant-ui 的 ExternalStoreAdapter：把项目现有 SSE 流（streamAgentChat）
// 翻译成它要的 ThreadMessageLike 数组。
// 我们持有的"原始消息"形状就是自己拼的 ThreadMessageLike，
// convertMessage 直接透传。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useExternalStoreRuntime } from '@assistant-ui/react'
import { getAgentSession, streamAgentChat } from '../api/agent.js'

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
  const abortRef = useRef(null)
  const restoredRef = useRef(false)

  const setSessionId = useCallback((id) => {
    setSessionIdState(id)
    if (id) localStorage.setItem(SESSION_KEY, id)
    else localStorage.removeItem(SESSION_KEY)
  }, [])

  // 进页面时若有 sessionId，拉历史还原成 ThreadMessageLike[]
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!sessionId) return
    getAgentSession(sessionId)
      .then((res) => {
        const rows = res?.data?.rows
        if (!Array.isArray(rows) || rows.length === 0) return
        setMessages(rows.map(rowToLike))
      })
      .catch(() => setSessionId(null))
  }, [sessionId, setSessionId])

  const send = useCallback(
    async (text) => {
      if (!text.trim() || busy) return
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
            appendPart(assistantId, {
              type: 'tool-call',
              toolCallId: `confirm-${ev.confirmation_id}`,
              toolName: 'confirmation_required',
              args: ev.draft ?? {},
              argsText: JSON.stringify(ev.draft ?? {}),
              interrupt: { type: 'human', payload: ev },
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
        },
        onDone: (info) => {
          if (info?.session_id) setSessionId(info.session_id)
          markDone(assistantId)
          setBusy(false)
        },
      })
    },
    [busy, sessionId, setSessionId],
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
    setMessages([])
    setSessionId(null)
    setBusy(false)
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
      },
    }),
    [messages, busy, send],
  )

  const runtime = useExternalStoreRuntime(adapter)
  return { runtime, sessionId, reset, busy }
}

/** 后端 GET /api/agent/sessions/:id 的 row → ThreadMessageLike */
function rowToLike(row, i) {
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
        result: row.toolResult,
        isError: row.toolOk === false,
      },
    ],
    status: { type: 'complete', reason: 'stop' },
    metadata: {},
  }
}
