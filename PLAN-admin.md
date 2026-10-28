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

### 9.5 长期任务、项目子任务与日程（历史需求；阶段 B 实现见 §10.2.6）

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
| 项目子任务 | **2026-10-28 本地实现 `project_tasks`，未部署** | 描述长期项目中的具体执行步骤、进度和依赖 | 建议新增 `project_tasks`，待数据库设计确认 |
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

上图中的 `progress`、`depends_on`、`estimated_minutes` 是此前提出的能力概念，不代表均会成为 `project_tasks` 列。阶段 B 已明确只保留实际状态与依赖关系；进度口径留到阶段 C，估时字段是否需要尚未决定。

`project_tasks`、依赖表和 `schedules.task_id` 已由迁移 004 实现并在隔离库验证；真实数据库尚未执行该迁移。前端实际查询 API，不伪造示例任务。

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

本节保留最初的规划方向；2026-10-28 已按 §10.2 分阶段实现 ProjectTask，未实现的进度/重复等能力仍保留为后续方向。

## 10. 未来优化方案：统一信息对象与智能规划体系

> 本节区分已实现与后续方向。使用者于 2026-10-28 指示“进行 非必要 不要停下”后，§10.2 阶段 B 已进入本地实施（结果见 §10.2.6）；进度/自动改期、图片等其他方向不因此提前实施。日程与系统任务不合并。

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
阶段 B（当前本地实现，未部署）：Plan 1 ── * ProjectTask 1 ── * Schedule
                              Plan 1 ───────────── * Schedule（允许不绑定子任务）
```

**当前已经实现的基础**：`plans` 是长期目标/项目容器；`schedules.plan_id` 外键关联 `plans.id`，删除 Plan 时 `ON DELETE SET NULL`，因此日程可独立存在；一个 Plan 可关联多条 Schedule。创建草案时可同时提交 Plan 和多条 Schedule，服务端在确认事务中把这些 Schedule 默认关联到新建 Plan；也允许仅创建 Schedule，或创建未关联 Plan 的 Schedule。现有列表查询分别返回 `plans[]` 与 `schedules[]`，按日程标题筛选时仍附带匹配日程所关联的 Plan；按 ID 查询 Schedule 时也返回所属 Plan 的 `plans[]` 上下文，独立日程则返回空 `plans[]`。未提供嵌套的 `plan.schedules[]` 响应。

当前状态语义保持解耦：完成 Plan 不自动完成其 Schedule；完成 Schedule 不自动完成 Plan；取消 Plan 不自动取消其 Schedule。日程冲突按时间段检查，不因是否关联同一个 Plan 而豁免。现有实现与专项测试见 `db/migrations/002_planning.sql`、`server/src/services/planning.js`、`server/src/db/planning.js`、`server/scripts/smoke.mjs --planning-lifecycle-selftest`。

**阶段 A：稳定 Plan → Schedule 的关联契约**（不新增表/字段）：

1. 固定 API 的关联表达：列表继续返回 `plans[]`、`schedules[]`，每条 Schedule 以 `plan_id` 作为关联真值；详情查询明确说明所属 Plan（或无关联）。是否额外提供嵌套视图属于接口设计，不能让前端或 Agent 自行猜测关联。
2. 确认创建规则：同一草案含新 Plan 时，未指定 `plan_id` 的草案 Schedule 默认挂到该 Plan；明确传入现有 `plan_id` 时保留该关联；仅有 Schedule 时 `plan_id` 可为空。
3. 确认生命周期规则：Plan 与 Schedule 状态互不隐式级联；删除 Plan 的数据库行为为解除关联而保留 Schedule；完成/取消必须针对各自对象显式生成草案并确认。
4. 明确时间约束：现有实现检查结束时间晚于开始时间及 Schedule-Schedule 时间重叠，但尚未要求 Schedule 必须位于 Plan 的 `start_at` / `due_at` 范围内。若要增加此约束，须作为独立决策加入草案冲突/复核契约，不能在实现中静默拒绝。
5. Agent 的 `get_planning` 已可同时返回 Plan 与 Schedule 数据；工具说明要求使用实际 `plan_id`，不根据标题猜关联。`propose_planning` 的写入仍只走 `planning_drafts` → 冲突检查 → Confirmation → 事务。

阶段 A 验收：独立 PostgreSQL 专项测试覆盖「新建 Plan + 多条默认关联 Schedule」「Schedule 单独创建/无 Plan」「显式关联既有 Plan」「计划与日程状态互不级联」「删除 Plan 后 Schedule 保留且 `plan_id` 置空」「详情及 Agent 查询可识别关联」「拒绝/冲突不写入」。以上契约与关联验收由 `server/scripts/smoke.mjs --planning-lifecycle-selftest` 覆盖；完成阶段 A 后再评估是否需要嵌套响应或页面改版，不预先增加接口。

**阶段 B：引入 ProjectTask 实体**（单独数据库设计与迁移板块）：

- 新增 `project_tasks`，归属于 Plan；至少先设计字段、状态迁移、排序、进度/依赖含义、删除策略、审计快照和索引，再写迁移。
- `schedules.task_id` 作为可空外键关联 ProjectTask；一条 Schedule 最多绑定一个 ProjectTask，也可只绑定 Plan 或完全独立。
- 关联一致性约束：若同时存在 `schedule.plan_id` 与 `schedule.task_id`，Task 必须属于同一个 Plan；不能只靠前端保证。
- 迁移现有数据时保留现有 `plans`、`schedules` 和 ID；旧 Schedule 的 `plan_id` 不自动推断或伪造 `task_id`。
- 新建/修改子任务及其日程继续复用 Draft、冲突审查、Confirmation 和事务；不得让 Agent 直接写表。

**状态决策（2026-10-28，使用者选择方案 A）**：`ProjectTask` 采用 `todo / doing / blocked / done / cancelled`；`done` 和 `cancelled` 为终态，不允许重开。需要继续或返工时创建新的子任务，保留原任务及其完成/取消历史。此规则已在阶段 B 本地实现；不得据此宣称现有 Plan 或 Schedule 已具备相同的终态校验。其他状态间的迁移与核心字段已按本次推进授权接入，详见 §10.2.3–6；进度计算留到阶段 C。

**核心字段与校验候选（2026-10-28，已按本次授权实施；结果见 §10.2.6）**：

| 字段 | 类型及默认值 | 候选校验与编辑规则 |
|---|---|---|
| `id` | text，服务端生成 `project-task-时间戳-随机串` | 主键，创建后不可编辑；不复用 SystemTask ID |
| `plan_id` | text，必填，无默认值 | FK 指向存在的 Plan；创建后不允许跨 Plan 移动；新 Plan 草案内通过草案引用解析真实 ID |
| `title` | text，必填 | 必须是字符串，trim 后 1–200 个 Unicode 码点；不把 null、数组或对象转成标题 |
| `description` | text，默认空字符串 | 必须是字符串，最多 10000 个 Unicode 码点；保留换行，不接受 null |
| `status` | text，默认 `todo` | 仅五种已定状态；建议创建只能为 `todo`，随后通过确认草案变更；完整迁移表候选见 §10.2.3 |
| `due_at` | timestamptz，可空，默认 NULL | 候选新增：任务截止时刻，可不安排 Schedule；必须显式带时区，允许过去的截止时刻以如实表示逾期；不自动产生或改写日程 |
| `position` | integer，服务端分配 | 非负，Plan 内排序按 `(position,id)`；允许并列值，用 id 保证稳定顺序；重排与并发候选见 §10.2.4 |
| `source` | text，服务端确定 | `user / agent`；创建后不可由请求改写，不以模型传入值判断来源 |
| `created_at` / `updated_at` | timestamptz，服务端设置 | 创建后 `created_at` 不变；成功变更时更新 `updated_at`，拒绝或失败不改业务记录 |
| `completed_at` | timestamptz，默认 NULL | 只有进入 `done` 时由服务端写入实际完成时间；其余状态保持 NULL；重复确认不重写 |
| `schema_version` | integer，默认 1 | 由服务端维护，普通请求不可编辑；不是迁移是否已执行的标记 |

- `depends_on` 在接口中表达依赖 ID 集合，候选持久化方式为独立依赖表，不重复存入 ProjectTask 列。`progress`、`progress_mode`、权重、估时、子任务独立执行起止时间暂不加入本次核心字段候选；执行时间安排由关联 Schedule 表达。边界复核后新增可空 `due_at` 候选，只表达截止要求，不占用日历时段。
- 编辑采用字段白名单；不支持的字段、错误类型、超长值或空标题明确返回校验错误，不静默截断或修正。创建时省略可选字段使用默认值；更新时省略字段保留原值，清空说明须显式传空字符串。涉及依赖、状态与排序的操作须在最终确认事务中复核；重排协议候选见 §10.2.4，状态迁移表候选见 §10.2.3，本次实施已采用，验收见 §10.2.6。
- 上述是最小字段方案建议，200/10000 的长度上限、创建仅 `todo`、不允许跨 Plan 移动及新增可空任务截止日期已随本次整体推进采用；已确认的终态规则保持不变。

**依赖决策与进度边界（2026-10-28，使用者选择方案 A）**：

- `depends_on` 表示“当前子任务开始前需完成的同一 Plan 下的子任务”，是任务之间的关系，不等于日程时间先后；禁止跨 Plan、自依赖、重复依赖与环形依赖。依赖新增/移除须进入草案、经确认后同事务写入，并记录变更快照；存储结构（关联表或其他形式）留待迁移设计。
- 已确认方案 A（显式状态、派生可执行性）：`blocked` 是人工标记的任务状态；另按依赖计算“可开始/尚待前置任务”，不因前置任务完成而自动改写 `status`。前置任务只有 `done` 才满足依赖，`cancelled` 不算完成；取消前置任务后，由使用者经确认移除依赖或另行建立替代任务。未满足依赖时不允许子任务开始/完成，但仍可编辑、取消或调整依赖。调整依赖时需再次检查当前状态，避免已开始任务突然变得不满足前置条件。**本地已实现，未部署。**
- 不采用方案 B 的自动状态迁移：前置任务完成不会自动把 `blocked` 改成 `todo`，避免覆盖人工阻塞的意图。
- 阶段 B 只记录子任务实际状态和依赖，不新增 `plans.progress_mode`、`project_tasks.progress`、权重或估时驱动的完成率。阶段 C 再单独决定 `auto / manual / hybrid`、取消项与无子任务的分母口径、阻塞是否计入进度，以及进度是实时派生还是留存快照；此前不得把“完成任务数 / 总任务数”展示为已定的项目完成率。

**删除策略决策与审计要求（2026-10-28，使用者选择方案 A）**：

- 先区分业务“取消”（保留对象和关系，状态转为 `cancelled`）与物理 `DELETE`（对象从表中消失）。现有规划 API 只有完成/取消草案，没有删除入口；数据库直接删除 Plan 会将已有 Schedule 的 `plan_id` 置空，但不会产生 `planning_changes`。阶段 B 不能把外键动作描述成已审计的删除流程。
- 已确认方案 A（保留历史）：不新增业务物理删除入口；取消 Plan 不自动取消 ProjectTask 或 Schedule，取消 ProjectTask 不自动取消关联 Schedule，且已确认的依赖规则仍适用（取消的前置任务不满足依赖）。未来 `project_tasks.plan_id` 对物理删除 Plan 使用限制约束；已有 `schedules.plan_id ON DELETE SET NULL` 维持不变。日后确需清理数据时另设计有确认与逐项审计的维护流程，不依赖级联删除。**本地已实现，未部署。**
- 不采用方案 B 的业务物理删除：不添加 `delete` 草案动作，也不通过级联删除子任务或日程。
- 阶段 B 审计要求：将 `planning_changes.object_type` 扩展为 `project_task`；创建记录 `after_data`，状态/内容/依赖变更记录确认前的 `before_data` 与实际提交后的 `after_data`（含所属 Plan 与排序、按固定顺序列出的依赖 ID）。关联日程变更仍单独记 Schedule 的前后 `plan_id/task_id`；批准决策、对象变更及审计写入同一事务，拒绝或写入失败不留下部分业务变更。无需增加物理删除的 `action` 值。

**索引与迁移兼容候选（2026-10-28，待复核）**：

- 遵循当前 PostgreSQL 部署方式：新增独立编号迁移（预期 `004`，实施前再核对编号），不改写已部署的 `002_planning.sql`；迁移在事务内完成，使用 `ADD COLUMN IF NOT EXISTS`、`CREATE TABLE/INDEX IF NOT EXISTS`，增加 CHECK/FK 前检查 `pg_constraint`，可重复执行。当前没有 migration ledger 或启动时自动迁移器；部署继续由操作者执行 SQL，并在 `RUN.md` 记录命令及迁移后重建步骤，不在本设计阶段新增迁移框架。
- 迁移只扩展结构，不搬移或推断业务数据：保留现有 Plan、Schedule 的 ID 和字段；新增的 Schedule `task_id` 全部为 NULL，现有 `plan_id` 不变；不把 `SystemTask` 导入 ProjectTask。上线前后记录并核对 plans/schedules 行数、主键集合，验证旧 Schedule 无字段改写；保留数据库备份与回滚步骤。DDL 可事务回滚，但一旦新代码写入 ProjectTask 数据，回滚应用前须先停写并另行制定数据处置方案。
- 依赖关系建议使用独立 `project_task_dependencies(plan_id, task_id, depends_on_task_id)` 表；复合主键防止重复边，两个端点分别用 `(plan_id, task_id)`、`(plan_id, depends_on_task_id)` 复合外键指向 `project_tasks(plan_id,id)` 并 `ON DELETE RESTRICT`，另以 `CHECK(task_id <> depends_on_task_id)` 拒绝自依赖，从数据库层保证同 Plan 且防止错误级联。分别为前置查询与反向后继查询建索引。该表结构可拦截跨 Plan、自依赖和重复边；PG CHECK 无法可靠验证递归环，环检测须在事务写入路径校验并锁定同 Plan 的任务集合，防并发写入形成环；当前并发控制沿用统一表级锁序，详见 §10.2.3/6。
- 最小索引候选：`project_tasks(plan_id, status, position, id)` 支持项目内排序和状态列表；依赖表主键从属任务方向可查，另建 `(depends_on_task_id, task_id)` 支持反查后继；`schedules.task_id` 建索引支持按子任务查日程。避免预先给低选择性字段单独建索引，待查询 API 与 `EXPLAIN` 验证后再增补。
- 为保证 `schedules.plan_id` 与 `task_id` 同属一个 Plan，候选做法是在 `project_tasks` 建 `(plan_id,id)` 唯一键，`schedules` 增加复合外键 `(plan_id,task_id)`；并加 CHECK 要求 `task_id IS NULL OR plan_id IS NOT NULL`。因此只有 Plan、Plan+Task、或二者皆空三种关系有效；跨 Plan 组合被数据库拒绝。ProjectTask 受限删除，因此不会通过删除 Task 触发关联日程失联。
- 上述编号、依赖表实现、索引组合及复合外键仍属迁移设计候选；实施前须按最终查询和并发控制方案复核，并通过空库建库、已有数据升级、连续重复执行、非法关联/环拒绝、备份恢复演练。

#### 10.2.2 使用场景边界（2026-10-28，实施范围见 §10.2.6）

本节承接使用者关于每日固定事项、零碎独立日程的追问；用于补齐设计，由使用者本次推进指令进入实施，实际覆盖与限制见 §10.2.6。此前已确认的终态、人工 blocked、依赖语义及保留历史策略继续有效。核心字段及状态迁移/事务规则已按 §10.2.3/4 实施，测试覆盖与尚未上线事项见 §10.2.6。

**对象与本期范围**：

| 对象或需求 | 边界建议 | 当前实现状态 |
|---|---|---|
| Plan | 长期目标容器；不要求所有生活安排归属于 Plan | 已有 |
| ProjectTask | 属于一个 Plan 的可执行成果；可以尚未安排执行时间，截止日期与执行时段分开 | 阶段 B 设计中 |
| 独立 Schedule | 有日期/时间的独立安排，允许 `plan_id=NULL, task_id=NULL`；不为零碎安排自动创建 Plan | 现有支持无 Plan；task_id 尚不存在 |
| 无日期独立待办 | 没有日期、也不服务于 Plan 的事项；不得伪造开始时间或借 SystemTask 存储 | 建议作为后续独立待办能力，本期暂不实现，也不强塞入 Plan |
| 重复规则 | 表达每天/每周何时安排，并产生独立发生实例；可独立存在，也可关联 Plan | 后续单独设计，不增加本期重复字段或无限生成日程 |
| 全天安排 | 代表有日期、持续全天的日程；不等于时间自由的待办 | 现有会参与整天冲突检查；本期不静默改变冲突口径 |

**具体行为建议**：

1. **截止与排期**：ProjectTask 候选新增可空 `due_at`；没有 Schedule 的任务仍可存在，有截止不等于已排期。截止已过而未完成只派生为逾期，不自动取消、完成或改期。只提供日期而未明确截止时刻时，创建草案前需明确按哪个本地时刻截止，并在预览展示完整时区时间；不得偷偷填入任意时刻。截止超出 Plan 范围或排期晚于截止，在预览明确提示，不自动移动任一对象；是否设置硬时间限制另行决策。
2. **漏做与改期**：Schedule 的 `ended` 只是时间位置，未完成仍保留实际完成状态。使用者可明确选择改期原记录（保留同一 ID 与前后时间快照），或保留原记录并新建一次补做安排；系统和 Agent 不自行替用户选择，也不把漏做自动映射为取消或完成。
3. **固定事项**：每天执行属于多次发生，不能重开同一个终态 ProjectTask 冒充每日完成。现阶段只支持在明确日期范围内、通过草案创建有限条独立 Schedule（沿用每次最多 50 条），不能宣称支持重复序列。未来重复能力须先定义时区、结束条件、单次跳过/改期与后续生效范围、按规则版本和本地发生日期去重，以及规则停用后已产生实例如何保留；今天漏做不应阻止明天独立实例。
4. **完成关系**：一个 ProjectTask 可安排多条 Schedule；完成其中一条甚至全部 Schedule，不自动完成 Task；完成 Task 也不自动完成/取消未来 Schedule。保留未处理的日程，预览或查询提示父任务已完成；若要取消剩余安排，须逐项列出并确认，拒绝不写入。此为新增行为建议，不表示现有工具已支持 Task。
5. **Plan 终态**：完成/取消 Plan 不级联修改子对象。建议拒绝向终态 Plan 新增子任务或新关联；已有子任务和日程仍可由使用者明确推进、改期、完成或取消，且不自动重开 Plan。最终确认时重读 Plan 状态，不能仅在生成草案时校验。
6. **Task 终态与依赖**：不重开 done/cancelled Task，不再给终态 Task 新建关联日程或修改依赖来改写其执行条件；已有日程仍保留并可单独处理。前置已完成不自动解除人工 blocked，明确解除与完成路径见 §10.2.3 状态迁移候选；未满足依赖不能启动/完成 Task，也不能靠完成 Schedule 绕过 Task 校验。
7. **关联表达**：仅 Plan、Plan+Task、完全独立三种持久关系有效；请求仅提供真实 Task ID 时可解析其 Plan，但必须在预览展示并在确认时复核；若显式提供不一致的 Plan 则拒绝，不静默覆盖。API/Agent 创建 Schedule 时，省略 `plan_id` 表示同一草案内默认关联新 Plan（没有新 Plan 则独立），显式 `plan_id:null` 表示明确独立，真实 ID 表示关联该 Plan。新 Task 的草案引用候选采用 §10.2.4 的 task_ref，不能猜 ID。
8. **解绑和改绑**：清空 Task 可保留 Plan，变为直接属于 Plan 的日程；改为完全独立需同时清空两个关联。跨 Plan 改绑 Schedule 时，Task 必须同事务解除或替换为新 Plan 下的 Task，预览完整展示前后 ID/名称并留下 Schedule 快照；ProjectTask 自身仍按候选规则不允许跨 Plan 移动。确认时关联对象消失、状态变化或依赖发生变化，须重新审阅或明确失败，不静默改成独立记录。

**存量缺口与修复记录（本次已修复）**：

- E1：`propose_planning` 的 create 日程 schema 未包含 `plan_id`，Agent 输入解析会丢弃显式关联，不能用服务层测试通过代替工具入参验收。
- E2：服务层创建校验将 `plan_id:null` 合并为未指定，数据库写入又以 `??` 默认关联新 Plan，无法表达同一新 Plan 草案内的明确独立日程。
- 阶段 A 的 25/25 是此前独立 PostgreSQL 专项的实跑历史结果，未覆盖 E1/E2，不代表这些边界已通过；本次已增加工具解析及真实确认落库测试并保留原有默认关联，生命周期专项由 25 增至 26 条。

**边界验收清单（本次执行结果及剩余范围见 §10.2.6）**：

| 场景 | 预期结果 |
|---|---|
| 明天取快递，不属于目标 | 独立 Schedule，不创建 Plan/Task |
| 有空买电池，无任何日期 | 明确说明本期无日期独立待办未支持，不伪造日程或 SystemTask |
| 周五截止但未排期的项目子任务 | Task 可独立于 Schedule 存在，due_at 明确展示；不制造执行时段 |
| 全天出游与当日下午会议重叠 | 按当前全天冲突语义展示冲突，不冒充自由待办 |
| 每日固定事项中的今天漏做 | 保留今天未完成事实，明天的独立安排不受隐式状态影响；不声称已有重复序列 |
| 一个 Task 安排三次，完成其中一次 | 只完成该 Schedule，Task 与其他 Schedule 保持原状态 |
| Task 完成但仍有未来 Schedule | 不自动删除或取消，显示关联任务已完成并等待明确处理 |
| Plan 在草案生成后变为终态 | 新子任务/新关联不得按旧状态直接写入；已有对象的推进不重开 Plan |
| 新 Plan 草案混合默认关联与明确独立日程 | 省略 plan_id 的关联新 Plan，显式 null 的保持独立 |
| Agent 将新日程关联既有 Plan | 工具解析保留真实 plan_id，预览与落库关联一致 |
| Schedule 跨 Plan 改绑但保留旧 Task | 拒绝不一致关联，业务与审计不留下部分写入 |
| 用户拒绝或重复确认改绑/补做草案 | 拒绝零业务变更；同一草案重复确认不重复创建、改期或写审计 |

#### 10.2.3 ProjectTask 状态与确认事务候选（2026-10-28，已按本次授权实施；结果见 §10.2.6）

本节补齐状态操作与事务行为；保留已确认的终态/依赖/保留历史决策，新增限制已随本次整体推进进入实施，见 §10.2.6。仅适用于未来 ProjectTask，不追溯改变当前 Plan、Schedule 或 SystemTask 的实现。

**状态迁移表**：

| 原状态 | 允许的目标状态 | 条件与操作 |
|---|---|---|
| 新建 | `todo` | 经 create 草案确认，所属 Plan 存在且可接受新任务；未完成依赖不妨碍登记待办 |
| `todo` | `doing` | 显式 update；前置任务全部 done，无依赖时此条件成立 |
| `doing` | `todo` | 显式 update，表示退回待办，不伪装成完成或取消 |
| `todo / doing` | `blocked` | 显式 update，由使用者标记人工阻塞；展示操作说明，不把依赖等待自动写成 blocked |
| `blocked` | `todo / doing` | 显式解除人工阻塞；回 todo 可仍等待依赖，转 doing 必须满足全部依赖 |
| `todo / doing` | `done` | 仅 complete 操作，最终确认时依赖全部 done；写入实际 completed_at |
| `blocked` | `done` | 候选不允许直接完成，先明确解除人工阻塞，再单独生成完成草案；不能由前置完成自动触发 |
| `todo / doing / blocked` | `cancelled` | 仅 cancel 操作，无需依赖满足；保留对象、关系和历史，completed_at 仍为 NULL |
| `done / cancelled` | 任意其他状态 | 禁止；需要继续或返工另建任务，不通过 update、complete 或 cancel 互换终态 |

- complete/cancel 不接受夹带内容或依赖编辑；update 不得直接把 status 设置为 done/cancelled。同一对象在一份草案中至多出现一次，避免先后操作顺序掩盖非法迁移。
- 候选将终态 Task 设为只读（含内容、依赖、截止与排序）；关联 Schedule 是独立对象，仍按自己的规则显式处理，不因 Task 终态被自动删除或完成。是否允许终态内容纠错如有需求须再单独放宽，不能借此重开任务。
- 依赖按本次事务的最终任务集合及图校验：不得跨 Plan、自依赖、重复或成环。若 doing Task 要新增尚未完成的前置任务，草案须显式同时将本 Task 退回 todo 或转 blocked，否则拒绝；不能只改依赖后保留不合法的 doing。这里的组合更新必须完整预览，不得自动替用户退回状态。
- 同一份草案可涉及不同 Task 的变更，但所有操作要独立合法：被依赖 Task 从 blocked 直接变 done 仍不可由批量提交绕过。完成依赖不自动启动后继，Schedule 完成也不充当 Task 完成的批准。

**草案与确认事务流程**：

1. **先鉴权再处理**：读取公开规划与生成/读取/确认草案继续遵守当前读写权限分离。游客不得创建或确认写草案；退出登录或会话失效后，旧的审阅凭据不是写权限，最终确认必须重新校验身份。
2. **生成可审阅内容**：查询真实目标；预览逐项列出对象 ID、名称、原/目标状态、截止、完整关联及依赖变化、时间冲突和影响范围。版本校验覆盖目标记录及其依赖 ID 集合、相关前置状态和 Plan 是否可接收新增对象；只对 task 行的 updated_at 做比较不够。新增 Plan/Task 使用草案内局部引用，确认事务中分配并解析真实 ID，不要求 Agent 预测数据库 ID；具体请求格式候选见 §10.2.4。
3. **固定锁序后重读**：当前实现统一按 schedules → plans → project_tasks → project_task_dependencies 的表级锁序，再锁草案/确认行，读取最新对象和依赖图。保留现有 Schedule 时间冲突串行保护，覆盖空 Plan 与并发新建依赖；并非早期候选中的每 Plan 细粒度锁。后续若优化吞吐，必须让所有写路径同步采用一致锁协议。
4. **校验最终结果**：先校验草案凭据，再依据锁内最新数据检验状态迁移、依赖图、Plan 终态、Schedule 三种合法关联、截止提示和时间冲突；一次性验证整份草案的最终结果，不依赖按数组顺序执行来绕过规则。任何缺失对象或非法操作不得静默跳过、重建目标或清空关联。
5. **变化需重审**：审阅后目标、关系、前置状态或冲突变化时，不记录批准、不写业务数据；可安全重算则刷新草案并返回 `409 PLANNING_REVIEW_REQUIRED`，展示新差异并等待新的显式确认。目标已不存在或最终方案非法则明确失败并要求重新生成/修订，原待决定草案仍可拒绝；前端和 Agent 不自动连发批准。
6. **批准与执行分开表述**：沿用现有 savepoint 语义，在外层事务记录用户批准，业务保存点内写入 Plan/Task、依赖、Schedule 与 planning_changes。业务及审计任一步失败全部回滚到保存点，草案记 failed、业务零部分写入，并保留已批准事实；不能把失败说成拒绝或保存成功。若整个数据库事务未能提交，返回无法确认并先读取结果，不臆测批准事实已经持久化。
7. **拒绝及幂等**：拒绝只记录决定与草案终态，不改业务对象及其审计。相同草案重复提交相同决定只返回已记录结果，不重复生成对象、更新时间、完成时间或审计；反向决定报冲突。已批准但执行失败的草案不重新执行，修复后生成新草案；两个不同草案不因文字相同而被视作同一请求，跨草案查重另行设计。
8. **提交后同步会话**：实际提交后才向 Agent 回灌结果。会话同步失败与业务写入失败分开返回，重试只同步已提交终态；不能为了重发对话再次执行规划写入。

**状态/事务验收范围（实跑结果见 §10.2.6）**：

- 未满足依赖时可创建 todo、编辑或取消，但启动和完成均被拒绝；取消的前置任务不算完成。
- 前置已完成但本 Task 为 blocked 时不自动启动，也不能直接 complete；显式解除后方可按迁移表推进。
- done/cancelled Task 的新状态操作与编辑拒绝；相同完成草案重复确认只返回原结果。
- doing Task 新增未满足前置且未显式退回时拒绝；完整预览的退回加依赖修改可一次确认。
- 两个并发草案分别新增 A→B 与 B→A，最多一个可提交，最终无环；空 Plan 并发创建也遵守统一锁。
- 草案审阅后 Task、依赖、前置状态或 Plan 终态变化，不产生批准事实或部分业务写入，重新审阅后才允许继续。
- Plan/Task/Schedule/依赖/审计任一写入失败全部业务回滚，保留已批准但 failed 的实际结果；整笔事务提交失败不冒称已批准。
- 拒绝不写业务审计；同草案同决定幂等、反向决定冲突；会话同步失败后重试不重复保存。
- 新 Plan/Task 的局部引用被正确解析；存在错误引用或跨 Plan 关联时整份草案不部分保存。
- 游客以及退出登录后的旧草案确认请求无业务写权限，不因持有 review_token 获得授权。

#### 10.2.4 排序与 API/Agent 契约候选（2026-10-28，已按本次授权实施；结果见 §10.2.6）

本节沿用已有四个规划端点与 `get_planning / propose_planning`，只设计增量结构；上述字段已由共用 schema 接入，结果见 §10.2.6；真实库需先迁移 004。本次采用核心字段、终态只读、截止日期和场景边界约定，当前结果见 §10.2.6。

**排序和重排**：

- 默认在各 Plan 内按 `(position ASC,id ASC)` 稳定排序，状态/依赖优先级不隐式改变顺序。新任务在 Plan 锁内以该 Plan 当前最大 position 加一追加，空 Plan 从 0 开始；一次创建多项按草案顺序追加。不对外开放直接填写 position，不把请求中的排序值当作可信输入；整数越界明确报错，不回绕或静默重排。
- 重排请求使用 `operation:update` 加 `reorder:{plan_id, task_ids:[真实ID…]}`，与 target/patch、changes、新增对象互斥。task_ids 必须恰好覆盖该 Plan 的全部活跃 Task（todo/doing/blocked），无重复、无外 Plan 或终态任务；不允许只提交当前搜索页/分页的子集。首期最多重排 50 条，超过时明确提示当前规模限制，不截断或部分重排。
- 预览展示完整活跃任务前后顺序；确认时再次校验成员集合、状态、旧 position 和任务版本，发生变化返回重新审阅，不自动合并两个标签页的排序。确认后活跃任务按所选顺序分配 0..n-1，终态 Task 的 position 不变；允许与终态 position 并列，全状态视图仍按 position/id 排序，可能与历史任务交错，不能把此重排描述为全状态列表重排。
- 仅对 position 实际改变的活跃 Task 写入 update 审计和 updated_at；同一个事务完成整个重排，失败全部撤销。完全无变化的请求明确返回无需变更，不创建空草案。内部保留 reorder 意图及整份审阅快照，不能只保存若干 position patch 后丢失完整列表校验。

**读取契约**：

| 入口 | 增量候选与兼容要求 |
|---|---|
| `GET /api/planning` / `get_planning` | 保留现有 timezone/plans/schedules，新增 `project_tasks:[]`；Task 附 depends_on 的真实 ID 列表与派生 dependency_state（satisfied、waiting_on_ids），不存第二份状态，也不自动将 blocked 改为 todo |
| 查询筛选 | 增加 plan_id、task_status（默认 all；可 active/todo/doing/blocked/done/cancelled）；plan_id 精确限定所属 Plan，状态过滤不改变原有 plan_status/schedule_status 含义；from/to 仍只筛 Schedule，不用于误删未排期的 Task |
| 关键词和上下文 | q 对 Task 标题/说明生效；保留既有 Plan 搜索上下文行为。为匹配日程所需但被 Task 筛选排除的父 Task，放入新增 `related.project_tasks[]`，其缺失 Plan 可放 `related.plans[]`，与主列表区分；上下文不计作筛选命中，UI/Agent 合并查名称时仍使用真实 ID |
| `type + id` | type 增加 project_task；保留 item 与服务端版本。Task 详情返回所属 Plan、该 Task 及其关联 Schedule；Schedule 详情补其父 Task 与 Plan（不因父对象终态筛选丢失），独立 Schedule 两者皆空；Plan 详情可附其 Task/Schedule。精确 ID 查询不套用列表搜索/状态条件来隐藏目标 |
| `GET /api/planning/drafts/:id` | 保留 summary/payload/conflicts/status/review_token/confirmation，新增 Task、依赖、关联和重排差异的可审阅数据；不返回密钥或内部数据库错误 |

**创建与局部引用**：

- create 保留原有单个 plan 和 schedules，新增可选 project_tasks。每个新 Task 使用草案内唯一 `ref`（1–64 个 ASCII 字母、数字、下划线或连字符），以及 title、description?、due_at?、plan_id?、depends_on?；状态和 position 由服务端初始化。Task 未指定 plan_id 时只可默认归属同草案的新 Plan，没有新 Plan 则必须提供真实既有 Plan ID；Task 的 plan_id 不接受 null。
- depends_on 使用互斥引用对象 `{id:"既有TaskID"}` 或 `{ref:"本草案Task引用"}`；只允许引用同 Plan 的任务，支持引用在数组后面声明的 Task，但整图必须无环。ref 仅用于本草案，不能用于后续查询/修改，不能作为数据库 id，也不允许模型提交自选 id。
- Schedule 保留原有时间字段，增加 `plan_id?:真实ID或null` 与互斥的 `task_id?:真实ID或null` / `task_ref?:本草案ref`。省略关联时遵循 §10.2.2：绑定 Task 则解析其 Plan；无 Task 且同草案有新 Plan 则默认关联新 Plan；显式 plan_id:null 表示独立，不能同时提供 Task。未知、重复或跨 Plan 的引用整份拒绝，不能忽略字段或静默改绑。
- 同草案 Task 与 Schedule 的新增条目总数最多 50，单个 Plan 单独计；仅 plan、仅 schedules 及显式关联既有 Plan 的旧请求仍合法。确认事务生成 Plan ID，再预分配 Task ID 映射，校验并写入任务/依赖，最后写 Schedule；拒绝不留下业务对象。结果增加 `created:{plan_id, task_ids_by_ref, schedule_ids}`，真实 ID 来自实际保存，不把 ref 当成功结果。

**修改、批量变更与确认**：

- 旧的 `{operation,target:{type,id},patch?}` 请求继续有效，target.type 增加 project_task。Task update 白名单为 title/description/due_at/status/depends_on；due_at:null 清空截止，depends_on:[] 清空依赖，字段省略保留旧值，其他 null 按字段规则拒绝；依赖修改只接受真实 Task ID，不跨草案使用 ref。状态范围和 complete/cancel 规则遵循 §10.2.3，不开放 plan_id/position/id/source/系统时间编辑。
- 可选批量请求采用 `{operation:"update", changes:[{action,target,patch?},…]}`，action 为 update/complete/cancel，最多 50 条；与单目标、reorder、create 互斥，同一对象只能出现一次。服务端读取真实 before 并派生 after，不接收客户端伪造的 before/after、审计、版本或 confirmation；存储层仍按既有规则将规范化操作归为 update 或全取消时 cancel，每个对象审计保留实际 action。
- Schedule patch 允许真实 task_id 和 plan_id，解绑/改绑按 §10.2.2 原子校验；预览逐项展示原/新 Plan 与 Task 的 ID、名称、状态、时段和必要的依赖/截止提示。依赖快照与排序快照须纳入 review_token；客户端不能用只读查询的 item.version 代替草案 review_token。
- `PATCH /api/planning/drafts/:id` 继续只接受 decision 和 review_token；409 只刷新预览等待新确认，不自动重试批准。响应沿用现有业务成功/failed/拒绝及 agent_sync 的区别；created 仅在确有创建成功的终态提供，同一草案重试返回相同 ID。
- API 与两个 Agent 工具必须共用或逐项对照同一输入定义，覆盖所有可选字段和 null 语义，避免再次出现服务层支持 plan_id 但工具层丢字段。旧工具名与 readonly/needs-confirm 权限不变；已发现 E1/E2 单独修复并回归，不等于本候选已经落地。

**接口/排序验收范围（实跑结果见 §10.2.6）**：

- 同一 Plan 并发追加任务得到锁内分配的稳定尾部顺序；重排不修改终态任务，超规模或部分列表明确拒绝。
- 重排预览后另一会话增删活跃成员、完成任务或改变顺序，旧确认不能覆盖新结果；排序写入/审计故障时全部回滚。
- 旧 create、单目标 update/complete/cancel、旧列表消费者仍可运行；新增字段不替换旧字段或改变时间筛选口径。
- 新 Plan、互相引用但无环的 Task 与 Schedule 局部引用全部解析为真实 ID；自依赖、重复 ref、错误引用和跨 Plan 组合不部分保存。
- Agent schema 的 plan_id/task_id/task_ref、依赖、批量和 reorder 入参不被丢弃；显式 null、字段省略、空依赖数组按不同语义处理。
- Task 搜索和状态筛选不把 related 上下文冒充命中；独立 Schedule、终态父 Task 及未排期 Task 的查询均能如实表达。
- 用户拒绝后不写入对象或顺序；同一草案重复确认不多建记录、多写审计或分配新 ID。

#### 10.2.5 实施授权记录与顺序（2026-10-28，结果见 §10.2.6）

在整体清单呈交后，使用者明确指示“进行 非必要 不要停下”，本次据此实施下列范围并连续完成常规板块；这不同于此前仅推进讨论的“继续/进入”。原先三项 A 保持不变，不扩展自动重复、无日期待办或进度能力；真实/远程数据、提交及推送不在自动执行范围。

**已确认、不得静默改变的决定**：

- ProjectTask 的 done/cancelled 是终态，继续或返工另建任务。
- blocked 人工设置；依赖是否满足单独派生，前置完成不自动改状态，取消的前置不视为完成。
- 保留历史、不开放业务物理删除；Plan/Task 取消不隐式取消关联对象。

**本次实施采用的新增规则**：

| 项目 | 本次建议采用的规则 | 影响与依据 |
|---|---|---|
| 核心数据 | §10.2.1 的字段候选：Task 必须归属 Plan，不跨 Plan 移动；标题 1–200 码点、说明上限 10000；只以 todo 创建；可空 due_at | 截止与执行排期分离，可有截止而无 Schedule；长度、初始状态和归属限制不是既有实现 |
| 本期范围 | §10.2.2：零碎有日期安排可独立；无日期独立待办、重复规则、估时和自动进度暂不实现 | 不强造 Plan 或时间；每日固定事项目前只能通过明确有限日期的多条 Schedule 表达，不能宣称已有重复能力 |
| 终态及阻塞 | §10.2.3：终态内容也只读；blocked 先显式解除，再单独确认完成；终态 Plan 不接收新任务或新关联 | 比“状态不可重开”更严格，是新增候选限制；已有子对象可明确继续处理，不自动重开父对象 |
| 截止与关联 | 截止越界或排期晚于截止只提示、不静默修正；Schedule 以省略、null、真实 ID 分别表达默认关联、明确独立、指定关联 | 维持当前非硬时间包络，不新增隐式拒绝；解绑/改绑原子预览并留下完整快照 |
| 排序 | §10.2.4：尾部追加；完整活跃列表重排，最多 50 条；终态顺序不改，无变化不创建草案 | 不能只重排搜索/分页子集；全状态视图可能穿插历史记录，首期不承诺大规模局部排序 |
| 接口与确认 | 保留四端点与两工具名；增量 Task、依赖、局部引用、批量和排序结构；旧请求/响应字段保留；重审、幂等、权限及失败语义按 §10.2.3/4 | 服务端/Agent 不丢可选字段，不猜 ID；保存与审计原子，批准但保存失败如实记录；同草案幂等不等于不同草案自动查重 |
| 存储与上线 | 候选独立 Task/依赖表、同 Plan 复合外键、自依赖 CHECK 与服务端锁内环检测；保留旧 ID 与 Schedule.plan_id，task_id 初始 NULL | 先隔离验证，不导入 SystemTask；沿用人工执行编号 SQL，不在本期新增迁移登记器，具体编号/锁顺序/索引在实现前复核 |

未在上表或 §10.2.1–4 中承诺的提醒推送、重复序列、独立待办、自动进度、自动改期和物理清理不随封版自动纳入。封版表示接受设计范围及候选行为，不代表代码已完成，也不替代每板块开始前的现状核对或提交前文件清单确认。

**本次实施顺序（实际验收见 §10.2.6）**：

| 板块 | 意图与范围 | 完成证据 |
|---|---|---|
| ① 修复 E1/E2 | 只修现有 Plan–Schedule 的 Agent plan_id 丢失与 null/省略混淆，不引入 Task | 工具解析保留关联；独立 PostgreSQL 确认落库覆盖指定既有 Plan、新 Plan 默认关联、同草案明确独立及拒绝零写入；原生命周期回归 |
| ② 增量数据库结构 | 新 Task/依赖表、Schedule.task_id、约束/索引及 project_task 审计对象类型；不执行生产迁移 | 空库与旧数据升级、连续重跑迁移、旧字段/ID/行数不变、非法关联与删除保护的隔离测试 |
| ③ 后端规划闭环 | Task 读写、状态/依赖、局部引用、重排、审阅版本和确认事务；共用输入校验 | 草案前零业务写入，批准落地、拒绝不变、审计失败回滚、并发无环、过期重审、同草案幂等 |
| ④ Agent 接入 | 两工具增量契约、权限灰显、关联查询与确认后真实结果回灌 | 同一请求经 API/Agent 保持含义；游客读可用、写越界拒绝、登录后写仍须确认，会话同步失败不重复保存 |
| ⑤ 页面接入 | Plan 下 Task 列表、截止/依赖、Schedule 归属、确认差异和活跃任务重排；维持独立日程入口 | 登录/游客、空/加载/错误/就绪、历史对象、重排过期、改绑拒绝的可见页面验证；前端构建 |
| ⑥ 集成验收与上线说明 | 对照场景清单回归并同步已实现的 SPEC/TECH_DESIGN/RUN 与进度；给出备份、显式迁移、重建和恢复步骤 | 隔离端到端证据、兼容旧数据/旧请求、真实配置环境的待办说明；实际线上部署须另行明确授权，不把文档检查说成已上线 |

各板块开始前已先检查现状，完成后报告改动与实跑结果并提示下一板块；本次依使用者指示自动衔接普通步骤。原子提交仍另列文件清单确认，不自动提交、推送或操作远程数据库。

#### 10.2.6 阶段 B 本地落地与验收（2026-10-28）

- 已实现：E1/E2；迁移 004；Task/依赖/截止与状态、局部引用、重排/批量、读写权限、审阅版本与 savepoint 原子写入；持久创建结果；Agent 共用 schema；`/planning?tab=tasks` 列表、编辑、关联和排序草案；独立确认与对话确认预览。
- 迁移与逻辑专项使用临时 PostgreSQL；专项包含已有字段校验、重复迁移、备份恢复、并发成环、部分写入故障、陈旧草案、退出登录确认与原子解绑。随后按使用者请求，当前本地 Docker PostgreSQL 已执行 004：升级前后计划均 1、日程均 2，task_id 全空；本地 web 镜像也已重建。其他真实/远程数据库及 server 镜像尚未更新。
- 规划页视觉统一：已补齐既有 `planning-page`、`view-switch`、`planning-list/item` 样式挂点，复用全站 `workflow` token；不另建颜色/字体体系。实际桌面截图见 `/tmp/vbcd-planning-unified.png`，本地 Docker web 已重建；生产构建与 `git diff --check` 通过。
- 实现取舍：为兼容现有 Schedule 冲突保护，审批统一按 schedules → plans → project_tasks → project_task_dependencies → 草案行顺序加锁，而非本节早期提出的每 Plan 锁。空 Plan/并发依赖同样串行，适合当前单人场景，不宣称支持跨 Plan 并发写；两个排序索引同时支持无状态及按状态列表。
- 尚未做：自动重复、无日期独立待办、自动进度/改期、提醒推送；真实模型推理产生 Task 草案的现场验收（工具调用与假模型闭环已回归）；线上迁移/重建与生产恢复。没有把这些项记为已完成。
- 当前证据与可复跑命令见 `runs/2026-10-28-project-planning.md`；升级步骤见 RUN §8.7.1，实际契约见 SPEC §3.0.6。


阶段 B 验收：迁移可重复执行；旧数据零损失；非法跨 Plan 关联被数据库/服务端拒绝；确认拒绝零业务写入；批准后 ProjectTask、Schedule 与 `planning_changes` 同事务落地；查询能双向定位 Plan、Task、Schedule。

**阶段 C：进度与 Agent 日程建议**（阶段 B 稳定后）：

- 先在 `manual` / `auto` / `hybrid` 中单独确定进度规则与完成率计算，定义权重、无子任务、阻塞和取消项的口径；不要先添加含义未定的 `progress` 字段。
- 再决定 `get_planning` 是否已足够，只有响应不够表达时才新增独立进度工具。
- `propose_schedule_adjustment` 只生成包含原因、前后时间、冲突和影响范围的草案；Agent 不因延期自动挪动日程，用户确认后才写入。

阶段 C 验收：进度结果可由数据库状态复算；日程调整草案展示前后差异和冲突；拒绝无写入；并发或草案过期时要求重新审阅；不重复生成或重复应用调整。

**阶段 A 历史验收状态（2026-10-28）**：✅ 当次已纳入的契约与关联用例由独立 PostgreSQL 专项测试覆盖（`server/scripts/smoke.mjs --planning-lifecycle-selftest`，25/25）；日程详情及 Agent 查询会返回所属 Plan 上下文，独立日程返回空 `plans[]`；删除 Plan 后 Schedule 保留且 `plan_id` 置空。未新增表或字段。

**下一项**：阶段 B 的本地开发/隔离验收已完成；下一步是确认提交范围，以及在使用者选择的部署环境显式备份、迁移 004 并重建服务。未获部署指令不连接或修改远程数据库。阶段 C、重复与独立待办须另行规划，不随阶段 B 自动开始。

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
