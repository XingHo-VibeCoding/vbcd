# DESIGN — buddy 主站设计系统（v0.1.0 · 2026-10-11）

> 本文档是 buddy 主站前端的**设计真值**（Single Source of Truth）。
> 规则来源：XHBlogs 毛玻璃配方（`XinghuisamaBlogs/DESIGN.md` v0.3.2）移植 + 本项目拍板。
> 冲突时的优先级：**本文档 > 既有同类实现 > 通用原则**。任何新 token / 新色值 / 新 z 值必须先落档再使用。
> buddy 的 `/admin` 后台（Refine + AntD）**不归本文件管**，那是另一套体系。

## 0. 技术栈与边界

| 项 | 值 |
|---|---|
| 框架 | React 19 + Vite 8 + **Tailwind CSS v4**（`@tailwindcss/vite`） |
| 样式入口 | `web/src/styles.css`（顶部 `@theme` = 新 token 真值；下方旧规则迁移期共存） |
| 主题 | 浅/深二态：`<html data-theme>` 管旧 token，`<html class="dark">` 管 Tailwind `dark:`（双写同步） |
| 字体 | Google Fonts：Noto Serif SC（正文）/ Geist（拉丁兜底）/ Geist Mono（代码） |
| 不管 | `/admin/**`（Refine+AntD）、`src/agent/**`（assistant-ui 自带样式）、`server/`、`asr/` |
| 审计排除 | `audit-frontend.sh` 收集文件时已排除 `src/admin/` 与 `src/agent/` |

## 1. 决策记录（grilling 拍板）

| # | 决策 | 结论 | 日期 |
|---|---|---|---|
| Q1 | 实现路径 | Tailwind v4 原子类逐字复刻 XHBlogs | 2026-10-11 |
| Q2 | 图片 | 全套：背景+头像+资料图+`site.json`（只读渲染） | 2026-10-11 |
| Q3 | L0 背景 | 渐变兜底 + site.json 可配图（深浅各一槽） | 2026-10-11 |
| Q4 | 节奏 | 第一刀含全局（Tailwind+背景+导航+主页） | 2026-10-11 |
| Q5 | 字体 | Noto Serif SC 正文 + Geist 兜底 + 标题 900 | 2026-10-11 |
| Q6 | 导航 | 沿用 5 项（主页/档案/日志/agent/关于） | 2026-10-11 |
| Q7 | 移动导航 | 底部玻璃 tab bar | 2026-10-11 |
| Q8 | site.json | 含社交链接/封面默认图/强调色 | 2026-10-11 |
| Q9 | 第一刀 | 视觉+卡片布局一起改，先 mockup | 2026-10-11 |
| Q10 | site/profile | 分层：site.json 管站点，profile.md 管人 | 2026-10-11 |
| Q11 | 本文件 | 放 `web/DESIGN.md` | 2026-10-11 |
| Q13 | 审计基线 | 迁移完再 `--init-baseline` | 2026-10-11 |

## 2. 页面层级（五层 Z 轴）

任何新层**先归位再写 `z-*`**，白名单外取值判违规。

| 层 | 职责 | z 值 |
|---|---|---|
| L0 背景 | 渐变/底图（`fixed inset-0`） | `z-[-9]` ~ `z-[-1]` |
| L1 内容 | 页面主体 | `relative z-10` |
| L2 卡片 | 玻璃卡（靠 DOM 序，不写 z） | 无 / 局部 `z-10` |
| L3 悬浮 | 桌面顶栏、移动 tab bar | `z-50` |
| L4 遮罩 | 菜单/弹窗遮罩 | `z-[65]` |
| L5 模态 | 对话框、Toast | `z-[70]` |

**合法 z 白名单**：`-9 -8 -7 -1 0 10 20 30 40 50 60 65 70`

## 3. 颜色（亮/暗成对）

| 语义 | Tailwind 类 | 亮 | 暗 |
|---|---|---|---|
| 页面底色 | `bg-slate-50` / `dark:bg-slate-950` | `#f8fafc` | `#020618` |
| 正文 | `text-slate-900` / `dark:text-slate-100` | `#0f172b` | `#f1f5f9` |
| 次级 | `text-slate-500` / `dark:text-slate-400` | `#62748e` | `#90a1b9` |
| 玻璃卡底 | `bg-white/50` / `dark:bg-slate-800/50` | — | — |
| 玻璃描边 | `border-white/40` / `dark:border-white/10` | — | — |
| 实心描边 | `border-slate-200` / `dark:border-slate-700` | `#e2e8f0` | `#314158` |
| 导航玻璃底 | `bg-white/40` / `dark:bg-slate-900/50` | — | — |

**强调色**（自定义 token，见 `@theme`）：

| 语义 | 类 | hex |
|---|---|---|
| 主色 | `bg-brand` `text-brand` | `#615fff` |
| 主色 hover | `hover:bg-brand-hover` | `#4f39f6` |
| 主色淡底 | `bg-brand-soft` | `#eef2ff` |
| 暗色强调字 | `dark:text-brand-dark-text` | `#7c86ff` |
| 品牌硬编码 | `#6366f1` | 仅全局滑块/滚动条/accent-color |
| 创意 | `bg-creative` | `#f6339a` |
| 成功 | `bg-success` | `#00bc7d` |
| 警示 | `bg-warning` | `#fe9a00` |
| 信息 | `bg-info` | `#2b7fff` |
| 错误 | `bg-danger` / `hover:bg-danger-hover` | `#fb2c36` / `#e7000b` |

**对比度口径**（沿用 frontend-rules skill）：正文/次要/徽章/按钮/禁用 ≥ 4.5:1；UI 边界线 ≥ 3:1；两套主题都算。

## 4. 字体

| 变量 | 值 | 用途 |
|---|---|---|
| `--font-serif` | Noto Serif SC … | **`body` 默认**（正文衬线） |
| `--font-sans` | Geist + 系统栈 | UI/表单/列表兜底 |
| `--font-mono` | Geist Mono … | 代码、等宽标签 |

**字号层级**：沿用 Tailwind 档；徽章/角标可放宽到 `text-[10px]`（Q5 解禁原 13px 下限的徽章场景）；**正文 ≥14px**（`text-sm`）。

**字重**：标题 `font-black`(900) + `tracking-[-0.02em]`；正文 400；微标签 `font-black tracking-widest`。微软雅黑无 900/500——标题 900 靠 Noto Serif SC 提供。

## 5. 圆角

`rounded-2xl` 16px 主流 / `rounded-3xl` 24px 大卡 / `rounded-full` 胶囊徽章。**禁用 `rounded-none`**。

## 6. 间距

4px 基准；常用 `p-4/p-6/gap-4/gap-6`；容器 `w-[90%] max-w-6xl mx-auto`。

## 7. 阴影与模糊

| 层 | 类 | 场景 |
|---|---|---|
| 主卡 | `shadow-lg` | 玻璃卡/主按钮 |
| 悬停 | `shadow-xl` | hover 抬升 |
| 主按钮光晕 | `shadow-brand-glow` | indigo 主按钮 |
| 玻璃模糊 | `backdrop-blur-xl` 默认 | 卡片/导航 |

**交互态四件套必备**：`hover` / `active:scale-95` / `disabled:opacity-50` / `focus:ring-2 ring-brand/50`（Q5 解禁动画后恢复）。

## 8. 断点与移动端

移动优先；断点 `sm:640 / md:768 / lg:1024 / xl:1280`。
**<768px**：桌面顶栏 `hidden`，改为**底部玻璃 tab bar**（`fixed bottom-0 z-50 bg-white/40 backdrop-blur-xl border-t`）。
触控目标 ≥44px；输入框 ≥16px 字号（防 iOS 缩放）。

## 9. 图片与站点配置

`data/site.json`（本期只读渲染）：

```json
{
  "site": { "title": "buddy", "subtitle": "…" },
  "profile": { "nickname": "…", "avatar": "…", "bio": "…" },
  "background": {
    "light": { "type": "gradient"|"image", "src": "…" },
    "dark":  { "type": "gradient"|"image", "src": "…" }
  },
  "social": [{ "label": "…", "url": "…" }],
  "cover": { "default": "…" },
  "accent": { "primary": "#615fff" }
}
```

- L0 背景：`type=gradient` 用内置渐变兜底；`type=image` 时 `src` 生效（深浅各一槽）。
- `profile` 与 `data/profile.md` 分层（Q10）：profile.md 继续管人，site.json 管站点视觉。
- 图片资产约定存 `data/images/`；上传接口 + admin 编辑归 PLAN-admin（本期不做）。

## 10. 迁移边界

- 旧 `styles.css` 的 `:root` token 与组件规则为**旧体系**，逐页迁移后删除；迁移期两套并存。
- 每个页面迁移完成后从「待迁移清单」划掉；全部完成 → 删旧规则 → `audit-frontend.sh --init-baseline` 采基线。
