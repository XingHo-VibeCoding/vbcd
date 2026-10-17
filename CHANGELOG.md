# 更新日志

本文件从 **v1.0** 起维护：每次对外发布（tag + 部署公网）记一节。
格式参照 Keep a Changelog，版本号用 `v主.次`（功能增量升「次」，只修问题升「次.补」）。

> 版本是**发布**的单位，不是提交的单位：多次提交可以同属一个版本；
> 只有「打过 tag、过了发布前检查、公网可访问」三者齐备才算一个版本。

## v1.0 — 2026-10-16

**第一个正式版本**。tag `v1.0`，对应提交 `1387c1c`（2026-09-17 首提交 → 2026-10-15，共 211 commits）。
公网入口 **https://birdxp.324614917.xyz**，本版静态产物指纹 `index-AshHe_0w.js / d57b8707…`。

### 能力清单（自 v0 起累计）

| 能力 | 说明 |
|---|---|
| 个人数据库 | 资料存 Markdown + PostgreSQL，可索引检索，回答定位原文（F1–F3、F9） |
| 手机端联动 | 移动端浏览与操作，与桌面同源（F4–F6） |
| 数据自托管 | `data/` 绑定挂载，宿主机可直接备份（F7） |
| 深浅主题 | 全站双色适配（F10） |
| 关于页 | 个人介绍 + GitHub 贡献热力图与动态（F11、F16） |
| Agent 工具化 | `/agent` 多轮对话 + 工具调用 + 确认闸门（F12） |
| 视频转写归档 | `asr/` fun-asr 微服务，任务链路 `transcribe_url`（F13） |
| 链接收敛 | 归档页「收敛」→ 抓正文 → LLM 整理 → 归档（F14） |
| ima 云端只读 | 知识库/笔记只读视图，内容零落盘（F15/F15b） |
| 后台管理 | `/admin`：站点/个人信息、图片资产、任务、Agent 工具、环境变量 |
| 发布纪律 | 发布前检查 22 项（`skills/release-check/`）+ 回滚手册（`ROLLBACK.md`） |

### 发布形态

- 阿里云上海单机 Docker Compose：`web`(Nginx:80 托管静态 + 反代 `/api`) + `server` + `chroma` + `asr` + `pg`
- HTTPS 由 CDN 前置终结（源站仅 `:80` 明文）
- `/api/health` → `{"ok":true,…,"asr_configured":true,"ima_configured":true}`
- 环境变量/密钥在 `server/.env`（不入库）；口令走根 `.env` 的 `PG_PASSWORD`

### 已知限制（v1.0 不解决，见 ROLLBACK.md / 各文档）

- `index.html` 未显式下发 `Cache-Control: no-cache` —— 回滚/发版后浏览器可能短暂用旧
  `index.html` 去引用已不存在的带 hash 资源而白屏（heuristic 缓存，窗口通常几分钟）。
  **修法已写进 `ROLLBACK.md` §6，待使用者拍板后改 `web/nginx.conf`。**
- `SPEC.md` 的接口计数口径在文档侧仍写 38/40 混用（以 §3 表格行数为准）。
- `.pi/agents/*.md` 硬编码 `/home/bird/work/vbcd`，换机器即失效。

### 回滚

本版之前的最后一个可用状态是提交 `cc6aa14`（导航为中文）。
完整回滚流程、耗时实测与「什么情况必须回滚」的判断表见 **`ROLLBACK.md`**。
