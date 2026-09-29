// 面包屑（Day 13）：只回答「这条页面在一级导航里的哪个层级」，是静态、可预期的位置。
// 「我刚才从哪儿来」由 BackLink 负责——两者分工写在 SPEC.md §1.2 的约定 4。
// 首项固定「主页」；末项是当前页，纯文字 + aria-current="page"，不可点。
// 分隔符是装饰，aria-hidden 掉，不进读屏（否则读屏会逐个念「斜杠」）。
import { Link } from 'react-router-dom'

export default function Breadcrumb({ items = [] }) {
  const trail = [{ label: '主页', to: '/' }, ...items]

  return (
    <nav className="breadcrumb" aria-label="面包屑">
      <ol>
        {trail.map((item, i) => {
          const isLast = i === trail.length - 1
          return (
            <li key={`${item.label}-${i}`}>
              {isLast ? (
                // title：长标题被 CSS 单行截断后仍能看到全称
                <span aria-current="page" title={item.label}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )}
              {isLast ? null : (
                <span className="sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
