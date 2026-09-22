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

## 4. 今天能做什么（功能边界）

| 能做 | 不能做（今天不做） |
|---|---|
| 登录（口令校验）后查看资料列表、关键词搜索、按分类过滤 | 编辑 / 删除资料（高风险操作，等确认机制就位） |
| 新建资料（标题/分类/标签/来源链接/正文）→ 落到 `data/` 目录 | 任务发起 / 进度 / 确认操作（F4–F6，第 3 周） |
| 点开详情看原文 + 真实文件路径（`data/…`） | 多用户与权限、公网 HTTPS 部署（第 3 周） |
| 查重（内容完全相同时拒绝重复保存） | — |

## 5. 数据存哪（重要）

- **资料根目录**：项目 `data/`，按分类（`learning` / `life` / `work`）分子目录，每条一个 `.md`（frontmatter + 正文）；
- **示例**：`data/` 里预置 4 条（Day 8 迁入）；
- **索引缓存**：`data/.index.json`（派生数据，删了下次重建，不丢资料）；
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
    ├── App.jsx           # 外壳 + 路由（列表 / 新建 / 详情 / 登录）
    ├── pages/            # 列表 / 新建 / 详情 / 登录
    ├── api/              # client.js（统一请求）/ notes.js / auth.js
    └── components/       # MarkdownContent（Markdown 渲染）
```

## 8. 后端（`server/`）怎么跑

> ✅ **已实测**（2026-09-22）：`server/scripts/smoke.mjs` 12/12 全过（健康检查 / 鉴权 / 登录 / 新建 / 查重 / 检索 / 详情 / 404 / 登出）。

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
| 登录 / 登出 / 健康检查 | 删除资料（`remove` 占位，501） |
| 资料三接口：新建、列表检索、读原文（`/api/notes`） | 资料的 Git 提交/推送同步（`sync` 占位，第 3 周） |
| 全文检索 + 索引缓存 + 失败限流 + 统一错误格式 | 会话持久化：现在存内存，**重启服务就掉线**，需重新登录 |

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
    ├── routes/           # health / auth（登录、登出）/ notes（资料三接口）
    ├── services/         # notes（校验+查重）/ index-store（索引缓存）/ sessions / errors
    └── storage/          # files.js（文件存储适配层，SPEC 7.3）
```

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
