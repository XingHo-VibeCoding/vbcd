# buddy — 会成长的个人助手

个人助手实验项目，五项基础能力：

| 能力 | 说明 |
|---|---|
| 个人数据库 | 资料存 Markdown + 目录，可索引检索，回答时定位原文 |
| smail 邮箱关联 | 获取并关联邮件，拟回复草稿；发送前须确认，同一封不重复处理 |
| ehall 事务 | 查询信息、准备材料与填表；提交前展示关键字段与后果 |
| 手机端联动 | 手机发起任务、查看进度、确认操作，不依赖桌面端 |
| 能力组合 | 五项共享上下文，跑通一条可反复使用的完整流程 |

本期只做两项：个人数据库（F1–F3、F9）+ 手机端联动（F4–F6），外加数据自托管（F7）、深浅主题（F10）、关于页（F11）、Agent 工具化（F12：`/agent` 页多轮对话 + 工具调用 + 确认闸门）、视频转写归档（F13：`asr/` 独立 fun-asr 微服务，走任务链路 `transcribe_url`）、链接收敛（F14：归档页「收敛」→ 抓取正文 → LLM 整理 → 归档）、ima 云端只读视图（F15 知识库 / F15b 笔记，内容零落盘）与关于页 × GitHub 动态（F16）。其余见 `PRD.md` 第 6 章。

外部操作（发邮件、提交表单、退课等）一律先展示后果再等确认；密钥与个人资料不进公开仓。

## 文档

| 文件 | 内容 |
|---|---|
| `AGENTS.md` | 协作规则，每次会话先读（最高优先级） |
| `research.md` | 竞品调研、本期不做清单 |
| `PRD.md` | 功能与验收标准 |
| `TECH_DESIGN.md` | 技术选型、数据流 |
| `SPEC.md` | 接口与数据结构（接口唯一事实源，见 §3） |
| `RUN.md` | 怎么跑起来 |
| `AGENT.md` | 产品 agent 化的方向备忘（动作 ↔ 接口 ↔ 页面） |
| `PLAN.md` | 转写服务的**原始设计方案**（实现已落于 `asr/`，差异见该文顶部批注） |
| `PLAN-admin.md` | 后台管理模块的设计方案（实现已落于 `web/src/admin/`） |
| `asr/PROBE.md` | fun-asr 上游返回结构与上限的实测结论 |
| `runs/` | 执行留证：子 agent 派出与长任务验证的原始证据（格式见 `AGENTS.md` §10.6） |

## 仓库结构

```
vbcd/
├── web/                 # 前端 React + Vite（含 web/src/admin/ 后台）
├── server/              # 后端 Node.js + Express（routes/ 为接口唯一事实源）
├── asr/                 # 转写微服务：Python + FastAPI（F13），仅 compose 内网
├── db/                  # PostgreSQL 建表与种子：schema.sql / seed.sql / migrations/
├── data/                # 个人资料，不进公开仓（Markdown + images/ + site.json）
├── runs/                # 执行留证（子 agent 派出、长任务验证）
├── skills/              # 固化下来的技能（frontend-rules 及其 runs/）
├── .pi/agents/          # 项目级子 agent 定义（规则审计 / 文档核对 / 验证执行）
├── docker-compose.yml   # 部署：web(Nginx) + server + Chroma + asr + postgres
└── *.md                 # 文档（链路：research → PRD → TECH_DESIGN → SPEC）
```
