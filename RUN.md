# RUN.md — buddy 运行说明（Day 7）

> 范围：本文件只说**怎么把今天的 MVP 跑起来**。技术选型见 `TECH_DESIGN.md`，实现规格见 `SPEC.md`。
> 结构：第 1–7 节是**前端**（`web/`，Day 7 已实测）；第 8 节是**后端**（`server/`，代码已完成，**尚未实测**）。

## 1. 前提

- Node.js **20.19+ 或 22.12+**（本机实测 v22.22.2）
- 依赖装到 `web/node_modules/`（**不入库**，已在 `.gitignore`）

## 2. 启动（每次开机后只需这三步）

```bash
cd web
npm install        # 首次或依赖变化时（约 1 分钟；本机网络延迟约 5 秒/请求，属正常）
npm run dev
```

## 3. 访问

| 入口 | 地址 | 说明 |
|---|---|---|
| 本机 | http://localhost:5173 | 打卡截图用这个（地址栏要有 localhost） |
| 手机 | http://192.168.1.56:5173 | 同一 Wi-Fi 下可开（**仅局域网预览**，不是真正的手机端联动；那要登录+公网 HTTPS，第 3 周） |

## 4. 今天能做什么（功能边界）

| 能做 | 不能做（今天不做） |
|---|---|
| 查看资料列表、关键词搜索、按分类过滤 | 登录（今天不做） |
| 新建资料（标题/分类/标签/来源链接/正文） | 数据落到文件或服务器（现在只存浏览器 localStorage） |
| 点开详情看原文、来源、将来会存的文件路径 | 任务发起 / 进度 / 确认操作（F4–F6，第 3 周） |
| 查重（内容完全相同时拒绝重复保存） | 编辑 / 删除资料（高风险操作，等确认机制就位） |

## 5. 数据存哪（重要）

- **测试数据**：`web/src/data/notes.js`（4 条样例，跟代码一起入库）；
- **你新建的条目**：浏览器 `localStorage`（key：`buddy-notes-local`）；
- ⚠️ **清浏览器缓存 / 换浏览器 / 换电脑，本地条目会丢**——这是"无后端"的预期行为，接后端（第 3 周）后才会真正落到资料目录。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面打不开 | dev 服务没起 | 重新执行 `npm run dev` |
| 改了代码页面没变 | 缓存 | **刷新浏览器**（Ctrl+F5 强制刷新） |
| `npm install` 卡住或 502 | 环境变量里的代理已失效 | 先清掉再装：`$env:HTTP_PROXY=""; $env:HTTPS_PROXY=""; npm install`（或 PowerShell 里执行同样命令） |
| 端口被占用 | 上次的服务还在跑 | `Ctrl+C` 停掉再启；或换端口 `npm run dev -- --port 5174` |
| 生产构建 | — | `npm run build`（产物在 `web/dist/`，不入库） |

## 7. 目录速查

```
web/
├── index.html            # 入口页面
├── package.json          # 依赖与脚本（dev / build / preview）
├── vite.config.js        # 端口 5173、host 打开
└── src/
    ├── main.jsx          # 挂载 React + 路由
    ├── App.jsx           # 外壳 + 三个路由
    ├── pages/            # 三个视图（列表 / 新建 / 详情）
    ├── api/notes.js      # 本地数据适配层（将来接后端只换这里）
    └── data/notes.js     # 测试数据（4 条样例）
```

## 8. 后端（`server/`）怎么跑

> ⚠️ **诚实标注**：本节是**按代码写出的预期步骤，本机尚未实测**（`server/node_modules` 未安装、`server/.env` 未创建）。照着跑一遍、把结果反馈给我，我再把「已实测」补上。

### 8.1 前提

- Node.js **20.19+ 或 22.12+**（与前端同一份 Node 即可）；
- 后端不需要 Docker；依赖装在 `server/node_modules/`（**不入库**，已在 `.gitignore`）。

### 8.2 启动（四步）

```bash
cd server
npm install                                  # 首次；若卡住/502 → 先清空 HTTP_PROXY、HTTPS_PROXY 再装
cp .env.example .env                         # Windows PowerShell 用：Copy-Item .env.example .env
node scripts/hash-password.js "你的口令"     # 生成 bcrypt 哈希（口令明文只出现在你的终端里）
```

把上一步打印出的**一整串哈希**粘到 `server/.env` 的 `PASSWORD_HASH=` 后面，然后：

```bash
npm run dev                                  # = node --watch src/index.js，默认 3000 端口
```

`server/.env` 需要的内容（此文件不入库、不要发给别人）：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 端口 |
| `NODE_ENV` | `development` | 生产环境才给 Cookie 加 `Secure` |
| `PASSWORD_HASH` | 上一步生成的一整串 | **必填**，缺了登录接口会返回 500 并明确报错 |
| `SESSION_TTL_HOURS` | `720` | 会话有效期（30 天），可省 |

### 8.3 验证（看到这些输出才算跑通）

```bash
# ① 服务活着
curl http://localhost:3000/api/health
# 期望：{"ok":true,"data":{"status":"ok","time":"..."}}

# ② 口令正确 → 拿到会话 Cookie
curl -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" -d '{"password":"你的口令"}'
# 期望：200 {"ok":true,"data":{"message":"登录成功"}}
#       响应头带 Set-Cookie: sid=...; HttpOnly; SameSite=Lax

# ③ 口令错误 → 401；连续错 5 次 → 429
# 期望：{"ok":false,"error":{"code":"AUTH_FAILED","message":"口令错误"}}
#       {"ok":false,"error":{"code":"RATE_LIMITED","message":"尝试次数过多，请 10 分钟后再试"}}

# ④ 不存在的接口 → 统一 404
curl -i http://localhost:3000/api/nope
# 期望：404 {"ok":false,"error":{"code":"NOT_FOUND","message":"接口不存在"}}
```

### 8.4 今天能做什么 / 不能做什么

| 能做 | 不能做（今天不做） |
|---|---|
| 健康检查、登录、登出三个接口 | **前端还没接后端**：`web/` 仍读写浏览器 localStorage |
| 口令校验 + HttpOnly Cookie 会话 + 失败限流 | 资料的读写接口（`/api/notes` 等，第 3 周） |
| 统一错误格式与请求日志（每条带 request_id 与耗时） | 会话持久化：现在存内存，**重启服务就掉线**，需重新登录 |

### 8.5 目录速查

```
server/
├── package.json          # 依赖与脚本（dev = node --watch / start）
├── .env.example          # 配置样例（.env 自己建，不入库）
├── scripts/
│   └── hash-password.js  # 本机生成口令哈希
└── src/
    ├── index.js          # 启动入口（读 .env → 建应用 → 监听端口）
    ├── app.js            # 装配中间件与路由
    ├── middleware/       # auth（requireAuth，尚未挂路由）/ errors（统一错误）/ request-log
    ├── routes/           # health（/api/health）/ auth（/api/login、/api/logout）
    └── services/         # sessions（内存会话，默认 30 天）
```
