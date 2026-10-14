# release-check 实跑记录 · 2026-10-14

- 环境：本机（sandbox），文件模式；HEAD `f7b8739`；分支 `main`；CST
- 命令：`bash skills/release-check/scripts/release-check.sh`
- 性质：**只读**，不改文件、不 commit、不 push

## 一、基线（项目当前真实状态）

```
结果：20 通过  0 失败  1 警告  0 跳过
→ 无 FAIL，有 WARN，可发布但建议先看警告
```

退出码 `2`。

| 节 | 通过 | 失败 | 警告 | 跳过 |
|---|---|---|---|---|
| ① 密钥与凭据 | 5 | 0 | 0 | 0 |
| ② 隐私边界 | 6 | 0 | 0 | 0 |
| ③ 构建与自测 | 6 | 0 | 0 | 0 |
| ④ 发布形态一致性 | 3 | 0 | 1 | 0 |

> 注：首次落地时为 19 项（①4）；22:17 追加「compose 无注释掉的 env」后为 **20 项（①5）**。

**唯一的 WARN**：`工作区干净 — 8 个文件有未提交改动`。
这 8 个是用户自己的在制品（`AGENTS.md` / `PLAN-admin.md` / `RUN.md` / `TECH_DESIGN.md` /
`web/DESIGN.md` / `web/src/App.jsx` / `web/src/agent/theme.css` / `web/src/styles.css`），
按要求不动。**SKIP = 0**，说明每条检查都真跑了。

## 二、故意留个问题：它查得出来吗？

**结论：查得出来，且精准命中、可阻断、可还原。**

### 弄坏的是哪一项

`.gitignore` 第 2–3 行的 `.env` / `.env.*` 两条规则注释掉，
模拟「`.env` 意外失去忽略保护」这一最危险的发布事故（密钥文件随时可能被 `git add` 进去）。

### 靠哪条判据查出来的

检查 ①-1.2「`.env` 已被忽略」，判据是 `git check-ignore -q .env`：

```bash
if git check-ignore -q .env 2>/dev/null; then
  pass ".env 已被忽略" "$(git check-ignore -v .env | ...)"
else
  fail ".env 已被忽略" ".gitignore 未覆盖 .env"
fi
```

### 三次跑的对照

| 阶段 | 结果计数 | `.env 已被忽略` | 退出码 | 末尾结论 |
|---|---|---|---|---|
| 植入前（基线） | 19 通过 / 0 失败 / 1 警告 | PASS | `2` | 无 FAIL，可发布但建议先看警告 |
| **植入后（缺陷态）** | **18 通过 / 1 失败 / 1 警告** | **FAIL** | **`1`** | **有 FAIL，阻断发布** |
| 还原后 | 19 通过 / 0 失败 / 1 警告 | PASS | `2` | 无 FAIL，可发布但建议先看警告 |

### 三个「不虚报」的证据

1. **定点命中**：缺陷态下只有 ①-1.2 一条翻红，其余 18 项仍是 PASS
   → 不是「一片飘红」式的假报警；（② ③ ④ 三节全部保持全绿）。
2. **真的拦住**：末尾文案从「可发布」翻成「**阻断发布**」，退出码 `2 → 1`
   → 放进 CI 会直接 fail job，不是只印一句提示。
3. **证据可复核**：FAIL 行打印出 `.gitignore 未覆盖 .env`
   → 读的人可自行 `git check-ignore -v .env` 复核，无需相信结论。

### 还原留证（这一步不能省）

```bash
cp .gitignore .gitignore.bak-day25verify     # 植入前先备份
# ...植入缺陷、跑检查、截图...
diff .gitignore.bak-day25verify .gitignore    # → 无差异
rm -f .gitignore.bak-day25verify
```

还原后 `git status --short` 未提交文件数从 9 回到 8、`git diff --stat .gitignore` 为空
→ 实验对仓库**零残留**。

> 只跑到「查出 FAIL」就收工是危险的一半：**没有还原确认，缺陷会跟着一起发上去。**

## 二·补 第二轮：追加「compose 无注释掉的 env」并同样验证（22:17）

**新增检查项**（①-1.4）：扫 `docker-compose.yml` 里**形如赋值却被注释掉**的 env 行。
事故长相：Dockerfile 写 `# ENV DATA_DIR=/app/data`、compose 写 `#   DATABASE_URL: postgres://…`——
作者以为「写进文件就是配好了」，实际容器里根本没这个变量，进程静默走默认值。

**判据（收窄到只打真歧义）**：

```bash
grep -nE '^[[:space:]]*#[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[:=]' docker-compose.yml
```

只命中「整行是注释，且去掉注释符后**首个 token 就是赋值**」。
说明性注释（`# 不要删除下面的 DATA_DIR`、`# 命名卷：…`）与 `.env.example` 里的 `# KEY=`（样例应留空）**均不命中**。

**验证——故意植入 2 行**（`CHROMA_URL` / `DATABASE_URL` 注释成配置）：

| 阶段 | 结果计数 | `compose 无注释掉的 env` | 退出码 |
|---|---|---|---|
| 植入前 | 20/0/1 | PASS | `2` |
| **植入后** | **19/1/1** | **FAIL — `命中 2 行：82:# CHROMA_URL… 87:# DATABASE_URL…`** | **`1`** |
| 还原后 | 20/0/1 | PASS | `2` |

**证据要点**：FAIL 行直接给出**行号 + 原文**（82/87），读的人可 `sed -n '82p;87p' docker-compose.yml` 自行复核；
其余 19 项保持 PASS，②③④ 三节全绿 → 仍是定点命中，非一片飘红。
**还原**：`cp` 备份 → 植入 → 跑 → `diff` 无差异 → `rm`；`git diff --stat docker-compose.yml` 为空 → 零残留。

## 三、原始输出（不转述）

见同目录：
- `2026-10-14-day25-shot1-planted-fail.txt`（缺陷态，含 [FAIL] 行）
- `2026-10-14-day25-shot2-restored.txt`（还原态）

## 四、未做清单

- 公网健康检查只做了**只读 GET**（未改服务器、未重启容器）。
- ③-3.2 前端构建会在 `web/dist/` 产出构建物（已被忽略，未入库）。
- 未把本 Skill 接进自动化流水线（按今日清单「不做」项）。
- `.pi/agents/*.md` 里 `/home/bird/work/vbcd` 硬编码等历史遗留项未处理（沿用前日登记）。
