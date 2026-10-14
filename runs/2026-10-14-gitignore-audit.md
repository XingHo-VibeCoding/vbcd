# `.gitignore` 完备性审计（2026-10-14）

审计对象：`/home/bird/work/vbcd/.gitignore`（52 行，6 组规则）
方法：逐条规则 + `git check-ignore -v` 实测 + 与 `git ls-files`（215 个跟踪文件）交叉核对；不凭印象。
结论：**骨架正确、无致命漏网；有 1 个真实缺口 + 6 处建议加固（主要是「本地临时/编辑器态」与「凭据扩展名」）。**

---

## 1. 现状总览

| 组 | 规则 | 评价 |
|---|---|---|
| 密钥凭据 | `.env` `.env.*` `!.env.example` `*.pem` `*.key` `*secret*` `credentials*.json` `token*.json` | ✅ 核心正确 |
| 依赖与构建 | `node_modules/` `__pycache__/` `.venv/` `venv/` `dist/` `build/` `.cache/` | ✅ 无锚定 → 子目录全生效（已实测） |
| 本地数据库/索引 | `*.db` `*.sqlite` `*.sqlite3` `index_data/` `*.faiss` | ✅ 覆盖到位 |
| 个人资料 | `memory/` `drafts/` `/data/` | ✅ 根锚定 `/data/` 正确（避免误伤 `web/src/data/`） |
| 本地 AI 数据 | `.workbuddy/` | ✅ |
| 编辑器/系统 | `.vscode/` `.idea/` `.DS_Store` `Thumbs.db` `desktop.ini` | ✅ |
| 日志与临时 | `*.log` `npm-debug.log*` `logs/` `.tmp-*` `asr/probe-result-*.json` `asr/data/` `asr/.secrets/` | ✅ 项目特异项齐全 |

**已跟踪文件集干净**：`git ls-files` 中搜 `*.log` / `.env`（非 example）/ `*.db` / `node_modules` / `/dist/` / `*.key` / `secret` / `credential` / `.tmp-` / `probe-result` → **0 命中** ✅

**`.env` 规则验证**（重点，实测）：

```
.env               → IGNORED ✅        .env.example          → 可入库 ✅
.env.local         → IGNORED ✅        server/.env.example   → 可入库 ✅
.env.production    → IGNORED ✅        asr/.env.example      → 可入库 ✅
server/.env        → IGNORED ✅        .env.bak/.old/.save   → IGNORED ✅（走 .env.*）
asr/.env           → IGNORED ✅
```

**子目录生效验证**（无锚定规则的 glob 行为）：

```
asr/__pycache__  → __pycache__/ ✅      web/dist          → dist/ ✅
asr/.venv        → .venv/       ✅      server/node_modules → node_modules/ ✅
asr/.tmp-probe   → .tmp-*       ✅      asr/data          → asr/data/ ✅
asr/.secrets     → asr/.secrets/ ✅     asr/probe-result-a1.json → ✅
```

---

## 2. 🔴 真实缺口（1 项，建议立即补）

### G1：`.pytest_cache/` 未被忽略

- **现状**：`asr/.pytest_cache/` 实际存在于工作区，**不被忽略**；它之所以没入库，是因为 pytest 自己在里面写了一个 `.gitignore`（`*`），属于「靠工具自觉」，不是我们的规则。
- **风险**：换 pytest 版本 / 手动清理后该目录可能裸奔；`asr/` 下还有 `__pycache__`（已覆盖）但没有 pytest 缓存规则，规则集不对称。
- **实测**：
  ```
  asr/.pytest_cache  -> NOT ignored ⚠️
  ```
- **建议**：在第 2 组「依赖目录与构建产物」补一行 `\.pytest_cache/`。

---

## 3. 🟡 建议加固（6 项，非必须但成本极低）

### G2：`.Trash-0/` 未被忽略（工作区实际存在）

- 现状：仓库根有一个 `.Trash-0/`（含 `files/` `info/`），是桌面环境的回收站目录。
- 风险：当前**只是恰好未跟踪**；一旦误 `git add -A` 就会连回收站内容一起入库。
- 建议：补 `.Trash-0/`（必要时再加 `.Trash-*`）。

### G3：编辑器交换文件未覆盖

- `*.swp` / `*.swo` / `*~`（vim）、`.#*`（emacs）均未覆盖。
- 现状实测：`.env~` / `.Trash-0` 等无「NOT ignored」。其中 `*~` 风险最高（任何编辑器都可能生成）。
- 建议：补 `*.swp` `*.swo` `*~`。

### G4：`.history/`、`.local/` 未覆盖

- VS Code 的 Local History、部分插件的 `.history/` 会快照**文件内容**（含 `.env` 编辑历史）。
- 实测：`.history` → NOT ignored ⚠️
- 建议：补 `.history/`。

### G5：凭据类扩展名不全

- 已覆盖 `*.pem` `*.key`；**未覆盖** `*.p12` `*.pfx` `*.jks` `*.crt` `*.cer` `*.der`。
- 本项目当前用不到，但属「零成本保险」，且 `*.pem` 已经在列，规则不完整。
- 建议：把密钥组扩成 `*.pem` `*.key` `*.p12` `*.pfx` `*.jks` `*.crt` `*.cer`。

### G6：明文凭据的常见文件名未覆盖

- 已覆盖 `credentials*.json` `token*.json`；**未覆盖** `service-account.json`（GCP 约定名）、`auth.json`、`.npmrc`（含 registry token）、`.netrc`。
- 实测：全部 NOT ignored ⚠️
- 建议：补 `service-account*.json` `auth*.json` `.npmrc` `.netrc`。

### G7：`docker-compose.override.yml`

- Compose 的 override 文件常含本机端口/路径/临时口令；本项目 `docker-compose.yml` 已入库，override 未覆盖。
- 实测：NOT ignored ⚠️
- 建议：补 `docker-compose.override.yml`。

---

## 4. ✅ 已确认无需改动的地方（避免过度设计）

| 检查 | 结论 |
|---|---|
| `venv/` 与 `.venv/` 同时写 | 已在（第 14–15 行），无冗余问题 |
| `index_data/` | ✅ 覆盖（PRD 要求「索引文件不入库」） |
| `memory/` vs `.workbuddy/memory/` | 前者是资料目录（已忽略）；**后者是 AI 工作记忆，被 `.workbuddy/` 覆盖** —— 两者都不入库，符合预期 |
| `runs/` | ✅ 未被忽略（留证文档应当入库，正确） |
| `.env.example` 三份（根/asr/server） | ✅ 均正确放行 |
| 无锚定 glob 是否误伤子目录 | ✅ 实测无过度匹配（`web/src/data/` 未被 `/data/` 误伤） |
| 与 SPEC §1「仓库边界」一致性 | ✅ 一致（`memory/` `drafts/` `/data/` 三项齐全，SPEC A1 已标完成） |

---

## 5. 建议补丁（可直接应用）

> **状态：已应用**（`.gitignore` 52 → 69 行）。应用后实测：15 项新增规则全部生效；
> 对 **215 个已跟踪文件逐一 `git check-ignore`，0 项误伤** ✅。

```gitignore
# ===== 依赖目录与构建产物 =====
node_modules/
__pycache__/
.pytest_cache/          # ← 新增 G1
.venv/
venv/
dist/
build/
.cache/

# ===== 密钥与凭据 =====
*.pem
*.key
*.p12                   # ← 新增 G5
*.pfx                   # ← 新增 G5
*.jks                   # ← 新增 G5
*.crt                   # ← 新增 G5
service-account*.json   # ← 新增 G6
auth*.json              # ← 新增 G6
.npmrc                  # ← 新增 G6
.netrc                  # ← 新增 G6

# ===== 编辑器与系统文件 =====
*.swp                   # ← 新增 G3
*.swo                   # ← 新增 G3
*~                      # ← 新增 G3
.history/               # ← 新增 G4
.Trash-0/               # ← 新增 G2

# ===== 本地编排覆盖 =====
docker-compose.override.yml   # ← 新增 G7
```

---

## 6. 一句话结论

**核心安全规则（`.env` / 密钥 / 资料目录 / 依赖产物）全部正确且经实测生效，已跟踪文件集干净；唯一真实缺口是 `.pytest_cache/`，另有 6 项低成本加固建议。** 建议把 G1 立刻补上，G2–G7 一并补齐（纯追加，无破坏性）。
