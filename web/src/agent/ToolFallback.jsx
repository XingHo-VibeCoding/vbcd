// assistant-ui 的 tool-call part 渲染组件（板块②）。
// 一个工具调用一条折叠行：工具名 + 参数预览 + 状态图标，点开看完整参数/结果。
// confirmation_required 走特殊样式（橙边居中卡片）。
export default function ToolFallback({ toolName, args, argsText, result, isError, interrupt }) {
  // 确认挂起：interrupt.payload 是 SSE 的 confirmation_required 事件数据
  if (interrupt?.type === 'human') {
    const p = interrupt.payload ?? {}
    return (
      <div className="aui-tool confirm">
        <div className="aui-tool-confirm-icon">⏸</div>
        <div className="aui-tool-confirm-body">
          <div className="aui-tool-confirm-title">这个动作需要你先确认</div>
          {p.draft?.title ? (
            <div className="aui-tool-confirm-draft">归档《{p.draft.title}》</div>
          ) : null}
          {p.confirmation_id ? (
            <code className="aui-tool-confirm-id">#{p.confirmation_id}</code>
          ) : null}
          <div className="aui-tool-confirm-hint">
            请到「日志 → 确认留痕」处理，确认后我会继续
          </div>
        </div>
      </div>
    )
  }

  const hasResult = result !== undefined
  const status = !hasResult ? '…' : isError ? '✗' : '✓'

  return (
    <details className={`aui-tool ${isError ? 'fail' : ''}`}>
      <summary>
        <span className="aui-tool-icon">🔧</span>
        <span className="aui-tool-name">{toolName}</span>
        {argsText ? (
          <code className="aui-tool-args">{argsText.slice(0, 80)}</code>
        ) : null}
        <em className={`aui-tool-status ${isError ? 'bad' : hasResult ? 'ok' : ''}`}>
          {status}
        </em>
      </summary>
      {hasResult ? (
        <pre className="aui-tool-result">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
      ) : null}
    </details>
  )
}
