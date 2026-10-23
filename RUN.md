# RUN.md — buddy 运行说明

> 怎么把 buddy 跑起来。技术选型见 `TECH_DESIGN.md`，接口规格见 `SPEC.md`。
> 第 1–7 节 = 前端（`web/`），第 8 节 = 后端（`server/`），第 9 节 = Obsidian。

## 1. 前提

- Node.js 20.19+ 或 22.12+
- 依赖装在 `web/node_modules/`、`server/node_modules/`，不入库

## 2. 启动（两个终端，先起后端再起前端）

> **端口说明（本机，2026-09-27 起）**：本机 `5173` 与 `3000` 已被其他项目占用，故本地 dev 改走
> **前端 `5174` / 后端 `3100`**。前端端口写在 `web/vite.config.js`，后端端口写在 `server/.env`（不入库）；
> 后端默认端口仍是 `3000`（`src/index.js` 与 `.env.example`），Docker 部署也仍走容器内 `3000`，均不受影响。

后端（`server/.env` 见第 8 节）：

```bash
cd server
npm install
cp .env.example .env        # PowerShell：Copy-Item .env.example .env
npm run dev                 # :3100（本机已改；默认仍 :3000）
```

前端：

```bash
cd web
npm install
npm run dev                 # :5174，/api 代理到 :3100
```

生产构建：`npm run build`，产物在 `web/dist/`（不入库）。

## 3. 访问

| 入口 | 地址 |
|---|---|
| 本机 | http://localhost:5174 （打卡截图用这个） |
| 手机 | http://<本机局域网IP>:5174 （同一 Wi-Fi，局域网预览；公网 HTTPS 见 8.8） |

页面清单：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 个人主页 | 头像 / 昵称 / 简介；日历周视图（默认）/ 月视图切换（`?cal=month`）；待办任务列表；**「归档」方格（跳 `/archive`）** + 深色模式方格（F10）并排 |
| `/notes` | 档案 | 卡片 / 目录两种视图（`?view=dir`），关键词与分类筛选；工具栏「+ 归档」按钮 → `/archive` |
| `/archive` | 归档 | 写一条资料（原 `/new`），Markdown 实时预览 |
| `/log` | 日志 | 任务与确认留痕合并页：`?tab=tasks`（默认，发起任务 + 进度推进，F4/F5）/ `?tab=confirm`（确认留痕回看，F6） |
| `/tasks/:id/confirm` | 确认页 | 高风险动作的后果说明 + 确认 / 取消（F6） |
| `/notes/:id` | 资料详情 | 正文 + 文件路径；底部「删除这条资料」入口（F6） |
| `/new` `/tasks` `/confirmations` | — | 旧入口，重定向到 `/archive`、`/log`、`/log?tab=confirm` |
| `/agent` | agent 对话页（F12 工具化，原 /ask 已 redirect 至此） | 见 8.12 |
| `/about` | 关于 | 自我介绍 / 研究动态页签（`?tab=activity`）；热力图按资料 date 聚合，时间线取最新 8 条（F11） |
| `/login` | 登录 | 仅 `AUTH_ENABLED=1` 时可达 |

后台入口（`/admin`）：

| 路径 | 页面 | 当前职责 |
|---|---|---|
| `/admin` | 运维总览 | 服务探针、任务/资料计数、最近任务；规划/确认/索引指标尚待补齐 |
| `/admin/tasks` | 任务队列 | 查看任务状态；`failed` / `attention` 可退回 `todo` 重试 |
| `/admin/agent/runs` | Agent 审计 | 查看 LLM/工具调用记录，只读 |
| `/admin/agent/tools` | Agent 工具 | 查看当前工具清单与风险等级，只读 |
| `/admin/notes` | 资料管理 | 搜索、分类、详情、编辑、删除；资料文件/数据库迁移边界见下文 |
| `/admin/settings` | 站点设置 | 读写 `data/site.json` 业务配置，热生效 |
| `/admin/env` | 环境变量 | `.env` 脱敏只读总览，不提供网页编辑 |

后台不是第二套业务系统：内容流、规划流和 Agent 确认都必须复用主站已有接口与事务，不直接修改数据库、会话文件或审计文件。

## 4. 功能边界

| 能做 | 不能做 |
|---|---|
| 资料：新建 / 列表检索 / 详情看原文（F1–F3）；后台可编辑已有资料 | 主站普通资料页不提供编辑入口；后台编辑受资料存储模式限制 |
| 任务：发起（记资料 / 提醒 / 收敛 / 删除资料 / 视频转写）+ 查看与推进状态（F4/F5） | `remind` 的自动执行器：只登记待办；`note` 同步归档，`organize`（收敛）提交即异步整理归档（F14），`transcribe_url` 由轮询器异步归档（F13） |
| 删除资料：详情页发起 → 确认页看后果 → 确认后才真删（F6） | smail 邮箱关联、ehall 事务（第 2–3 期） |
| 确认留痕：每次请求与决定可回看（F6） | 多用户与权限、原生 App、自动后台记录 |
| 个人主页；agent 对话 `/agent` | RAG 进阶：混合检索 / Rerank / 多轮记忆 |
| 全站深浅主题：主页方格开关，偏好存浏览器本地，首次跟随系统（F10） | 主题跨设备同步；跟随系统 / 浅 / 深 三态切换；切换动画 |
| 关于页：自我介绍 / 研究动态（F11） | 真实横幅图、热力图按天点击查看资料 |
| 视频转写：归档页切换「视频链接」并提交 `transcribe_url` 任务 → 自动转写归档（F13，见 8.9） | 上传文件转写、说话人分离 |
| 查重：内容完全相同则拒绝写入 | 公网 HTTPS 部署（见 8.9） |

## 5. 数据存哪

| 数据 | 位置 | 说明 |
|---|---|---|
| 资料 | `data/<分类>/YYYY-MM-DD-<slug>.md` | 分类 `learning` / `life` / `work`；frontmatter + 正文 |
| 索引缓存 | `data/.index.json` | 派生数据，删了下次重建 |
| 任务、确认记录 | `data/.runtime/tasks.json`、`data/.runtime/confirmations.json` | 删了只丢任务与留痕，不影响资料 |
| 个人主页 | `data/profile.md`（`nickname` / `avatar` / `bio`）、`data/schedule.md`（每行 `- YYYY-MM-DD [HH:mm] 事项`） | 根级文件，不进资料索引 |
| 站点业务配置 | `data/site.json` | 后台 `/admin/settings` 结构化读写；实际字段以 `site.json` 和 `SPEC.md` 为准 |
| 图片资产 | `data/images/` | 主站通过 `/images/*` 读取；后台资产管理尚未开放 |
| 转写临时产物 | `asr/data/jobs/`（本机）或命名卷 `asr-jobs`（compose） | 临时媒体终态即删；只剩小体积 job JSON，TTL 30 分钟 GC |

`data/` 不进公开仓（`.gitignore` 已排除），换机器 `git clone` 不会带过去。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面打不开 | dev 服务没起 | 重新 `npm run dev` |
| 改了代码页面没变 | 缓存 | Ctrl+F5 强制刷新 |
| `npm install` 卡住或 502 | 环境变量里的代理已失效 | 清空 `HTTP_PROXY`、`HTTPS_PROXY` 后再装 |
| 端口被占用 | 上次的服务还在跑 | Ctrl+C 停掉；本机 dev 已固定用 5174/3100 避开其他项目 |
| 登录提示「口令错误」 | 哈希与口令不匹配，或后端没重启 | 重跑 `node scripts/hash-password.js "口令"` 换 `PASSWORD_HASH=`，重启后端 |
| 列表「无法连接后端服务」 | 后端 :3100 没起 | 先 `cd server && npm run dev` |

## 7. 目录速查（前端）

```
web/
├── index.html
├── package.json           # dev / build / preview
├── vite.config.js         # :5174，host 打开，/api → :3100
├── nginx.conf             # 生产：SPA 回退 + SSE 关缓冲
└── src/
    ├── main.jsx           # React 挂载 + 路由
    ├── App.jsx            # 路由表
    ├── styles.css        # 颜色 token：浅色在 :root、深色在 :root[data-theme='dark']
    ├── theme.js           # 主题读写/切换（localStorage 键：buddy-theme）
    ├── pages/             # 首页 / 列表 / 新建 / 详情 / 任务 / 确认页 / 留痕 / 问答 / 登录 / 关于
    ├── api/               # client.js 统一请求；notes / tasks / me / kb / auth
    └── components/        # MarkdownContent / NoteFileList
```

## 8. 后端（`server/`）

冒烟测试：`node scripts/smoke.mjs` —— **公开模式 20/20、隐私模式 24/24** 通过（按 `/api/health` 的 `auth_enabled` 自适应；2026-09-29 实测复核，此前口径 19/23 已过时）。隐私模式临时口令哈希：`node scripts/hash-password.js "口令" | head -1`（第二行是提示文字，只取第一行）。
转写链路冒烟（后端以 `ASR_SERVICE_URL=http://127.0.0.1:8099 ASR_SERVICE_TOKEN=fake-token ASR_POLL_INTERVAL_MS=1000` 启动后）：`SMOKE_FAKE_ASR_PORT=8099 node scripts/smoke.mjs` —— 自动拉起 `scripts/fake-asr.mjs` 桩，追加 9 条断言（成功/查重/部分转写/失败/404/重试/非法 payload），**公开 29/29、隐私 33/33**（2026-09-29 实测复核，此前口径 28/32 已过时）。
> 两个档位都**需要先自起一个后端**（`smoke.mjs` 不会自己拉后端）：如 `DATA_DIR=/tmp/buddy-smoke PORT=3199 node src/index.js`，再 `BASE_URL=http://localhost:3199 node scripts/smoke.mjs`。用临时 `DATA_DIR` 可避免写到真实 `data/`。
> **条数随开关变化**：不开 `ORGANIZE_ALLOW_LOOPBACK` 时会跳过「收②/收③」两条本地抓取断言（上列 20/24 与 29/33 即此口径）；开后为 **公开 31/31、隐私 35/35**（与 `AGENTS.md` §4 的 F14 条目一致）。SSRF 断言「收①」（元数据地址恒拦）**两个口径都跑**。

### 8.1 前提

- Node.js 20.19+ 或 22.12+
- 不需要 Docker；依赖装在 `server/node_modules/`，不入库

### 8.2 启动（默认公开、免登录）

```bash
cd server
npm install
cp .env.example .env
npm run dev                 # node --watch src/index.js，默认 :3000（本机已在 .env 改成 :3100）
```

> 下文 curl 示例里统一写 `:3000`（后端默认端口）。本机要是改了 `PORT`，把 `:3000` 换成实际端口（本机为 `:3100`）即可。

**三种运行模式**（SPEC §5.6）：

| 模式 | `AUTH_ENABLED` | `AUTH_WRITE_REQUIRED` | 适用 |
|---|---|---|---|
| ① 完全公开（本地 dev） | `0` | `0` | 默认；一切直通 |
| ② 读写分离（公网推荐） | `0` | `1` | 游客读公开 / 写 + 敏感读要登录 |
| ③ 全站鉴权（隐私） | `1` | 任意 | 未登录一律 401 |

模式②（公网推荐）配置：

```bash
node scripts/hash-password.js "你的口令"     # 哈希粘到 .env 的 PASSWORD_HASH=
# .env 加一行：AUTH_WRITE_REQUIRED=1
```

- 游客：可读公开数据 + 用 agent readonly 工具（chat 入口开放，LLM 看不到写工具）
- 登录后：全部权限（含 agent needs-confirm 工具、/admin、/ima、写操作）
- 登录页：`/login` 可达但不挂导航链接（你记 URL 直达；不是真正的隐藏，依赖入口不可知）

模式③（全站鉴权）配置：

```bash
node scripts/hash-password.js "你的口令"
# .env 加一行：AUTH_ENABLED=1
```

`server/.env` 常用项（不入库）：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 端口 |
| `NODE_ENV` | `development` | `production` 时 Cookie 加 `Secure` |
| `AUTH_ENABLED` | `1` | 可选；不设 = 公开免登录 |
| `AUTH_WRITE_REQUIRED` | `1` | 可选；不设 = 公开模式写也免登录；设 1 时**必须配 `PASSWORD_HASH`**，否则无人能写 |
| `PASSWORD_HASH` | bcrypt 哈希 | 模式②或③都需要 |
| `SESSION_TTL_HOURS` | `720` | 会话有效期 30 天，可省 |

### 8.2.1 可选 Key 获取向导（人操作 · 不做不跑也能用）

buddy 的可选能力各有自己的 Key。**不配对应 Key 也能跑**，只是该功能显示空态或降级（详见各小节「三档降级」）。要解锁时需要你自己去对应平台拿 Key——本节集中列步骤，避免每次翻文档。

| 功能 | 需要的 env | 拿不到时的表现 |
|---|---|---|
| 登录（模式②/③） | `PASSWORD_HASH` | 无人能写（模式②）或无人能进（模式③） |
| ima 云端知识库/笔记（F15/F15b） | `IMA_OPENAPI_CLIENTID` + `IMA_OPENAPI_APIKEY` | 云端页空态、`/api/ima/*` → `503 IMA_NOT_CONFIGURED` |
| GitHub 热力图（F16） | `GITHUB_USERNAME`（必需）+ `GITHUB_TOKEN`（可选） | 未配 → `configured:false` 灰条；只配用户名 → 资料卡/事件可见，热力图显示「需配置 GITHUB_TOKEN」 |
| RAG 问答 / agent `ask_kb` | `OPENAI_API_KEY` + `CHROMA_URL` | `POST /api/kb/*` → `503 KB_NOT_CONFIGURED`；agent 清单里 `ask_kb` `enabled=false` |
| 视频转写（F13） | `ASR_SERVICE_URL` + `ASR_SERVICE_TOKEN` | `type=transcribe_url` 任务 → `failed` |
| 链接收敛 / agent 归档（F14） | `OPENAI_API_KEY`（可选） | 缺 Key → 仍能归档，但资料只有「原文节选」无模型整理 |

#### A. `PASSWORD_HASH`（模式②/③必配）

本机执行：

```bash
cd server
node scripts/hash-password.js "你的口令"
# 输出形如 $2b$10$xxxxxxxx...，整串粘到 .env 的 PASSWORD_HASH=
```

⚠️ 口令明文**不要**写进 `.env`，只写哈希；`server/.env` 已在 `.gitignore`。

#### B. ima OpenAPI Key（F15/F15b）

1. 浏览器登录 **ima.qq.com**（腾讯 QQ/微信扫码）
2. 打开 **https://ima.qq.com/agent-interface** → 「开放平台」/「自建应用」
3. 创建应用 → 拿到 **ClientID** 与 **ApiKey** 两串
4. 粘到 `server/.env`：

```bash
IMA_OPENAPI_CLIENTID=<ClientID>
IMA_OPENAPI_APIKEY=<ApiKey>
```

⚠️ ApiKey 泄露 = 你的整个 ima 知识库内容泄露。不进 git、不截图发群、不提交到任何聊天记录。
⚠️ 重启 `server` 才生效（改 `.env` 不热载）。

#### C. GitHub Personal Access Token（F16 可选）

只要展示 profile + events 不需要 token；**热力图（contributionsCalendar）必须 token**。

1. 打开 **https://github.com/settings/tokens**
2. 「Generate new token (classic)」
3. Note 填 `buddy-f16`、Expiration 按需、**勾选 `read:user` 一个 scope 即可**
4. Generate → 立刻复制（关掉页面就再也看不到）
5. 粘到 `server/.env`：

```bash
GITHUB_USERNAME=bird-z         # 你的 GitHub 用户名
GITHUB_TOKEN=ghp_xxxx...       # 刚生成的 PAT
```

#### D. OpenAI 兼容 Key（F9 / F14 / agent `ask_kb`）

buddy 用 OpenAI 兼容端点，任选其一：

| 端点 | `OPENAI_BASE_URL` | 模型建议 |
|---|---|---|
| OpenAI 官方 | `https://api.openai.com/v1` | `gpt-4o-mini` + `text-embedding-3-small` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` + **另配 `EMBED_BASE_URL`**（DeepSeek 无 embeddings） |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` + `text-embedding-v3` |
| Ollama 本地 | `http://localhost:11434/v1` | `qwen2.5` 系列 |

`.env` 三行核心：

```bash
OPENAI_API_KEY=<key>
OPENAI_BASE_URL=<端点>
LLM_MODEL=<模型>
```

#### E. ASR 微服务 Token（F13）

`ASR_SERVICE_TOKEN` 是**你自己起 fun-asr 服务时自己定的一串字符串**——不是从任何平台拿，两端配置一致即可：

```bash
# server/.env
ASR_SERVICE_URL=http://localhost:8000    # 或 http://asr:8000（compose 内）
ASR_SERVICE_TOKEN=<任意随机串>
# asr/.env
SERVICE_TOKEN=<同一串>
```

#### 常见踩坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 改了 `.env` 接口还是报「未配置」 | 没重启 server（`.env` 不热载） | `docker compose up -d --build server` 或本地重启 |
| 容器内改了 `.env` 还是旧值 | compose 的 `env_file` 只在值非空时剥注释；值留空 = 注释吃进值里 | `.env` 里空值写法是 `KEY=`（等号后什么都不写），**不是** `KEY=  # 注释` |
| `docker compose` 报「变量未定义」 | compose 的 `${VAR}` 只认**仓库根 `.env`**，不认 `server/.env` | 把 compose 用到的变量（如 `PG_PASSWORD`）放根 `.env` |
| GitHub PAT 创建后忘复制 | GitHub 只显示一次 | 只能重新生成；旧 token 可在 settings/tokens 吊销 |
| ima ApiKey 截图发群了 | 等于把知识库交出去 | 立刻去 ima 后台吊销并重置 |

### 8.3 验证

```bash
# ① 服务活着（auth_enabled 表示当前模式）
curl http://localhost:3000/api/health
# {"ok":true,"data":{"status":"ok","time":"...","auth_enabled":false}}

# ② 公开模式免登录读列表
curl http://localhost:3000/api/notes
# 200 {"ok":true,"data":{"total":4,...}}

# ③ 不存在的接口 → 统一 404
curl -i http://localhost:3000/api/nope
# 404 {"ok":false,"error":{"code":"NOT_FOUND","message":"接口不存在"}}

# ④ 建一条提醒任务（无自动执行器，落待办）
curl -s -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" \
  -d '{"type":"remind","payload":{"text":"交作业"},"origin":"phone"}'
# 201 {"ok":true,"data":{"status":"todo","origin":"phone",...}}

# ⑤ 任务列表（可加 ?status=todo）
curl -s http://localhost:3000/api/tasks
# 200 {"ok":true,"data":{"total":N,"items":[...]}}
```

删除确认流（F6），`<资料id>` / `<任务id>` 换成列表里的真实 id：

```bash
# ⑥ 发起删除 → 只生成待确认记录，资料还在
curl -s -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" \
  -d '{"type":"delete_note","payload":{"note_id":"<资料id>"}}'
# 201 + status=attention

# ⑦ 没确认就执行 → 拒绝
curl -s -w ' [%{http_code}]\n' -X PATCH http://localhost:3000/api/tasks/<任务id> \
  -H "Content-Type: application/json" -d '{"status":"done"}'
# 428 CONFIRM_REQUIRED

# ⑧ 拒绝执行 → 任务 failed，资料原封不动（改 approved 才真删）
curl -s -X PATCH http://localhost:3000/api/tasks/<任务id> \
  -H "Content-Type: application/json" -d '{"decision":"rejected"}'
# 200 + status=failed

# ⑨ 留痕回看
curl -s http://localhost:3000/api/confirmations
# 200 {"ok":true,"data":{"total":N,"items":[...]}}

# ⑩ 视频转写任务（F13，需先配 ASR env 与起 asr 服务，见 8.9）
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"transcribe_url","payload":{"url":"https://www.bilibili.com/video/BVxxxx"}}'
# 201 + status=doing；随后 GET /api/tasks 可见「转写中：正在转写（n/m，x%）」→「已归档到 learning/….md」
```

隐私模式（`AUTH_ENABLED=1`）登录：

```bash
curl -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" -d '{"password":"你的口令"}'
# 200 + Set-Cookie: sid=...; HttpOnly；口令错 401 AUTH_FAILED；连错 5 次 429 RATE_LIMITED
```

### 8.4 接口边界

> 全量清单与字段契约见 `SPEC.md` §3（**44 条**：业务 24 + 管理 14 + 运维 6）。本表只做「有 / 没有」的速查。

| 已有 | 没有 |
|---|---|
| 登录 / 登出 / 健康检查（`/api/login`、`/api/logout`、`/api/health`） | 资料的 Git 提交推送同步（`sync` 占位） |
| `/api/notes`：新建、列表检索、读原文、**编辑（PATCH）**、**删除（DELETE）** | `organize` / `remind` 的独立对外接口（复用任务链路） |
| `/api/tasks`：建任务、进度列表、状态与确认 | 会话持久化：存内存，重启服务需重新登录 |
| `/api/confirmations`：确认留痕 | 独立的上传接口（F13 只接受 URL，不收文件） |
| `/api/me`：个人主页数据 | 多用户 / 权限分级 |
| `/api/kb/*`：问答三接口（SSE 流式，需配 env，见 8.6） | 云端内容写入本地（F15/F15b 明确只读） |
| `/api/ima/*`：知识库与笔记只读五接口（F15/F15b） | |
| `/api/db/*`：Postgres 只读迁移口（Day 17–18） | |
| `/api/agent/*`：对话（SSE）、审计、会话读回、工具清单（F12） | |
| `/api/github/*`：动态聚合、仓库列表（F16） | |
| 转写：`type=transcribe_url` 任务（F13，复用任务链路，需配 env，见 8.9） | |
| `/api/admin/*`、`/api/planning/*`、`/api/home`：后台与计划模块（非 PRD 验收范围） | |

### 8.5 目录速查（后端）

```
server/
├── package.json
├── .env.example           # 配置样例（.env 自建，不入库）
├── scripts/
│   ├── hash-password.js   # 生成口令哈希
│   ├── fake-asr.mjs       # 假 ASR 服务桩（转写链路冒烟用）
│   └── smoke.mjs          # 端到端冒烟
└── src/
    ├── index.js           # 读 .env → 建资料目录 → 启动转写轮询器 → 监听端口
    ├── app.js             # 装配中间件与路由
    ├── middleware/        # auth / errors / request-log
    ├── routes/            # health / auth / notes / tasks / confirmations / me / kb
    ├── services/          # notes / tasks / transcribe(+runner) / asr(客户端) / me / index-store / sessions / kb / llm / errors
    └── storage/           # files.js / tasks.js / confirmations.js
```

### 8.6 知识库问答（F9，RAG）

需要三样：OpenAI 兼容端点的 API Key（Chat 与 Embedding 同端点，Embedding 可单独配）、一个 Chroma 服务、`server/.env` 里对应变量（见 `.env.example` 的「知识库问答」组）。

```bash
# ① 起 Chroma
docker run -d --name chroma -p 8000:8000 chromadb/chroma

# ② server/.env：OPENAI_API_KEY=sk-…  CHROMA_URL=http://localhost:8000

# ③ 建索引（增量：只重算改过/新增的）
curl -X POST http://localhost:3000/api/kb/index
# {"ok":true,"data":{"added":N,"updated":0,"removed":0,"unchanged":M,"chunks":K}}

# ④ 问答
curl -X POST http://localhost:3000/api/kb/query \
  -H 'Content-Type: application/json' -d '{"q":"WSL 里 Docker 怎么配"}'
curl -N "http://localhost:3000/api/kb/stream?q=WSL"     # 流式
```

前端 `/agent` 提问，逐字显示，来源可跳原文。

| 现象 | 原因 | 处理 |
|---|---|---|
| `KB_NOT_CONFIGURED` | 缺 `OPENAI_API_KEY` 或 `CHROMA_URL` | 补齐后重启后端 |
| `CHROMA_UNAVAILABLE` | Chroma 没起 / 地址错 / 网络不通 | `curl $CHROMA_URL/api/v2/heartbeat` |
| `LLM_FAILED` | key 错 / 端点不支持该模型 / 欠费 | 用 curl 测端点 `/models` 或 `/chat/completions` |
| 用 DeepSeek 报 embeddings 404 | DeepSeek 无 `/embeddings` | Embedding 单独配 `EMBED_BASE_URL`（如 DashScope 兼容模式） |
| 换 Embedding 模型后检索全乱 | 向量维度变了 | 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json`，重跑 `/api/kb/index` |
| Chroma 裸奔公网 | 没配认证 | 设 `CHROMA_SERVER_AUTHN_CREDENTIALS` + `CHROMA_AUTH_TOKEN`，或安全组只放后端 IP |

### 8.7 后台与规划流验收

后台依赖与主站同一份登录配置。隐私模式下先设置 `AUTH_ENABLED=1` 并准备 `PASSWORD_HASH`，再登录后访问 `/admin`；公开模式下 `requireAuth` 会直通，但不建议把后台和全部管理接口暴露在公网。

```bash
# 本机后端已启动时，检查后台核心接口
curl -s http://localhost:3100/api/admin/overview
curl -s http://localhost:3100/api/admin/settings
curl -s http://localhost:3100/api/admin/env
curl -s http://localhost:3100/api/planning
```

规划写入不能直接改 `plans` / `schedules`：先通过 `POST /api/planning/drafts` 生成草案，再用 `PATCH /api/planning/drafts/:id` 提交批准/拒绝；若数据或冲突快照已变化，预期返回 `409 PLANNING_REVIEW_REQUIRED`，必须重新读取并审阅。

资料接口处于文件→PostgreSQL 迁移期：生产环境配置 `DATABASE_URL` 时 `POST /api/notes` 只写 `notes` 表；本地裸跑未配置数据库时才落 Markdown。后台资料页当前仍走 `/api/notes`，编辑/删除在两种模式下均可用（2026-10-18 验收实测，SPEC S2/S3 已同步修正）。

站点设置与环境变量的边界：

```text
/admin/settings → data/site.json，业务配置，可网页修改，热生效
/admin/env      → .env，基础设施和秘密，只读脱敏
```

Docker 部署改完 `web/src` 后必须重建 `web` 镜像，改完 `server/src` 后必须重建 `server`；不要只重启容器期待镜像内静态产物自动变化。

### 8.8 Docker 部署（Nginx + 后端 + Chroma + ASR + Postgres）

彩排与上线同一份 `docker-compose.yml`。

```bash
cd /home/bird/work/vbcd
docker compose up -d --build
docker compose ps            # web(80) / server(仅内网 3000) / chroma(仅内网 8000) / asr(仅内网 8000) / pg(仅内网 5432)
```

访问 http://localhost/ （前端静态站 + `/api` 反代，同源，Cookie 零配置）。后端 3000 与 Chroma 8000 都不发布到宿主机，Chroma 不会裸奔公网。

Docker Hub 直连不通时拉镜像（不改 `daemon.json`）：

```bash
docker pull docker.m.daocloud.io/library/node:22-alpine && docker tag docker.m.daocloud.io/library/node:22-alpine node:22-alpine
docker pull docker.m.daocloud.io/library/nginx:alpine && docker tag docker.m.daocloud.io/library/nginx:alpine nginx:alpine
docker pull docker.m.daocloud.io/chromadb/chroma:latest && docker tag docker.m.daocloud.io/chromadb/chroma:latest chromadb/chroma:latest
docker pull docker.m.daocloud.io/library/python:3.11-slim && docker tag docker.m.daocloud.io/library/python:3.11-slim python:3.11-slim   # asr 基础镜像
```

镜像站：`docker.m.daocloud.io`（示例）、`docker.1ms.run`、`hub.rat.dev`；`registry.cn-hangzhou.aliyuncs.com` 需带命名空间。

**Postgres（Day 17 读 / Day 18 写）**：`pg` 服务用 `postgres:18-alpine`（本地已有镜像），数据进命名卷 `vbcd_pg-data`、不发布端口、只在 compose 内网被 `server` 访问。首次起库自动跑 `db/schema.sql` 建表（不跑 `db/seed.sql` —— 种子只给 Day 16 的临时库用）。口令走项目根 `.env` 的 `PG_PASSWORD`（compose 的 `${VAR}` 插值只认根 `.env`，不认 `server/.env`；见踩坑表最后一行）。

**Day 18 起 `POST /api/notes` 落点自适应**：compose 里注入了 `DATABASE_URL` → `createNote()` 只写 `notes` 表（不落 `data/` 文件）；本地裸跑没配 → 照旧落文件。验证写库 + 重复/缺字段被拒：

```bash
# 正常写入 → 201 {id,path,hash}（路径是契约字段，库行没有对应 .md）
curl -s -X POST http://localhost/api/notes -H 'Content-Type: application/json' \
  -d '{"title":"测试标题","category":"learning","content":"测试正文"}'
# 重复提交同 body → 409 DUPLICATE（查重按 sha256(title\ncontent)，库里有老行也拦得住）
# 缺 title/content / 分类非 learning|life|work → 400 VALIDATION_FAILED + 中文提示
# 同标题不同正文再 POST → 自动退 -2 后缀（撞主键 23505 重试）
# 读回：curl -s http://localhost/api/db/notes/<id> 或 docker compose exec pg psql -U buddy -d buddy
```

⚠️ 只写库的资料此后会被 `sync-to-db.mjs` 对账报成「库有文件没有」——**预期内**分叉，别误删。改完 `server/src` 后记得 `docker compose up -d --build server` + `docker compose restart web`（后者防 nginx 解析旧 IP 的 502，见踩坑表）。

起库与同步（数据进 compose 内网的 pg）：

```bash
docker compose up -d --build pg server web   # pg 先 healthy 再拉起 server
# 同步 data/ 真实资料（临时容器走 compose 内网，不占宿主机端口）
docker run --rm --network vbcd_internal \
  -e DATA_DIR=/app/data \
  -e DATABASE_URL="postgres://buddy:$(grep '^PG_PASSWORD=' .env | cut -d= -f2)@pg:5432/buddy" \
  -v $(pwd)/data:/app/data -v $(pwd)/server:/srv -w /srv \
  node:22-alpine node scripts/sync-to-db.mjs
# 验证
curl -s 'http://192.168.130.14/api/db/notes?limit=3'          # 内网机子的实际 IP；localhost 也行
```

验证：

```bash
docker compose ps                                            # 四个 Up（web/server/chroma/asr），server 应为 (healthy)
curl -s http://localhost/api/health                          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/agent   # 200（SPA 回退生效；/ask 由前端 redirect）
curl -sN 'http://localhost/api/kb/stream?q=test'             # 未配 key 应立刻回 event: error
ls data/work/                                                # 主页「归档」方格 → /archive 提交一条后能看到新 .md
```

已知事实：容器写盘落到宿主机且属主为 `bird`（容器内 `uid=1000(node)`）；`./data` 与 `vbcd_chroma-data` 整栈 `down`→`up` 后数据仍在；Chroma JS 客户端 `3.5.0` 与服务器 `1.4.4` 兼容。

踩坑表（改配置时别删这几条）：

| 现象 | 原因 | 现状 |
|---|---|---|
| 刷新 `/agent`、`/notes/xxx` 变 404 | 单页路由，Nginx 找不到文件 | `web/nginx.conf` 已配 `try_files $uri /index.html` |
| 流式回答不逐字，卡一下全出来 | Nginx 缓冲 SSE | 已对 `/api/kb/stream` 关 `proxy_buffering` |
| 模型端点挂掉要等 60 秒才回，且是 Nginx 英文 504 页 | OpenAI SDK 默认超时 600s + 重试 2 次，超过 `proxy_read_timeout 60s` | 已设 `LLM_TIMEOUT_MS=30000` + `LLM_MAX_RETRIES=1`，现约 1.8 秒返回中文 `LLM_FAILED` |
| 彩排时开 `AUTH_ENABLED` 登录不了 | `NODE_ENV=production` 让 Cookie 带 `Secure`，彩排走 HTTP | 彩排不开；上线用 HTTPS 后正常 |
| 宿主机 80 端口被占用 | — | 改 compose 的 `ports`（如 `"8080:80"`） |
| Chroma 数据存哪 | 命名卷，不在仓库里 | 镜像 `1.4.4` 的 `persist_path` 是 `/data`，已挂 `vbcd_chroma-data` |
| 换 Embedding 模型后检索全乱 | 向量语义变了但文档 hash 未变，不会重建 | 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json`，重跑 `/api/kb/index` |
| 宿主机 ping 通容器 IP，访问 80 端口被重置（容器本身 healthy） | 宿主机 sing-box（v2rayN TUN）把接口地址设成 `172.18.0.1/30`，与 Docker 的 `172.18.0.0/16` 撞车，`/30` 更具体 → `172.18.0.3`（web 容器）被当成广播地址 | compose 已把 `internal` 网段固定为 `172.30.0.0/16`，别改回去 |
| `docker compose config` / `up` 报 `asr/.env not found` | `asr` 服务的 `env_file` 指向 `asr/.env`，只拷了 `.env.example` | `cp asr/.env.example asr/.env` 填入 `DASHSCOPE_API_KEY` 与 `SERVICE_TOKEN` |
| `docker compose build asr` 拉不到 `python:3.11-slim` | Docker Hub 直连不通 | 用上面的镜像站前缀拉取再 `docker tag` |
| `curl localhost:8000/healthz` 连接被拒但容器是 Up | asr **刻意不发布端口**（防 API Key 通道裸奔） | 从 server 容器里访问：`docker compose exec server node -e "fetch('http://asr:8000/healthz').then(r=>r.json()).then(console.log)"` |
| `docker` 报 `permission denied` | 当前用户不在 `docker` 组 | `sudo usermod -aG docker $USER` 后重新登录；临时：`sudo setfacl -m u:$USER:rw /var/run/docker.sock`（docker 重启后失效） |
| `docker run --env-file server/.env` 启动的服务问 KB 报 `LLM_FAILED：Cannot convert argument to a ByteString because the character at index N has a value of X which is greater than 255` | **`docker run --env-file` 不剥行内注释**（任何值都原样带上），而 `docker compose` 的 `env_file` 只在「值非空」时剥掉 ` #…` 并剥外层引号。于是密钥尾部吃进中文注释 → `Authorization: Bearer …# 可换…` 里出现 >255 的字符，Node 的 `fetch` 直接抛 ByteString 错（2026-09-29 实测：`OPENAI_API_KEY` 长度 117 → 165） | **别用 `docker run --env-file` 直接跑这个服务**；要另起一份用 `docker compose run`（同一套解析），或先把 `.env` 的注释与引号剥干净再造临时文件。核对办法：比 `LLM_MODEL` 长度（应为 19）且 `/\u4e00-\u9fa5/` 不命中 |
| 容器里某个变量的值是**一整段中文注释**（例：`SERVICE_TOKEN` 长 50、非 ASCII、以 `#` 开头；`YTDLP_PROXY=# 下载走代理时填`），表现为 401 / 代理地址非法 / `FileNotFoundError` | 2026-10-14 实测纠正上面那条的口径：**compose 的剥注释是「看值是不是空的」** —— 值非空（`ASR_CHUNK_SECONDS=180  # …`）剥掉注释；**值留空（`SERVICE_TOKEN=   # 必填：…`）则整段注释变成值**。`.env.example` 里值留空又带行内注释的行就是陷阱 | 注释一律挪到键的**上一行**（`asr/.env.example` 已于 2026-10-14 改成这个写法）；核验：`docker exec <容器> printenv <键>` 或 `python -c "import os;v=os.environ['<键>'];print(len(v),v.isascii())"`，空值应当**长度为 0** |
| 线上 `:80` 页面少了刚提交的文案（如「发散 / 收敛」搜不到），接口却是新的 | `web` 镜像是**多阶段构建**：静态产物在 `docker build` 时就固化进镜像，改完 `web/src` 不重建就永远是旧的（2026-09-29 实测：镜像 09-28 18:44 构建，而前端提交在 09-29 06:54 之后） | `docker compose up -d --build web`（会连带重启依赖服务，`asr`/`server` 会重启）。核对：`docker exec vbcd-web-1 ls -l /usr/share/nginx/html/assets/*.js` 的文件名与字节数应与 `web/dist/assets/` **完全一致** |
| `docker compose up` 报 `required variable PG_PASSWORD is missing`，但 `server/.env` 里明明写了 | **`docker compose` 的 `${VAR}` 插值只认项目根 `.env`**，`env_file` 是容器运行时的变量、不参与编排插值 | `PG_PASSWORD` 放项目根 `.env`（gitignore 已覆盖）；`server/.env` 里不必重复写 |
| web 容器还在但接口 502，`docker compose logs server` 显示 `health -> 200` | nginx 在 `server` 容器重建前启动，把 `server` 主机名解析成了旧 IP | `docker compose restart web`（重启重新解析）即可；根治法是给 nginx.conf 加 `resolver 127.0.0.11 valid=5s` + 变量代理，本期未改 |
| `git push` 报 `Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`，紧接着 `fatal: 无法读取远程仓库` | 本机该系统配置文件属主/权限不合规，OpenSSH 拒绝加载后直接退出；`git` 用 ssh 远程（`origin` = `git@github.com:…`）走的是同一个通道，`ssh fel` 也报同一句 | **把所有 ssh 路径写成绝对路径**（2026-10-14 两次实测）：<br>`GIT_SSH_COMMAND="ssh -F /home/bird/.ssh/min.conf -i /home/bird/.ssh/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/home/bird/.ssh/known_hosts" git push origin HEAD:main`；连服务器把末尾换成 `ssh … fel`。**只本次生效，不改任何持久配置**。 |
| 同上，但改用 `-F ~/.ssh/config` 时**卡住不动、直到超时被杀（exit 137）**，或报 `hostkeys_foreach failed for /root/.ssh/known_hosts: Permission denied` + `Host key verification failed` | **根因（2026-10-14 傍晚查明）**：本机 sandbox 下 ssh 进程查到的账户 home 是 **`/root`**（不是 `$HOME=/home/bird`）——OpenSSH 用 `getpwuid()` 而非环境变量定位 `~`。于是 `~/.ssh/config` 里的 `IdentityFile ~/.ssh/id_ed25519` 与默认 `known_hosts` **全被解析到 `/root/.ssh/`** → 无权限读取 → 非 `BatchMode` 时 ssh **停在 host key 交互等待输入**，因而「卡死」被杀 | **`~` 不可用，一律换绝对路径**：`-F /home/bird/.ssh/config` + `-i /home/bird/.ssh/id_ed25519` + `-o UserKnownHostsFile=/home/bird/.ssh/known_hosts`（三者缺一不可）→ 实测 `ssh -T git@github.com` 正常回 `Hi bird-z!`。**结论修正**：可用方案不是「只能用 `min.conf`」，而是「**所有路径必须绝对**」；`-F /home/bird/.ssh/config` 补全绝对路径后同样可用 |

上线到服务器还差三步：① 阿里云安全组放行 443；② 域名 A 记录指向服务器 IP；③ 加 certbot 证书段。

### 8.9 视频转写（F13）

来源查询使用与主站相同的资料存储：配库查数据库，未配库查 Markdown。保留原始 URL，按 URL 与明确 `part` 一起查重；旧档案缺少分 P 时保持 null，不推断成 P1。已有资料会提前结束任务，日志显示「查看归档资料」。查询失败和字幕归档失败会明确标记 failed，只有字幕抓取失败才回落转写。

升级已有数据库须先执行新增字段迁移（不会回填旧档案），再重建 server/web：

```bash
docker compose exec -T pg sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrations/003_notes_source_part.sql
docker compose build server web
docker compose up -d --no-deps server web
```

隔离验证（仓库根目录；本机须有 `postgres:18-alpine` 镜像）：

```bash
node server/scripts/smoke.mjs --source-selftest
```

测试会自行创建和移除独立 PostgreSQL 容器及临时目录，使用假 ASR；覆盖分 P、提前查重、导入元数据、日志真实链接和数据库故障，不处理真实链接。来源 URL 暂不归一，跨进程并发唯一与历史分 P 补齐尚未实现。

`asr/` 是独立的 fun-asr 转写微服务（FastAPI 单进程，5 个端点）；buddy 侧不新增接口，走 `type=transcribe_url` 任务（支持「先抓字幕 → 抓不到回落转写」+ srt 输出）。

```bash
# ① 本机跑：装依赖（Python 3.11+）+ 起服务
python3 -m venv asr/.venv && asr/.venv/bin/pip install -r asr/requirements.txt
cp asr/.env.example asr/.env        # 填 DASHSCOPE_API_KEY 与 SERVICE_TOKEN
asr/.venv/bin/python -m uvicorn asr.app:app --host 127.0.0.1 --port 8000   # 仓库根执行

# 健康检查（无需鉴权）；SERVICE_TOKEN 未设时只允许绑 127.0.0.1 并打 WARN
curl http://127.0.0.1:8000/healthz

# ② 服务端接入：server/.env 加
#   ASR_SERVICE_URL=http://127.0.0.1:8000   （compose 内则是 http://asr:8000）
#   ASR_SERVICE_TOKEN=<与 asr/.env 相同>

# ③ 提交转写任务（前端：归档页「收敛」→「视频链接」；也可 curl）
curl -X POST http://localhost:3100/api/tasks -H 'Content-Type: application/json' \
  -d '{"type":"transcribe_url","payload":{"url":"https://www.bilibili.com/video/BVxxxx","category":"learning","tags":["视频转写"],"prefer_subtitles":true,"formats":["text","segments","srt"]},"origin":"desktop"}'
# → prefer_subtitles=true 先抓平台字幕：命中则同步归档（status=done、result 含「字幕」、正文带 srt 代码块）；
#   抓不到则回落转写（status=doing），完成后 status=done、result=「已归档到 learning/….md」；B 站分 P 传 "part": 2

# 归档后若要进知识库问答，需手工触发一次增量索引：
curl -X POST http://localhost:3100/api/kb/index

# ④ 测试（不烧 Key）：单元 + respx mock 集成（仓库根执行，48 个用例）
asr/.venv/bin/python -m pytest asr

# ⑤ 探针（改上游参数前先跑）：asr/scripts/probe_funasr.py，结论写在 asr/PROBE.md
```

ASR 服务的 5 个端点：`POST /v1/transcribe`（`wait_seconds=0` 立即返回 job，`formats:["srt"]` 时 result 带 `srt`）、`GET|DELETE /v1/jobs/{id}`、`POST /v1/subtitles`（平台字幕抓取，同步返回 `{found:true,…}` 或 `{found:false}`）、`GET /healthz`；`/v1/*` 需 `Authorization: Bearer $SERVICE_TOKEN`。临时媒体终态即删，job JSON TTL 30 分钟后 GC。

**时长硬上限（最常踩）**：上游单请求**音频硬上限 300 秒**（305s 起 400 + 空句子，与体积无关）→ `ASR_CHUNK_SECONDS` 默认 180，且启动时自动夹紧到 ≤ `ASR_MAX_AUDIO_SECONDS`（提交 999 会打印警告并生效为 300，2026-09-29 实测）。长媒体靠静音对齐切片 + 片偏移合并完成，不需要你手动切。

**三项验证已于 2026-09-29 跑完（不再挂起）**：多片链路 `stats.chunks=14`（`BV1Eb411u7Fw` p15，39:26）、同 URL TTL 内第二次提交 `cache_hit=true`（0.127s 墙钟）、逐句 `[mm:ss]` 归档复跑成功（68 段 / 364 句）。完整命令、原始输出与「asr 镜像必须先重建」的前置条件见 `runs/2026-09-29-f13-live-verify.md`；结论同步在 `asr/PROBE.md` §A4 与 `SPEC.md` §7.5（A7）。

| 现象 | 原因 | 处理 |
|---|---|---|
| 任务立刻 `failed`：「转写服务未配置」 | `ASR_SERVICE_URL` 未设 | 补齐 `server/.env` 后重启后端 |
| 任务 `failed`：「提交转写失败：缺少或错误的 Bearer Token」（上游 401 `AUTH_FAILED`） | 两侧 token 不一致。最常见的是 `asr/.env` 的 `SERVICE_TOKEN=` **值留空、注释写在同行** → compose 把那串注释当成了值（2026-10-14 在 `fel` 实测：容器里的 token 是 50 字符的中文注释，非 ASCII） | `asr/.env` 改成「注释在上一行 + `SERVICE_TOKEN=<同一串>`」，`server/.env` 的 `ASR_SERVICE_TOKEN` 对齐；核验：`docker exec vbcd-asr-1 python -c "import os;v=os.environ['SERVICE_TOKEN'];print(len(v),v.isascii())"` 应为 `48 True`，且与 `docker exec vbcd-server-1 printenv ASR_SERVICE_TOKEN` 一致；改完 `docker compose up -d asr server`（env_file 变了必须重建容器） |
| 任务 `failed`：「提交转写失败：服务不可达」 | asr 没起 / 地址错 | `curl $ASR_SERVICE_URL/healthz`；compose 内用 `http://asr:8000` |
| 任务 `failed`：「下载失败：（yt-dlp 报错）」 | yt-dlp 版本不匹配 / 站点改版 / 会员内容 | 升 yt-dlp（`pip -U yt-dlp`，镜像里的版本见 `docker exec vbcd-asr-1 python -m yt_dlp --version`）；会员视频配 cookies |
| 任务 `failed`：「下载失败：… **HTTP Error 412: Precondition Failed**」 | B 站风控（WAF）拦出口 IP：**机房 IP 一律 412，与国内/海外无关**（2026-10-14 实测：阿里云上海 ECS 与海外 ECS 均 412；住宅 IP 能过页面请求）。另一半原因是没有登录态 | 配登录态 cookies：浏览器导出 **Netscape 格式** → `asr/.secrets/bilibili.txt` → `asr/.env` 设 `YTDLP_COOKIES_DIR=/app/secrets`（挂载已在 compose 里）→ `docker compose up -d asr`。**cookie 过期后的症状同样是 412**，重新导出覆盖该文件即可（bind 挂载、每次下载现读，**不用重建容器**）。不烧额度的核验：`POST /v1/subtitles` 同一链接不再返回 412（`found:false` 也算通过，那是「该视频没有 CC 字幕」） |
| `scp` 传 cookies 报 `Permission denied`（容器读得到、宿主机写不进） | compose 首次创建 bind 挂载的源目录时建成了 `root:root`，当前用户不是 root | 用 docker 以 root 写一次并把目录交回自己：`docker run --rm -u root -v ~/vbcd/asr/.secrets:/s -v /tmp/bilibili.txt:/in:ro vbcd-asr sh -c 'cp /in /s/bilibili.txt && chmod 644 /s/bilibili.txt && chown -R 1002:1002 /s'`（644 是给容器内 uid 10001 读的） |
| 转写慢卡在「正在下载」 | B 站限速 | 正常现象（70s 视频下载约 30s）；超时阈值 60 分钟内都算正常 |
| 想重跑一次 | `failed→todo` 合法迁移 | `PATCH /api/tasks/:id {"status":"todo"}`，轮询器自动重提交 |


### 8.10 链接收敛（F14）

归档页 `/archive` 默认停在「收敛」：贴一个链接（可选分类）→ 查询已有资料 → 后端抓网页 → 提取正文 → LLM 整理 → 再次查重归档。已有资料直接返回实际档案引用；网页链路不依赖 ASR。等价 curl：

```bash
# ① 提交（返回 201，status=doing，随即异步执行）
curl -s -X POST http://localhost:3100/api/tasks -H 'Content-Type: application/json' \
  -d '{"type":"organize","payload":{"url":"https://example.com/some-article","category":"learning","tags":["收敛"]}}'

# ② 看进度（result 会从「正在抓取网页」→「正在让模型整理」→「已归档到 data/…」）
curl -s 'http://localhost:3100/api/tasks?status=doing'

# ③ 看成果：日志的「查看归档资料」进入详情；也可 GET /api/notes/<note_id>
# 配 DATABASE_URL 时资料只写数据库；未配时才在 data/learning/ 查看 Markdown
```

前置条件：无（未配 `OPENAI_API_KEY` 也能跑，只是资料里会写一行「本次未做模型整理」）。向量索引仍需手工 `POST /api/kb/index`。

本地自测（不烧 Key、不用起服务）：

```bash
node server/scripts/link-selftest.mjs      # SSRF 拦截矩阵 / 正文提取 / 重定向 / GBK 解码，38 条（2026-09-29 实跑复核：38 通过 / 0 失败）
```

失败原因对照（都是任务 `result` 里的中文文案，不是接口报错）：

| 现象 | 原因 | 处理 |
|---|---|---|
| `failed`「出于安全已阻止」 | 链接指向内网/回环/链路本地/云元数据/CGNAT 地址 | 换成公网链接（这是防 SSRF，不要关） |
| `failed`「抓取返回 HTTP 403」 | 页面要登录或开了反爬 | 用「发散」页手动粘贴正文 |
| `failed`「正文提取失败（只提取到 n 字）」 | JS 渲染的 SPA / 非文字页 / 页面改版 | 发散手动粘贴；视频链接改用视频转写（F13） |
| `failed`「抓取超时」 | 站点慢或不可达 | 重试一次；仍失败则换源（可把任务退回待办重试） |
| 资料里写「本次未做模型整理」 | `OPENAI_API_KEY` 未配或 LLM 超时/报错 | 资料仍然可用（含原文节选）；补 Key 后重跑即可 |
| 任务卡在 `doing` 不动 | 进程执行中被重启 | 等 `ORGANIZE_STALE_MS`（默认 4 分钟）后兜底轮询器自动重试，超过 3 次会转 `failed` |

测试专用开关：`ORGANIZE_ALLOW_LOOPBACK=1` 时**只放行回环地址**（127.0.0.1 / localhost / ::1，仅供 `link-selftest.mjs` 与本地冒烟打假服务器）；
内网网段（10./172.16-31./192.168.）与云元数据地址（169.254.169.254）**无论如何都拦**。上线与日常开发一律不要开。

### 8.11 ima 云端知识库 + 笔记只读视图（F15 / F15b）

在 `/notes` 页「云端」标签看你 ima（ima.qq.com）里的**知识库**和**笔记**：知识库卡片后面还有一张「笔记」卡片，点进列表，再点进详情（`/notes/ima/:docid`，跟档案详情页同款版式）。**只读**：不写 `data/`、不进向量库、不落缓存文件；Key 只在 `server/.env`。

```bash
# ① 启用：server/.env 加两行（ima 开放平台自建，https://ima.qq.com/agent-interface）
#   IMA_OPENAPI_CLIENTID=<你的 ClientID>
#   IMA_OPENAPI_APIKEY=<你的 ApiKey>   # 泄露 = 知识库内容泄露，勿入库勿截图
# ② 重启后端后在 /notes 页点「云端」即可；不配 Key 也能跑，云端页显示说明性空态
```

接口（只读，5 个）：`GET /api/ima/kbs`（库列表）、`GET /api/ima/items?kb_id=…[&folder_id=…]`（浏览，文件夹可下钻）、`GET /api/ima/search?kb_id=…&q=…`（库内搜索）、`GET /api/ima/notes`（笔记列表）、`GET /api/ima/notes/:id`（笔记 meta + Markdown 正文，`<mark>` 已剥）。前端跨库搜索是扇出并发（上限 4），不是后端聚合；笔记不做搜索。

踩坑：

| 现象 | 原因 | 处理 |
|---|---|---|
| `IMA_UPSTREAM_FAILED: invalid SearchKnowledgeBaseReq.Limit` | 上游文档写 limit 上限 50，**实测 `search_knowledge_base` 只收 ≤20**；前端曾默认传 50 | 已修：对外收 1–50，发上游时夹紧到 20；分页走 `next_cursor` |
| 云端页一直转圈 | `IMA_*` 没配 → 接口 503 | 配 Key 重启；不想配可忽略（功能默认关闭） |
| 笔记详情里图片显示「图片已失效（ima 签名过期）」 | ima 内嵌图带 `t`/`sign` 签名，**上游已过期（403 `t info expired`），救不回来** | 属预期；能正常显示的图不受影响 |
| 知识库里的文件夹行点不动 | 上游把文件夹表示成 `media_type:99` + `media_id:"folder_…"`（与我们参照的旧版文档 `folder_id`/`name` 形状不同），判据过时 | 已知缺陷，未修（2026-10-05 实探测得） |

测试（不烧真 Key）：`SMOKE_FAKE_IMA_PORT=8097` + 后端 `IMA_BASE_URL=http://127.0.0.1:8097 IMA_OPENAPI_CLIENTID=fake-cid IMA_OPENAPI_APIKEY=fake-key` → `smoke.mjs` 会自动拉起 `scripts/fake-ima.mjs` 桩并跑 im①–im⑪（知识库 7 条：字段映射/混排/校验/上游错误透传/高亮剥标签+截断/缓存命中/隐私未登录 401；笔记 4 条：列表字段映射/详情 meta+Markdown 且 `<mark>` 已剥/404/隐私未登录 401）。

### 8.12 agent 对话（F12，2026-10-09 上线；2026-10-10 前端重构）

**接口**：`POST /api/agent/chat`（SSE）/ `GET /api/agent/runs` / `GET /api/agent/tools`（清单）/ `GET /api/agent/sessions/:id`（读回消息流，切页/刷新恢复）。整体挂在 `requireAuth` 后。

**前端（2026-10-10 起）**：`/agent` 页改用 [`@assistant-ui/react`](https://github.com/assistant-ui/assistant-ui) 的 `useExternalStoreRuntime` + `ThreadPrimitive`/`ComposerPrimitive`/`MessagePrimitive` 组装，适配器在 `web/src/agent/runtime.js`（SSE 事件 → `ThreadMessageLike` 数组），工具卡/审批卡渲染在 `web/src/agent/ToolFallback.jsx`，样式自写于 `web/src/agent/theme.css`（无 Tailwind，沿用 `--sp-*`/`--accent` 变量）。`/agent-v2` 与旧 `/ask` 一律 redirect 至 `/agent`。

**本机跑通**（本地 vLLM，`server/.env` 已指）：

```bash
# 后端（.env 里 OPENAI_BASE_URL=http://127.0.0.1:8000/v1）
npm run dev            # server 默认 3000，或 PORT=3210

# 前端
cd web && npm run dev  # /agent 页（旧 /ask、/agent-v2 均 redirect 至此）
```

**验证一条只读链路**（模型自主调 search_notes）：

```bash
curl -N -X POST http://localhost:3210/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"资料库里 learning 类最新3条？"}'
# 期望事件流：tool_call → tool_result → token* → done
```

**验证写操作闸门**（archive_note → 确认 → 真写）：

```bash
curl -N -X POST http://localhost:3210/api/agent/chat \
  -d '{"message":"把这段归档：标题 X，分类 learning，正文 ..."}' -H 'Content-Type: application/json'
# → confirmation_required 事件 + suspended:true；此刻 data/ 未写入
# 去「日志 → 确认留痕」或用 PATCH 确认：
curl -X PATCH http://localhost:3210/api/tasks/<task_id> -d '{"decision":"approved"}'
# → data/learning/ 下出现该文件；decision:"rejected" 则不写入
```

**冒烟**：`smoke.mjs` 新增 ag①–ag⑤（工具清单 / 空消息 SSE error / 不存在 session / runs 接口 / 隐私模式 401），公开 24/24 通过。真实多轮对话链路已实测（vLLM Qwen3-4B + hermes tool-call）。

**环境变量**：`AGENT_MAX_STEPS`（默认 8，单轮步数上限）、`AGENT_TOOLS`（逗号白名单收窄）。

**已知边界**：
- 确认完成后 agent 会话**不自动接话**（`resumeAfterDecision` 预留未接路由，S3 再议）——用户确认后想继续对话直接再发一条即可；
- LLM 用 `invoke` 拿全量再推 token，非逐字流式（要打字机效果可自行改 `model.stream`）；
- `routes/kb.js` 的 `/api/kb/stream` 存在同型 `req.on('close')` 误用 bug（SSE 提前判断开），待修；
- 4B 级模型偶发编造 `source_url`——system prompt 已压「不要编造」，仍建议抽查。

### 8.13 关于页 × GitHub 动态（F16，2026-10-10）

`/about` 页签接 GitHub：研究动态页签变成「资料热力图（上）+ GitHub 一年贡献热力图（下）」+ 混排时间线（GitHub 事件与资料更新按日期穿插，徽章区分来源）；自我介绍页签在「个人简介」下方渲染 GitHub 资料卡。

```bash
# ① server/.env 两行（用户名必填，token 可选）
#   GITHUB_USERNAME=bird-z
#   GITHUB_TOKEN=<Classic PAT>   # https://github.com/settings/tokens 勾选 read:user 一个 scope
# ② data/profile.md frontmatter 加一行（自我介绍页资料卡的 login 来源）
#   github: bird-z
# ③ 重启后端 → /about?tab=activity 见两块热力图 + 混排时间线
```

**接口**：`GET /api/github/activity` → `{configured, profile?, calendar?, events?}`。进程内 30 分钟 TTL 缓存 + 单飞；`GITHUB_CACHE_TTL_MS=0` 关闭。

**三档降级**：

| 状态 | 接口返回 | 页面表现 |
|---|---|---|
| 未配 `GITHUB_USERNAME` | `200 {configured:false}` | 「GitHub 动态未配置」灰条 |
| 配用户名没配 token | `configured:true` + `calendar:null` | 资料卡 + 事件时间线正常，热力图区提示「贡献日历不可用（需配置 GITHUB_TOKEN）」 |
| GitHub 整体不可达 | `502 GITHUB_UPSTREAM` | 「GitHub 动态拉取失败」灰条 |

**冒烟**：`SMOKE_FAKE_GH_PORT=8096` 拉起 `scripts/fake-github.mjs` 桩，断言 gh①–③（聚合结构 / `WatchEvent` 白名单过滤 / TTL 内上游计数不涨）；不设端口时只断言 `configured:false` 降级。


## 9. 用 Obsidian 查看资料（F1）

资料就是 Markdown 文件，可用 Obsidian 直接打开编辑。把项目 `data/` 软链进 Obsidian 仓库（这一步由你本人执行）：

```bash
ln -s /home/bird/work/vbcd/data /home/bird/note/los/buddy
```

| 在哪 | 看到什么 |
|---|---|
| Obsidian 左侧栏 | 多出 `buddy/`，按 `learning / life / work` 分类 |
| 打开一篇 | frontmatter + 正文正常渲染，`tags` 变成 Obsidian 标签 |
| 双向联动 | Obsidian 里改正文或新增文件，浏览器刷新列表页即同步（索引重建，F3） |

验收清单：

- [ ] Obsidian 的 `buddy/` 下能看到 4 条示例（atomic-commit / prd-review / proxy-502 / wsl-env）
- [ ] 浏览器「归档」页录一条 → `buddy/` 下立即出现对应 `.md`
- [ ] Obsidian 里改一条正文 → 浏览器刷新列表，内容更新
- [ ] `data/.index.json` 是隐藏文件，Obsidian 默认不显示（别删，删了只是下次重建）

| 现象 | 处理 |
|---|---|
| Obsidian 里看不到 `buddy/` | 符号链接可能不被跟随 → 把 `DATA_DIR` 指向真实目录：`DATA_DIR=/home/bird/note/los/buddy npm run dev` |
| 想换资料目录 | 改 `server/.env` 的 `DATA_DIR` 或启动时传 `DATA_DIR=…`，重启后端 |
| 列表看不到 Obsidian 里新加的文件 | 确认第一行是 `---`；没有 frontmatter 会被索引跳过并在后端日志告警 |

### 后台来源精选：热点和项目

进入 `/admin/site`（站点与个人信息页面），页面下方提供“首页热点精选”和“关于页项目精选”。

1. 点搜索框选择档案或 GitHub 仓库；项目列表仅允许 GitHub。可搜索标题、仓库名及 `focus` Topic。已被另一列表选择的来源不再出现在候选中。
2. 按需选择图片、调整顺序或隐藏。热点最多4项（含隐藏），项目不设数量硬上限。
3. 选好至少一项后手动打开对应精选开关，再点击页面“保存”。两个区域独立启用；只保存站点名称、背景等设置不会自动开启精选。
4. 首页检查热点是否按选择显示；关于页检查项目是否按设置顺序显示。标题、简介、链接跟随来源，后台不重复填写。
5. 关闭精选并保存可回退旧展示方式。移除只是取消展示引用，不删除原档案/仓库。要移除已启用列表的最后一项，先关闭开关。

来源失败时已有选择保留；后台用“待核实”区别暂时失败与已确认不可用。GitHub 使用已有内存缓存，重启后缓存不保留。精选开启后不自动用其他项目补位。隐藏或禁用配置中的封面引用也会阻止图片删除。

本地验证（不需要真实数据库或 GitHub）：

```bash
node server/scripts/curated-selftest.mjs
cd web
npm run build
```

Docker 部署仍需将改动部署到目标服务器并重建 `server` 和 `web`，仅本地构建不会更新运行中的容器。部署属于独立操作；本轮实现未重启容器，页面实际验收留待部署后执行。
