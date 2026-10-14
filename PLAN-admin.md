# PLAN-admin —— buddy 站长控制台（后台）设计

> 本文档是「给 buddy 建后台」的设计定稿，由 grilling 讨论收敛而来。
> 仅作设计依据，落地按板块逐步执行；新增/变更需先改本文档再动手。

> **实现状态（2026-10-14 批注）**：本文设计**已基本落地**，以下为与实现的差异，阅读 §4/§5 时请以本批注为准。
> - **板块①–⑤ 全部完成**：`/admin` 路由 + `AdminApp`（`web/src/App.jsx` 已挂 `/admin/*`，lazy 加载）；`web/src/admin/pages/` 现有 **7 个页面**——`Dashboard` / `TaskList` / `AgentRuns` / `AgentTools` / `NoteBrowse` / `SiteSettings` / `EnvManager`。
> - **板块⑥ 完成**：`PATCH /api/notes/:id` 与 `DELETE /api/notes/:id` **均已实现**（`server/src/routes/notes.js`），非 §4/§5 所写的「新接口/待做」。
> - **第二期（配置管理）也已落地**：`GET/PATCH /api/admin/settings`、`GET /api/admin/env` 均已实现。
> - **接口差异**：§5 提到的 `GET /api/admin/services` **未单独实现**（已并入 `GET /api/admin/overview` 的 `services[]`）。实际 `/api/admin/*` 端点为 4 个：`overview` / `env` / `settings`(GET) / `settings`(PATCH)，已录入 `SPEC.md` §3.0.2。
> - **§4 标题措辞**：文中「第一期」指「只读运维台 + 资料浏览」这一阶段划法，与 `PRD.md` 的「第 1 期（本期 MVP）」**不是同一概念**，勿混。

## 0. 背景与结论速览

- **定位**：buddy 的站长控制台 = 运维台（Admin）+ 资料/资产管理（部分 CMS）。不是通用 CMS——Obsidian 才是内容的主编辑入口，网站/后台是 `data/` 的合法写者之一。
- **形态**：Refine 嵌入现有 `web/`（React 19 + Vite 8）的 `/admin` 路径，与主站同栈同仓。**不**新建前端项目、**不**引入独立后台服务。
- **部署**：`xxx.com/admin` 路径部署；`admin.xxx.com` 二级域名**留作未来项**。
- **第一期**：只读运维台 + 资料浏览起步，按板块推进到「资料编辑/删除」。

## 1. 已确认的架构事实（讨论的锚点）

| 事实 | 含义 |
|---|---|
| `data/` = **云端共享内容库**（服务器上的真本） | Obsidian 通过远程插件连它；网站在服务器上读写的就是真本 |
| `data/` 的写者 = **Obsidian + 网站** | 网站本就写 `data/`（`POST /api/notes`、任务自动归档），不是"Obsidian 独占、网站只读" |
| 网站已有写入口 | 主站新建 note、F13/F14 任务归档——网站是合法写者 |
| 响应契约 `{ ok:true, data }` / `{ ok:false, error:{code,message} }` | Refine 需一个 dataProvider 适配层统一翻译 |
| 鉴权 `requireAuth` + `AUTH_ENABLED` 开关 | 公开模式下中间件直通，API 实际裸露；后台须自行控制暴露面 |

## 2. 需求全景（讨论中收敛的清单）

```
Admin（运维）              第一期
  · 服务健康（server/asr/pg/chroma 四盏灯）
  · 任务队列：列表 + 重试 + 僵死恢复状态
  · agent runs 审计 + 工具清单（只读）+ 待确认操作
  · 资料浏览：搜索/分类/详情（先只读）

资料管理（CMS 的一部分）    第一期后段
  · 资料编辑 + 删除（比主站深的权限）

站点设置 + 资产           第二期
  · 通用上传 POST /api/uploads → data/images/
  · 图片资产列表（Refine 网格）
  · 站点设置：头像 / 主站背景 → data/site.json
  · 卡片：独立内容类型（标题+图+文，类 flomo/Notion gallery）→ data/cards/

配置管理（分层）          第二期
  · data/site.json：业务配置（LLM model/base_url、头像、背景、限额）— 网页可改、热生效、容器可达
  · .env 只读总览：基础设施秘密（DB/密钥/AUTH）— 网页只显状态，不编辑
  · 已弃：网页直接改 .env（容器不可达 + 密钥过 HTTP + 需重建，非规范）

Agent 治理               第二/三期
  · 工具清单只读（第一期已含）
  · 工具启停开关（改 registry，中期）
  · 工具/提示词运行时可编辑（远期，独立工程）

未来项
  · admin.xxx.com 二级域名部署（隔离/白名单价值）
  · 完整 CMS（note 全量编辑流，取决于与 Obsidian 的分工演化）
```

## 3. 关键设计决策（已拍板）

| # | 决策 | 结论 | 理由/代价 |
|---|---|---|---|
| D1 | 框架 | **Refine**（嵌 `web/`） | 与 React 19 + Vite 8 同栈；dataProvider 一次适配后资源页近免费；比 AdminJS 更贴合长期演进 |
| D2 | UI 库 | **Ant Design**，仅 `/admin` 路由内 | 后台需信息密度与成套控件；lazy chunk 隔离，不污染主站手写 CSS；bundle +~1MB 可接受 |
| D3 | 部署 | `xxx.com/admin` **路径**部署 | 零新增运维面；二级域名留未来（价值在隔离/白名单，非好看） |
| D4 | 鉴权 | 后台要求 `AUTH_ENABLED=1` 且登录 | 单人系统，登录者即管理员；公开模式下后台入口提示未启用 |
| D5 | `data/` 写者分工 | 按**目录**划主写权 | `data/notes`：网站现有写（新建/归档）→后台扩展编辑/删除；`data/images|cards|site.json`：未来网站主写；Obsidian 全域可读可写，其余笔记目录以 Obsidian 为主 |
| D6 | 资料管理深度 | 后台可**编辑 + 删除** note（比主站深） | 后台是管理入口，权限高于主站合理；需新 PATCH/DELETE 接口 |
| D7 | 编辑冲突策略 | **A：网站改动直接覆盖**，Obsidian 靠远程同步刷新 | 最简单；风险是 Obsidian 未保存编辑可能被同步覆盖——接受，单人使用可控 |
| D8 | 卡片类型 | **独立内容类型**（非图片附件） | 第二期工程：`data/cards/`，标题+图+文 |
| D9 | 第一期写操作 | 仅安全触发：任务重试 / KB reindex / agent 确认 | 零新数据语义；编辑/删除放板块⑥ |
| D10 | 配置管理 | **分层**：`.env` 管基础设施秘密（网页只读状态，不编辑）；`data/site.json` 管业务配置（网页可改、热生效） | 更规范：密钥不过 HTTP、业务配置容器可达（data/ 已挂载）、免重建；修正早期"网页改 .env"方向 |

## 4. 第一期板块切分（一次一步，当天出成果）

| 板块 | 内容 | 改动点 | 当天可见产出 |
|---|---|---|---|
| ① 骨架 | 装 `@refinedev/core` `@refinedev/antd` `antd` 等；`/admin` 路由 + `AdminLayout`（侧边栏）；dataProvider 适配层 | `web/package.json`、`web/src/App.jsx`、新增 `web/src/admin/` | `/admin` 打开空后台布局 |
| ② 仪表盘 | 新增 `GET /api/admin/overview`（聚合服务健康+计数+最近任务） | `server/src/routes/`、`web/src/admin/` 仪表盘页 | 首页四服务灯 + 计数 |
| ③ 任务 | 任务列表（Refine list）+ 重试按钮（复用 `PATCH /api/tasks/:id`） | `web/src/admin/tasks` | 能看任务、点重试 |
| ④ agent | runs 审计表 + tools 清单（只读） | `web/src/admin/agent` | 两页只读表 |
| ⑤ 资料浏览 | 资料 list + 搜索/分类 + 详情 + 新建入口 | `web/src/admin/notes` | 能浏览/搜资料 |
| ⑥ 资料写 | `PATCH /api/notes/:id` + `DELETE /api/notes/:id`（新接口）+ 后台编辑/删除 UI + 冲突策略 A | `server/src/routes/notes.js` + `web/src/admin/notes` | 后台能改/删资料 |

## 5. 接口契约（第一期）

复用现有：`GET /api/tasks`、`PATCH /api/tasks/:id`、`GET /api/agent/runs`、`GET /api/agent/tools`、`GET /api/notes`、`GET /api/notes/:id`、`POST /api/kb/index`。

新增（第一期）：
- `GET /api/admin/overview` → `{ ok, data:{ services:[{name,ok,latencyMs}], counts:{notes,tasks,runs}, recentTasks:[...] } }`
- `GET /api/admin/services`（或并入 overview）
- `PATCH /api/notes/:id`（板块⑥，`{title?,content?,tags?,category?}` → 覆盖写文件，策略 A）
- `DELETE /api/notes/:id`（板块⑥，物理删文件 + 处理 `.index.json` 缓存）

新增（第二期 · 配置管理，分层）：
- `GET /api/admin/settings` → 读 `data/site.json` 业务配置（LLM/站点/限额），网页可改
- `PATCH /api/admin/settings` → 写 `data/site.json`（原子写），热生效（进程内缓存失效）
- `GET /api/admin/env` → .env **只读总览**：各键 `{set, sensitive, preview?}`，永不回显明文、不提供 PATCH
- 读取优先级：`data/site.json` > `process.env` > 默认值（site.json 可覆盖业务配置，密钥仍只走 env）

dataProvider 适配层职责：
- 请求路径映射 Refine 资源 → `/api/*`
- 响应 `{ok,data}` → Refine `{data,total}`
- 错误 `{ok:false,error.code}` → Refine HttpError，统一中文提示

## 6. 验证方式（每板块）

- 板块①：`npm run build` 过、`/admin` 打开侧边栏空壳
- 板块②：`curl /api/admin/overview` 返回聚合结构；仪表盘渲染四服务状态
- 板块③：列表出任务、点重试状态翻转（`failed→doing`）
- 板块④：runs 表出行、tools 列出 4+ 工具
- 板块⑤：搜索命中、详情跳转主站一致
- 板块⑥：PATCH 后文件内容变、`GET /api/notes/:id` 读回新值；DELETE 后列表消失、文件物理删除

## 7. 未决与遗留（动工前须看）

- **板块⑥前置**：冲突策略已定 A（直接覆盖），但需在 UI 提示"Obsidian 未保存编辑可能被覆盖"
- `?limit` 上限 500 的资料，超量需游标分页（存量已知债）
- 公开模式下 API 裸露是**存量风险**，后台上线不放大它，但建议后续给 `/api/*` 加整体鉴权或只读降级
- 第二期依赖：`/api/uploads`、`/api/images`、`data/site.json`、`data/cards/` 均未建
- **配置分层边界**：`.env` 只读总览（`GET /api/admin/env`，敏感键只显 `set+preview`，**不提供 PATCH**——网页不碰密钥）；业务配置走 `data/site.json`（`GET/PATCH /api/admin/settings`，热生效）。已修正原"网页改 .env"方向——容器内够不到宿主机 .env、密钥过 HTTP 是红线、改 env 需重建，三者都违背规范。`data/` 已绑定挂载进容器，天然可达

## 8. 提交纪律（AGENTS.md §9.4）

- 每个板块一次原子提交，格式 `[ BIRD ] | 中文说明`
- 文档类产出先五维自检：内部一致性 / 验收可复现 / 范围一致 / 与上游文档一致 / 术语前提定义
- 密钥、`.env` 不进库
