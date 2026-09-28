# 留证 · 只读子 agent 派出记录（2026-09-29）

> 本文件按 `AGENTS.md` §10.6 的格式产出：记录**子 agent 被派出**的执行（与 `skills/frontend-rules/runs/` 记「Skill 被调用」分工不同）。
> 这是 §10「多 agent 协作纪律」落地后的**首次实战调用**。

## 1. 派出概况

| 项 | 内容 |
|---|---|
| 授权依据 | `AGENTS.md` §10.1「只读类可在使用者已确认的板块内直接派出，不必再单独申请」 |
| 落点选择 | 选**只读** agent，不选写类：执行期仓库刚有第二个写者（F14），且按 §10.3 单写者原则，主会话不引入第二个写者 |
| 首批形态 | 一个异步 workflow（`runs.all`），两个只读子 agent 并行：`buddy-doc-sync` + `buddy-verifier` |
| 隔离 | 无 worktree（只读，不需要）；子 agent 工具集不含 `edit`/`write`，且提示词明令不得执行 git 命令 |

## 2. 结果一：`buddy-verifier`（completed）

独立重跑，**未接触主会话的结论**：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `cd /home/bird/work/vbcd && asr/.venv/bin/python -m pytest asr/tests -q` | 0 | **48 passed**（与主会话一致） |
| `cd web && npm run build` | 0 | `✓ built in 243ms`，`index.html 1.15 kB` / `index-*.css 21.59 kB` / `index-*.js 460.82 kB` |
| 附（主动反证）`cd asr && ../asr/.venv/bin/python -m pytest tests -q` | 2 | 7 errors during collection —— 印证「必须在仓库根跑」 |

它另外报告了两条**主会话没提**的观察：

1. `StarletteDeprecationWarning`：`starlette.testclient` 建议改用 `httpx2`——非致命，测试全绿，**但这是一条真实的技术债**（当前 `asr/requirements.txt` 仍走 `httpx`）。
2. `web/dist/assets/index-*.js` 达 **460.82 kB**（gzip 143.27 kB），逼近 Vite 的 500 kB 告警线——体积观察项。

`git status --porcelain` 为空 → 它确实没改任何被跟踪文件（`web/dist/` 属 `.gitignore` 的构建产物）。

## 3. 结果二：`buddy-doc-sync`（**首次失败 → 同协议重试成功**）

### 3.1 首次：failed（如实记录，不静默掩盖）

- 症状：子运行 `status=failed`，报 `Error: Run fan-out: 2/64 used, 62 remaining / Request timed out.`
- 残留输出仅 **64 字节**：`I'll start by gathering facts from the code, then read the docs.` → 说明它在**首个模型请求**阶段就超时，几乎没产出。
- 判断：疑似 **provider 侧请求超时**（非工具失败、非权限失败）；未做进一步根因定位（无法从残留物判断）。
- 处置依据：§10.4「违规即中止并以失败上报，不静默忽略、不降级重试」——故**没有**改用别的机制绕过，而是**同协议**（同一个 `subagent` 工具 + 同一个 agent）做**一次有界重试**。

### 3.2 重试：completed（缩小范围 + 显式 `timeoutMs=1200000`）

把 7 项核对缩到 3 项，并要求「先出结论再补证据」，10 分钟内完成。结果（原文要点）：

| 检查项 | 判定 |
|---|---|
| ① 接口数量 | ✅ 一致：代码实际 **14 个 `router.*` 注册**，去掉 `GET /api/health` 后 **13**，与 SPEC / RUN / AGENT.md / TECH_DESIGN / PRD 五处「13」同源 |
| ② 页面清单 | ✅ 一致：`web/src/pages/` 9 个组件与 `RUN.md` §3 表格全覆盖，`/confirmations` 已正确标注为「旧入口重定向」，与 `App.jsx` 相符 |
| ③ 挂起项口径 | ✅ 三处一致（均已完成），但发现措辞问题（见下） |

## 4. 它抓到的两个问题（主会话自查没发现的）

| # | 位置 | 文档写的 | 实际 | 严重度 | 处置 |
|---|---|---|---|---|---|
| 1 | `AGENTS.md` F13 行 | `⏸ **两项验证已挂起**`，但同一行紧接着列了**三条** | 三项验证，且 09-29 已全部完成 | **必须修改**（行内数字自相矛盾，会让读者误以为仍有挂起项） | ✅ **已修**：改为 `⏸ **三项验证曾挂起**`（保留历史叙述 + 「已全部跑完」注记） |
| 2 | `SPEC.md` §3 | 表内无 `GET /api/health`，全文零提及；而 `RUN.md` §8.4 却把「健康检查」列进「已有」 | 代码真实注册（`server/src/app.js` → `routes/health.js`），是第 14 个注册处理器 | 建议 | ⏸ **未改，等使用者拍板**：这是**口径选择**（health 是否计入「N 个接口」）。历史一律不计 → 若要维持「13」，只需在 SPEC 表下加一行脚注；若定为「计入」，则 SPEC / RUN / AGENT.md / TECH_DESIGN / PRD **五处都要 13→14**。按 §2 三.3「需要拍板的地方列选项给使用者选」，不在无授权时改口径 |

> 价值判断：这一条正是派独立审计员的意义——**主会话自己写下的注记、自己扫一遍不会发现「两项/三条」的矛盾**；只读 agent 从零读文档才看得出来。

## 5. 纪律核对（§10 自查）

| 条款 | 本次执行情况 |
|---|---|
| §10.1 只读自动、写入须批 | ✅ 只派了只读类；未派 `worker` / `*-writer` |
| §10.2 不为「显得忙」而派 | ✅ 两路都有明确目的（独立复核 / 文档口径）且都产出了可引用结论；未派空跑 |
| §10.3 单写者 + 提交权归主会话 | ✅ 子 agent 无写权限、被禁止执行 git；本轮 3 个提交全部由主会话执行 |
| §10.4 红线不下放 | ✅ 两个 agent 提示词均写明 §9.1/§9.2 同样生效、禁 git 写操作；doc-sync 末段自述「未修改任何文件、未读 `.env` 内容、未调视觉模型或浏览器」 |
| §10.5 派 agent ≠ 跳过确认 | ✅ 派 agent 属「当前这一步内部」的手段，未借它把多步并行做完（长任务本身就是使用者授权的范围） |
| §10.6 留证 | ✅ 即本文件 |

## 6. 遗留

- `buddy-doc-sync` 首次超时的**根因未定位**（疑似 provider 侧）；若再复现，按 §10.4 记证据后上报，不改机制绕过。
- `buddy-verifier` 的 bash 白名单是**提示词约束**而非工具级硬约束（pi 无「只允许这些命令」字段）——已在 `runs/2026-09-29-agent-extension.md` §4 记为待观察项。
- 未派写类 agent（本轮无此需求 + 单写者约束）；`worker` / `codex-exec-writer` / `claude-code-writer` 仍**一次未实战**。
