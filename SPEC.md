# SPEC.md — buddy 实现规格（MVP · 第 1 期）

> 上游依据：`PRD.md` v1.1（F1–F7 与 25 条验收标准）、`TECH_DESIGN.md` v1.1（技术路线、数据流、架构原则）
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
│   │   ├── routes/      # 接口路由（对应第 3 章）
│   │   ├── services/    # 业务逻辑（资料、任务、确认）
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
| `type` | enum | `note`（记资料）/ `organize`（整理链接）/ `remind`（提醒） |
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

## 3. API 列表（**8 个**）

> 说明：原方案我提了 7 个，**漏了 F5 需要的"任务列表"接口**，故实为 8 个（此处如实修正）。
> 统一前缀 `/api`；请求与响应均为 JSON。资料接口**默认公开**；启用隐私模块（`AUTH_ENABLED=1`）后，除登录外全部要求已登录。

| # | 方法与路径 | 用途 | 关键请求字段 | 成功响应 | 主要错误 |
|---|---|---|---|---|---|
| 1 | `POST /api/login` | 口令登录（隐私模块，默认关闭） | `password` | `200` + `Set-Cookie: sid=…` | `AUTH_FAILED` |
| 2 | `POST /api/logout` | 退出（隐私模块，默认关闭） | — | `204` | `AUTH_REQUIRED` |
| 3 | `POST /api/notes` | 新建资料（F1） | `title, category, content, tags?, source_url?` | `201 {id, path, hash}` | `VALIDATION_FAILED`、`DUPLICATE` |
| 4 | `GET /api/notes` | 列表与检索（F2/F3） | `q?, category?, from?, to?, sort?, limit?, offset?` | `200 {total, items[], rebuilt_in_ms}` | `INTERNAL` |
| 5 | `GET /api/notes/:id` | 读原文（F2） | — | `200 {meta, content}` | `NOT_FOUND` |
| 6 | `POST /api/tasks` | 建任务（F4） | `type, payload` | `201 {id, status}` | `VALIDATION_FAILED` |
| 7 | `GET /api/tasks` | 任务进度列表（F5） | `status?` | `200 {items[]}` | `AUTH_REQUIRED` |
| 8 | `PATCH /api/tasks/:id` | 更新状态 / 提交确认（F5/F6） | `status?, decision?, summary?` | `200 {task}` | `CONFIRM_REQUIRED`（高风险动作未确认时返回 `428`） |

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
| `INTERNAL` | 500 | 其他未预期错误 |

### 5.3 用户可见文案
- 一律**中文、说清后果**，不暴露堆栈；例如"保存失败：服务器磁盘空间不足，请稍后重试"；
- 前端收到任何 `ok:false` 都**必须显示提示**，不允许静默失败（F1 验收）。

### 5.4 部分失败与幂等
- **写文件成功但 Git 失败** → 任务/资料标记 `attention`，保留待重试队列，并在页面上可见（不静默）；
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
2. **第 3 章接口**：8 个够用吗？是否需要"删除资料"接口（当前没有——符合"本期不做"）？
3. **第 6 章环境变量**：键名与默认值是否符合你的习惯？
4. **第 7.3 迁移**：触发条件（1000 条 / 2 秒）是否接受？
