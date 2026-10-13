# Token 表（buddy v0.3.0 · 2026-10-13）

真值：`web/DESIGN.md` + `web/src/styles.css` 顶部 `@theme`。
新增 token 必须先更新 `web/DESIGN.md`，再更新本文件。
适用范围：除 admin 外全部前端界面，包括 Agent；实施路线与并行修改边界见 DESIGN §18。以下为已确认标准，不代表页面已全部迁移。

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

字号按 DESIGN §4 的角色表（桌面 ≥768px / 手机 <768px）：

| 角色 | 桌面 | 手机 |
|---|---:|---:|
| 页面主标题 | 28px | 24px |
| 区块标题 | 20px | 18px |
| 内容卡标题 | 18px | 16px |
| 紧凑模块标题 | 14px | 14px |
| 常规正文 | 14px | 14px |
| 长文／Agent 消息 | 16px | 16px |
| 辅助信息 | 12px | 12px |
| 小徽标 | 11px | 11px |
| 输入文字 | 16px | 16px |

字重：标题 `font-black`(900)，正文 400，控件按强调程度 600/700。正文行距 1.625，紧凑标题 1.375，长文 1.8。Markdown 标题和代码按 DESIGN §14。

## 4. 圆角 / 阴影 / 模糊

| 项 | 类 | px |
|---|---|---|
| 主卡 | `rounded-3xl` | 24；padding 默认 16，阅读／表单可 24 |
| 内层面板 | `rounded-xl` | 12；padding 12–16 |
| 按钮／输入框 | `rounded-xl` | 12 |
| 胶囊/徽章 | `rounded-full` | — |
| 禁止 | `rounded-none` | — |

阴影：`--shadow-card` 主卡；`--shadow-card-hover` 仅可操作卡片；`shadow-brand-glow` 主按钮光晕。静态卡不新增可点击式反馈，内层不叠重阴影与磨砂。
模糊：卡片使用 `--site-glass-blur`（浅色 12px / 深色 24px）；导航独立使用 `--blur-glass: 24px`。
Agent 消息气泡保留方向性圆角，以 12px 为基础尺度。菜单选项 8px 为嵌套例外。

## 5. z 轴白名单

`-9 -8 -7 -1 0 10 20 30 40 50 60 65 70`（L0 背景 / L1 内容 / L3 悬浮 50 / L4 遮罩 65 / L5 模态 70）

## 6. 布局与控件

- 外框 `w-[90%] max-w-6xl mx-auto`，沿用现有导航对齐基线，不重新调整贴边；阅读／登录／确认页可内部收窄，Agent 保留双栏。
- 主卡 gap 16px，大区块 gap 可 24px，图标文字 gap 8px，标签 gap 4–8px。
- 常规按钮、搜索框与单行输入高 44px；桌面紧凑工具按钮可 36px，手机触控区域至少 44px。
- 按钮文字 14px，输入文字 16px；多行输入、Agent 编辑框与代码区高度按内容处理。
- 卡片内容决定高度；主页同排等高与上下宽窄反向布局保留，不推广为所有页面规则。

背景、阅读面板与个人页封面等内容例外见 DESIGN §11–17；本轮不改变背景与氛围动画。标准更新与逐页落地状态见 DESIGN §18。
