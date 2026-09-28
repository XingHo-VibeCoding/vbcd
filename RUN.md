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
| 手机 | http://<本机局域网IP>:5174 （同一 Wi-Fi，局域网预览；公网 HTTPS 见 8.7） |

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
| `/ask` | agent · 知识库问答 | 需配 KB env，见 8.6（本期仅改名 agent，功能未动；方向见 `AGENT.md`） |
| `/about` | 关于 | 自我介绍 / 研究动态页签（`?tab=activity`）；热力图按资料 date 聚合，时间线取最新 8 条（F11） |
| `/login` | 登录 | 仅 `AUTH_ENABLED=1` 时可达 |

## 4. 功能边界

| 能做 | 不能做 |
|---|---|
| 资料：新建 / 列表检索 / 详情看原文（F1–F3） | 编辑已有资料 |
| 任务：发起（记资料 / 提醒 / 收敛 / 删除资料 / 视频转写）+ 查看与推进状态（F4/F5） | `remind` 的自动执行器：只登记待办；`note` 同步归档，`organize`（收敛）提交即异步整理归档（F14），`transcribe_url` 由轮询器异步归档（F13） |
| 删除资料：详情页发起 → 确认页看后果 → 确认后才真删（F6） | smail 邮箱关联、ehall 事务（第 2–3 期） |
| 确认留痕：每次请求与决定可回看（F6） | 多用户与权限、原生 App、自动后台记录 |
| 个人主页；知识库问答 `/ask` | RAG 进阶：混合检索 / Rerank / 多轮记忆 |
| 全站深浅主题：主页方格开关，偏好存浏览器本地，首次跟随系统（F10） | 主题跨设备同步；跟随系统 / 浅 / 深 三态切换；切换动画 |
| 关于页：自我介绍 / 研究动态（F11） | 真实横幅图、热力图按天点击查看资料 |
| 视频转写：curl 提交 `transcribe_url` 任务 → 自动转写归档（F13，见 8.8） | 前端表单入口、上传文件转写、说话人分离 |
| 查重：内容完全相同则拒绝写入 | 公网 HTTPS 部署（见 8.7） |

## 5. 数据存哪

| 数据 | 位置 | 说明 |
|---|---|---|
| 资料 | `data/<分类>/YYYY-MM-DD-<slug>.md` | 分类 `learning` / `life` / `work`；frontmatter + 正文 |
| 索引缓存 | `data/.index.json` | 派生数据，删了下次重建 |
| 任务、确认记录 | `data/.runtime/tasks.json`、`data/.runtime/confirmations.json` | 删了只丢任务与留痕，不影响资料 |
| 个人主页 | `data/profile.md`（`nickname` / `avatar` / `bio`）、`data/schedule.md`（每行 `- YYYY-MM-DD [HH:mm] 事项`） | 根级文件，不进资料索引 |
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

不设 `AUTH_ENABLED` 即公开免登录。启用隐私模块：

```bash
node scripts/hash-password.js "你的口令"     # 哈希粘到 .env 的 PASSWORD_HASH=
# 再加一行 AUTH_ENABLED=1
```

`server/.env` 常用项（不入库）：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 端口 |
| `NODE_ENV` | `development` | `production` 时 Cookie 加 `Secure` |
| `AUTH_ENABLED` | `1` | 可选；不设 = 公开免登录 |
| `PASSWORD_HASH` | bcrypt 哈希 | 仅启用隐私时需要 |
| `SESSION_TTL_HOURS` | `720` | 会话有效期 30 天，可省 |

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

# ⑩ 视频转写任务（F13，需先配 ASR env 与起 asr 服务，见 8.8）
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

| 已有 | 没有 |
|---|---|
| 登录 / 登出 / 健康检查 | 资料的 Git 提交推送同步（`sync` 占位，第 3 周） |
| `/api/notes`：新建、列表检索、读原文 | 编辑已有资料 |
| `/api/tasks`：建任务、进度列表、状态与确认 | `organize` / `remind` 自动执行器 |
| `/api/confirmations`：确认留痕 | 会话持久化：存内存，重启服务需重新登录 |
| `/api/me`：个人主页数据 | 直接删除资料的接口（只能经 F6 确认流触发） |
| `/api/kb/*`：问答三接口（需配 env，见 8.6） | 公网 HTTPS 部署（见 8.7） |
| 转写：`type=transcribe_url` 任务（需配 env，见 8.8） | 独立的转写对外接口（复用任务链路，共 13 个接口） |

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

前端 `/ask` 提问，逐字显示，来源可跳原文。

| 现象 | 原因 | 处理 |
|---|---|---|
| `KB_NOT_CONFIGURED` | 缺 `OPENAI_API_KEY` 或 `CHROMA_URL` | 补齐后重启后端 |
| `CHROMA_UNAVAILABLE` | Chroma 没起 / 地址错 / 网络不通 | `curl $CHROMA_URL/api/v2/heartbeat` |
| `LLM_FAILED` | key 错 / 端点不支持该模型 / 欠费 | 用 curl 测端点 `/models` 或 `/chat/completions` |
| 用 DeepSeek 报 embeddings 404 | DeepSeek 无 `/embeddings` | Embedding 单独配 `EMBED_BASE_URL`（如 DashScope 兼容模式） |
| 换 Embedding 模型后检索全乱 | 向量维度变了 | 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json`，重跑 `/api/kb/index` |
| Chroma 裸奔公网 | 没配认证 | 设 `CHROMA_SERVER_AUTHN_CREDENTIALS` + `CHROMA_AUTH_TOKEN`，或安全组只放后端 IP |

### 8.7 Docker 部署（Nginx + 后端 + Chroma + ASR）

彩排与上线同一份 `docker-compose.yml`。

```bash
cd /home/bird/work/vbcd
docker compose up -d --build
docker compose ps            # web(80) / server(仅内网 3000) / chroma(仅内网 8000) / asr(仅内网 8000)
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

验证：

```bash
docker compose ps                                            # 四个 Up（web/server/chroma/asr），server 应为 (healthy)
curl -s http://localhost/api/health                          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/ask   # 200（SPA 回退生效）
curl -sN 'http://localhost/api/kb/stream?q=test'             # 未配 key 应立刻回 event: error
ls data/work/                                                # 主页「归档」方格 → /archive 提交一条后能看到新 .md
```

已知事实：容器写盘落到宿主机且属主为 `bird`（容器内 `uid=1000(node)`）；`./data` 与 `vbcd_chroma-data` 整栈 `down`→`up` 后数据仍在；Chroma JS 客户端 `3.5.0` 与服务器 `1.4.4` 兼容。

踩坑表（改配置时别删这几条）：

| 现象 | 原因 | 现状 |
|---|---|---|
| 刷新 `/ask`、`/notes/xxx` 变 404 | 单页路由，Nginx 找不到文件 | `web/nginx.conf` 已配 `try_files $uri /index.html` |
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
| `docker run --env-file server/.env` 启动的服务问 KB 报 `LLM_FAILED：Cannot convert argument to a ByteString because the character at index N has a value of X which is greater than 255` | **`docker run` 不剥行内注释**，而 `docker compose` 的 `env_file` 会（未加引号的值剥掉 ` #…` 并剥外层引号）。于是密钥尾部吃进中文注释 → `Authorization: Bearer …# 可换…` 里出现 >255 的字符，Node 的 `fetch` 直接抛 ByteString 错（2026-09-29 实测：`OPENAI_API_KEY` 长度 117 → 165） | **别用 `docker run --env-file` 直接跑这个服务**；要另起一份用 `docker compose run`（同一套解析），或先把 `.env` 的注释与引号剥干净再造临时文件。核对办法：比 `LLM_MODEL` 长度（应为 19）且 `/\u4e00-\u9fa5/` 不命中 |
| 线上 `:80` 页面少了刚提交的文案（如「发散 / 收敛」搜不到），接口却是新的 | `web` 镜像是**多阶段构建**：静态产物在 `docker build` 时就固化进镜像，改完 `web/src` 不重建就永远是旧的（2026-09-29 实测：镜像 09-28 18:44 构建，而前端提交在 09-29 06:54 之后） | `docker compose up -d --build web`（会连带重启依赖服务，`asr`/`server` 会重启）。核对：`docker exec vbcd-web-1 ls -l /usr/share/nginx/html/assets/*.js` 的文件名与字节数应与 `web/dist/assets/` **完全一致** |

上线到服务器还差三步：① 阿里云安全组放行 443；② 域名 A 记录指向服务器 IP；③ 加 certbot 证书段。

### 8.8 视频转写（F13）

`asr/` 是独立的 fun-asr 转写微服务（FastAPI 单进程，4 个端点）；buddy 侧不新增接口，走 `type=transcribe_url` 任务。

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

# ③ 提交转写任务（暂无前端表单，用 curl）
curl -X POST http://localhost:3100/api/tasks -H 'Content-Type: application/json' \
  -d '{"type":"transcribe_url","payload":{"url":"https://www.bilibili.com/video/BVxxxx","category":"learning","tags":["视频转写"]},"origin":"desktop"}'
# → 201 status=doing；GET /api/tasks 看「转写中：正在转写（n/m，x%）」；
#   完成后 status=done、result=「已归档到 learning/….md」；B 站分 P 传 "part": 2

# 归档后若要进知识库问答，需手工触发一次增量索引：
curl -X POST http://localhost:3100/api/kb/index

# ④ 测试（不烧 Key）：单元 + respx mock 集成（仓库根执行，48 个用例）
asr/.venv/bin/python -m pytest asr

# ⑤ 探针（改上游参数前先跑）：asr/scripts/probe_funasr.py，结论写在 asr/PROBE.md
```

ASR 服务的 4 个端点：`POST /v1/transcribe`（`wait_seconds=0` 立即返回 job）、`GET|DELETE /v1/jobs/{id}`、`GET /healthz`；`/v1/*` 需 `Authorization: Bearer $SERVICE_TOKEN`。临时媒体终态即删，job JSON TTL 30 分钟后 GC。

**三项验证已于 2026-09-29 跑完（不再挂起）**：多片链路 `stats.chunks=14`（`BV1Eb411u7Fw` p15，39:26）、同 URL TTL 内第二次提交 `cache_hit=true`（0.127s 墙钟）、逐句 `[mm:ss]` 归档复跑成功（68 段 / 364 句）。完整命令、原始输出与「asr 镜像必须先重建」的前置条件见 `runs/2026-09-29-f13-live-verify.md`；结论同步在 `asr/PROBE.md` §A4 与 `SPEC.md` §7.5（A7）。

| 现象 | 原因 | 处理 |
|---|---|---|
| 任务立刻 `failed`：「转写服务未配置」 | `ASR_SERVICE_URL` 未设 | 补齐 `server/.env` 后重启后端 |
| 任务 `failed`：「提交转写失败：…401」 | 两侧 token 不一致 | `ASR_SERVICE_TOKEN` 与 `asr/.env` 的 `SERVICE_TOKEN` 对齐 |
| 任务 `failed`：「提交转写失败：服务不可达」 | asr 没起 / 地址错 | `curl $ASR_SERVICE_URL/healthz`；compose 内用 `http://asr:8000` |
| 任务 `failed`：「下载失败」 | yt-dlp 抓取失效 / 会员内容 | 升 yt-dlp（`pip -U yt-dlp`）；会员视频配 `YTDLP_COOKIES_FILE` |
| 转写慢卡在「正在下载」 | B 站限速 | 正常现象（70s 视频下载约 30s）；超时阈值 60 分钟内都算正常 |
| 想重跑一次 | `failed→todo` 合法迁移 | `PATCH /api/tasks/:id {"status":"todo"}`，轮询器自动重提交 |


### 8.9 链接收敛（F14）

归档页 `/archive` 默认停在「收敛」：贴一个链接（可选分类）→ 后端抓网页 → 提取正文 → LLM 整理 → 归档成资料。等价 curl（`server/.env` 里同样要配 `ASR_SERVICE_URL` 那套就绪后）：

```bash
# ① 提交（返回 201，status=doing，随即异步执行）
curl -s -X POST http://localhost:3100/api/tasks -H 'Content-Type: application/json' \
  -d '{"type":"organize","payload":{"url":"https://example.com/some-article","category":"learning","tags":["收敛"]}}'

# ② 看进度（result 会从「正在抓取网页」→「正在让模型整理」→「已归档到 data/…」）
curl -s 'http://localhost:3100/api/tasks?status=doing'

# ③ 看成果：frontmatter 带 source_url，正文含摘要/要点/原文节选
ls data/learning/ && sed -n '1,20p' data/learning/<刚生成的>.md
```

前置条件：无（未配 `OPENAI_API_KEY` 也能跑，只是资料里会写一行「本次未做模型整理」）。向量索引仍需手工 `POST /api/kb/index`。

本地自测（不烧 Key、不用起服务）：

```bash
node server/scripts/link-selftest.mjs      # SSRF 拦截矩阵 / 正文提取 / 重定向 / GBK 解码，24 条
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
