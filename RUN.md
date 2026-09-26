# RUN.md — buddy 运行说明（Day 7）

> 范围：本文件只说**怎么把 buddy 跑起来**。技术选型见 `TECH_DESIGN.md`，实现规格见 `SPEC.md`。
> 结构：第 1–7 节是**前端**（`web/`），第 8 节是**后端**（`server/`），第 9 节是 **Obsidian 展示**。前后端已联通（Day 8 实测）。

## 1. 前提

- Node.js **20.19+ 或 22.12+**（本机实测 v22.22.2）
- 依赖装到 `web/node_modules/`（**不入库**，已在 `.gitignore`）

## 2. 启动（两个终端，先起后端再起前端）

后端（先按第 8 节配好 `server/.env`）：

```bash
cd server
npm install        # 首次或依赖变化时
npm run dev        # 监听 :3000
```

前端（另开一个终端）：

```bash
cd web
npm install        # 首次或依赖变化时（约 1 分钟；本机网络延迟约 5 秒/请求，属正常）
npm run dev        # 监听 :5173，/api 自动代理到 :3000
```

## 3. 访问

| 入口 | 地址 | 说明 |
|---|---|---|
| 本机 | http://localhost:5173 | 打卡截图用这个（地址栏要有 localhost） |
| 手机 | http://<本机局域网IP>:5173 | 同一 Wi-Fi 下可开（`ip addr` 查本机 IP；**仅局域网预览**，真正的手机端联动要公网 HTTPS + 登录，第 3 周） |

页面清单（都能直接输地址打开）：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 个人主页 | 头像 / 昵称 / 简介 + 当月日历与近期日程 |
| `/notes` | 资料列表 | 卡片 / 目录两种视图，关键词与分类筛选 |
| `/new` | 新建资料 | 支持 Markdown 实时预览 |
| `/notes/:id` | 资料详情 | 正文 + 文件路径；底部有「删除这条资料」入口（F6） |
| `/tasks` | 任务 | 手机端发起任务 + 查看/推进进度（F4/F5） |
| `/tasks/:id/confirm` | 确认页 | 高风险动作的大白话后果 + 确认 / 取消（F6） |
| `/confirmations` | 确认留痕 | 回看每一次请求与决定（F6） |
| `/ask` | 知识库问答 | 需配 KB env，见 8.6 |
| `/login` | 登录 | 仅隐私模块（`AUTH_ENABLED=1`）启用时可达 |

## 4. 今天能做什么（功能边界）

| 能做 | 不能做 |
|---|---|
| 资料：新建 / 列表检索 / 详情看原文（F1–F3） | 编辑已有资料（改一条已存在的资料）—— 本期没做 |
| **任务：手机端发起（记资料 / 提醒 / 整理链接）+ 查看与推进状态（F4/F5）** | 任务自动执行器：`organize` / `remind` 只登记待办，只有 `note` 会同步归档 |
| **删除资料：详情页发起 → 确认页看后果 → 确认后才真删（F6）** | smail 邮箱关联、ehall 事务（第 2–3 期，见 PRD 第 6 章） |
| **确认留痕：每次请求与决定都能回看（F6）** | 多用户与权限、原生 App、自动后台记录（最后一个永不做） |
| 个人主页；知识库问答 `/ask`（配好 KB env 后可用，见 8.6） | RAG 进阶项：混合检索 / Rerank / 多轮记忆 |
| 查重：内容完全相同时拒绝重复写入 | 公网 HTTPS 部署（见 8.7，待安全组放行 443 + 域名） |

## 5. 数据存哪（重要）

- **资料根目录**：项目 `data/`，按分类（`learning` / `life` / `work`）分子目录，每条一个 `.md`（frontmatter + 正文）；
- **示例**：`data/` 里预置 4 条（Day 8 迁入）；
- **索引缓存**：`data/.index.json`（派生数据，删了下次重建，不丢资料）；
- **任务与确认记录**：`data/.runtime/tasks.json`、`data/.runtime/confirmations.json`（运行时数据，独立成目录、一类数据一个文件，便于第 3 周迁数据库；删这两个文件只会丢任务与留痕，**不影响资料本身**）；
- **个人主页数据**：`data/profile.md`（frontmatter：`nickname` / `avatar` / `bio`）与 `data/schedule.md`（每行 `- YYYY-MM-DD [HH:mm] 事项`），放 `data/` 根级、不进资料索引；改完刷新 `http://localhost:5173/` 即可看到；
- ⚠️ `data/` **不进公开仓**（`.gitignore` 已排除）：换电脑/重新 `git clone` 不会带过去，等第 3 周接私有仓后才真正可迁移。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面打不开 | dev 服务没起 | 重新执行 `npm run dev` |
| 改了代码页面没变 | 缓存 | **刷新浏览器**（Ctrl+F5 强制刷新） |
| `npm install` 卡住或 502 | 环境变量里的代理已失效 | 先清掉再装：`$env:HTTP_PROXY=""; $env:HTTPS_PROXY=""; npm install`（或 PowerShell 里执行同样命令） |
| 端口被占用 | 上次的服务还在跑 | `Ctrl+C` 停掉再启；或换端口 `npm run dev -- --port 5174` |
| 生产构建 | — | `npm run build`（产物在 `web/dist/`，不入库） |
| 登录提示「口令错误」 | `.env` 的哈希与输入口令不匹配，或后端没重启 | 重新 `node scripts/hash-password.js "口令"` → 替换 `PASSWORD_HASH=` → **重启后端** |
| 列表「无法连接后端服务」 | 后端 :3000 没起 | 先 `cd server && npm run dev` |

## 7. 目录速查

```
web/
├── index.html            # 入口页面
├── package.json          # 依赖与脚本（dev / build / preview）
├── vite.config.js        # 端口 5173、host 打开、/api 代理到 :3000
└── src/
    ├── main.jsx          # 挂载 React + 路由
    ├── App.jsx           # 外壳 + 路由（列表 / 新建 / 详情 / 问答 / 登录）
    ├── pages/            # 列表 / 新建 / 详情 / 问答（KbAskPage）/ 登录
    ├── api/              # client.js（统一请求）/ notes.js / auth.js / kb.js（问答+SSE）
    └── components/       # MarkdownContent（Markdown 渲染）
```

## 8. 后端（`server/`）怎么跑

> ✅ **已实测**（2026-09-26 更新）：`server/scripts/smoke.mjs` 覆盖**资料、任务、确认**三条链路 —— 公开模式 **19/19**、隐私模式 **23/23** 通过（自动按 `/api/health` 的 `auth_enabled` 适配断言）。隐私模式的临时口令哈希：`node scripts/hash-password.js "口令" | head -1`（⚠️ 该脚本第二行是提示文字，用 `head -1` 取哈希）。

### 8.1 前提

- Node.js **20.19+ 或 22.12+**（与前端同一份 Node 即可）；
- 后端不需要 Docker；依赖装在 `server/node_modules/`（**不入库**，已在 `.gitignore`）。

### 8.2 启动（默认公开、无需登录）

```bash
cd server
npm install                                  # 首次；若卡住/502 → 先清空 HTTP_PROXY、HTTPS_PROXY 再装
cp .env.example .env                         # Windows PowerShell 用：Copy-Item .env.example .env
npm run dev                                  # = node --watch src/index.js，默认 3000 端口
```

`.env` 里**不设 `AUTH_ENABLED` 即完全公开、免登录**。要启用隐私模块（登录）时，才需要加两步：

```bash
node scripts/hash-password.js "你的口令"     # 把哈希粘到 .env 的 PASSWORD_HASH=
# 再在 .env 加一行：AUTH_ENABLED=1
```

`server/.env` 常用项（此文件不入库、不要发给别人）：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 端口 |
| `NODE_ENV` | `development` | 生产环境才给 Cookie 加 `Secure` |
| `AUTH_ENABLED` | `1` | **可选**：设 1 启用隐私模块（需登录）；不设 = 公开免登录 |
| `PASSWORD_HASH` | bcrypt 哈希 | **仅启用隐私时才需要** |
| `SESSION_TTL_HOURS` | `720` | 会话有效期（30 天），可省 |

### 8.3 验证（看到这些输出才算跑通）

```bash
# ① 服务活着（看 auth_enabled 判断当前模式）
curl http://localhost:3000/api/health
# 期望：{"ok":true,"data":{"status":"ok","time":"...","auth_enabled":false}}

# ② 公开模式：免登录直接读列表
curl http://localhost:3000/api/notes
# 期望：200 {"ok":true,"data":{"total":4,...}}（无需任何 Cookie）

# ③ 不存在的接口 → 统一 404
curl -i http://localhost:3000/api/nope
# 期望：404 {"ok":false,"error":{"code":"NOT_FOUND","message":"接口不存在"}}

# ④ 任务：建一条提醒（无自动执行器，落「待办」）
curl -s -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" \
  -d '{"type":"remind","payload":{"text":"交作业"},"origin":"phone"}'
# 期望：201 {"ok":true,"data":{"status":"todo","origin":"phone",...}}

# ⑤ 任务列表（可加 ?status=todo 过滤）
curl -s http://localhost:3000/api/tasks
# 期望：200 {"ok":true,"data":{"total":N,"items":[...]}}
```

删除确认流（F6）—— 把 `<资料id>` 换成 `/api/notes` 里某条的 id：

```bash
# ⑥ 发起删除 → 只生成待确认记录，**资料此时还在**
curl -s -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" \
  -d '{"type":"delete_note","payload":{"note_id":"<资料id>"}}'
# 期望：201 + status=attention

# ⑦ 没确认就想执行 → 直接拒绝
curl -s -w ' [%{http_code}]\n' -X PATCH http://localhost:3000/api/tasks/<任务id> \
  -H "Content-Type: application/json" -d '{"status":"done"}'
# 期望：428 CONFIRM_REQUIRED

# ⑧ 拒绝执行 → 任务失败，资料原封不动（改成 "approved" 才会真删）
curl -s -X PATCH http://localhost:3000/api/tasks/<任务id> \
  -H "Content-Type: application/json" -d '{"decision":"rejected"}'
# 期望：200 + status=failed

# ⑨ 留痕回看
curl -s http://localhost:3000/api/confirmations
# 期望：200 {"ok":true,"data":{"total":N,"items":[...]}}
```

启用隐私（`AUTH_ENABLED=1`）后，再验证登录：

```bash
curl -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" -d '{"password":"你的口令"}'
# 期望：200 + Set-Cookie: sid=...; HttpOnly
# 口令错误 → 401 AUTH_FAILED；连续错 5 次 → 429 RATE_LIMITED
```

### 8.4 今天能做什么 / 不能做什么

| 能做 | 不能做（今天不做） |
|---|---|
| 登录 / 登出 / 健康检查 | 资料的 Git 提交/推送同步（`sync` 占位，第 3 周） |
| 资料三接口：新建、列表检索、读原文（`/api/notes`） | 编辑已有资料（改已有内容）—— 本期没做 |
| **任务三接口：建任务 / 进度列表 / 状态与确认（`/api/tasks`）** | `organize`、`remind` 的自动执行器（只登记待办） |
| **确认留痕接口（`/api/confirmations`）** | 会话持久化：现在存内存，**重启服务就掉线**，需重新登录 |
| 删除资料：`remove` 已实现，**但只能经 F6 确认流触发**（没有直接删除的接口） | 公网 HTTPS 部署（见 8.7） |
| 全文检索 + 索引缓存 + 失败限流 + 统一错误格式 | — |
| 知识库问答三接口 `/api/kb/*`（需配 env，见 8.6） | — |

### 8.5 目录速查

```
server/
├── package.json          # 依赖与脚本（dev = node --watch / start）
├── .env.example          # 配置样例（.env 自己建，不入库）
├── scripts/
│   └── hash-password.js  # 本机生成口令哈希
└── src/
    ├── index.js          # 启动入口（读 .env → 建资料目录 → 建应用 → 监听端口）
    ├── app.js            # 装配中间件与路由（/api/notes 挂 requireAuth）
    ├── middleware/       # auth（requireAuth）/ errors（统一错误）/ request-log
    ├── routes/           # health / auth（登录、登出）/ notes（资料三接口）/ kb（问答三接口）
    ├── services/         # notes（校验+查重）/ index-store（索引缓存）/ sessions / errors
    │                     # kb（RAG 索引+问答）/ llm（模型装配）
    └── storage/          # files.js（文件存储适配层，SPEC 7.3）
```

### 8.6 知识库问答（F9，RAG）

**要跑通需要三样东西**：① 一个 OpenAI 兼容端点的 API Key（Chat + Embedding 同端点；Embedding 可单独配）；② 一个 Chroma 向量库服务；③ `server/.env` 里配好对应变量（见 `.env.example` 的「知识库问答」组）。

```bash
# ① 起 Chroma（本机 Docker 或服务器 47.85.210.76 均可）
docker run -d --name chroma -p 8000:8000 chromadb/chroma

# ② server/.env 里配（键名见 .env.example）
#    OPENAI_API_KEY=sk-…  CHROMA_URL=http://localhost:8000

# ③ 建索引（增量：改过/新加的才重新向量化）
curl -X POST http://localhost:3000/api/kb/index
# 期望：{"ok":true,"data":{"added":N,"updated":0,"removed":0,"unchanged":M,"chunks":K}}

# ④ 问答
curl -X POST http://localhost:3000/api/kb/query \
  -H 'Content-Type: application/json' -d '{"q":"WSL 里 Docker 怎么配"}'
# 流式（看到逐 token 输出）：
curl -N "http://localhost:3000/api/kb/stream?q=WSL"
```

前端：`/ask` 页提问，逐字显示，回答下方列来源（点击跳原文）。

**常见坑**：

| 现象 | 原因 | 处理 |
|---|---|---|
| `KB_NOT_CONFIGURED` | 缺 `OPENAI_API_KEY` 或 `CHROMA_URL` | 补齐 `.env` 后重启后端 |
| `CHROMA_UNAVAILABLE` | Chroma 没起 / 地址错 / 网络不通 | `curl $CHROMA_URL/api/v2/heartbeat` 验证可达 |
| `LLM_FAILED` | key 错 / 端点不支持该模型 / 欠费 | 先 `curl` 端点的 `/models` 或 `/chat/completions` 排障 |
| LLM 用 DeepSeek 时报 embeddings 404 | DeepSeek 无 /embeddings | 给 Embedding 单独配 `EMBED_BASE_URL`（如 DashScope 兼容模式） |
| 换 Embedding 模型后检索全乱 | 向量维度变了 | 删 Chroma collection 与 `data/.kb-manifest.json`，重跑 `/api/kb/index` |
| Chroma 裸奔在公网 | 没配认证 | 设 `CHROMA_SERVER_AUTHN_CREDENTIALS` + `.env` 的 `CHROMA_AUTH_TOKEN`，或安全组只放后端 IP |

### 8.7 Docker 部署（Nginx + 后端 + Chroma）

> 2026-09-25 在开发机（原生 Ubuntu）**彩排实测通过**。彩排与上线用**同一份** `docker-compose.yml`。

**跑起来**：

```bash
cd /home/bird/work/vbcd
docker compose up -d --build     # 首次构建镜像；之后改动只需再跑一次
docker compose ps                # 三个服务：web(发 80) / server(仅内网 3000) / chroma(仅内网 8000)
```

访问 **http://localhost/**（前端静态站 + `/api` 反代，同源，Cookie 零配置）。
后端 3000 与 Chroma 8000 **都不对宿主机发端口**，Chroma 因此永远不会裸奔公网。

**镜像从哪来**（Docker Hub 直连不通时；不改 `daemon.json` 的办法）：

```bash
docker pull docker.m.daocloud.io/library/node:22-alpine && docker tag docker.m.daocloud.io/library/node:22-alpine node:22-alpine
docker pull docker.m.daocloud.io/library/nginx:alpine && docker tag docker.m.daocloud.io/library/nginx:alpine nginx:alpine
docker pull docker.m.daocloud.io/chromadb/chroma:latest && docker tag docker.m.daocloud.io/chromadb/chroma:latest chromadb/chroma:latest
```

| 镜像站（2026-09-25 实测可达） | 备注 |
|---|---|
| `docker.m.daocloud.io` | 本文示例用它 |
| `docker.1ms.run` / `hub.rat.dev` | 备选 |
| `registry.cn-hangzhou.aliyuncs.com` | 需带命名空间路径 |

**验证清单（逐条能看到结果）**：

```bash
docker compose ps                                           # 三个 Up，server 应为 (healthy)
curl -s http://localhost/api/health                         # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/ask   # 200（SPA 回退生效）
curl -sN 'http://localhost/api/kb/stream?q=test'            # 未配 key 时应立刻回 event: error
ls data/work/                                               # 在页面上新建资料后，这里能看到新 .md
```

**实测已确认**（2026-09-25）：容器写盘落到宿主机且属主为 `bird`（容器内 `uid=1000(node)`）；`./data` 与 `vbcd_chroma-data` 两个卷**整栈 `down`→`up` 后数据仍在**；Chroma JS 客户端 `3.5.0` 与服务器 `1.4.4` **兼容**。

**踩过的坑（都是实测发现，改配置时别把这几条删了）**：

| 现象 | 原因 | 现状 |
|---|---|---|
| 刷新 `/ask`、`/notes/xxx` 变 404 | 前端是单页路由，Nginx 默认找不到文件就 404 | `web/nginx.conf` 已配 `try_files $uri /index.html` |
| 流式回答不逐字，卡一下全出来 | Nginx 缓冲了 SSE | 已对 `/api/kb/stream` 单独关 `proxy_buffering` |
| 模型端点挂掉时要等 **60 秒**才回，且是 Nginx 的英文 504 页 | OpenAI SDK 默认超时 600s + 重试 2 次，超过 Nginx 的 `proxy_read_timeout 60s` | 已设 `LLM_TIMEOUT_MS=30000`（< 60s）+ `LLM_MAX_RETRIES=1`，修后 **1.8 秒**返回中文 `LLM_FAILED` |
| 彩排时开了 `AUTH_ENABLED` 登录不了 | `NODE_ENV=production` 让 Cookie 带 `Secure`，而彩排走的是 HTTP | 彩排期间别开；上线用上 HTTPS 后正常 |
| 宿主机 80 端口被别的服务占用 | — | 改 compose 的 `ports`（如 `"8080:80"`） |
| Chroma 数据存哪 | 命名卷，不在仓库里 | 实测镜像 `1.4.4` 的 `persist_path` 是 **`/data`**（不是 `/chroma/chroma`），已挂 `vbcd_chroma-data` |
| 换 Embedding 模型后检索全乱 | 向量语义变了，但文档 hash 未变 → 不会重建 | 删 Chroma collection `buddy-notes` 与 `data/.kb-manifest.json`，再跑 `/api/kb/index` |
| 宿主机能 ping 通容器 IP，但访问 80 端口被**重置**（容器本身一直 healthy） | 宿主机 sing-box（v2rayN 的 TUN 模式）把接口地址设成 `172.18.0.1/30`，与 Docker 的 `172.18.0.0/16` 撞车；`/30` 更具体 → `172.18.0.3`（web 容器）被当成广播地址 | `docker-compose.yml` 已把 `internal` 网段固定为 `172.30.0.0/16`（2026-09-26），**别再改回去** |
| `docker` 报 `permission denied` | 当前用户不在 `docker` 组 | 永久：`sudo usermod -aG docker $USER` 后重新登录；临时：`sudo setfacl -m u:$USER:rw /var/run/docker.sock`（docker 服务重启后失效，需重跑） |

**上线到服务器还差三步**（现只开了 80）：① 阿里云安全组放行 **443**；② 域名 A 记录指向服务器 IP；③ 加 `certbot` 证书段。

## 9. 用 Obsidian 查看资料（F1 的「能看到文件」）

buddy 的资料就是 Markdown 文件，Obsidian 能直接当笔记打开、编辑。开发机上的做法：把项目 `data/` 目录用**符号链接**挂进你的 Obsidian 仓库。

```bash
ln -s /home/bird/work/vbcd/data /home/bird/note/los/buddy
```

> 这一步由你本人执行（目标目录在项目结构之外，我不代做）。

### 9.1 预期效果

| 在哪 | 看到什么 |
|---|---|
| Obsidian 左侧栏 | 多出 `buddy/`，下面按 `learning / life / work` 分类，每篇一个 `.md` |
| 打开一篇 | frontmatter（标题/标签/日期/来源…）+ Markdown 正文正常渲染；`tags` 自动成为 Obsidian 标签 |
| 双向联动 | 你在 Obsidian 里改正文或新增文件，回浏览器列表页刷新，条目随之变化（索引重建，对应 F3） |

### 9.2 验收清单（逐条勾）

- [ ] Obsidian 的 `buddy/` 下能看到 4 条示例（atomic-commit / prd-review / proxy-502 / wsl-env）
- [ ] 浏览器「新建资料」录一条 → `buddy/` 下立即出现对应 `.md`
- [ ] 在 Obsidian 里改一条的正文 → 浏览器刷新列表，顶部显示「索引本次重建」且内容更新
- [ ] `data/.index.json` 是点开头的隐藏文件，Obsidian 默认不显示（也别删：删了只是下次重建，不丢资料）

### 9.3 常见问题

| 现象 | 处理 |
|---|---|
| Obsidian 里看不到 `buddy/` | 符号链接可能不被跟随 → 把后端 `DATA_DIR` 直接指向仓库内真实目录：`DATA_DIR=/home/bird/note/los/buddy npm run dev`（目录结构不变） |
| 想换资料目录 | 改 `server/.env` 的 `DATA_DIR` 或启动时传 `DATA_DIR=…`，重启后端即可 |
| 列表看不到你在 Obsidian 里新加的文件 | 确认它第一行是 `---`（有 frontmatter）；没有 frontmatter 会被索引跳过，并在后端日志里告警 |
