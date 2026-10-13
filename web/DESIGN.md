# DESIGN — buddy 主站设计系统（v0.2.0 · 2026-10-12）

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
| 玻璃卡底 | `site-glass-card`（浅白 40% / 深 slate-800 50%） | — | — |
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
| 玻璃模糊 | `--blur-glass: 24px` | 卡片/导航 |

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

## 11. 主页参数基线（后续页面必须复用）

视觉方向：buddy 的个人工作台；浅粉彩底、圆润玻璃卡、靛紫操作色。
主页特色是同排等高、上下宽窄反向的卡片结构；其他页面按内容布局，不照搬主页网格。

| 参数 | 固定值与使用范围 |
|---|---|
| 背景色板 | 樱花粉 #fdf2f8 → 浅玫瑰 #fff1f2 → 淡靛紫 #eef2ff；靛紫主色 #615fff、悬停 #4f39f6、暗色强调 #7c86ff |
| 浅色背景 | `background.light.type=gradient`；右下方向渐变，浅色 veil 白色 25% |
| 深色背景 | 图片轮播，6000ms 间隔、1000ms 淡入淡出；veil slate-950 50% |
| 主卡配方 | `site-glass-card`：浅白 40% / 深 slate-800 50%，描边浅白 40% / 深白 10%，1px 边框，24px 圆角，24px 模糊 |
| 阴影 | `--shadow-card` 默认 / `--shadow-card-hover` 悬停；300ms，仅阴影过渡；减少动态时关闭 |
| 内层面板 | 圆角 12px（rounded-xl），浅白 40% / 深白 5%；不再叠重阴影 |
| 导航 | 桌面浅白 40% / 深 slate-900 50%；移动浅白 55% / 深 slate-900 55%；24px 模糊 |
| 字体角色 | 中文正文/标题 Noto Serif SC；控件、数字及辅助数据 Geist；代码 Geist Mono |
| 字号尺度 | 页面标题 28px；个人/区块大标题 20px；卡片标题 14px；正文 14–16px；辅助信息 12px；徽章 10–11px（不用于正文） |
| 字重与行距 | 标题 900，正文 400；正文行距 1.625，紧凑标题 1.375；控件按强调程度 600/700 |
| 布局尺度 | 外壳 90%、最大 1152px；内容横向 padding 16/24/40px（默认/sm/lg）；主卡 padding 16px，轮播容器可 12px；卡间距 16px |
| 主页比例 | 第一行 1.25fr/.75fr，第二行 .75fr/1.25fr，底部 1.5fr/.5fr；同排等高，内容决定高度 |
| 小屏 | 768px 以下单列，底部导航；长文字允许换行，输入字号至少 16px |

实现入口：颜色、圆角、阴影、模糊来自 `styles.css`；主卡统一使用 `site-glass-card`。
已有旧页逐页迁移，不全局改写旧 `--accent/--surface`，避免未迁移页面突然变色。
新增主站页面不得另造玻璃透明度、品牌色或阴影；例外应先记录用途与理由。
语义状态色继续按第 3 节使用，不把装饰渐变当作成功/失败提示。

验收：深浅两态、手机单列、键盘焦点、长标题及空状态；玻璃上的文字对比度随背景变化，不能只用固定色板宣称已达标。
当前背景配置以本节为准：第 9 节单 `src` 示例仍受支持，轮播使用 `images` 数组及 `background.interval`。

## 12. 档案页（2026-10-12 定稿）

- `/notes`：统一宽玻璃工具卡，标题与归档操作、来源切换、搜索筛选依次排列；云端搜索也在该工具卡内。
- 资料网格 ≥768px 两列，小屏单列；同排等高，长标题两行、摘要三行，标签换行。
- 资料标题 18px/900、摘要 14px/1.625、日期标签 12px；本地分类使用中文名称。
- 卡片复用主页玻璃参数；静态云端条目不增加点击或悬停反馈，可进入的资料保留链接。
- 目录模式为宽玻璃面板；资料总量独立显示，索引信息默认折叠。
- 来源与视图切换、搜索筛选、面包屑、重试、加载更多及归档入口保留现有行为。
- 样式限定 `.archive-page`，不迁移其他页面或后台；焦点可见、触控控件 ≥44px，搜索输入 16px。

## 13. 浅色视觉修订（2026-10-12，覆盖前文浅色基线）

使用者确认恢复浅色 c1/c2/g3 图片轮播：6000ms 间隔，1000ms 淡入淡出，白色 veil 25%。
全主站卡片采用轻磨砂：浅白 25%，模糊 12px；深色仍为 slate-800 50%、24px 模糊。
透明度与模糊由 `--site-glass-bg` / `--site-glass-blur` 控制，布局、字体与圆角保留。
旧页卡片通过 `.site-main` 限定的浅色覆盖继承该配方；后台路由不加该标记。

## 14. 资料详情阅读基线（2026-10-12）

本地资料与云端笔记统一阅读卡：外卡最大 880px，正文区域最大 720px；小屏内边距 16px，桌面外卡 32px、正文 24px。
外层继承主站轻磨砂；正文浅白 65% / 深 slate-900 80% 底，减弱图片轮播干扰。
页面标题 28px（小屏 24px）/900，正文 16px/1.8；Markdown h1/h2/h3 为 24/20/18px，代码 14px Geist Mono。
分类、日期、标签与来源常显；创建、更新、路径默认折叠在「资料信息」，路径复制行为保留。
图片限宽，宽表格独立横向滚动且可键盘聚焦；代码块内部滚动；样式限定 `.reading-card`，录入预览不变。
底部保留返回与本地删除确认入口；云端保持只读及图片失效占位。

档案分类筛选补充：使用自定义圆润菜单替代原生 select 弹层；浅色白底、深色 slate-800，16px 圆角、品牌色选中态与勾选标记。
菜单使用清晰底色保证文字可读；支持方向键、Home/End、Escape、点击外部关闭，保留四个分类值。工具卡 z-20、菜单局部 z-30，低于导航 z-50。

分类弹层尺寸修订：宽度为触发按钮的 100%，外圆角 12px、内边距 4px、选项圆角 8px及最小高度 44px，左右边界对齐。

目录模式修订：主行固定 52px，图标/标题/日期/信息列为 20px/minmax(0,1fr)/100px/44px，标题单行按宽度省略。
文件名和标签移至 z-40 详情浮层，显示完整标题、文件名、日期、全部标签及最多三行摘要；悬停延迟 300ms，键盘聚焦或手机信息按钮也可查看，Escape/外部点击关闭。
浮层宽度最多 360px，按视口定位、必要时向上展开，长内容内部滚动；移动端隐藏日期列。分组与排序保持原逻辑。

## 15. 日志页（2026-10-12 定稿）

任务处理优先：顶部标题/任务与确认留痕页签/新建入口；需确认、失败、进行中三项概览，点击筛选。
沿用现有任务接口一次加载任务，再在前端筛选，概览计数仅表示已加载任务；加载或错误时不显示假零。
新建表单页面内展开，提交成功收起；任务类型为分段按钮，资料分类保持现有选择。
单列轻磨砂记录卡保留接口顺序；标题最多两行、状态与操作常显；结果/确认摘要默认两行，实际溢出才出现展开按钮。
新建、状态推进、去确认与查看确认入口行为不变；使用主站品牌色、字体、圆角与模糊参数，样式限定 `.log-page`。

## 16. 个人页（/about · 自我介绍）

以配置的 nickname / bio / github 为唯一个人内容来源，不展示示例式占位介绍；bio 缺省时明确提示尚未填写，不编造个人经历。
顶部横幅高度取首屏的 40vh（桌面限制 240–400px，手机限制 180–300px），以 `site.cover.default` 为图源；未配置时使用现有 `/images/bg-l1.jpg`，图片加载失败回退为浅粉/靛紫渐变。图片铺满横幅，深色主题叠轻遮罩；个人身份卡展示头像、昵称、英文识别字与页签，外卡及资料面板沿用主站轻磨砂。
正文桌面为简介主栏 + GitHub 入口侧栏，窄屏堆叠；Noto Serif SC 承担姓名与简介，Geist 用于辅助标签与链接。研究动态页签的热力图、时间线及 API 行为保持不变。


主页项目主卡图片测试：项目轮播以整图铺底，叠加左下深、右上透明的斜向渐变，保证标题可读且图像主体保持清晰；测试图取现有 `/images/bg-l1.jpg`，仅配置于 buddy 项目项。


## 17. 背景氛围动效（2026-10-12）

在现有背景图片上先叠静态 veil，再叠主题氛围层，均位于页面内容下方：浅色为 3 片青/粉/靛柔光，深色为桌面最多 16、手机最多 6 个萤火点。
柔光固定模糊半径，只动画 transform/opacity；萤火点固定小面积阴影，只动画 transform/opacity；不模糊背景原图、不使用 Canvas、不新增图片请求。
页面进入 admin 或 agent 路由不渲染动态氛围；`prefers-reduced-motion` 或标签页隐藏时暂停动画并保留静态低强度效果；图层 `pointer-events:none`，不挡导航与卡片。
尺寸修订：水光桌面宽 70vw、高 56vw（上限 1100×880px），手机宽 86vw、高 70vw；萤火虫直径 9–13px，并扩大光晕。元素数量与周期不变，大面积模糊可能增加 GPU 开销，需在移动设备实看帧率。
亮度修订：水光位于 veil 上方，运动透明度 0.28–0.48，静态 0.38；萤火虫呼吸透明度 0.38–1，静态 0.8，内外光晕分别为 18px/38px。调整入口：`web/src/styles.css` 的 `.waterlight*`、`@keyframes waterlight-drift`、`.firefly` 和 `@keyframes firefly-breathe`；底图遮罩位于 `web/src/App.jsx` 的 `BackgroundLayer`，调整遮罩会同时影响底图亮度。
