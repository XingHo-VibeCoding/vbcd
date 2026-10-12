# Token 表（buddy v0.2.0）

真值：`web/DESIGN.md` + `web/src/styles.css` 顶部 `@theme`。
新增 token 必须先更新 `web/DESIGN.md`，再更新本文件。

## 1. 颜色（亮/暗成对，强制）

| 语义 | 类 | 亮 | 暗 |
|---|---|---|---|
| 页面底色 | `bg-slate-50` / `dark:bg-slate-950` | `#f8fafc` | `#020618` |
| 正文 | `text-slate-900` / `dark:text-slate-100` | `#0f172b` | `#f1f5f9` |
| 次级 | `text-slate-500` / `dark:text-slate-400` | `#62748e` | `#90a1b9` |
| 玻璃卡底 | `site-glass-card` | rgba(255,255,255,.25) | rgba(29,41,61,.5) |
| 玻璃描边 | `border-white/40` / `dark:border-white/10` | — | — |
| 实心描边 | `border-slate-200` / `dark:border-slate-700` | `#e2e8f0` | `#314158` |
| 导航玻璃底 | `bg-white/40` / `dark:bg-slate-900/50` | — | — |

## 2. 强调色（@theme 自定义）

| 语义 | 类 | hex | 用途 |
|---|---|---|---|
| 主色 | `bg-brand` `text-brand` | `#615fff` | 主按钮、激活 |
| 主色 hover | `hover:bg-brand-hover` | `#4f39f6` | — |
| 主色淡底 | `bg-brand-soft` | `#eef2ff` | 列表行悬停 |
| 暗色强调字 | `dark:text-brand-dark-text` | `#7c86ff` | 暗色链接/强调 |
| 品牌硬编码 | — | `#6366f1` | 仅全局滑块/滚动条/accent-color |
| 创意 | `bg-creative` | `#f6339a` | 创意操作 |
| 成功 | `bg-success` | `#00bc7d` | — |
| 警示 | `bg-warning` | `#fe9a00` | — |
| 信息 | `bg-info` | `#2b7fff` | — |
| 错误 | `bg-danger` / `hover:bg-danger-hover` | `#fb2c36` / `#e7000b` | — |
| 焦点环 | `ring-brand/50` | — | 表单 focus |

## 3. 字体

| 变量 | 值 | 用途 |
|---|---|---|
| `--font-serif` | Noto Serif SC … | body 默认正文 |
| `--font-sans` | Geist + 系统栈 | UI/表单/列表 |
| `--font-mono` | Geist Mono … | 代码、等宽 |

字号：Tailwind 档；徽章可 `text-[10px]`；**正文 ≥14px**。
字重：标题 `font-black`(900)；正文 400；不写 500。

## 4. 圆角 / 阴影 / 模糊

| 项 | 类 | px |
|---|---|---|
| 卡片/按钮 | `rounded-2xl` | 16（主流） |
| 大卡 | `rounded-3xl` | 24 |
| 胶囊/徽章 | `rounded-full` | — |
| 禁止 | `rounded-none` | — |

阴影：`--shadow-card` 主卡 / `--shadow-card-hover` 悬停 / `shadow-brand-glow` 主按钮光晕。
模糊：`--blur-glass: 24px`；兜底 `will-change: backdrop-filter` 已在 styles.css。

## 5. z 轴白名单

`-9 -8 -7 -1 0 10 20 30 40 50 60 65 70`（L0 背景 / L1 内容 / L3 悬浮 50 / L4 遮罩 65 / L5 模态 70）

主页基线：主卡统一 `site-glass-card`（24px 圆角）；内层 rounded-xl（12px）。浅色背景使用图片轮播，深色保留图轮播。完整间距、字体及布局尺度见 `web/DESIGN.md` §11。

浅色修订以 DESIGN §13 为准：主站卡片浅白 25% / 模糊 12px，深色 50% / 24px，使用 --site-glass-blur。
