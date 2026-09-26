# SPEC.md — buddy 实现规格（MVP · 第 1 期）

> 上游依据：`PRD.md` v1.3（F1–F9 与 31 条验收标准）、`TECH_DESIGN.md` v1.2（技术路线、数据流、架构原则、F9 方案）
> 日期：2026-09-19 ｜ 定位：Day 7 生成代码时直接照此实现；本文只描述"怎么做"，不重复"为什么"（见 PRD / TECH_DESIGN）

## 0. 前置事实（已核实，2026-09-19）

| 项 | 事实 |
|---|---|
| 服务器 | `47.85.210.76`（**海外，无需备案**）；端口 **22 可达**、**80 可达**、443 未开（证书待配） |
| 本机 WSL | Debian 13 + **Node v20.19.2** + **Docker 26.1.5**（免 sudo，systemd 已启用） |
| ⚠️ 镜像拉取 | 本机 WSL 直连 Docker Hub **超时** → **改为在海外服务器上构建/拉取镜像**（本机不拉） |
| 代码/数据分区 | 代码与文档 → GitHub 公开仓 **双远程**（`origin`: bird-z/vbcd、`camp`: XingHo-VibeCoding/vbcd）；个人资料 → 自建 Gitea 私有仓（**待搭建**） |
| 本机网络 | ⚠️ 环境变量中的代理端口已失效 → 推送报 502 / TLS handshake failed；**直连 GitHub 正常**，推送统一加 `-c http.proxy= -c https.proxy=`（alias `pushboth`） |
| 域名 | 已有域名（**待确认**是否已解析到服务器 IP） |

## 1. 项目结构（monorepo）

```
vbcd/
├── AGENTS.md            # 协作规则 + 项目铁律
├── research.md          # Day 3 需求研究
├── PRD.md               # Day 4 产品需求
├── TECH_DESIGN.md       # Day 5 技术设计
├── SPEC.md              # 本文件（实现规格）
├── web/                 # 前端：React + Vite
│   ├── src/
│   │   ├── pages/       # 录入 / 列表 / 详情 / 任务 / 确认
│   │   ├── components/  # 通用组件
│   │   └── api/         # 接口封装（唯一与后端通信的出口）
│   └── package.json
├── server/              # 后端：Node.js + Express
│   ├── src/
│   │   ├── routes/      # 接口路由（对应第 3 章；tasks.js/confirmations.js = F4–F6，kb.js = F9）
│   │   ├── services/    # 业务逻辑（资料、任务、确认；kb.js 索引+问答、llm.js 模型装配）
│   │   ├── storage/     # 存储适配层（见 7.3：将来换数据库只动这里）
│   │   ├── middleware/  # 鉴权、错误处理、请求日志
│   │   └── index.js
│   ├── migrations/      # 数据迁移脚本（未来文件→数据库用）
│   └── package.json
├── docs/                # 备忘与手册摘录（可选）
└── .env.example         # 环境变量样例（不含真实值，可入库）
```

**仓库边界（重要）**：
- 公开仓**只放代码与文档**，个人资料内容**不进公开仓**；
- 开发期的资料目录（`data/`）**已补 `.gitignore` 规则**（见 7.5 行动项 A1）；
- 线上资料目录位于服务器 `DATA_DIR`（数据私有仓的克隆），与代码目录分开。

## 2. 数据对象及字段（草案，请逐项确认）

**通用约定**：
- `id`：资料用 `日期-slug`（如 `2026-09-19-wsl-setup`），任务与确认用递增时间戳随机串；
- 时间统一 **ISO 8601** 字符串，时区 `Asia/Shanghai`；
- 所有对象带 `schema_version`（整数），为未来迁移做准备；
- `hash`：正文与元数据的 SHA-256，用于**查重**与一致性校验。

### 2.1 Note（资料条目）——存为 `data/<分类>/YYYY-MM-DD-<slug>.md`
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 文件名主键 |
| `title` | string | ✅ | 标题（≤80 字） |
| `category` | string | ✅ | 分类目录名（`learning` / `life` / `work`） |
| `date` | date | ✅ | 资料归属日期（可与创建时间不同） |
| `tags` | string[] | ⬜ | 标签，检索用 |
| `source_url` | string | ⬜ | 来源链接（B 站/网页，F8 会用） |
| `created_at` / `updated_at` | datetime | ✅ | 创建/更新时间 |
| `hash` | string | ✅ | 正文哈希（查重） |
| `schema_version` | int | ✅ | 当前 1 |
| body | Markdown | ✅ | 正文（文件主体） |

### 2.2 IndexEntry（索引条目，派生数据，不入库）
| 字段 | 说明 |
|---|---|
| `id` / `title` / `category` / `date` / `tags[]` | 直接取自 Note |
| `path` | 相对资料目录的文件路径（用于"定位原文"） |
| `excerpt` | 正文前 120 字，列表页显示 |
| `hash` / `mtime` | 用于判断是否需要重建 |
| `rebuilt_at` | 本次索引重建时间（F3 验收要展示） |

### 2.3 Task（任务）——手机端发起
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键 |
| `type` | enum | `note`（记资料）/ `organize`（整理链接）/ `remind`（提醒）/ `delete_note`（删除资料，**高风险**：只生成待确认记录，须经 F6 确认才真删，见 3.3） |
| `payload` | object | 任务参数（如 `{title, content}`） |
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
| `summary` | **大白话写明"接下来会发生什么"**（F6 验收要展示） |
| `requested_at` | 请求确认时间 |
| `decision` | `approved` / `rejected` |
| `confirmed_at` | 确认时间（**不记录"谁"**，单人使用） |

### 2.5 Rule（规则）——`data/rules.md` 的条目

> ⚠️ **本期未实现**：`data/rules.md` 尚未创建，也没有读写它的接口 —— 此处先约定数据结构，等真正要做「记住你的纠正」时再实现。

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
| `sid` | 随机串，写入 **HttpOnly Cookie** |
| `created_at` / `expires_at` | 默认 30 天 |
| `last_seen_at` | 最近活跃时间 |

## 3. API 列表（**13 个**）

> 说明：原方案我提了 7 个，**漏了 F5 需要的"任务列表"接口**，故实为 8 个（此处如实修正）；2026-09-25 为 F9 知识库问答追加 3 个、为个人主页追加 1 个；2026-09-26 为 F6 确认留痕追加 1 个，共 13 个。
> **删除资料不单独开接口**：它复用任务链路（`POST /api/tasks` + `type=delete_note`），并强制走 3.3 的确认流。
> 统一前缀 `/api`；请求与响应均为 JSON（SSE 流式接口除外，见 3.1）。资料接口**默认公开**；启用隐私模块（`AUTH_ENABLED=1`）后，除登录外全部要求已登录。

| # | 方法与路径 | 用途 | 关键请求字段 | 成功响应 | 主要错误 |
|---|---|---|---|---|---|
| 1 | `POST /api/login` | 口令登录（隐私模块，默认关闭） | `password` | `200` + `Set-Cookie: sid=…` | `AUTH_FAILED` |
| 2 | `POST /api/logout` | 退出（隐私模块，默认关闭） | — | `204` | `AUTH_REQUIRED` |
| 3 | `POST /api/notes` | 新建资料（F1） | `title, category, content, tags?, source_url?` | `201 {id, path, hash}` | `VALIDATION_FAILED`、`DUPLICATE` |
| 4 | `GET /api/notes` | 列表与检索（F2/F3） | `q?, category?, from?, to?, sort?, limit?, offset?` | `200 {total, items[], rebuilt_in_ms}` | `INTERNAL` |
| 5 | `GET /api/notes/:id` | 读原文（F2） | — | `200 {meta, content}` | `NOT_FOUND` |
| 6 | `POST /api/tasks` | 建任务（F4） | `type, payload, origin?` | `201 {task}` | `VALIDATION_FAILED`、`NOT_FOUND`（delete_note 指向的资料不存在） |
| 7 | `GET /api/tasks` | 任务进度列表（F5） | `status?` | `200 {items[]}` | `AUTH_REQUIRED` |
| 8 | `PATCH /api/tasks/:id` | 更新状态 / 提交确认（F5/F6） | `status?`、`decision?`（两者二选一；`summary` 由服务端生成，不接受传入） | `200 {task}` | `VALIDATION_FAILED`、`CONFIRM_REQUIRED`（高风险动作未确认时返回 `428`） |
| 9 | `POST /api/kb/query` | 知识库问答（F9） | `q`（必填，≤500 字）, `k?` | `200 {answer, sources[]}` | `VALIDATION_FAILED`、`KB_NOT_CONFIGURED`、`CHROMA_UNAVAILABLE`、`LLM_FAILED` |
| 10 | `GET /api/kb/stream` | 流式问答（SSE，F9） | `?q=`、`?k=` | `text/event-stream` | 错误以 `event: error` 推送 |
| 11 | `POST /api/kb/index` | 触发增量索引（F9） | 无 | `200 {added, updated, removed, unchanged, chunks}` | `KB_NOT_CONFIGURED`、`CHROMA_UNAVAILABLE`、`LLM_FAILED` |
| 12 | `GET /api/me` | 个人主页（头像/昵称/简介/日程） | — | `200 {profile:{nickname,avatar,bio}, schedule:[{date,time,title}]}` | `INTERNAL` |
| 13 | `GET /api/confirmations` | 确认留痕回看（F6） | `task_id?` | `200 {total, items[]}` | `INTERNAL` |

### 3.1 知识库问答（F9，2026-09-25 追加）

**索引（离线建库，`POST /api/kb/index` 触发）**：
- 扫描 `DATA_DIR` 各分类**子目录**中的 `*.md`（frontmatter + 正文），空正文跳过（根级文件如 `profile.md` 不进索引）；
- 切分：`RecursiveCharacterTextSplitter`，`chunkSize=500 / chunkOverlap=50`，分隔符中文优先 `["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]`（依次：段落 → 换行 → 中英文句读 → 空格 → 硬切字符）；每篇以 `# 标题` 开头拼接正文一起切分；
- 向量化后写入 Chroma collection `buddy-notes`，chunk id 为 `<note_id>::<i>`，metadata 带 `note_id / title / path / chunk_index / hash`；
- **增量**：本地清单 `data/.kb-manifest.json` 记录 `note_id → {hash, chunk_ids, path}`（hash=标题+正文 SHA-256）。hash 相同跳过；变化先按 chunk_ids 删除再重写；文件被删则删 chunks 并清清单条目。清单为派生数据，不入库。

**检索与生成**：
- 问题向量化 → Chroma Top-K（默认 `KB_TOP_K=3`，接口可传 `k`，上限 10）；
- 可选 `KB_MAX_DISTANCE`：命中的距离大于该值即丢弃（Chroma 返回的是距离，越小越像）；
- Prompt 约束：只根据给定资料回答、不足时明说、禁止编造、末尾用「来源：」行列出用到的文件；
- 零命中时不调用 LLM，直接返回固定话术「资料库里没有找到相关内容…」；
- `sources[]` 元素：`{ note_id, title, path, chunk_index, score }`（score 为检索距离）。

**SSE 事件格式（接口 10）**：`event: sources`（检索结果，回答前先推）→ `event: token` ×N（`data:{"text":"…"}`）→ `event: done`；任一步失败推 `event: error`（`data:{code,message}`）后关闭。响应头含 `X-Accel-Buffering: no`（供 Nginx 反代不缓冲）。

### 3.2 个人主页数据文件（2026-09-25 追加）

- **`data/profile.md`**：frontmatter 只取三个字段——`nickname`（昵称，空则前端回落 `buddy`）、`avatar`（头像 URL，推荐把图片放 `web/public/` 后填 `/xxx.jpg`）、`bio`（单行简介）。
- **`data/schedule.md`**：正文每行一条日程，格式 `- YYYY-MM-DD [HH:mm] 事项`（时间可省略表示全天）；不合法的行静默跳过；接口返回按日期+时间升序。
- 两文件位于 `data/` **根级而非子目录**：`files.js:list()` 只遍历子目录，所以它们不会出现在资料列表，也不会进知识库向量索引。
- 文件缺失或为空时接口照常返回 `200`（空 profile / 空 schedule），由前端降级展示。

### 3.3 高风险动作的确认流（F6，2026-09-26 追加）

**为什么要有它**：删除资料不可撤销。产品铁律要求「先展示后果、经使用者确认后再执行」，所以后端**不提供任何直接删除的入口**。

**三步时序**：
1. **请求**：`POST /api/tasks` 带 `type=delete_note` + `payload.note_id` → 校验资料存在 → 任务落 `attention` → 写一条 `Confirmation`（`action=delete_note`、`summary` 用大白话写明后果、`decision` 为空）→ **一个字节都不删**；
2. **闸门**：只要该任务存在未决的 `Confirmation`，任何带 `status` 的 `PATCH /api/tasks/:id` 一律返回 **`428 CONFIRM_REQUIRED`**，不给绕过确认的口子（前端页面只是「提交决定」的地方，安全边界在后端）；
3. **决定**：`PATCH /api/tasks/:id` 带 `decision=approved|rejected` → **先把决定与时间写回 `Confirmation`（留痕），再按决定执行或取消**：
   - `approved` → 执行动作（当前只有 `delete_note`）→ 任务 `done`；执行前会再确认一次资料是否还在，不在则 `failed`；
   - `rejected` → **不执行任何动作** → 任务 `failed`，`result` 写明「你在 <时间> 拒绝了这次操作，未做任何改动」；
   - 重复提交同一确认 → `400`（已无待确认记录），对应「不重复处理」铁律。

**删除成功后的一致性**：索引缓存（`data/.index.json`）按目录指纹自动重建，无需手工清理；知识库向量库里的旧 chunk 由下一次 `POST /api/kb/index` 的增量逻辑清掉（本期不自动触发）。

**留痕口径**：`GET /api/confirmations` 按请求时间倒序返回全部记录（可 `?task_id=` 过滤）；记录**不写「谁」**（单人使用），只写「何时请求、将要发生什么、何时决定、决定了什么」。

## 4. 数据流

两条链路的完整图见 `TECH_DESIGN.md` 第 4 章（写入链路 / 读取链路），此处只列要点：

- **写入**：前端（JSON）→ Nginx → 后端（校验 → 写 `data/<分类>/…md`；**隐私模式启用时才先鉴权**）→ 更新索引 → `git commit & push` → 私有仓；
- **读取**：前端 → 后端 → （必要时 `git pull`）→ 扫描资料目录重建索引 → 返回 JSON → 前端展示，点条目可看原文；
- **权威副本**：**Gitea 私有仓的 Git 版本**；服务器目录与本地 `index.json` 都是可重建的副本。

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
| `VALIDATION_FAILED` | 400 | 字段缺失/超长（如标题 >80 字） |
| `NOT_FOUND` | 404 | 资料或任务不存在 |
| `DUPLICATE` | 409 | 同一份内容重复提交（按 `hash` 查重，**对应实验里的"不重复处理"**） |
| `CONFIRM_REQUIRED` | 428 | 高风险操作未附带确认（F6） |
| `RATE_LIMITED` | 429 | 登录尝试过于频繁（简单限流） |
| `STORAGE_FAILED` | 503 | 写文件失败（磁盘/权限） |
| `GIT_FAILED` | 503 | 文件写成功但提交或推送失败 |
| `KB_NOT_CONFIGURED` | 503 | 知识库问答未配置（缺 `OPENAI_API_KEY` / `CHROMA_URL`） |
| `LLM_FAILED` | 503 | 模型端点异常（Chat 或 Embedding） |
| `CHROMA_UNAVAILABLE` | 503 | 向量库连不上或异常 |
| `INTERNAL` | 500 | 其他未预期错误 |

### 5.3 用户可见文案
- 一律**中文、说清后果**，不暴露堆栈；例如"保存失败：服务器磁盘空间不足，请稍后重试"；
- 前端收到任何 `ok:false` 都**必须显示提示**，不允许静默失败（F1 验收）。

### 5.4 部分失败与幂等
- **写文件成功但 Git 失败** → 任务/资料标记 `attention`，保留待重试队列，并在页面上可见（不静默）；
  - ⚠️ **当前尚未生效**：`storage/files.js:sync()` 仍是空操作（没有远端可推），第 3 周接上私有仓后才会真正产生 `attention` 状态；
- **重复提交** → 按 `hash` 判定为 `DUPLICATE`，不重复写入（这也是"不重复处理"的产品铁律在代码层的落地）；
- **确认类操作** → 未带 `decision=approved` 一律拒绝执行（`428`）。

### 5.5 日志
- 位置：`LOG_DIR/app.log`（Docker 卷挂载，容器重建不丢）；保留 **7 天**；
- 每条含 `request_id`、时间、路径、状态码、耗时、错误码；
- 错误额外记录堆栈（仅服务端可见）。

## 6. 环境变量

`.env` **不入库**；仓库里只放 `.env.example`（键名 + 占位值）。

| 变量 | 示例 | 说明 | 敏感 |
|---|---|---|---|
| `NODE_ENV` | `production` | 运行模式 | ⬜ |
| `PORT` | `3000` | 后端监听端口（仅内网，不直接暴露） | ⬜ |
| `PUBLIC_ORIGIN` | `https://buddy.example.com` | 对外地址，用于 Cookie 与跳转 | ⬜ |
| `DATA_DIR` | `/srv/buddy/data` | 资料目录；本地开发缺省 = 仓库根 `data/` | ⬜ |
| `DATA_REPO_URL` | `git@gitea.example.com:bird/buddy-data.git` | 数据私有仓地址 | 🟡 |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `buddy` / `buddy@local` | 服务器上自动提交身份 | ⬜ |
| `AUTH_ENABLED` | `1` | 设 1 启用隐私模块（需登录）；缺省公开免登录 | ⬜ |
| `SESSION_SECRET` | 随机 32 字节 | 会话签名（**暂未启用**，当前用随机 sid） | 🟡 |
| `PASSWORD_HASH` | `$2b$…`（bcrypt） | 单用户口令哈希（**仅 AUTH_ENABLED=1 时需要**，不存明文） | 🔴 |
| `SESSION_TTL_HOURS` | `720` | 会话有效期（仅隐私启用时生效） | ⬜ |
| `TZ` | `Asia/Shanghai` | 时区 | ⬜ |
| `LOG_LEVEL` | `info` | 日志级别 | ⬜ |
| `LOG_DIR` | `/srv/buddy/logs` | 日志目录 | ⬜ |
| `TRUST_PROXY` | `1` | 位于 Nginx 之后 | ⬜ |
| `OPENAI_API_KEY` | `sk-…` | **F9 必填**：OpenAI 兼容端点 key | 🔴 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Chat 端点；可换 DashScope 兼容模式 / Ollama `/v1` | ⬜ |
| `LLM_MODEL` | `gpt-4o-mini` | 聊天模型（可换 deepseek-chat / qwen-plus…） | ⬜ |
| `EMBED_MODEL` | `text-embedding-3-small` | Embedding 模型 | ⬜ |
| `EMBED_BASE_URL` | （可空） | Embedding 端点；可空 = 与 `OPENAI_BASE_URL` 同端点（DeepSeek 无 embeddings，需单独配） | ⬜ |
| `EMBED_API_KEY` | （可空） | Embedding key；可空 = 与 `OPENAI_API_KEY` 相同 | 🔴 |
| `CHROMA_URL` | `http://47.85.210.76:8000` | Chroma 服务地址（自托管） | ⬜ |
| `CHROMA_AUTH_TOKEN` | 随机串 | Chroma token 认证（`X-Chroma-Token` 头）；服务端开了才需要 | 🟡 |
| `KB_TOP_K` | `3` | 检索段落数（1–10） | ⬜ |
| `KB_MAX_DISTANCE` | （可空） | 距离阈值：命中的距离大于它即丢弃 | ⬜ |

**密钥管理**：Git 拉取用服务器上的 **deploy key（SSH）**，不放 `.env` 明文；`.env` 权限 `600`，只属于部署用户。

## 7. 部署与迁移注意事项

### 7.1 部署步骤（服务器 `47.85.210.76`）
1. 基础环境：`apt install docker.io docker-compose`（服务器在海外，镜像拉取大概率通畅）
2. 目录：创建 `/srv/buddy/{data,logs}`；`data` 为私有仓克隆（deploy key）
3. 应用：`docker compose up -d` 启动后端（端口 3000 仅绑 `127.0.0.1`）
4. 入口：Nginx 反代 + `certbot` 申请证书（**443 目前未开**，需开通并放行安全组）
5. 自启：`systemctl enable docker`（+ compose 的 restart 策略）
6. 定时任务：每日 `git clone --mirror` 到本地 + 阿里云快照（备份链路）
7. 域名：A 记录指向 `47.85.210.76`（**待确认是否已解析**）

### 7.2 安全清单（部署时逐条打勾）
> ⚠️ 本期**隐私模块默认关闭**：站点公开可读写。需要门禁时才设 `AUTH_ENABLED=1` 并妥善保管口令。
- [ ] 只对外开放 80/443；22 建议改端口或限制来源 IP
- [ ] 后端端口不对公网暴露
- [ ] Gitea：强密码 + 两步验证 + 关闭公开注册
- [ ] `.env` 权限 600；密钥不进 Git
- [ ] 服务器系统与 Docker 定期更新

### 7.3 迁移场景（本期重点：**文件存储 → 数据库**）
**为什么现在就要写**：数据显示存储是"有意欠债"，迟早要还。

- **触发条件**（任一满足）：资料 > 1000 条；列表检索 > 2 秒；需要多端并发写入；
- **设计前提**：后端读写必须走 `server/src/storage/` **适配层**（对外只暴露 `list / get / put / remove / sync` 五个方法），业务代码不直接碰文件系统 —— 这样换存储**不改业务、不改 API、不改前端**；
- **迁移三步**：
  1. **导入 + 双写**：建 `notes` 表（字段对齐第 2 章）→ 全量导入 Markdown → 此后新写入同时落文件和数据库；
  2. **校验**：逐条比对 `hash`，确认零差异（脚本放 `server/migrations/`）；
  3. **切换读路径**：读走数据库 → 观察一段时间 → 旧的 Markdown 作为备份保留（不删除）；
- **回滚**：读路径改回文件即可（数据库保留，不破坏数据）；
- **注意事项**：`schema_version` 与迁移脚本必须成对存在；迁移期间**不要改 API 契约**（前端零改动是验收点之一）。

### 7.4 其他迁移（简述）
- **换 Embedding 模型**：向量维度会变 → 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json` 后重跑一次 `/api/kb/index`（不做自动迁移）；
- **向量库迁移**：Chroma 数据是派生数据（可由 `data/` 重建），换实例直接重索引即可，无需导出；
- **换电脑**：`git clone` 两个仓库（代码 + 数据）即可继续；
- **换服务器**：新机装 Docker → 恢复 `data` 与 `.env` → 起容器 → 切 DNS；因为数据在 Git 里，迁移风险低。

### 7.5 已知阻塞项与行动项
| # | 事项 | 状态 |
|---|---|---|
| A1 | 公开仓补 `.gitignore` 规则，确保资料目录（`memory/`、`data/`）内容永不入公开库 | ✅ **已完成**（2026-09-19：`.gitignore` 增加 `memory/`、`drafts/`；2026-09-22：增加根锚定 `/data/`；均已 `git check-ignore` 验证） |
| A2 | 搭建自建 Gitea 私有仓（含 backup 与 deploy key） | ⬜ 待做 |
| A3 | 本机 WSL 拉镜像超时 → 确定"服务器构建"路线，或在 WSL 配镜像加速器 | ⬜ 待定 |
| A4 | 确认域名 A 记录是否已指向 `47.85.210.76` | ⬜ 待确认 |
| A5 | 服务器开通 443 + 证书自动化（certbot） | ⬜ 待做 |
| A6 | 服务器安全组与 SSH 加固（改端口/限来源） | ⬜ 待做 |

## 8. 本文档待确认项（草案部分需你勾选）

1. **第 2 章字段**：`tags`、`source_url`、`excerpt` 长度（120 字）是否都保留？有没有多余字段想删？
2. **第 3 章接口**：现为 13 个（原 8 个 + F9 的 3 个 + 个人主页 1 个 + 确认留痕 1 个）。「删除资料」已于 2026-09-26 实现，但**不新增独立接口** —— 复用任务链路（`type=delete_note`）并强制走 F6 确认流（见 3.3）。
3. **第 6 章环境变量**：键名与默认值是否符合你的习惯？
4. **第 7.3 迁移**：触发条件（1000 条 / 2 秒）是否接受？
