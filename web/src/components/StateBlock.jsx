// 列表类视图的四种状态（Day 13）：加载 / 错误 / 空 / 正常。
// 为什么抽成一个组件：Day 13 之前是各页各写一套 —— 同样是「加载」，有的页面有 role、有的没有；
// 同样是错误，有的页面把整页换掉、有的只在顶部挂一条。抽出来后「四态怎么判定、怎么被读屏播报」
// 只有一处定义，页面只管传文字。
//
// 无障碍要点（对齐 skills/frontend-rules/SKILL.md §2.5）：
// · 播报容器**常驻 DOM**：内容换来换去，但容器一直挂在页面上；若容器随状态卸载，
//   很多读屏不会播报「新出现」的内容；
// · 正常态的列表放在容器**外面**，否则读屏会把整张列表当一条状态消息念一遍；
// · 错误态用 role="alert" + aria-live="assertive"（比 status 更急），加载与空态用 status/polite。
export default function StateBlock({
  state, // 'loading' | 'error' | 'empty' | 'ok'
  loadingText = '载入中…',
  errorText = '加载失败',
  onRetry, // 传了才显示「重试」按钮
  emptyText = '这里是空的',
  emptyAction = null, // 空态里的引导控件（按钮或链接节点），可选
  children, // 正常态内容
}) {
  const isError = state === 'error'

  return (
    <>
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        aria-busy={state === 'loading' ? 'true' : undefined}
      >
        {state === 'loading' ? <div className="loading">{loadingText}</div> : null}

        {isError ? (
          <div className="error-bar">
            {errorText}{' '}
            {onRetry ? (
              <button type="button" className="btn-ghost" onClick={onRetry}>
                重试
              </button>
            ) : null}
          </div>
        ) : null}

        {state === 'empty' ? (
          <div className="empty">
            {emptyText} {emptyAction}
          </div>
        ) : null}
      </div>

      {state === 'ok' ? children : null}
    </>
  )
}
