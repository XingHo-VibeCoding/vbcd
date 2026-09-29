// 「返回上一页」（Day 13）：回答「我刚才从哪儿来」，和面包屑（位置）分工不同。
// 二级页的入口不止一个（/notes/:id 有 5 个、/tasks/:id/confirm 有 4 个），
// 所以写死父级会把从 /about 时间线或 /ask 来源进来的人带错路 —— 有来路时一律回退历史。
//
// 无来路时（直接粘地址打开、新标签页、从外部跳进来）退回 fallback 的父级路由，
// 并且文案跟着改：按钮写着「返回上一页」却无处可去是最糟的情况。
import { Link, useNavigate } from 'react-router-dom'

// react-router v7 把「本次会话的第几条历史记录」写在 history.state.idx 上（0 = 第一页）；
// 读不到 idx 时保守退化成 history.length 判断。
function canGoBack() {
  if (typeof window === 'undefined') return false
  const idx = window.history.state?.idx
  if (typeof idx === 'number') return idx > 0
  return window.history.length > 1
}

export default function BackLink({ fallback = '/', fallbackLabel = '返回上级' }) {
  const navigate = useNavigate()

  if (canGoBack()) {
    // 有来路：这是一个动作，用原生 button（Enter / Space 都能触发，符合样式规则 2.5）
    return (
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        ← 返回上一页
      </button>
    )
  }

  // 无来路：这是一个目的地，用链接（可中键新开、可右键复制地址）
  return (
    <Link to={fallback}>← {fallbackLabel}</Link>
  )
}
