# 留证 · 扩展 agent 功能（项目级 agent 定义，2026-09-29）

> 执行者：主会话。格式对齐 `skills/frontend-rules/runs/2026-09-28-day12.md`。
> 起因：使用者 2026-09-29 指示「按文档中挂起的任务 → 扩展 agent 功能」，不干预、允许长时间执行。
> 前置：`AGENTS.md` §10「多 agent 协作纪律」于同日先落地（commit `3535869`）。

## 1. 为什么做「项目级 agent 定义」而不是「后端 agent 工具层」

`AGENT.md` §2 列的 7 个工具（`archive_note` / `create_task` / `transcribe_media` / …）**不在本次范围**，依据是该文件自己的边界条款：

> §4 本期边界：「agent」页当前只是「知识库问答」改名——自然语言驱动全站动作是**后续期数的事**，本文件只定方向，**不承诺排期**。
> §4 另注：后端 13 个接口保持原样，agent 化是**在接口之上加一层工具编排**。

同时另有现实约束（诚实记录）：当时仓库里**有第二个写者正在工作**（F14 链接收敛：`server/src/services/{link,organize,organize-runner}.js` 等 8 个文件在 30 分钟内被改动）。按 `AGENTS.md` §10.3「任一时刻只允许一个写者」，主会话**不能**同时改 `server/`。

因此本次选的路径是：**扩展 pi 的 agent 能力面**（项目级 agent 定义），它对 `server/`、`web/` 零侵入，且直接落地刚写好的 §10 纪律。

## 2. 交付物：三个项目级 agent

位置：`.pi/agents/*.md`（pi 标准项目 agent 目录；`docs/agents.md` 载明「Project | `.pi/agents/**/*.md`」）。

| agent | 用途 | 工具集 | 角色 |
|---|---|---|---|
| `buddy-rules-auditor` | 只读审计改动是否守住 `AGENTS.md`：任务边界 / 禁区文件 / §9.4 提交纪律 / §10 多 agent 纪律 / §2 八.3 五维度自检 | `read, grep, find, ls, bash` | read-only |
| `buddy-doc-sync` | 只读核对五份文档与代码事实：接口数量 / 页面清单 / env 键 / 功能边界 / 进度 / 挂起项三处口径 | `read, grep, find, ls, bash` | read-only |
| `buddy-verifier` | 只跑验证命令并回原始输出与退出码（build / smoke / pytest / health），不改源码 | `read, grep, find, ls, bash, contact_supervisor` | — |

三者共同的硬约束（写在各自系统提示词里）：

1. **§9.1 不调视觉模型、§9.2 不调浏览器工具**——子 agent 一并禁用（`AGENTS.md` §10.4「红线不因委派而失效」）。
2. **不得 `git commit` / `push` / `reset`**——提交权归主会话（§10.3）。
3. 两个审计 agent **绝不修改任何文件**；`bash` 仅限只读命令。
4. `inheritProjectContext: true`——子 agent 会**继承仓库的 `AGENTS.md`**，不必在提示词里复述规则。
5. `completionGuard: false`（审计类）——因为带了 `bash`，避免把「提到实现类词汇」误判为在改代码。

## 3. 验证：pi 是否真的发现了它们

`subagent({ action: "list" })` 实测输出（截取）：

```
Project agents
- buddy-doc-sync (project): … Tools: read, grep, find, ls, bash; Thinking: high; Acceptance role: read-only
- buddy-rules-auditor (project): … Tools: read, grep, find, ls, bash; Thinking: high; Acceptance role: read-only
- buddy-verifier (project): … Tools: read, grep, find, ls, bash, contact_supervisor; Thinking: medium
```

| 验收点 | 结果 |
|---|---|
| 三个定义被 pi 发现 | ✅ 出现在 `Project agents` 分组 |
| 工具集按定义生效（无 `edit`/`write`） | ✅ 审计类只有 `read, grep, find, ls, bash` |
| 只读角色被识别 | ✅ 两个审计 agent 标 `Acceptance role: read-only` |
| 覆盖内置同名 agent | 不涉及（三个名字都与内置不冲突） |

> 未安排「实际派一次」的调用：按 `AGENTS.md` §10.2「不为『显得忙』而派」，本次没有需要独立复核的任务，就不发起空跑。真实验收等第一次有复核需求时做，记录另开文件。

## 4. 边界与遗留

- **未做**：`AGENTS.md` §4 未新增条目说明这三个 agent（主文档由使用者决定是否落笔——我已在最终报告里列为「待确认」）。
- **未做**：`~/.pi/agent/settings.json` 未改（项目 agent 目录是默认发现路径，不需要注册）。
- **未做**：未新增 `subagents.agentScanDirs` / `agentOverrides` 等设置。
- **未做**：未实现 `AGENT.md` §2 的后端工具层（依据见本文 §1）。
- **待观察**：`buddy-verifier` 的 bash 白名单是**提示词约束**而非工具级硬约束（pi 没有「只允许这些命令」的字段）；若将来需要硬约束，可改用 `runner.type: external-cli` 的 command-runner 形态，把可执行命令收进脚本。
