# RUN.md — buddy 运行说明

> 怎么把 buddy 跑起来。技术选型见 `TECH_DESIGN.md`，接口规格见 `SPEC.md`。
> 第 1–7 节 = 前端（`web/`），第 8 节 = 后端（`server/`），第 9 节 = Obsidian。

## 1. 前提

- Node.js 20.19+ 或 22.12+
- 依赖装在 `web/node_modules/`、`server/node_modules/`，不入库

## 2. 启动（两个终端，先起后端再起前端）

后端（`server/.env` 见第 8 节）：

```bash
cd server
npm install
cp .env.example .env        # PowerShell：Copy-Item .env.example .env
npm run dev                 # :3000
```

前端：

```bash
cd web
npm install
npm run dev                 # :5173，/api 代理到 :3000
```

生产构建：`npm run build`，产物在 `web/dist/`（不入库）。

## 3. 访问

| 入口 | 地址 |
|---|---|
| 本机 | http://localhost:5173 （打卡截图用这个） |
| 手机 | http://<本机局域网IP>:5173 （同一 Wi-Fi，局域网预览；公网 HTTPS 见 8.7） |

页面清单：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 个人主页 | 头像 / 昵称 / 简介；日历周视图（默认）/ 月视图切换（`?cal=month`）；待办任务列表 |
| `/notes` | 资料列表 | 卡片 / 目录两种视图（`?view=dir`），关键词与分类筛选 |
| `/new` | 新建资料 | Markdown 实时预览 |
| `/notes/:id` | 资料详情 | 正文 + 文件路径；底部「删除这条资料」入口（F6） |
| `/tasks` | 任务 | 发起任务 + 查看/推进进度（F4/F5） |
| `/tasks/:id/confirm` | 确认页 | 高风险动作的后果说明 + 确认 / 取消（F6） |
| `/confirmations` | 确认留痕 | 回看每次请求与决定（F6） |
| `/ask` | 知识库问答 | 需配 KB env，见 8.6 |
| `/login` | 登录 | 仅 `AUTH_ENABLED=1` 时可达 |

## 4. 功能边界

| 能做 | 不能做 |
|---|---|
| 资料：新建 / 列表检索 / 详情看原文（F1–F3） | 编辑已有资料 |
| 任务：发起（记资料 / 提醒 / 整理链接）+ 查看与推进状态（F4/F5） | `organize` / `remind` 的自动执行器：只登记待办，只有 `note` 会同步归档 |
| 删除资料：详情页发起 → 确认页看后果 → 确认后才真删（F6） | smail 邮箱关联、ehall 事务（第 2–3 期） |
| 确认留痕：每次请求与决定可回看（F6） | 多用户与权限、原生 App、自动后台记录 |
| 个人主页；知识库问答 `/ask` | RAG 进阶：混合检索 / Rerank / 多轮记忆 |
| 查重：内容完全相同则拒绝写入 | 公网 HTTPS 部署（见 8.7） |

## 5. 数据存哪

| 数据 | 位置 | 说明 |
|---|---|---|
| 资料 | `data/<分类>/YYYY-MM-DD-<slug>.md` | 分类 `learning` / `life` / `work`；frontmatter + 正文 |
| 索引缓存 | `data/.index.json` | 派生数据，删了下次重建 |
| 任务、确认记录 | `data/.runtime/tasks.json`、`data/.runtime/confirmations.json` | 删了只丢任务与留痕，不影响资料 |
| 个人主页 | `data/profile.md`（`nickname` / `avatar` / `bio`）、`data/schedule.md`（每行 `- YYYY-MM-DD [HH:mm] 事项`） | 根级文件，不进资料索引 |

`data/` 不进公开仓（`.gitignore` 已排除），换机器 `git clone` 不会带过去。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面打不开 | dev 服务没起 | 重新 `npm run dev` |
| 改了代码页面没变 | 缓存 | Ctrl+F5 强制刷新 |
| `npm install` 卡住或 502 | 环境变量里的代理已失效 | 清空 `HTTP_PROXY`、`HTTPS_PROXY` 后再装 |
| 端口被占用 | 上次的服务还在跑 | Ctrl+C 停掉，或 `npm run dev -- --port 5174` |
| 登录提示「口令错误」 | 哈希与口令不匹配，或后端没重启 | 重跑 `node scripts/hash-password.js "口令"` 换 `PASSWORD_HASH=`，重启后端 |
| 列表「无法连接后端服务」 | 后端 :3000 没起 | 先 `cd server && npm run dev` |

## 7. 目录速查（前端）

```
web/
├── index.html
├── package.json           # dev / build / preview
├── vite.config.js         # :5173，host 打开，/api → :3000
├── nginx.conf             # 生产：SPA 回退 + SSE 关缓冲
└── src/
    ├── main.jsx           # React 挂载 + 路由
    ├── App.jsx            # 路由表
    ├── styles.css
    ├── pages/             # 首页 / 列表 / 新建 / 详情 / 任务 / 确认页 / 留痕 / 问答 / 登录
    ├── api/               # client.js 统一请求；notes / tasks / me / kb / auth
    └── components/        # MarkdownContent / NoteFileList
```

## 8. 后端（`server/`）

冒烟测试：`node scripts/smoke.mjs` —— 公开模式 19/19、隐私模式 23/23 通过（按 `/api/health` 的 `auth_enabled` 自适应）。隐私模式临时口令哈希：`node scripts/hash-password.js "口令" | head -1`（第二行是提示文字，只取第一行）。

### 8.1 前提

- Node.js 20.19+ 或 22.12+
- 不需要 Docker；依赖装在 `server/node_modules/`，不入库

### 8.2 启动（默认公开、免登录）

```bash
cd server
npm install
cp .env.example .env
npm run dev                 # node --watch src/index.js，:3000
```

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

### 8.5 目录速查（后端）

```
server/
├── package.json
├── .env.example           # 配置样例（.env 自建，不入库）
├── scripts/
│   ├── hash-password.js   # 生成口令哈希
│   └── smoke.mjs          # 端到端冒烟
└── src/
    ├── index.js           # 读 .env → 建资料目录 → 监听端口
    ├── app.js             # 装配中间件与路由
    ├── middleware/        # auth / errors / request-log
    ├── routes/            # health / auth / notes / tasks / confirmations / me / kb
    ├── services/          # notes / tasks / me / index-store / sessions / kb / llm / errors
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

### 8.7 Docker 部署（Nginx + 后端 + Chroma）

彩排与上线同一份 `docker-compose.yml`。

```bash
cd /home/bird/work/vbcd
docker compose up -d --build
docker compose ps            # web(80) / server(仅内网 3000) / chroma(仅内网 8000)
```

访问 http://localhost/ （前端静态站 + `/api` 反代，同源，Cookie 零配置）。后端 3000 与 Chroma 8000 都不发布到宿主机，Chroma 不会裸奔公网。

Docker Hub 直连不通时拉镜像（不改 `daemon.json`）：

```bash
docker pull docker.m.daocloud.io/library/node:22-alpine && docker tag docker.m.daocloud.io/library/node:22-alpine node:22-alpine
docker pull docker.m.daocloud.io/library/nginx:alpine && docker tag docker.m.daocloud.io/library/nginx:alpine nginx:alpine
docker pull docker.m.daocloud.io/chromadb/chroma:latest && docker tag docker.m.daocloud.io/chromadb/chroma:latest chromadb/chroma:latest
```

镜像站：`docker.m.daocloud.io`（示例）、`docker.1ms.run`、`hub.rat.dev`；`registry.cn-hangzhou.aliyuncs.com` 需带命名空间。

验证：

```bash
docker compose ps                                            # 三个 Up，server 应为 (healthy)
curl -s http://localhost/api/health                          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/ask   # 200（SPA 回退生效）
curl -sN 'http://localhost/api/kb/stream?q=test'             # 未配 key 应立刻回 event: error
ls data/work/                                                # 页面上新建资料后能看到新 .md
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
| `docker` 报 `permission denied` | 当前用户不在 `docker` 组 | `sudo usermod -aG docker $USER` 后重新登录；临时：`sudo setfacl -m u:$USER:rw /var/run/docker.sock`（docker 重启后失效） |

上线到服务器还差三步：① 阿里云安全组放行 443；② 域名 A 记录指向服务器 IP；③ 加 certbot 证书段。

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
- [ ] 浏览器「新建资料」录一条 → `buddy/` 下立即出现对应 `.md`
- [ ] Obsidian 里改一条正文 → 浏览器刷新列表，内容更新
- [ ] `data/.index.json` 是隐藏文件，Obsidian 默认不显示（别删，删了只是下次重建）

| 现象 | 处理 |
|---|---|
| Obsidian 里看不到 `buddy/` | 符号链接可能不被跟随 → 把 `DATA_DIR` 指向真实目录：`DATA_DIR=/home/bird/note/los/buddy npm run dev` |
| 想换资料目录 | 改 `server/.env` 的 `DATA_DIR` 或启动时传 `DATA_DIR=…`，重启后端 |
| 列表看不到 Obsidian 里新加的文件 | 确认第一行是 `---`；没有 frontmatter 会被索引跳过并在后端日志告警 |
