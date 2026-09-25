// 知识库问答接口封装（SPEC 第 3 章 9–11）
// 普通问答走统一 client；流式问答用 fetch + ReadableStream 手写 SSE 解析
//（不用 EventSource：便于复用同源 Cookie 与统一错误处理，也方便将来改 POST）。
import { request } from './client.js'

/** 普通问答：返回 { answer, sources[] } */
export async function queryKb(q, k) {
  return request('/api/kb/query', { method: 'POST', body: { q, k } })
}

/**
 * 流式问答：GET /api/kb/stream?q=…&k=…
 * handlers: onSources(sources) / onToken(text) / onError({code,message}) / onDone()
 * 返回 AbortController，调用方可 abort() 中断生成。
 */
export function streamKb(q, { k, onSources, onToken, onError, onDone } = {}) {
  const params = new URLSearchParams({ q })
  if (k) params.set('k', String(k))
  const ctrl = new AbortController()

  fetch(`/api/kb/stream?${params}`, { credentials: 'include', signal: ctrl.signal })
    .then(async (res) => {
      if (!res.ok) {
        let code = res.status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL'
        let message = `请求失败（HTTP ${res.status}）`
        try {
          const data = await res.json()
          code = data?.error?.code || code
          message = data?.error?.message || message
        } catch {
          /* 非 JSON 错误体就用默认文案 */
        }
        onError?.({ code, message })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 事件以空行分隔；逐段解析 event:/data:
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const event = /^event: (.+)$/m.exec(block)?.[1]
          const raw = /^data: (.+)$/m.exec(block)?.[1]
          if (!event || raw === undefined) continue
          let data
          try {
            data = JSON.parse(raw)
          } catch {
            continue
          }
          if (event === 'sources') onSources?.(data.sources ?? [])
          else if (event === 'token') onToken?.(data.text ?? '')
          else if (event === 'error') onError?.(data)
          else if (event === 'done') onDone?.()
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.({ code: 'NETWORK', message: '无法连接后端服务，请确认它已启动' })
      }
    })

  return ctrl
}
