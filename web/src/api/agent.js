// agent 对话接口封装（F12，对应 POST /api/agent/chat SSE 与 GET /api/agent/runs）
// 与 api/kb.js 同一套手写 SSE 解析，但走 POST（消息体在 body，支持 session_id 多轮）。
import { request } from './client.js'

/**
 * 发一条 agent 消息（SSE 流）。
 * @param {string} message 用户消息
 * @param {object} opts
 * @param {string|null} opts.sessionId 既有会话 id（多轮）；null=新会话
 * @param {(ev:{type:string,step?:number,name?:string,args?:any,ok?:boolean,result?:string,text?:string,confirmation_id?:string,task_id?:string,draft?:object,session_id?:string,suspended?:boolean})=>void} opts.onEvent 统一事件回调
 * @param {(err:{code:string,message:string})=>void} [opts.onError]
 * @param {(info:{session_id:string,suspended:boolean})=>void} [opts.onDone]
 * @returns {AbortController}
 */
export function streamAgentChat(message, { sessionId = null, onEvent, onError, onDone } = {}) {
  const ctrl = new AbortController()

  fetch('/api/agent/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        let code = res.status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL'
        let msg = `请求失败（HTTP ${res.status}）`
        try {
          const data = await res.json()
          code = data?.error?.code || code
          msg = data?.error?.message || msg
        } catch { /* 保持默认 */ }
        onError?.({ code, message: msg })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
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
          data.type = event
          if (event === 'error') onError?.(data)
          else if (event === 'done') onDone?.(data)
          else onEvent?.(data)
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

/** 审计留痕列表 */
export async function listAgentRuns(limit = 50) {
  return request(`/api/agent/runs?limit=${limit}`)
}

/** 工具清单（含 enabled 状态） */
export async function listAgentTools() {
  return request('/api/agent/tools')
}
