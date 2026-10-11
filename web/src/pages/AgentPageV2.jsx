// assistant-ui 版 agent 对话页（F12 重构，A/B 阶段挂在 /agent-v2）。
// 骨架：ThreadPrimitive 渲染消息流 + ComposerPrimitive 输入框。
// 板块③ 再做主题样式贴合现有风格。
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import MarkdownContent from '../components/MarkdownContent.jsx'
import ToolFallback from '../agent/ToolFallback.jsx'
import { useBuddyAgentRuntime } from '../agent/runtime.js'
import '../agent/theme.css'

export default function AgentPageV2() {
  const { runtime, sessionId, reset, busy } = useBuddyAgentRuntime()

  return (
    <section className="aui-page">
      <div className="agent-head">
        <h2>agent</h2>
        {sessionId ? (
          <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
            新会话
          </button>
        ) : null}
      </div>

      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="aui-root">
          <ThreadPrimitive.Viewport className="aui-viewport">
            <ThreadPrimitive.Empty>
              <div className="aui-empty">
                说点什么——我可以查你的资料库、帮你归档整理，写操作会先给你看草案再等你确认。
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>

          <ComposerPrimitive.Root className="aui-composer">
            <ComposerPrimitive.Input
              className="aui-input"
              placeholder="问资料库、或让我帮你归档 / 建任务…"
              autoFocus
            />
            <ComposerPrimitive.Send className="aui-send" disabled={busy}>
              发送
            </ComposerPrimitive.Send>
            <ComposerPrimitive.Cancel className="aui-cancel">
              停止
            </ComposerPrimitive.Cancel>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </section>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-row user">
      <div className="aui-bubble user">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-row assistant">
      <div className="aui-bubble assistant">
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => <MarkdownContent content={text} />,
            tools: { Fallback: ToolFallback },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}
