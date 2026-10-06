# 2026-10-05 · F15b ima 笔记详情：图片失效占位样式

- **调用方式**：自动匹配（改动 `web/src/styles.css` 新增 `.md-img-missing`）
- **检查对象**：`styles.css` 新增的占位规则 + 前端新增 `ImaNoteDetailPage.jsx` / `MarkdownContent.jsx` 的 `components` 改动

## 逐条结论

| 检查项 | 结论 | 说明 |
|---|---|---|
| 字号走 `--fs-*` 档位 | 通过 | `font-size: var(--fs-1)`（13px，元信息档，≥13px 合法） |
| 间距走 `--sp-*` 档位 | 通过 | `margin: var(--sp-3) 0`、`padding: var(--sp-3) var(--sp-4)`，无裸值 |
| 圆角走 token | 通过 | `border-radius: var(--radius)` |
| 零硬编码色值 | 通过 | 新规则只用 `var(--border)` / `var(--muted)`；`grep` 色值仍全部在 `:root` 与 `[data-theme='dark']` 两个 token 定义块内（8–39 行） |
| 零动画 | 通过 | `grep transition\|animation\|@keyframes` 无输出 |
| 两套主题 | 通过 | 全用语义 token，深浅两主题自动跟随 |
| 可点元素 hover / 触控 44px | 不适用 | 占位是纯文字（`display:block` 的 span），不是交互控件 |
| `MarkdownContent` 新增 `components` prop | 通过 | 不传时行为不变（react-markdown 的 `components` 缺省即默认渲染），旧调用方零影响 |
| `img` 换带 `onError` 的版本 | 通过 | 失败才占位，不预先发探测请求；占位是纯文字无链接（F3 定的） |

## 跑过的命令与原始输出

```bash
cd web && npm run build
# ✓ 298 modules transformed.  dist/assets/index-C28sZv8a.js 475.83 kB  —— 通过

grep -n "transition\|animation\|@keyframes" src/styles.css
# 无输出 —— 零动画达标

grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" src/styles.css
# 命中行全部位于两个 :root token 定义块（8–39 行浅色 / 45–66 行深色），组件规则内零裸色值
```

## 未做项与原因

- **窄屏与键盘自查**（skill §4-⑤）：`.md-img-missing` 是流内块级纯文字，宽度自适应容器、无固定高度，不存在触控目标问题；不做额外 720/480/375 截图（§9.1 不调视觉模型）。
- **未做对比度脚本复算**（skill §4-④）：本次没改任何色值，只用了既有 `--muted`（浅色 7.37:1 / 深色 7.24:1，2026-09-27 已算过）与 `--border`（仅虚线框，非文字）——新增的组合沿用既有达标配对，无新配对需核算。
- **页面最终效果**：按 §9 由使用者刷新浏览器确认（需先 `docker compose up -d --build web`，属板块④）。
