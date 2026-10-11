# 移动端适配规则（buddy）

## 断点
移动优先：`sm:640 / md:768 / lg:1024 / xl:1280`。
**<768px**：桌面顶栏隐藏 → **底部玻璃 tab bar**（`fixed bottom-0 z-50 bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl border-t`）。

## 触控目标 ≥44px
| 元素 | 要求 |
|---|---|
| 主按钮 `px-6 py-3`+14px | ≈44px ✅ |
| 图标按钮 | `p-2.5`+ 或 `w-11 h-11` |
| tab bar 项 | 高 ≥48px |

## 输入
输入框字号 ≥16px（防 iOS 聚焦缩放）；`flex flex-wrap` 防溢出；无横向滚动。

## 验收清单
- [ ] <768px：底部 tab bar 可见不遮内容，桌面顶栏消失
- [ ] 页面无横向滚动（scrollWidth ≤ clientWidth）
- [ ] 每可点元素热区 ≥44px
- [ ] 暗色下 tab bar/卡片对比度正常
