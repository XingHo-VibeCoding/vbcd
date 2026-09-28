# AGENT.md — buddy 的 agent 化方向

> 方向文档（不是规格、不是任务清单）。
> 定位一句话：**界面上每个动作今天都由接口实现；未来它们都要变成 agent 可调用的工具。**
> 与 AGENTS.md 的分工：AGENTS.md 是"AI 助手怎么干活"的协作规则书，本文件是"产品怎么长"的方向备忘。

## 1. 现状：动作 ↔ 接口 ↔ 页面

| 动作 | 现有实现 | 页面入口 |
|---|---|---|
| 归档一条资料 | `POST /api/notes` | 主页「归档」卡 |
| 发起任务（记资料/提醒/收敛/删除资料/视频转写） | `POST /api/tasks`（`transcribe_url` 走 asr 微服务异步执行） | 归档页·收敛、日志页·任务页签、资料详情页「删除这条资料」；转写暂只有 curl 入口 |
| 推进任务状态 | `PATCH /api/tasks/:id` | 「日志」页 · 任务页签 |
| 高风险动作确认 | `PATCH /api/tasks/:id`（`decision`） | `/tasks/:id/confirm` 确认页 |
| 回看确认留痕 | `GET /api/confirmations` | 「日志」页 · 确认留痕页签 |
| 资料检索 | `GET /api/notes` | 「档案」页 |
| 知识库问答 | `/api/kb/query|stream` | 「agent」页（当前仅改名，功能未动） |

## 2. 方向：每个动作收编为 agent 工具

未来这些动作不再只走 HTTP 接口，而是注册成 **agent 的工具集**——使用者在「agent」页用自然语言下达指令，agent 编排调用：

| agent 工具（拟） | 底层复用 | 说明 |
|---|---|---|
| `archive_note` | `services/notes.js` | "把这段整理成资料归档" → 定标题/分类/标签后落盘 |
| `create_task` | `services/tasks.js` | "提醒我周五交报告" → 建 remind 任务 |
| `transcribe_media` | `services/transcribe.js` + `asr/` 微服务 | "把这个视频转成笔记" → 建 `transcribe_url` 任务，异步转写后归档 |
| `advance_task` | `routes/tasks.js` 的迁移校验 | "把那条收敛链接标完成" |
| `request_confirmation` | `storage/confirmations.js` | 高风险动作先登记待确认——**闸门留在后端，agent 不能绕过** |
| `search_notes` | `services/notes.js` 索引 | 检索自家资料库 |
| `ask_kb` | `routes/kb.js` | 基于向量索引的问答（现为「agent」页的实现） |

## 3. 铁律（引用 AGENTS.md §5，不因 agent 化而放松）

1. **外部操作必须确认**：发送、删除、提交类动作先展示后果、等同意——428 闸门保持后端强制，agent 工具也走同一条 Confirmation 链路，不留后门。
2. **不重复处理**：执行前查重（现有 `DUPLICATE` 语义保留）。
3. **密钥与隐私不入库**：agent 的凭证同样走 `.env`，不写进工具定义。
4. **保守优先**：agent 拿不准时停下来问，不代办用户的决定。

## 4. 本期边界

- 「agent」页当前只是「知识库问答」改名——自然语言驱动全站动作是后续期数的事，本文件只定方向，不承诺排期。
- 后端 13 个接口保持原样（「保留接口」）：agent 化是**在接口之上加一层工具编排**，不推翻现有链路。
- `transcribe_url` 已是现成的长任务模板：agent 调它时同样走「提交 → 轮询 → 归档」任务链路，写操作无需新闸门（归档与 F1 同级）。
