# SPEC.md — buddy 实现规格（MVP · 第 1 期）

> 上游依据：`PRD.md` v1.8（F1–F14 与验收标准）、`TECH_DESIGN.md` v1.4（技术路线、数据流、架构原则、F9/F13/F14 方案）
> 本文只写「怎么做」，不重复「为什么」（见 PRD / TECH_DESIGN）。

## 0. 前置事实

| 项 | 事实 |
|---|---|
| 服务器 | `47.85.210.76`（海外，无需备案）；22、80 可达，443 未开 |
| 代码 / 资料分区 | 代码与文档 → GitHub 公开仓（`origin`: camp 组织仓，本机只推它）；个人资料 → 自建 Gitea 私有仓（待搭建） |
| 镜像拉取 | Docker Hub 直连不通 → 用镜像站前缀拉取，见 `RUN.md` 8.7 |
| 域名 | 已有域名，A 记录是否指向服务器 IP 待确认 |

## 1. 项目结构（monorepo）

```
vbcd/
├── AGENTS.md            # 协作规则
├── research.md          # 需求研究
├── PRD.md               # 产品需求
├── TECH_DESIGN.md       # 技术设计
├── SPEC.md              # 本文件
├── README.md / RUN.md   # 项目说明 / 运行说明
├── docker-compose.yml   # 部署（Nginx + server + Chroma + asr）
├── web/                 # 前端 React + Vite
│   ├── nginx.conf       # 生产：SPA 回退 + SSE 关缓冲
│   └── src/
│       ├── pages/       # 主页(归档/主题方格) / 档案 / 归档 / 日志(任务+留痕) / 确认页 / 详情 / agent(问答) / 登录 / 关于
│       ├── components/  # MarkdownContent / NoteFileList / NoteArchiveForm / Toast
│       # 前端路由口径：/new /tasks /confirmations 重定向 → /archive /log /log?tab=confirm
│       ├── theme.js     # 深浅主题的读写与切换（F10）
│       └── api/         # 接口封装（唯一与后端通信的出口）
├── server/              # 后端 Node.js + Express
│   ├── Dockerfile
│   ├── scripts/         # hash-password.js / smoke.mjs
│   └── src/
│       ├── routes/      # 接口路由（对应第 3 章）
│       ├── services/    # 业务逻辑
│       ├── storage/     # 存储适配层（换数据库只动这里，见 7.3）
│       └── middleware/  # 鉴权、错误处理、请求日志
├── asr/                 # 转写微服务（F13）：Python + FastAPI，单进程，4 个端点，仅 compose 内网
│   ├── app.py / api.py  # 入口与路由（/v1/transcribe、/v1/jobs/{id}、/healthz）
│   ├── config.py        # env 驱动配置（JOBS_DIR 默认 asr/data/jobs，不进资料库）
│   ├── sources.py       # 来源校验（SSRF 黑名单）+ yt-dlp / 直链下载
│   ├── audio.py         # ffprobe / 归一化 / 静音对齐切片 / 时间轴合并
│   ├── providers/funasr.py  # fun-asr-flash 主通道（逐片、退避重试、partial 透传）
│   ├── jobs.py / cache.py   # job 状态机 + 单飞 + TTL GC；同源结果缓存
│   ├── scripts/probe_funasr.py  # 一次性探针（结论见 PROBE.md）
│   ├── PROBE.md         # 上游返回结构与上限的实测结论（改上游前先读）
│   ├── tests/           # pytest 单测 + respx mock 集成（不烧 Key）
│   └── Dockerfile       # python:3.11-slim + ffmpeg，非 root
├── skills/              # 可复用 AI Skill（Day 12 起）：一个 Skill 一个目录，内含 SKILL.md；
│                        #   现有 frontend-rules（前端样式规则与改动前后检查清单）
├── .pi/                 # pi 项目级设置：settings.json 注册 ../skills 为 Skill 发现路径
└── .env.example         # 环境变量样例（不含真实值，可入库）
```

**仓库边界**：
- 公开仓只放代码与文档，个人资料不进公开仓；
- 资料目录 `data/` 已被 `.gitignore` 根锚定排除（根锚定写法，避免误伤 `web/src/data/`）；
- 线上资料目录是服务器 `DATA_DIR`（数据私有仓的克隆），与代码目录分开。

## 1.1 前端主题（F10）

- **颜色只有一处定义**：`web/src/styles.css` 的 `:root`（浅色）与 `:root[data-theme='dark']`（深色覆盖），两套同名 token；组件规则里不出现硬编码色值。
- **真值**：`<html data-theme="light|dark">`；首屏由 `web/index.html` 的内联脚本在渲染前写好（避免浅色闪一下），运行期读写归 `web/src/theme.js`。
- **默认与持久化**：无 `localStorage['buddy-theme']` 时跟随系统 `prefers-color-scheme`；用户点过之后固定，写入该键（仅 `light`/`dark`，写失败静默不报错）。
- **服务端不参与**：不写 `data/profile.md`，不新增接口（接口仍 13 个），不跨设备同步。
- **无动画**：不引入 `transition` / `animation` / `@keyframes`；深色下原生控件由 `color-scheme` 跟随。
- **关于页热力图色（F11）**：两套主题各 3 个 `--contrib-*`（0 档复用 `--surface-hover`）。

## 2. 数据对象及字段

**通用约定**：
- `id`：资料用 `日期-slug`（如 `2026-09-19-wsl-setup`），任务与确认用递增时间戳随机串；
- 时间统一 ISO 8601，时区 `Asia/Shanghai`；
- 所有对象带 `schema_version`（整数），为迁移做准备；
- `hash`：正文与元数据的 SHA-256，用于查重与一致性校验。

### 2.1 Note（资料条目）——存为 `data/<分类>/YYYY-MM-DD-<slug>.md`
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 文件名主键 |
| `title` | string | ✅ | 标题（≤80 字） |
| `category` | string | ✅ | 分类目录名（`learning` / `life` / `work`） |
| `date` | date | ✅ | 资料归属日期（可与创建时间不同） |
| `tags` | string[] | ⬜ | 标签，检索用 |
| `source_url` | string | ⬜ | 来源链接（F8 会用） |
| `created_at` / `updated_at` | datetime | ✅ | 创建 / 更新时间 |
| `hash` | string | ✅ | 正文哈希（查重） |
| `schema_version` | int | ✅ | 当前 1 |
| body | Markdown | ✅ | 正文（文件主体） |

### 2.2 IndexEntry（索引条目，派生数据，不入库）
| 字段 | 说明 |
|---|---|
| `id` / `title` / `category` / `date` / `tags[]` | 取自 Note |
| `path` | 相对资料目录的文件路径（定位原文用） |
| `excerpt` | 正文前 120 字，列表页显示 |
| `hash` / `mtime` | 判断是否需要重建 |
| `rebuilt_at` | 本次索引重建时间（F3 要展示） |

### 2.3 Task（任务）——手机端发起
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键 |
| `type` | enum | `note`（记资料）/ `organize`（收敛链接，F14：异步执行，见 3.5）/ `remind`（提醒）/ `delete_note`（删除资料，高风险：只生成待确认记录，须经 F6 确认才真删，见 3.3）/ `transcribe_url`（转写归档，F13：异步执行，见 3.4） |
| `payload` | object | 任务参数（如 `{title, content}`；transcribe_url 为 `{url, category?, tags?, language?, part?}`；organize 为 `{url, category?, tags?}`） |
| `asr` | object | 可选；仅 `transcribe_url` 存在：`{job_id, stage, done, total, percent, submitted_at, last_error}`（不写转写正文，避免运行时文件膨胀） |
| `organize` | object | 可选；仅 `organize` 存在：`{stage, attempts, started_at, last_error}`，`stage ∈ fetch\|parse\|organize\|archive`（不存正文，避免运行时文件膨胀） |
| `status` | enum | `todo` / `doing` / `done` / `failed` / `attention`（见 5.4） |
| `result` | string | 执行结果摘要（成功或失败原因） |
| `origin` | enum | `phone` / `desktop` |
| `created_at` / `updated_at` | datetime | — |

### 2.4 Confirmation（确认记录）
| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `task_id` | 关联任务 |
| `action` | 将要执行的动作（如 `delete_note` / `send_mail`） |
| `summary` | 大白话写明「接下来会发生什么」（F6 要展示） |
| `requested_at` | 请求确认时间 |
| `decision` | `approved` / `rejected` |
| `confirmed_at` | 确认时间（不记录「谁」，单人使用） |

### 2.5 Rule（规则）——`data/rules.md` 的条目

> ⚠️ 本期未实现：`data/rules.md` 尚未创建，也没有读写接口。此处先约定结构。

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `text` | 规则原文（如"不要把报名截止时间当成活动开始时间"） |
| `applies_to` | 适用范围（如 `通知解析`） |
| `source` | 来自哪次纠正 |
| `created_at` | 生效时间 |

### 2.6 Session（会话，单用户）
| 字段 | 说明 |
|---|---|
| `sid` | 随机串，写入 HttpOnly Cookie |
| `created_at` / `expires_at` | 默认 30 天 |
| `last_seen_at` | 最近活跃时间 |

## 3. API 列表（13 个）

> 统一前缀 `/api`；请求与响应均为 JSON（SSE 接口除外，见 3.1）。资料接口默认公开；设 `AUTH_ENABLED=1` 后除登录外全部要求已登录。
> 删除资料不单独开接口，复用任务链路（`POST /api/tasks` + `type=delete_note`）并强制走 3.3 确认流。

| # | 方法与路径 | 用途 | 关键请求字段 | 成功响应 | 主要错误 |
|---|---|---|---|---|---|
| 1 | `POST /api/login` | 口令登录（隐私模块，默认关闭） | `password` | `200` + `Set-Cookie: sid=…` | `AUTH_FAILED` |
| 2 | `POST /api/logout` | 退出（隐私模块，默认关闭） | — | `204` | `AUTH_REQUIRED` |
| 3 | `POST /api/notes` | 新建资料（F1） | `title, category, content, tags?, source_url?` | `201 {id, path, hash}` | `VALIDATION_FAILED`、`DUPLICATE` |
| 4 | `GET /api/notes` | 列表与检索（F2/F3） | `q?, category?, from?, to?, sort?, limit?, offset?` | `200 {total, items[], rebuilt_in_ms}` | `INTERNAL` |
| 5 | `GET /api/notes/:id` | 读原文（F2） | — | `200 {meta, content}` | `NOT_FOUND` |
| 6 | `POST /api/tasks` | 建任务（F4） | `type, payload, origin?` | `201 {task}` | `VALIDATION_FAILED`、`NOT_FOUND`（delete_note 指向的资料不存在） |
| 7 | `GET /api/tasks` | 任务进度列表（F5） | `status?` | `200 {items[]}` | `AUTH_REQUIRED` |
| 8 | `PATCH /api/tasks/:id` | 更新状态 / 提交确认（F5/F6） | `status?`、`decision?`（二选一；`summary` 由服务端生成） | `200 {task}` | `VALIDATION_FAILED`、`CONFIRM_REQUIRED`（高风险未确认时 428） |
| 9 | `POST /api/kb/query` | 知识库问答（F9） | `q`（必填，≤500 字）、`k?` | `200 {answer, sources[]}` | `VALIDATION_FAILED`、`KB_NOT_CONFIGURED`、`CHROMA_UNAVAILABLE`、`LLM_FAILED` |
| 10 | `GET /api/kb/stream` | 流式问答（SSE，F9） | `?q=`、`?k=` | `text/event-stream` | 错误以 `event: error` 推送 |
| 11 | `POST /api/kb/index` | 触发增量索引（F9） | 无 | `200 {added, updated, removed, unchanged, chunks}` | `KB_NOT_CONFIGURED`、`CHROMA_UNAVAILABLE`、`LLM_FAILED` |
| 12 | `GET /api/me` | 个人主页（头像 / 昵称 / 简介 / 日程） | — | `200 {profile:{nickname,avatar,bio}, schedule:[{date,time,title}]}` | `INTERNAL` |
| 13 | `GET /api/confirmations` | 确认留痕回看（F6） | `task_id?` | `200 {total, items[]}` | `INTERNAL` |

### 3.1 知识库问答（F9）

**索引（`POST /api/kb/index` 触发）**：
- 扫描 `DATA_DIR` 各分类子目录的 `*.md`（frontmatter + 正文），空正文跳过；根级文件（`profile.md` 等）不进索引；
- 切分：`RecursiveCharacterTextSplitter`，`chunkSize=500 / chunkOverlap=50`，分隔符中文优先 `["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]`；每篇以 `# 标题` 开头拼正文一起切分；
- 写入 Chroma collection `buddy-notes`，chunk id 为 `<note_id>::<i>`，metadata 带 `note_id / title / path / chunk_index / hash`；
- 增量：清单 `data/.kb-manifest.json` 记录 `note_id → {hash, chunk_ids, path}`（hash = 标题+正文 SHA-256）。hash 相同跳过；变化先按 chunk_ids 删除再重写；文件删除则删 chunks 并清清单。清单为派生数据，不入库。

**检索与生成**：
- 问题向量化 → Chroma Top-K（默认 `KB_TOP_K=3`，接口可传 `k`，上限 10）；
- 可选 `KB_MAX_DISTANCE`：命中距离大于该值即丢弃（Chroma 返回距离，越小越像）；
- Prompt 约束：只根据给定资料回答、不足时明说、禁止编造、末尾用「来源：」行列出来源文件；
- 零命中时不调用 LLM，直接返回「资料库里没有找到相关内容…」；
- `sources[]` 元素：`{ note_id, title, path, chunk_index, score }`。

**SSE 事件格式（接口 10）**：`event: sources`（回答前先推）→ `event: token` ×N（`data:{"text":"…"}`）→ `event: done`；任一步失败推 `event: error`（`data:{code,message}`）后关闭。响应头含 `X-Accel-Buffering: no`（Nginx 不缓冲）。

### 3.2 个人主页数据文件

- `data/profile.md`：frontmatter 取三个字段——`nickname`（空则前端回落 `buddy`）、`avatar`（头像 URL，图片放 `web/public/` 后填 `/xxx.jpg`）、`bio`（单行简介）；
- `data/schedule.md`：正文每行一条，格式 `- YYYY-MM-DD [HH:mm] 事项`（时间可省略表示全天）；不合法行静默跳过；返回按日期+时间升序；
- 两文件在 `data/` 根级而非子目录：`files.js:list()` 只遍历子目录，所以不进资料列表、不进向量索引；
- 文件缺失或为空时接口照常 `200`（空对象），前端降级展示。

### 3.3 高风险动作的确认流（F6）

删除资料不可撤销，后端不提供任何直接删除入口。

**三步时序**：
1. **请求**：`POST /api/tasks` 带 `type=delete_note` + `payload.note_id` → 校验资料存在 → 任务落 `attention` → 写一条 `Confirmation`（`action=delete_note`、`summary` 写明后果、`decision` 为空）→ 一个字节都不删；
2. **闸门**：该任务存在未决 `Confirmation` 时，任何带 `status` 的 `PATCH /api/tasks/:id` 一律返回 **428 `CONFIRM_REQUIRED`**（安全边界在后端，前端只是提交决定的地方）；
3. **决定**：`PATCH /api/tasks/:id` 带 `decision=approved|rejected` → 先把决定与时间写回 `Confirmation`（留痕），再执行或取消：
   - `approved` → 执行动作（当前只有 `delete_note`）→ 任务 `done`；执行前再确认资料是否还在，不在则 `failed`；
   - `rejected` → 不执行任何动作 → 任务 `failed`，`result` 写入「你在 <时间> 拒绝了这次操作，未做任何改动」；
   - 重复提交同一确认 → `400`（已无待确认记录），对应「不重复处理」铁律。

**删除成功后的一致性**：索引缓存 `data/.index.json` 按目录指纹自动重建；向量库旧 chunk 由下一次 `POST /api/kb/index` 的增量逻辑清掉（本期不自动触发）。

**留痕口径**：`GET /api/confirmations` 按请求时间倒序返回全部记录（可 `?task_id=` 过滤）；只写「何时请求、将要发生什么、何时决定、决定了什么」，不写「谁」。

### 3.4 视频/音频转写链路（F13）

**入口**：`POST /api/tasks` 带 `type=transcribe_url` + `payload={url, category?, tags?, language?, part?}`——**不新增对外接口**（仍 13 个）。归档是 F1 同级写操作，不设确认闸门；高风险外部动作规则不变。

**payload 校验**：`url` 必须 http/https（否则 400，不落任务）；`category` 默认 `learning` 且必须是 `learning|life|work`；`part` 为 B 站分 P 序号（≥1 整数）；`tags` ≤10 个。

**时序**：
1. **提交**：校验 → `POST {ASR_SERVICE_URL}/v1/transcribe`（`wait_seconds=0`，Bearer `ASR_SERVICE_TOKEN`）→ 任务 `status=doing`、`result="已提交转写，等待结果"`、`task.asr.job_id` 落盘；服务不可达 / 未配 `ASR_SERVICE_URL` / 4xx → **不返回 5xx**，落 `failed` 任务写中文原因（与 `note` 执行器同口径，F5 进度可见）；
2. **轮询**：`services/transcribe-runner.js` 每 `ASR_POLL_INTERVAL_MS`（默认 5000）扫 `type=transcribe_url` 且 `status in (todo,doing)` 的任务，单进程单飞、一轮只推进一个：`GET /v1/jobs/{id}` 刷新 `task.asr` 与 `result`（如「转写中：正在转写（3/5，46%）」）；
3. **归档**：`succeeded` → `createNote()` → `done`，`result="已归档到 <path>"` → 立即 `DELETE /v1/jobs/{id}`（best-effort）；同 URL 已归档过则 `done` + `result="已归档过 <path>"`，不写第二份（不重复处理）；
4. **失败**：job `failed` 且 `error.details.partial` 带非空文本 → 仍归档（正文顶部加「部分转写」告警块）并 `done`；否则 `failed` 写原因。job 404 或超 `ASR_JOB_MAX_WAIT_MINUTES`（默认 60）→ `failed`，`result` 提示「可把任务退回待办重试」；
5. **重试**：`PATCH` 退回 `todo` 时清空 `task.asr`，轮询器下一轮重新提交（复用既有 `failed→todo` 合法迁移，无新接口）。

**资料格式**（全文始终来自转写，不由 LLM 生成）：标题取 `source.title`（空则 `<platform>-<id>`，≤80 字）；frontmatter `source_url` = 原链接；正文 = 来源行（URL/平台/时长/转写日期）→ `## 摘要`（3–5 句）→ `## 要点`（3–7 条）→ `## 全文（带时间戳）`（相邻 segment 间隔 <2s 合并成段，`[mm:ss]` 或 ≥1h 的 `[h:mm:ss]`）。LLM 未配置/失败 → 去掉摘要/要点两节，改一行「⚠️ 本次未做模型整理（原因：…）」并 `done`。

**LLM 整理**：复用 `services/llm.js` 的 `getChatModel(timeoutMs)`（独立实例，超时 `NOTE_LLM_TIMEOUT_MS` 默认 120s）；输入截断 `LLM_TRANSCRIPT_MAX_CHARS`（默认 12000 = 头 2/3 + 尾 1/3），截断时在资料里注明。

**句级时间戳的来源**（2026-09-28 实测，详见 `asr/PROBE.md`）：上游 `output.sentence` 是**整片一个对象**（毫秒），句级 `segments[]` 由该对象的 `words[]` 按标点重组（句末标点 `。！？!?…；;` 切分，start 取首词、end 取末词）；没有 `words[]` 时降级为整片一段并标 `timestamp_granularity="chunk"`（不谎报 sentence）。上游**单请求音频硬上限 300 秒**（305s 起 HTTP 400 + 空句子，与体积无关），故 `ASR_CHUNK_SECONDS` 默认 180 且启动时对硬上限夹紧。

**向量索引**：归档后 `POST /api/kb/index` 仍需手工触发（本期不自动入库），RUN.md 8.8 有说明。

### 3.5 链接收敛链路（F14 / `organize`）

**入口**：归档页「收敛」或 `POST /api/tasks` 带 `type=organize` + `payload={url, category?, tags?}`——**不新增对外接口**（仍 13 个）。归档是 F1 同级写操作，不设确认闸门（读取外部网页不算对外动作）。

**payload 校验**：`url` 必须 http/https（否则 400，不落任务）；`category` 默认 `learning` 且必须是 `learning|life|work`；`tags` ≤10 个。

**时序**：
1. **提交即执行**：`createTask` → `services/organize.js:startOrganizeTask()` 校验 → 置 `doing`、`result="已提交，正在抓取链接"`、`task.organize={stage:'fetch',attempts:1,started_at}` 落盘并**即时返回 201**（异步触发，不阻塞请求）；
2. **抓取**（`services/link.js`）：SSRF 闸门（只许 http(s)；IP 字面量与 DNS 解析结果的私有/保留段一律拒，含内网、回环、链路本地、CGNAT、云元数据；IPv6 按段判，v4-mapped 与 6to4 抽内嵌 v4 再判）→ `fetch` + `redirect:'manual'` **逐跳跟随**（≤5 跳，每跳重验）→ 超时 `ORGANIZE_FETCH_TIMEOUT_MS`(20s) → 只收 `text/html` → 体积封顶 `ORGANIZE_MAX_HTML_BYTES`(2MB，流式截断) → 按声明 charset 解码，乱码密度 >5% 自动重试 gb18030；
3. **提取**：`node-html-parser` 删干扰标签 → 优先 `article/main/[role=main]/#content/.article/.post/.entry-content` 中文本最长者，否则 `body`；标题 `<title>` > `og:title` > `h1` > 域名（≤80 字）；正文 < `ORGANIZE_MIN_TEXT_CHARS`(200) → 失败并给出路（发散手动粘贴 / 视频改用转写）；
4. **查重（两次）**：提交 URL 先查一次（命中就跳过抓取），抓取后的**最终 URL** 再查一次（短链/跳转归一）；命中 → `done`「已归档过 <path>」，不写第二份；
5. **LLM 整理**：复用 `getChatModel(NOTE_LLM_TIMEOUT_MS)` + `truncateForLlm`（`LLM_TRANSCRIPT_MAX_CHARS`），失败回退模板（正文一行「未做模型整理」）并 `done`；
6. **归档**：`buildLinkNote()` → `createNote()` → `done`「已归档到 <path>」；`createNote` 报 `DUPLICATE`（同内容）也算「已归档过」。

**资料格式**（全文始终来自抓取的网页，不由 LLM 编造）：标题 ≤80 字；frontmatter `source_url` = 提交链接；正文 = 来源行（链接/重定向提示/站点/抓取日期，可选作者）→ 可选视频提示行 → `## 摘要` → `## 要点` → `## 原文节选（前 ORGANIZE_EXCERPT_CHARS=8000 字）`。

**兜底轮询器**（`services/organize-runner.js`）：正常路径是提交即执行，轮询器只收两种残局——`todo`（`PATCH failed→todo` 重试，清空 `task.organize` 后重跑）与 `doing` 且 `updated_at` 超 `ORGANIZE_STALE_MS`(240s) 未动的僵死任务（`attempts < ORGANIZE_MAX_ATTEMPTS`(3) 则重跑，否则 `failed`）；单飞、一轮一个。

**失败落点**（均写进 `task.result` 中文文案，不是 HTTP 错误码）：非 http(s) 提交时 400；内网/云元数据 → `failed`「出于安全已阻止」；下载失败/超时/非 HTML/正文不足 → `failed` 带原因与出路；LLM 失败 → 仍归档；`createNote` 失败 → `failed` 可退回重试。

**与 F13 的边界**：视频站链接（bilibili/youtube 等）仍走本文通用抓取（拿到标题+简介），但会在正文里提示「要逐句时间戳请改用视频转写」；不做自动改走转写。

## 4. 数据流

完整图见 `TECH_DESIGN.md` 第 4 章，此处只列要点：

- **写入**：前端（JSON）→ Nginx → 后端（校验 → 写 `data/<分类>/…md`；隐私模式才先鉴权）→ 更新索引 → `git commit & push` → 私有仓；
- **读取**：前端 → 后端 →（必要时 `git pull`）→ 扫描资料目录重建索引 → 返回 JSON → 前端展示；
- **权威副本**：Gitea 私有仓的 Git 版本；服务器目录与 `index.json` 都是可重建的副本。

## 5. 错误处理

### 5.1 统一响应体
```json
成功：{ "ok": true,  "data": { ... } }
失败：{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "标题不能为空" } }
```

### 5.2 错误码表
| code | HTTP | 何时出现 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | 未登录或会话过期 |
| `AUTH_FAILED` | 401 | 口令错误 |
| `VALIDATION_FAILED` | 400 | 字段缺失 / 超长（如标题 >80 字） |
| `NOT_FOUND` | 404 | 资料或任务不存在 |
| `DUPLICATE` | 409 | 同一份内容重复提交（按 `hash` 查重） |
| `CONFIRM_REQUIRED` | 428 | 高风险操作未附带确认（F6） |
| `RATE_LIMITED` | 429 | 登录尝试过于频繁 |
| `STORAGE_FAILED` | 503 | 写文件失败（磁盘 / 权限） |
| `GIT_FAILED` | 503 | 文件写成功但提交或推送失败 |
| `KB_NOT_CONFIGURED` | 503 | 知识库问答未配置（缺 `OPENAI_API_KEY` / `CHROMA_URL`） |
| `LLM_FAILED` | 503 | 模型端点异常（Chat 或 Embedding） |
| `CHROMA_UNAVAILABLE` | 503 | 向量库连不上或异常 |
| `ASR_NOT_CONFIGURED` | 503 | 转写服务未配置（缺 `ASR_SERVICE_URL`），仅出现在任务 result，不作响应码 |
| `ASR_UNAVAILABLE` | 503 | 转写服务不可达 / 超时（同上：落任务 result，接口仍返回 201） |
| `INTERNAL` | 500 | 其他未预期错误 |

### 5.3 用户可见文案
- 一律中文、说清后果，不暴露堆栈，例如「保存失败：服务器磁盘空间不足，请稍后重试」；
- 前端收到任何 `ok:false` 都必须显示提示，不允许静默失败（F1 验收）。

### 5.3.1 交互反馈档位与提示条（Day 11 · 交互反馈）

同一个动作的三档反馈，按「用户多久之后还需要看得到」来选：

| 档位 | 什么时候用 | 现有实现 |
|---|---|---|
| ① 即时态（按下立刻变） | 用户正在操作的那个控件 | `NoteDetailPage.jsx` 的「正在发起…」+ `disabled`；全站 `:focus-visible` 焦点环 |
| ② 短暂提示（几秒后自动消失） | 操作成功 / 失败，看一眼就够 | 本小节新增：`components/Toast.jsx` |
| ③ 结果留痕（可回看） | 用户之后还要回来查 | 任务状态徽标、`/log?tab=confirm` 留痕页签、`?tab=confirm` / `?tab=activity` / `?cal=month` / `?view=dir` 写进地址栏 |

**提示条规格**（首个使用者：资料详情页「复制路径」）

- **组件**：`web/src/components/Toast.jsx`，纯展示（`props: { text, tone }`，`tone: 'ok' \| 'error'`）；状态与计时器由使用它的页面持有，**不引入全局状态**。
- **位置**：固定视口**右上角**（`top` / `right` = `var(--sp-4)`，`z-index` 高于内容，`max-width: min(92vw, 360px)`；窄屏 `right: var(--sp-2)`、`max-width: calc(100vw - var(--sp-4))`）。会短暂压住顶部标题区，但 `pointer-events: none` 保证不挡点击（使用者在 2026-09-27 实测后选定右上角）。
- **单例**：同一时刻最多一条；再次触发**先清掉上一个计时器**再重设，不叠加、不排队。
- **停留时长**：成功 **3 秒**、失败 **5 秒**（失败信息更重要）；到时自动消失。
- **文案（以此表为准，改动需同步本表）**：

  | 场景 | 按钮文字 | 提示条文字 |
  |---|---|---|
  | 复制成功 | `复制路径` → `已复制 ✓`（3 秒后复原） | `路径已复制：data/<分类>/<文件>.md` |
  | 复制失败（浏览器不支持或拒绝剪贴板） | `复制路径` → `复制失败`（3 秒后复原） | `复制失败，请长按选中路径手动复制` |

- **失败降级**：`navigator.clipboard?.writeText` 不可用或抛错时，用 Selection API **自动选中**「文件路径」里的 `<code>` 文本供手动复制；不引入 polyfill、不请求额外权限。
- **连续操作**：连点 / 连按多次只保留最后一条提示，按钮文字不反复跳动；组件卸载时清掉计时器。
- **可访问性**：提示条容器 `role="status"` + `aria-live="polite"`；触发控件用原生 `<button>`（`Enter` / `Space` 天然可用），焦点环沿用全局 `:focus-visible`；`Enter` / `Space` 与鼠标点击行为一致。
- **无动画**：出现 / 消失均为瞬时，不引入 `transition` / `animation`；颜色走现有 token，深浅主题自动成立。
- **不依赖后端**：只读页面上已有的 `meta.path`，不新增接口、不改 `server/`。

### 5.4 部分失败与幂等
- **写文件成功但 Git 失败** → 任务 / 资料标记 `attention`，保留待重试队列，页面可见；
  - ⚠️ 当前尚未生效：`storage/files.js:sync()` 仍是空操作（没有远端可推），第 3 周接上私有仓后才会产生 `attention`；
- **重复提交** → 按 `hash` 判定 `DUPLICATE`，不重复写入；
- **确认类操作** → 未带 `decision=approved` 一律拒绝（`428`）。

### 5.5 日志
- 位置 `LOG_DIR/app.log`（Docker 卷挂载，容器重建不丢），保留 7 天；
- 每条含 `request_id`、时间、路径、状态码、耗时、错误码；
- 错误额外记录堆栈（仅服务端可见）。

## 6. 环境变量

`.env` 不入库；仓库里只放 `.env.example`。

| 变量 | 示例 | 说明 | 敏感 |
|---|---|---|---|
| `NODE_ENV` | `production` | 运行模式 | ⬜ |
| `PORT` | `3000` | 后端监听端口（仅内网） | ⬜ |
| `PUBLIC_ORIGIN` | `https://buddy.example.com` | 对外地址，用于 Cookie 与跳转 | ⬜ |
| `DATA_DIR` | `/srv/buddy/data` | 资料目录；本地开发缺省 = 仓库根 `data/` | ⬜ |
| `DATA_REPO_URL` | `git@gitea.example.com:bird/buddy-data.git` | 数据私有仓地址 | 🟡 |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `buddy` / `buddy@local` | 服务器上自动提交身份 | ⬜ |
| `AUTH_ENABLED` | `1` | 设 1 启用隐私模块（需登录）；缺省公开免登录 | ⬜ |
| `SESSION_SECRET` | 随机 32 字节 | 会话签名（暂未启用，当前用随机 sid） | 🟡 |
| `PASSWORD_HASH` | `$2b$…`（bcrypt） | 单用户口令哈希（仅 `AUTH_ENABLED=1` 时需要） | 🔴 |
| `SESSION_TTL_HOURS` | `720` | 会话有效期（仅隐私启用时生效） | ⬜ |
| `TZ` | `Asia/Shanghai` | 时区 | ⬜ |
| `LOG_LEVEL` | `info` | 日志级别 | ⬜ |
| `LOG_DIR` | `/srv/buddy/logs` | 日志目录 | ⬜ |
| `TRUST_PROXY` | `1` | 位于 Nginx 之后 | ⬜ |
| `OPENAI_API_KEY` | `sk-…` | F9 必填：OpenAI 兼容端点 key | 🔴 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Chat 端点；可换 DashScope 兼容模式 / Ollama `/v1` | ⬜ |
| `LLM_MODEL` | `gpt-4o-mini` | 聊天模型 | ⬜ |
| `LLM_TIMEOUT_MS` | `30000` | 单次模型调用超时。**必须 < Nginx `proxy_read_timeout`（60s）**，否则用户看到英文 504 页 | ⬜ |
| `LLM_MAX_RETRIES` | `1` | 模型调用失败的重试次数（配合上面的超时一起控制最坏等待） | ⬜ |
| `EMBED_MODEL` | `text-embedding-3-small` | Embedding 模型 | ⬜ |
| `EMBED_BASE_URL` | （可空） | Embedding 端点；空 = 与 `OPENAI_BASE_URL` 同端点（DeepSeek 无 embeddings，需单独配） | ⬜ |
| `EMBED_API_KEY` | （可空） | Embedding key；空 = 与 `OPENAI_API_KEY` 相同 | 🔴 |
| `CHROMA_URL` | `http://47.85.210.76:8000` | Chroma 服务地址（自托管） | ⬜ |
| `CHROMA_AUTH_TOKEN` | 随机串 | Chroma token 认证（`X-Chroma-Token` 头）；服务端开了才需要 | 🟡 |
| `KB_TOP_K` | `3` | 检索段落数（1–10） | ⬜ |
| `KB_MAX_DISTANCE` | （可空） | 距离阈值：命中距离大于它即丢弃 | ⬜ |
| `INDEX_CACHE` | `1` | 资料索引缓存开关；设 `0` 强制重建 `data/.index.json` | ⬜ |
| `ASR_SERVICE_URL` | `http://asr:8000` | F13 转写微服务地址（compose 内网服务名）；缺省 = 功能关闭 |
| `ASR_SERVICE_TOKEN` | 随机串 | 调 ASR 的 Bearer token，与 `asr/.env` 的 `SERVICE_TOKEN` 一致 | 🔴 |
| `ASR_HTTP_TIMEOUT_MS` | `15000` | 调 ASR 单次请求超时 | ⬜ |
| `ASR_POLL_INTERVAL_MS` | `5000` | 转写轮询器间隔 | ⬜ |
| `ASR_JOB_MAX_WAIT_MINUTES` | `60` | job 超此时长未完成判超时 | ⬜ |
| `NOTE_LLM_TIMEOUT_MS` | `120000` | 转写笔记整理的模型超时（比问答慢，允许分钟级） | ⬜ |
| `LLM_TRANSCRIPT_MAX_CHARS` | `12000` | 喂给模型的转写/正文文本上限（超长截头留尾） | ⬜ |
| `ORGANIZE_FETCH_TIMEOUT_MS` | `20000` | 抓单个网页的超时（F14） | ⬜ |
| `ORGANIZE_MAX_HTML_BYTES` | `2097152` | HTML 体积封顶（超过就截断，不爆内存） | ⬜ |
| `ORGANIZE_MIN_TEXT_CHARS` | `200` | 正文少于此字数即判提取失败 | ⬜ |
| `ORGANIZE_EXCERPT_CHARS` | `8000` | 资料里「原文节选」的字数上限 | ⬜ |
| `ORGANIZE_SWEEP_INTERVAL_MS` | `15000` | organize 兜底轮询间隔 | ⬜ |
| `ORGANIZE_STALE_MS` | `240000` | `doing` 超过此时长未动算僵死（须 > fetch+LLM 最坏耗时） | ⬜ |
| `ORGANIZE_MAX_ATTEMPTS` | `3` | 僵死重试上限，超过判 failed | ⬜ |
| `ORGANIZE_ALLOW_LOOPBACK` | `0` | =1 时**只放行回环地址**（127.0.0.1/localhost/::1），仅供本地假服务器自测；内网与云元数据地址恒拦 | 🟡 |

`asr/` 服务侧变量见 `asr/.env.example`（完整清单以样例文件为准；高频项：`DASHSCOPE_API_KEY` / `SERVICE_TOKEN` / `MAAS_BASE_URL` / `ASR_MODEL` / `ASR_CHUNK_SECONDS` / **`ASR_MAX_AUDIO_SECONDS=300`（上游单请求时长硬上限，启动时把 `ASR_CHUNK_SECONDS` 夹紧到 ≤ 本值）** / `ASR_MAX_B64_BYTES` / `ASR_REQUEST_TIMEOUT` / `ASR_CHUNK_CONCURRENCY` / `ASR_GLOBAL_CONCURRENCY` / `ASR_HOST` `ASR_PORT` / `DOWNLOAD_TIMEOUT` `MAX_DOWNLOAD_MB` / `JOBS_DIR` `JOB_TTL_SECONDS` `JOB_TIMEOUT_SECONDS` / `YTDLP_*` / `CACHE_TTL_SECONDS`）。

> ⚠️ **本表里有几个键目前代码不读**（属部署期预留，尚未启用）：`PUBLIC_ORIGIN` / `DATA_REPO_URL` / `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `TZ` / `LOG_DIR` / `TRUST_PROXY`。2026-09-29 由 `buddy-doc-sync` 核对发现（代码 0 处读取，`.env.example` 里也没有）——填入无害但也无效，启用对应功能时需同时补实现与文档。

**密钥管理**：Git 拉取用服务器上的 deploy key（SSH），不放 `.env` 明文；`.env` 权限 600，只属于部署用户。

## 7. 部署与迁移

### 7.1 部署步骤（服务器 `47.85.210.76`）
1. 基础环境：`apt install docker.io docker-compose`；
2. 目录：创建 `/srv/buddy/{data,logs}`，`data` 为私有仓克隆（deploy key）；
3. 应用：`docker compose up -d`（后端 3000 仅绑 `127.0.0.1`；asr 8000 仅 compose 内网，不发布端口）；
4. 入口：Nginx 反代 + certbot 申请证书（443 未开，需放行安全组）；
5. 自启：`systemctl enable docker`（+ compose restart 策略）；
6. 备份：每日 `git clone --mirror` 到本地 + 阿里云快照；
7. 域名：A 记录指向 `47.85.210.76`。

### 7.2 安全清单
> 本期隐私模块默认关闭：站点公开可读写。需要门禁时才设 `AUTH_ENABLED=1`。
- [ ] 只对外开放 80/443；22 建议改端口或限制来源 IP
- [ ] 后端端口不对公网暴露
- [ ] `asr` 不发布端口且 `SERVICE_TOKEN` 已设（否则仅允许绑 127.0.0.1）；`asr/.env` 权限 600
- [ ] Gitea：强密码 + 两步验证 + 关闭公开注册
- [ ] `.env` 权限 600；密钥不进 Git
- [ ] 服务器系统与 Docker 定期更新

### 7.3 迁移场景（本期重点：文件存储 → 数据库）

- **触发条件**（任一）：资料 > 1000 条；列表检索 > 2 秒；需要多端并发写入；
- **设计前提**：后端读写必须走 `server/src/storage/` 适配层（对外只暴露 `list / get / put / remove / sync`），业务代码不直接碰文件系统 —— 换存储不改业务、不改 API、不改前端；
- **迁移三步**：
  1. **导入 + 双写**：建 `notes` 表（字段对齐第 2 章）→ 全量导入 Markdown → 此后新写入同时落文件和数据库；
  2. **校验**：逐条比对 `hash`，确认零差异（脚本放 `server/migrations/`）；
  3. **切换读路径**：读走数据库 → 观察一段时间 → Markdown 作为备份保留；
- **回滚**：读路径改回文件即可（数据库保留，不破坏数据）；
- **注意**：`schema_version` 与迁移脚本必须成对存在；迁移期间不改 API 契约。

### 7.4 其他迁移
- **换 Embedding 模型**：向量维度变化 → 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json` 后重跑 `/api/kb/index`；
- **向量库迁移**：Chroma 数据是派生数据（可由 `data/` 重建），换实例直接重索引；
- **换电脑**：`git clone` 代码 + 数据两个仓库即可继续；
- **换服务器**：新机装 Docker → 恢复 `data` 与 `.env` → 起容器 → 切 DNS。

### 7.5 行动项
| # | 事项 | 状态 |
|---|---|---|
| A1 | 公开仓 `.gitignore` 排除资料目录 | ✅ 已完成（`memory/`、`drafts/`、根锚定 `/data/`，均已 `git check-ignore` 验证） |
| A2 | 搭建自建 Gitea 私有仓（含 backup 与 deploy key） | ⬜ 待做 |
| A3 | Docker Hub 不可达时的镜像来源 | ✅ 已定：用镜像站前缀拉取，见 `RUN.md` 8.7 |
| A4 | 确认域名 A 记录是否指向 `47.85.210.76` | ⬜ 待确认 |
| A5 | 开通 443 + certbot 证书自动化 | ⬜ 待做 |
| A6 | 服务器安全组与 SSH 加固（改端口 / 限来源） | ⬜ 待做 |
| A7 | F13 转写链路的三项验证（>20 分钟多片 `chunks ≥ 5`、TTL 内 `cache_hit=true`、逐句 `[mm:ss]` 归档复跑） | ✅ **已完成**（2026-09-29）：`chunks=14` / `cache_hit=true`（0.127s）/ 归档 68 段带时间戳；留证见 `runs/2026-09-29-f13-live-verify.md`（含「asr 镜像必须先重建」的前置条件），探针结论见 `asr/PROBE.md` §A4 |
| A8 | `GET /api/health` 是否计入「N 个接口」 | ⬜ **待使用者拍板**（2026-09-29 由 `buddy-doc-sync` 子 agent 独立核对时发现）：代码实际注册 **14** 个 `router.*`（含 health），文档统一口径是**不含 health** 的「13 个」——但本文件 §3 的表与正文从未收录 health，而 `RUN.md` §8.4 把「健康检查」写进「已有」，两份口径不齐。选项：① **维持 13**（推荐，改动最小）→ 在本文件 §3 表下加一行脚注「另有 `GET /api/health`（健康检查，无鉴权，不计入上表）」；② 改为计入 → 本文件 §3 标题 + `RUN.md` + `AGENT.md` + `TECH_DESIGN.md` + `PRD.md` **五处 13→14** 同步 |
