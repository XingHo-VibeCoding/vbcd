// 短暂提示条（Day 11 · 交互反馈）：纯展示组件，不持有状态——显隐与计时器由使用它的页面管。
// 固定视口底部居中，不遮顶部导航；出现/消失都是瞬时，不加任何过渡动画。
// role="status" 的容器常驻 DOM（空着也留着），这样读屏在文字变化时才会播报。
export default function Toast({ text, tone = 'ok' }) {
  return (
    <div className="toast-slot" role="status" aria-live="polite">
      {text ? <span className={`toast toast--${tone}`}>{text}</span> : null}
    </div>
  )
}
