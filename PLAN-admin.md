# PLAN-admin —— buddy 站长控制台规划

> 本文档只规划后台，不定义新的业务真相源。
> 后台必须基于当前 buddy 信息流、实际接口、数据库结构和上游文档建设。
> 本文与代码不一致时，先核对 `server/src/routes/`、`server/src/services/`、数据库迁移和 `SPEC.md`，确认后再回改文档；不得按旧计划继续扩展。

## 0. 当前结论

buddy 的后台不是一组孤立 CRUD 页面，而是当前信息流的 **观察台、控制台和审计台**：

```text
内容输入
  ├─ 主站归档
  ├─ 视频转写
  ├─ 链接整理
  ├─ Agent 归档
  └─ 手工录入
        ↓
任务处理 / 查重 / 归档
        ↓
资料业务层
  ├─ PostgreSQL notes（部署环境主数据）
  └─ Markdown 文件（本地降级路径 / 共享内容边界）
        ├─ 首页聚合
        ├─ 资料查询
        ├─ 知识库索引
        └─ Agent 查询

用户或 Agent 提出规划
        ↓
planning draft
        ↓
冲突检查 / 版本检查
        ↓
确认或拒绝
        ↓
plans + schedules + planning_changes
        ↓
首页 / 规划页 / Agent 查询
```

后台的核心问题不是“还有哪些表没有做 CRUD”，而是：

> **输入有没有被处理？处理结果有没有成为资料？资料有没有进入数据库和知识库？规划有没有经过确认并落库？Agent 的动作有没有留下可追溯记录？**

## 1. 当前已完成

### 1.1 后台基础设施

- React + Vite 内嵌现有 `web/`，入口为 `/admin`。
- Refine + Ant Design，后台 lazy 加载，不影响主站首屏。
- `dataProvider` 复用 `{ ok: true, data }` / `{ ok: false, error }` 契约。
- 后台页面已经注册在 `web/src/admin/AdminApp.jsx`。
- 当前后台页面：
  - `Dashboard`
  - `TaskList`
  - `AgentRuns`
  - `AgentTools`
  - `NoteBrowse`
  - `SiteSettings`
  - `EnvManager`

### 1.2 已落地的后台能力

| 页面 | 当前能力 | 状态 |
|---|---|---|
| `/admin` | 服务探针、资料/任务计数、最近任务 | 已完成，仍需接入新的规划和信息流指标 |
| `/admin/tasks` | 任务列表、状态筛选、失败/需处理重试 | 已完成 |
| `/admin/agent/runs` | LLM/工具调用审计 | 已完成，只读 |
| `/admin/agent/tools` | Agent 工具清单和风险标记 | 已完成，只读 |
| `/admin/notes` | 资料搜索、分类、详情、编辑、删除 | 已完成，但数据源统一性待确认 |
| `/admin/settings` | `data/site.json` 业务配置读写 | 已完成，schema 需与真实配置统一 |
| `/admin/env` | `.env` 脱敏只读总览 | 已完成，只读 |

### 1.3 明确暂不做

- `admin.xxx.com` 二级域名。
- 用户、角色、RBAC。
- 网页直接编辑 `.env` 或密钥。
- Agent prompt 运行时编辑。
- 通用 CMS 工作流、多用户协作、审批系统。
- 图片上传和卡片 CRUD，直到主站图片用途和 `site.json` schema 稳定。

## 2. 数据真相源和写入边界

后台任何页面必须先标明自己读取的真相源，不能自行复制一套状态。

| 对象 | 当前真相源/状态 | 主站消费 | 后台当前消费 | 后台写入边界 |
|---|---|---|---|---|
| 资料 `notes` | 部署环境由 PostgreSQL 主导；无库本地走 Markdown | `/api/home`、`/api/db/notes` 等 | `/api/notes`，存在迁移期双源风险 | 现有编辑/删除需先统一生产数据源 |
| Markdown | `data/` 目录 | Obsidian、文件降级路径 | 详情路径展示 | 不得在未定义同步边界前扩大文件写入 |
| 任务 | runtime task store / `tasks` 表映射 | 日志、任务相关页面 | `/api/tasks` | 只允许合法状态迁移和重试 |
| 规划 | PostgreSQL `plans` / `schedules` | `/api/home`、`/api/planning` | 当前无规划后台页 | 必须走 draft、冲突检查和确认事务 |
| 规划草案 | `planning_drafts` + `confirmations` | 规划确认页、Agent | 当前无后台页 | 批准/拒绝复用现有确认流程 |
| 规划变更 | `planning_changes` | 当前主要用于留痕 | 当前无后台页 | 只读审计 |
| Agent 会话 | `data/.runtime/agent/*.json` | `/agent` 页面 | 当前只看 runs | 不直接编辑会话文件 |
| Agent 审计 | `data/.runtime/agent/runs.jsonl` | Agent 运行过程 | `/api/agent/runs` | 只读 |
| 站点业务配置 | `data/site.json` | `/api/me`、`/api/home`、主站视觉 | `/api/admin/settings` | 白名单结构化写入、原子写 |
| 基础设施秘密 | `.env` / compose 注入 | 服务启动 | `/api/admin/env` 脱敏只读 | 后台不写、不回显 |
| 图片 | `data/images/` | `/images/*` | 当前未管理 | 上传/删除待独立设计 |

## 3. 当前已知偏差

### 3.1 资料数据源偏差

当前首页主要使用 PostgreSQL 资料，而后台资料页仍调用 `/api/notes`。在数据库模式和文件模式之间存在迁移期分叉，必须先明确：

- 生产环境后台资料列表是否切换到数据库读接口。
- 编辑/删除是否同时支持数据库模式。
- Markdown 是主数据、同步副本还是本地降级存储。
- 知识库索引的资料来源是否与首页一致。

在该边界定稿前，不新增后台资料写功能。

### 3.2 仪表盘信息不足

当前 `/api/admin/overview` 主要返回：

- 服务探针
- 资料数量
- 任务数量和状态
- 最近任务

还没有反映：

- 今日计划
- 逾期计划
- 今日安排
- 待确认规划草案
- Agent 待确认会话
- 知识库索引是否落后
- 最近业务活动

### 3.3 规划流尚未进入后台

当前已有：

```text
GET  /api/planning
POST /api/planning/drafts
GET  /api/planning/drafts/:id
PATCH /api/planning/drafts/:id
```

以及数据库表：

```text
plans
schedules
planning_drafts
confirmations
planning_changes
```

但后台没有规划总览、草案审计和变更记录页面。

### 3.4 Agent 页面仍按早期工具清单设计

当前工具已经覆盖两个以上业务域：

```text
资料：search_notes / get_note / archive_note
知识库：ask_kb
规划：get_planning / propose_planning
```

后台工具页后续应按业务域、风险级别、确认状态和调用统计展示，不能只固定显示早期的“4 个工具”。

### 3.5 `site.json` schema 已扩展

实际配置已经包含：

```text
site
background
stats
social
hotspots
projects
cover
accent
```

后台设置页目前还偏向：

```text
llm
site.title / subtitle / avatar / background
limits
```

必须先统一配置模型，再决定是否把背景、热点、项目和社交链接纳入后台表单。

## 4. 后续后台路线

后续不按“再添加一个 CRUD 页面”的方式推进，而按信息流阶段推进。

### 阶段 A：信息流总览

目标：让 `/admin` 能回答“系统当前走到哪一步”。

建议增加的聚合指标：

```text
服务状态
资料总数 / 今日新增资料
任务 todo / doing / failed / attention
今日计划 / 逾期计划 / 待确认草案
Agent 活跃会话 / 待确认动作 / 失败运行
知识库最后索引时间 / 待索引数量
最近业务活动
```

完成标准：仪表盘数据能对应当前 `/api/home`、`/api/planning`、`/api/agent` 和任务数据，不能另造统计口径。

### 阶段 B：内容流管理

建议页面：

```text
/admin/content
/admin/content/tasks
/admin/content/notes
/admin/content/index
```

第一版重点不是增加写操作，而是串起：

```text
任务 → 归档结果 → 资料 → PostgreSQL → 知识库索引
```

需要能查看：

- 任务是否生成资料。
- 资料是否进入数据库。
- 资料是否进入知识库。
- 失败发生在哪一步。
- 是否允许重试。
- 是否发生重复来源或重复内容。

### 阶段 C：规划管理

建议页面：

```text
/admin/planning
/admin/planning/drafts
/admin/planning/changes
```

能力：

- 计划列表、状态、优先级、开始/截止时间。
- 日程列表和时间冲突标记。
- 待确认草案查看、批准、拒绝。
- 草案来源 Agent 会话查看。
- 变更前后数据审计。

硬约束：后台批准或拒绝不得绕过现有 `planning_drafts`、`confirmations` 和事务写入流程。

### 阶段 D：Agent 治理

建议页面：

```text
/admin/agent/sessions
/admin/agent/runs
/admin/agent/tools
/admin/agent/confirmations
```

能力：

- 会话状态和待确认状态。
- 工具按业务域分组。
- 工具调用次数、失败次数和最近调用时间。
- Agent 动作与资料、规划、任务的关联。
- 确认动作的批准、拒绝和执行结果。

工具启停、prompt 编辑暂不进入本阶段，需另行设计运行时配置模型。

### 阶段 E：站点设置和图片资产

先统一 `site.json` schema，再做结构化设置表单。主站与图片管理的已确认设计和现有实现差异见 §9；不能直接把旧 `hotspots/projects` 配置接回首页。

图片后台建议单独使用：

```text
/admin/assets/images
```

第一版只规划：

- 图片列表和预览。
- 文件类型、大小、尺寸、修改时间。
- 复制 URL。
- 引用位置检查。
- 上传和删除保护。

图片实际文件继续放在 `data/images/`，不把二进制放进 PostgreSQL。

### 阶段 F：卡片内容

卡片是独立内容类型，不等同于图片附件：

```text
/admin/cards
```

等待图片资产和站点配置稳定后再设计字段、存储方式和首页消费关系。

## 5. 当前优先级

| 优先级 | 工作项 | 状态 |
|---|---|---|
| P0 | 统一资料真实来源和后台读写边界 | 待定稿 |
| P0 | 后台总览接入规划、确认和索引状态 | 待做 |
| P0 | 规划后台：计划、日程、草案、变更 | 待做 |
| P1 | 内容流管理：任务 → 资料 → 数据库 → 索引 | 待做 |
| P1 | Agent 会话和确认中心 | 待做 |
| P1 | 同步 SPEC / TECH_DESIGN / RUN / AGENTS | 待做 |
| P2 | 统一 `site.json` schema 和设置表单 | 待做 |
| P2 | 图片资产管理 | 只读扫描已完成；上传、删除和引用修改待做 |
| P3 | 卡片管理 | 后置 |
| P3 | Agent 工具启停 | 后置 |
| P4 | Prompt 管理、RBAC、二级域名、异地部署 | 暂不排期 |

## 6. 接口原则

- 接口和字段以 `server/src/routes/`、`server/src/services/`、数据库迁移和 `SPEC.md` 的核对结果为准。
- 后台优先复用现有业务接口，不为同一对象制造第二套读写契约。
- 后台新增聚合接口只能聚合已有业务数据，不改变业务真相源。
- 规划写操作必须复用草案、冲突检查、确认和事务流程。
- Agent 审计和运行状态只读；不得通过后台直接修改会话文件或审计文件。
- `.env` 只读脱敏；业务配置写入 `data/site.json`，使用白名单和原子写。

## 7. 文档同步顺序

本文件只负责后台路线。确认本文件后，再按顺序同步：

1. `SPEC.md`：接口、数据对象、写入和确认契约。
2. `TECH_DESIGN.md`：信息流、数据源、后台 control plane。
3. `RUN.md`：后台访问、部署、验收和排错。
4. `AGENTS.md` 第 4 节：当前已完成和待办状态。

每次同步前执行五维自检：

- 内部一致性。
- 验收可复现性。
- 范围一致性。
- 与上游文档一致性。
- 术语与前提定义。

## 8. 协作与提交纪律

- 遵守 `AGENTS.md` 的“一次一个板块”。
- 其他 agent 正在修改的主站文件不属于本规划板块，不得顺手改动。
- 文档修改前列出文件边界；提交前列出实际改动文件，等待使用者确认。
- 非打卡内部改动使用：`[ BIRD ] | 中文解释提交内容`。
- 密钥、`.env`、数据库连接串和个人资料不得进入代码或提交。

## 9. 主站与图片后台设计记录（2026-10-14）

> 本节记录本轮讨论已确认的设计方向，**不是已实现功能**。本轮明确排除「日程与任务是否合并」；不在此定稿、修改或迁移其数据模型。图片和站点配置的实施仍受 §2 的真相源边界及 §4 的阶段顺序约束。

### 9.1 后台板块与职责

后台一级板块采用：总览、内容流、规划管理、Agent 管理、主站管理、图片资产。主站管理下按站点身份、联系方式、背景、首页卡片、热点五类组织；这只是后台信息架构，**不是已经建好的页面或接口**。

| 板块 | 管理对象 | 边界 |
|---|---|---|
| 站点身份 | 站点名、副标题、个人昵称、头像、简介 | 统一编辑体验，底层暂保留 `site.json` 与 `profile.md` 各自归属 |
| 联系方式 | GitHub、邮箱、个人主页、订阅等 | 链接配置与个人资料字段分清来源，不为统一界面迁移文件 |
| 背景控制 | 浅色/深色图片列表、顺序、轮播间隔、启用及自动轮播 | 图片选择只改引用，不覆盖原图片 |
| 首页卡片 | 卡片内容和配图 | 不与独立内容卡片混为同一业务对象 |
| 热点 | 标签、标题、副标题、图片、链接、排序及显示状态 | 图片与热点内容一同管理，但不自动并入资料流 |
| 图片资产 | 文件清单、预览、自动用途、实际引用、手工标签、上传与删除保护 | 不用图片文件冒充站点配置，也不把图片二进制放数据库 |

### 9.2 图片资源池：已确认

- 图片统一放在 `data/images/`，Web 引用格式为 `/images/<文件名>`；允许同一张图被背景、热点、项目等多处复用。当前本地图片可用于验证，不能把测试等同于允许随意覆盖或删除正式资源。
- **管理范围仅限站点资产**：扫描 `data/site.json` 的站点图片配置和 `data/profile.md` 的头像字段；不扫描、不展示、不标注、不修改、不删除资料笔记 Markdown 正文中的图片，也不管理 Obsidian 笔记附件。`profile.md` 虽是 Markdown 文件，但其中的个人头像字段属于站点身份配置，仍在范围内。
- 图片元数据（类型、大小、尺寸、修改时间）由文件扫描得到；**不新增图片表或独立图片 manifest**。`usage` 可有多个值，按引用自动推导；`references` 是具体引用位置，如 `site.json → background.dark.images[0]`，不能靠手工标签判定是否在用。
- 手工 `tags` 使用「预设标签 + 允许新建」；它仅用于筛选，不决定用途或删除权限。**标签持久化位置尚未拍板**：不新增 manifest 的前提下，曾建议 `site.json.assets`，但尚未得到确认；实现标签编辑前必须先决定存储位置和迁移方式。
- 上传后由服务端生成安全唯一文件名；不持久化原始文件名。现有文件名不因这个规则自动重命名。被任何真实引用使用的图片禁止删除，显示所有引用位置；首版不提供强制删除。
- 落地顺序已确认：**只读扫描 → 修改站点图片引用 → 上传 → 删除**。每阶段单独验证，不一次开放所有写操作。

### 9.3 背景、卡片与站点身份：已确认

- 背景基础控制保留现有 `background.light.images`、`background.dark.images` 和 `interval`（毫秒）；目标模型增加 `enabled` 与 `autoplay`。可选图、调整顺序和间隔；按时间段/设备/页面切换及随机策略不在第一版。新增字段尚未在当前主站实现，不能宣称保存后已经生效。
- 项目与热点**保持两个集合**，图片资源池共用；两类展示字段统一命名为 `id/title/subtitle/tag/image/url/visible/order`，`icon` 为可选字段。现有 `projects.name`、`projects.desc` 到 `title`、`subtitle` 的转换属于待实施迁移，不能让后台直接写新字段而主站继续读旧字段。
- 卡片只存 `/images/...` 引用，不重复存图片尺寸、文件大小、MIME、`usage` 或 `references`。独立知识/灵感卡片仍是后续内容模型，不与首页项目和热点配置自动合并。
- 站点身份和联系方式在后台可以统一呈现，但目前 `site.json` 管站点与社交配置、`profile.md` 管个人昵称/头像/简介/GitHub 字段；不为了后台界面统一而迁移文件。

### 9.4 与当前主站信息流的待对齐点

当前 `GET /api/home` 从 PostgreSQL 档案、规划、GitHub 和站点配置派生首页内容。**热点/项目的现行实现以 §12 为准**：后台通过来源引用选择，热点精选开启时不消费旧手填卡片；关闭时保留此前焦点聚合（含旧站点卡片）作为兼容回退，不把旧手填统计作为业务真相源。

历史边界：`server/src/services/settings.js` 的 PATCH 白名单只覆盖 `llm/site/limits` 的少数字段，不支持 `background/social/hotspots/projects/assets`；站点和个人信息现已通过独立的 `/api/admin/site` 管理，精选写入及读取归属见 §12。这里保留未决项，不伪称后台已经可以控制背景轮播、卡片或联系方式。

### 9.5 长期任务、项目子任务与日程（已记录，暂不实现）

本轮新增需求：长期任务/项目应包含执行任务、任务进度和日程；AI Tool 能查询和规划这些对象，并可根据进度提出日程调整建议。

#### 领域边界

当前不把所有对象合并成一个 `activities` 或统一 `tasks` 模型：

```text
Plan = 长期目标 / 项目容器
ProjectTask = 长期任务内部的可执行子任务
Schedule = 为 Plan 或 ProjectTask 预留的时间安排
SystemTask = 转写、收敛、归档、删除等系统异步处理任务
```

明确区分：

| 对象 | 当前对应 | 作用 | 是否与另一类合并 |
|---|---|---|---|
| 长期任务/项目 | 当前 `plans` | 描述长期目标、优先级、开始/截止时间和总体进度 | 不与系统任务合并 |
| 项目子任务 | **当前尚未建立** | 描述长期项目中的具体执行步骤、进度和依赖 | 建议新增 `project_tasks`，待数据库设计确认 |
| 日程 | 当前 `schedules` | 描述某个时间段的安排 | 保持独立，可关联 `plan_id` 和可选 `task_id` |
| 系统任务 | 当前 runtime task store / `tasks` | 描述转写、收敛、归档、删除等系统处理过程 | 不并入项目子任务 |

#### 目标关系

```text
Plan
  ├─ ProjectTask
  │    ├─ status
  │    ├─ progress
  │    ├─ depends_on
  │    ├─ estimated_minutes
  │    └─ Schedule
  │
  └─ Schedule（可不绑定具体子任务）

SystemTask 独立存在：
  transcribe_url / organize / note / delete_note / remind
```

目标数据关系：

```text
plans 1 ── * project_tasks
plans 1 ── * schedules
project_tasks 1 ── * schedules（可选关联）
```

当前 `schedules.plan_id` 已存在；`project_tasks` 和 `schedules.task_id` 尚未实现，不得在现有前端中伪造为已经存在的字段。

#### 进度模型

长期任务总体进度目标支持：

```text
progress_mode = auto | manual | hybrid
```

- `auto`：按项目子任务完成状态或权重计算。
- `manual`：使用者手动设置总体进度。
- `hybrid`：自动进度作为建议，使用者可以修正。

推荐默认 `auto`，但该字段和计算规则仍需在数据库设计板块单独确认。

项目子任务目标状态：

```text
todo / doing / blocked / done / cancelled
```

系统任务继续使用现有状态集合：

```text
todo / doing / done / failed / attention
```

两套状态不可直接混用。

#### AI Tool 规划边界

当前已有：

```text
get_planning
propose_planning
```

目标是扩展为长期任务规划入口，但必须继续走现有草案、冲突检查、确认和事务流程：

| Tool | 目标职责 | 风险 | 写入方式 |
|---|---|---|---|
| `get_planning` | 查询 Plan、ProjectTask、Schedule、进度和依赖 | readonly | 可直接执行 |
| `propose_planning` | 生成长期任务、子任务和初始日程草案 | needs-confirm | 只生成草案，确认后事务写入 |
| `propose_schedule_adjustment` | 根据任务进度、延期或阻塞生成日程调整建议 | needs-confirm | 只生成调整草案，确认后更新 |
| `get_project_progress` | **可选**；若 `get_planning` 已返回完整进度则不单独新增 | readonly | 不写入 |

AI 不得：

- 直接写 `plans`、`project_tasks` 或 `schedules`。
- 因为任务延期就自动移动用户日程。
- 把 `SystemTask` 当成长期项目子任务。
- 绕过 `planning_drafts`、`confirmations` 和事务写入。

目标流程：

```text
AI 查询当前规划和进度
        ↓
AI 生成任务拆解 / 日程建议
        ↓
planning draft
        ↓
冲突检查 + 用户确认
        ↓
事务写入 Plan / ProjectTask / Schedule
```

#### 对当前前端的影响

目标改造位置：

| 当前页面 | 目标变化 |
|---|---|
| `/planning` | 计划页增加项目进度和子任务视图；日程页显示关联子任务 |
| `/planning/:id` | **目标新增**：长期任务详情、子任务、进度、关联日程 |
| `/` | 长期计划卡显示进度和下一项日程；今日日程显示关联任务 |
| `/agent` | AI Tool 可查询、拆解长期任务、提出日程调整建议 |
| `/log` | 继续管理 SystemTask，不并入 ProjectTask |

本节只记录规划方向，不修改上述页面和接口。

## 10. 未来优化方案：统一信息对象与智能规划体系

> 本节记录已讨论确认的长期优化方向，**当前不实现**。启动前必须由使用者提供明确的后续任务清单，并重新核对代码、数据库和文档。日程与系统任务合并问题本轮明确排除。

### 10.1 目标

未来希望把两类能力逐步统一到同一套信息流视图中：

```text
A. 长期任务 / 项目 / 项目子任务 / 日程 / 进度
B. 焦点 / 项目卡片 / 热点 / 图片资源
```

目标不是把所有底层对象强行合成一张表，而是：

- 保留不同领域对象的业务边界。
- 通过统一展示模型和关联关系减少前端重复逻辑。
- 让 Agent 能查询进度、拆解长期任务并提出日程调整建议。
- 让后台能观察完整信息流，但不绕过现有确认和事务机制。

### 10.2 长期任务与日程优化

#### 10.2.1 实施顺序与当前契约（2026-10-27 核对）

目标链路分为两层，按「先补完整现有关联，再增加子任务实体」实施：

```text
阶段 A（当前基础）：Plan 1 ── * Schedule
阶段 B（后续扩展）：Plan 1 ── * ProjectTask 1 ── * Schedule
                              Plan 1 ───────────── * Schedule（允许不绑定子任务）
```

**当前已经实现的基础**：`plans` 是长期目标/项目容器；`schedules.plan_id` 外键关联 `plans.id`，删除 Plan 时 `ON DELETE SET NULL`，因此日程可独立存在；一个 Plan 可关联多条 Schedule。创建草案时可同时提交 Plan 和多条 Schedule，服务端在确认事务中把这些 Schedule 默认关联到新建 Plan；也允许仅创建 Schedule，或创建未关联 Plan 的 Schedule。现有查询分别返回 `plans[]` 与 `schedules[]`，Schedule 通过 `plan_id` 与 Plan 对应，未提供嵌套的 `plan.schedules[]` 响应；按日程标题筛选时，响应仍附带匹配日程所关联的 Plan，供前端/Agent 显示关系上下文。

当前状态语义保持解耦：完成 Plan 不自动完成其 Schedule；完成 Schedule 不自动完成 Plan；取消 Plan 不自动取消其 Schedule。日程冲突按时间段检查，不因是否关联同一个 Plan 而豁免。现有实现与专项测试见 `db/migrations/002_planning.sql`、`server/src/services/planning.js`、`server/src/db/planning.js`、`server/scripts/smoke.mjs --planning-lifecycle-selftest`。

**阶段 A：稳定 Plan → Schedule 的关联契约**（不新增表/字段）：

1. 固定 API 的关联表达：列表继续返回 `plans[]`、`schedules[]`，每条 Schedule 以 `plan_id` 作为关联真值；详情查询明确说明所属 Plan（或无关联）。是否额外提供嵌套视图属于接口设计，不能让前端或 Agent 自行猜测关联。
2. 确认创建规则：同一草案含新 Plan 时，未指定 `plan_id` 的草案 Schedule 默认挂到该 Plan；明确传入现有 `plan_id` 时保留该关联；仅有 Schedule 时 `plan_id` 可为空。
3. 确认生命周期规则：Plan 与 Schedule 状态互不隐式级联；删除 Plan 的数据库行为为解除关联而保留 Schedule；完成/取消必须针对各自对象显式生成草案并确认。
4. 明确时间约束：现有实现检查结束时间晚于开始时间及 Schedule-Schedule 时间重叠，但尚未要求 Schedule 必须位于 Plan 的 `start_at` / `due_at` 范围内。若要增加此约束，须作为独立决策加入草案冲突/复核契约，不能在实现中静默拒绝。
5. Agent 的 `get_planning` 已可同时返回 Plan 与 Schedule 数据；工具说明要求使用实际 `plan_id`，不根据标题猜关联。`propose_planning` 的写入仍只走 `planning_drafts` → 冲突检查 → Confirmation → 事务。

阶段 A 验收：独立 PostgreSQL 专项测试覆盖「新建 Plan + 多条默认关联 Schedule」「Schedule 单独创建/无 Plan」「显式关联既有 Plan」「计划与日程状态互不级联」「删除 Plan 后 Schedule 保留且 `plan_id` 置空」「Agent 查询可识别关联」「拒绝/冲突不写入」。完成阶段 A 后再评估是否需要嵌套响应或页面改版，不预先增加接口。

**阶段 B：引入 ProjectTask 实体**（单独数据库设计与迁移板块）：

- 新增 `project_tasks`，归属于 Plan；至少先设计字段、状态迁移、排序、进度/依赖含义、删除策略、审计快照和索引，再写迁移。
- `schedules.task_id` 作为可空外键关联 ProjectTask；一条 Schedule 最多绑定一个 ProjectTask，也可只绑定 Plan 或完全独立。
- 关联一致性约束：若同时存在 `schedule.plan_id` 与 `schedule.task_id`，Task 必须属于同一个 Plan；不能只靠前端保证。
- 迁移现有数据时保留现有 `plans`、`schedules` 和 ID；旧 Schedule 的 `plan_id` 不自动推断或伪造 `task_id`。
- 新建/修改子任务及其日程继续复用 Draft、冲突审查、Confirmation 和事务；不得让 Agent 直接写表。

阶段 B 验收：迁移可重复执行；旧数据零损失；非法跨 Plan 关联被数据库/服务端拒绝；确认拒绝零业务写入；批准后 ProjectTask、Schedule 与 `planning_changes` 同事务落地；查询能双向定位 Plan、Task、Schedule。

**阶段 C：进度与 Agent 日程建议**（阶段 B 稳定后）：

- 先在 `manual` / `auto` / `hybrid` 中单独确定进度规则与完成率计算，定义权重、无子任务、阻塞和取消项的口径；不要先添加含义未定的 `progress` 字段。
- 再决定 `get_planning` 是否已足够，只有响应不够表达时才新增独立进度工具。
- `propose_schedule_adjustment` 只生成包含原因、前后时间、冲突和影响范围的草案；Agent 不因延期自动挪动日程，用户确认后才写入。

阶段 C 验收：进度结果可由数据库状态复算；日程调整草案展示前后差异和冲突；拒绝无写入；并发或草案过期时要求重新审阅；不重复生成或重复应用调整。

**当前推荐的下一项实现范围**：只做阶段 A 的契约/关联验收补齐，不新增 `project_tasks` 表、不增加 `schedules.task_id`、不做自动进度或 AI 自动改期。阶段 A 完成并经使用者复核后，再单独决定是否启动阶段 B。

目标领域模型：

```text
Plan = 长期目标 / 项目容器
ProjectTask = 长期项目内部的可执行子任务
Schedule = 为 Plan 或 ProjectTask 预留的时间安排
SystemTask = 转写、收敛、归档、删除等系统处理任务
```

目标关系：

```text
plans 1 ── * project_tasks
plans 1 ── * schedules
project_tasks 1 ── * schedules（可选关联）
```

建议的增量结构变化：

```text
新增 project_tasks 表
schedules 增加可选 task_id
保留现有 plans
保留现有 SystemTask / tasks
```

当前明确不做：

- 不把 `SystemTask` 与 `ProjectTask` 合并。
- 不把所有对象合并为统一 `activities` 表。
- 不立即修改 `plans`、`schedules` 或现有任务状态。
- 不在没有迁移设计和事务方案前新增字段。

目标进度模式：

```text
progress_mode = auto | manual | hybrid
```

- `auto`：根据项目子任务状态或权重计算。
- `manual`：使用者手动设置总体进度。
- `hybrid`：自动进度作为建议，使用者可以修正。

项目子任务目标状态：

```text
todo / doing / blocked / done / cancelled
```

系统任务继续使用现有状态：

```text
todo / doing / done / failed / attention
```

### 10.3 AI Tool 优化方向

当前已有 `get_planning` 和 `propose_planning`。未来可在数据结构稳定后扩展：

| Tool | 目标职责 | 风险 | 写入方式 |
|---|---|---|---|
| `get_planning` | 查询 Plan、ProjectTask、Schedule、进度和依赖 | readonly | 可直接执行 |
| `propose_planning` | 生成长期任务、子任务和初始日程草案 | needs-confirm | 只生成草案，确认后事务写入 |
| `propose_schedule_adjustment` | 根据进度、延期或阻塞生成日程调整建议 | needs-confirm | 只生成调整草案，确认后更新 |
| `get_project_progress` | 若 `get_planning` 不足，再独立提供进度查询 | readonly | 不写入 |

目标流程：

```text
AI 查询当前规划和进度
        ↓
AI 生成任务拆解 / 日程建议
        ↓
planning draft
        ↓
冲突检查 + 使用者确认
        ↓
事务写入 Plan / ProjectTask / Schedule
```

AI 不得直接修改计划、项目子任务或日程，也不得因为任务延期而自动移动日程。

### 10.4 焦点和主站卡片优化方向

未来统一的是展示模型，不是立即合并所有底层来源。

目标 `FocusItem` 展示字段：

```text
id
title
subtitle
tag
image
url
visible
order
source_type
source_label
updated_at
```

可能的来源：

```text
资料标签「焦点」
GitHub focus 项目
site.json 手工配置
未来独立卡片内容
```

目标流程：

```text
不同业务来源
        ↓
统一 FocusItem 展示模型
        ↓
首页焦点 / 项目 / 热点卡片
```

当前明确不做：

- 不立即把资料焦点、GitHub 项目和 `site.json` 手工配置迁移到同一张表。
- 不立即恢复旧 `site.json.hotspots/projects` 作为首页业务数据源。
- 不把项目卡片、热点卡片和未来独立内容卡片强行合并。

项目卡片和热点卡片未来可共用轻量公共字段：

```text
id
title
subtitle
tag
image
url
visible
order
```

`icon` 作为可选字段保留；项目和热点仍然保持不同集合和业务语义。

### 10.5 图片资源优化方向

统一图片资源池：

```text
data/images/
```

Web 引用格式：

```text
/images/<文件名>
```

目标：

- 同一张图片可以被背景、项目、热点、头像或内容多处引用。
- 文件元数据（类型、大小、尺寸、修改时间）由实时扫描生成。
- `usage` 根据实际引用位置自动推导，可以有多个值。
- `references` 展示具体引用位置，例如 `site.json → background.dark.images[0]`。
- 手工 `tags` 使用预设标签并允许创建新标签，仅用于筛选辅助。
- 被真实引用的图片禁止删除；第一版不提供强制删除。
- 上传时服务端生成安全唯一文件名，不持久化原始文件名。

目标落地顺序：

```text
只读扫描
  → 修改站点图片引用
  → 上传
  → 删除保护
```

图片元数据存储位置、手工标签持久化方式和引用扫描范围，启动写入实现前仍需单独拍板；在不新增图片表或独立 manifest 的方向下，候选方案包括纳入 `site.json.assets`，但当前不默认实施。

### 9.6 图片资产板块当前实现状态

已完成只读板块：

```text
页面：/admin/assets/images
接口：GET /api/admin/images
      GET /api/admin/images/:id
服务：server/src/services/images.js
```

当前能力：

- 扫描 `data/images/` 中的 png/jpg/jpeg/webp/gif 文件。
- 返回文件名、Web URL、MIME、大小、修改时间。
- 仅扫描 `data/site.json` 的站点图片引用和 `data/profile.md` 的头像字段；不扫描资料 Markdown 正文图片。
- 自动推导多用途 `usage` 和具体 `references`。
- 后台网格预览、按用途筛选、按引用状态筛选、详情抽屉。
- 站点与个人信息页已增加背景引用控制：浅色/深色图片顺序、轮播间隔、启用/停用、自动轮播；配置写回 `data/site.json`，主站 `BackgroundLayer` 已消费 `enabled/autoplay`。
- 已验证当前本地 12 张图片，其中 9 张已引用、3 张未引用。

当前明确未做：

- 上传图片。
- 删除图片。
- 修改头像、热点或项目引用。
- 手工标签持久化。
- 资料 Markdown 正文图片与 Obsidian 附件管理（明确不纳入本图片资产板块）。
- `data/cards/` 引用扫描（独立卡片尚未实现）。
- 图片宽高解析。

实现顺序保持：

```text
只读扫描（已完成）
  → 修改站点图片引用（待做）
  → 上传（待做）
  → 删除保护（待做）
```

### 10.6 未来启动前置条件

启动本节任何代码工作前，必须完成：

1. 确认 `project_tasks` 的字段、状态、依赖和进度计算规则。
2. 确认 `schedules.task_id` 的可选关联和迁移策略。
3. 确认规划草案如何在同一事务中写入 Plan、ProjectTask 和 Schedule。
4. 确认 `get_planning` / `propose_planning` 的新响应和草案契约。
5. 确认 `FocusItem` 的来源优先级与首页消费方式。
6. 确认 `site.json`、`profile.md` 和图片资源元数据的字段归属。
7. 更新 `SPEC.md`、`TECH_DESIGN.md`、`RUN.md` 后再写代码。
8. 先做数据库迁移和只读验证，再开放后台写操作。

本节状态：**已记录，当前不实现。**

## 11. 站点信息与个人信息管理（设计记录，当前不实现）

> 本节只整理管理契约，避免与当前图片资产 agent 的改动冲突。当前工作区已有 `server/src/routes/admin.js`、`server/src/services/images.js`、`web/src/admin/AdminApp.jsx` 等并行改动；开始实现前必须重新确认文件边界。站点信息与个人信息管理不包含背景轮播、热点、项目卡片、图片上传/删除、长期任务或日程。

### 11.1 页面结构

建议新增一个后台页面：

```text
/admin/site
```

页面内部按三个分组展示：

```text
站点信息
  ├─ 站点名称
  └─ 站点副标题

个人信息
  ├─ 昵称
  ├─ 头像
  ├─ 个人简介
  └─ GitHub 用户名

联系方式
  └─ GitHub / 邮箱 / 主页 / 订阅等链接列表
```

后台体验统一为一个页面，但不为了页面统一而合并底层文件。

### 11.2 数据源与写入边界

```text
data/site.json
  ├─ site.title
  ├─ site.subtitle
  └─ social[]

data/profile.md
  ├─ nickname
  ├─ avatar
  ├─ bio
  └─ github
```

当前已确认：

- 站点信息写回 `data/site.json`。
- 个人信息写回 `data/profile.md` frontmatter。
- 联系方式写回 `data/site.json.social`。
- 不把个人字段迁入 `site.json`。
- 不把联系方式混入 `profile.md`。
- `background`、`hotspots`、`projects`、`cover`、`accent`、`stats` 不属于本板块写入范围。

### 11.3 接口契约草案

建议使用独立语义的后台接口，不继续扩大当前偏运行配置的 `/api/admin/settings`：

```text
GET   /api/admin/site
PATCH /api/admin/site
```

读取响应目标：

```json
{
  "ok": true,
  "data": {
    "site": {
      "title": "buddy",
      "subtitle": "会成长的个人助手",
      "social": []
    },
    "profile": {
      "nickname": "Bird",
      "avatar": "/images/profile-avatar.png",
      "bio": "",
      "github": "bird-z"
    },
    "sources": {
      "site": "data/site.json",
      "profile": "data/profile.md"
    }
  }
}
```

更新请求目标：

```json
{
  "site": {
    "title": "buddy",
    "subtitle": "会成长的个人助手",
    "social": [
      { "label": "GitHub", "icon": "🐙", "url": "https://github.com/bird-z" }
    ]
  },
  "profile": {
    "nickname": "Bird",
    "avatar": "/images/profile-avatar.png",
    "bio": "",
    "github": "bird-z"
  }
}
```

字段校验目标：

```text
title：必填，最多 80 字
subtitle：可空，最多 160 字
social：最多 12 条
social.label：必填，最多 30 字
social.icon：可空，最多 8 字
social.url：可空，只允许 http://、https://、mailto:
nickname：最多 80 字
avatar：可空，只允许 /images/ 路径或 https URL
bio：最多 500 字
github：可空，^[A-Za-z0-9-]{1,39}$
```

### 11.4 双文件保存原则

一次点击保存，底层分别更新两个文件：

```text
site → data/site.json
profile → data/profile.md
```

目标流程：

1. 读取当前 `site.json` 和 `profile.md`。
2. 校验请求字段。
3. 分别生成临时文件。
4. 两个临时文件都写成功后，再替换原文件。
5. 任一步失败，保留原文件并清理临时文件。
6. 返回新的站点/个人信息视图。

这只能降低部分写入风险，不能宣称具备数据库级跨文件事务；若一个文件替换成功、另一个替换失败，后续需要通过备份或重试恢复。

### 11.5 验收标准

实现后需要由使用者亲眼验证：

- `/admin/site` 能读取当前站点名称、副标题、个人信息和联系方式。
- 保存站点名称后，`GET /api/me` 的 `site.site.title` / `site.site.subtitle` 更新。
- 保存个人信息后，`GET /api/me` 的 `profile` 更新。
- 保存联系方式后，`GET /api/me` 的 `site.social` 更新。
- 关于页和主页刷新后能看到新的昵称、头像、简介和副标题。
- 非法 URL、超长文本、非法 GitHub 用户名会被拒绝。
- 保存失败不会留下半截 `site.json` 或 `profile.md`。
- 不修改 `background`、`hotspots`、`projects` 等未授权配置。

本节状态：**已记录，当前不实现。**

## 12. 来源精选：热点与 GitHub 项目（已确认并实现）

本节取代 §9 中手填热点/项目作为目标方案的描述。档案与 GitHub 继续是内容真相源，后台只选择来源与控制展示；不迁移 PostgreSQL，不新增数据库表、资源清单或 API 路由。

| 区域 | 来源 | 管理与展示规则 |
|---|---|---|
| 首页热点/焦点 | PostgreSQL 档案、现有 GitHub 项目接口返回的公开非 Fork 仓库 | 最多选择4项（含隐藏项）；开启后完全按选择展示，不受旧档案2条/GitHub1条配额限制，不自动补位 |
| 关于页项目 | 同一 GitHub 项目接口 | 不设项目数量硬上限；开启后只显示所选且可用的项目，包含已归档项目，统一遵循后台排序 |

- 配置位于 `data/site.json` 的 `site.curated`。`hotspots/projects` 各自包含 `enabled` 和 `items`；每项只存 `source/id/image/visible/order`。档案 ID 为现有资料 ID，GitHub ID 为仓库稳定 ID 字符串；标题、简介与链接从来源读取，禁止保存内容覆盖副本。
- 两组来源互斥，包括隐藏项和暂未启用的选择；前端隐藏已选候选项，后端再次校验。项目精选启用时，所选仓库（含隐藏项）也从旧首页自动发现候选中排除。
- 开启精选必须至少选择一项；清空已启用列表前需先关闭。全部隐藏或来源失效时展示空状态，不自动补位。
- 初始配置缺失或开关关闭时保持旧逻辑：热点回退原焦点聚合，关于页回退全部公开非 Fork 项目。两组开关独立；普通设置保存不会自动开启精选。旧根级 `hotspots/projects` 原样保留，不自动转换或删除。
- 来源选择器复用 `GET /api/db/notes`（每页500条、逐页读完）和 `GET /api/github/projects`，支持搜索标题、仓库名、Topic（包括 focus）。来源加载独立失败不阻塞设置编辑，未核实的来源标记待核实。
- 来源已删除/不可见：引用保留，后台标记不可用并允许移除、重新选择，主站跳过。GitHub 临时失败保留现有缓存语义；缓存不持久化，服务重启后无缓存会暂时跳过 GitHub 项目，不写内容快照到站点配置。
- 封面从统一图片池选择；`site.json` 的递归引用扫描已覆盖 `site.curated.*.items[*].image`，隐藏和禁用配置中的图片引用仍受删除保护。笔记 Markdown 插图继续排除。

实现：`services/curated.js` 负责校验和热点来源解析，`services/home.js` 派生首页，后台 `CuratedSettings.jsx` 管理选择，关于页从原始仓库列表派生精选视图。现有原始 GitHub 接口不受过滤，确保后台仍能选择所有候选。

验证：`node server/scripts/curated-selftest.mjs`，临时目录隔离，覆盖22项来源、排序、去重、兼容、接口和图片保护断言；前端 `npm run build`。完成代码与本地验证不代表 Docker 已部署或浏览器已验收。
