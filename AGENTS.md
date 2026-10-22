# AGENTS.md — vbcd / buddy 项目协作规则

> 本文件是 AI 助手（WorkBuddy）在本仓库工作时的规则书。
> 每次会话开始时请先读本文件，遵守以下约定。

## 1. 项目背景

- 本仓库用于 **28 天 VibeCoding 打卡训练营**（2026-09 入营），同时承载 NJU 实验项目。
- **项目主题：buddy —— 会成长的个人助手**（Day 3 确定）。
  - 五项能力：个人数据库 / smail 邮箱关联 / ehall 事务 / 手机端联动 / 能力组合。
  - **本期 MVP 只做两项**：个人数据库（Markdown + 目录，可索引检索）+ 手机端联动（网页版，手机浏览器可用）。
  - 其余能力写进 `research.md` 的「本期不做清单」，第 2–3 期再做。
- 节奏：每天 45–60 分钟，当天只做当天的最小成果，当天产出当天打卡（23:00 前）。

## 2. 与用户的协作协议（最高优先级）

> 本节由用户于 2026-09-17 明确定义。与其他章节冲突时，以本节为准。

### 一、任务边界（最重要）

1. 用户发来的「今日任务清单」就是**当天唯一的任务范围**，只做清单里写的事。
2. 不做清单以外的没写：不建多余的文件、不写清单没提的功能、不顺手优化已有代码。觉得可以改得更好，先口头提出，等用户点头。
3. 不提前做以后的天数。只有用户把某天清单发来并明确说「现在开始做 Day X」，才允许动那天。
4. 拿不准是否在范围内，先问，不要猜。

### 二、交互式推进

1. 收到清单后，先只给「今天的执行计划」（按什么顺序做、每步怎么做、哪些要用户自己动手），**写完停下等确认**。
2. 确认后**一次只做一个步骤**，不连着往下做。
3. 每步做完立刻停下，说清三件事：做了什么、改了哪些文件、怎么验证（附用户能亲眼确认的结果）。
4. 然后停下等用户回复「进入下一板块」。没说这四个字就不继续。
5. 「进入下一板块」只对当前这一步有效，不代表可以一路做到收尾。

> **2026-10-14 使用者放宽（仅适用于「非打卡的文档整理 / 批量修正」类任务）**：
> 当使用者明确说「**完成一个板块后直接开始，不要每次都询问**」这类话时，第 2–5 条按下述执行——
> - **板块间可自动衔接**，不必每个板块都等「进入下一板块」；说一次即对本任务全程有效。
> - **但每个板块结束仍须汇报三件事**（做了什么 / 改了哪些文件 / 怎么验证），不得跳过。
> - **提交前必须停下等确认**（本节第 4 条与「五、Git 与提交」中的清单确认**不因此放宽**）。
> - 该放宽**只对当前任务有效**，任务结束后回到默认的「一次一步」；打卡（Day）类任务**不适用**本放宽。

### 三、人机分工

1. 需要用户人工操作的（注册账号、点按钮、装软件、截图等）：不代做、不假装已完成。只说明：这步在干什么、一二三步怎么做、做完该看到什么、容易踩什么坑，然后停下等用户。
2. 需要 AI 生成的内容（文档、文件、代码）：等用户说了再做，不在用户刚说「开始吧」时就把整天内容全部生成。
3. 需要拍板的地方（选方案、起名字、定风格）：列出选项和各自代价给用户选，不自己决定。
4. 验证结果必须让用户能亲眼确认（页面能打开、文件能看到、命令有输出），不接受「已经完成了」这类口头结论。

### 四、讲清楚环节（用户是来学习的）

1. 每个步骤开始前先说明：它在整个作品里的位置、为什么现在做、做完会变成什么样。
2. 每步用「做了什么 → 结果 → 为什么」讲明白，不只给结果。
3. 用户不懂的概念（命令、报错、术语、配置）用一两句话解释，不默认用户会。
4. 报错时先说明错在哪、可能什么原因、打算怎么修，用户同意后再动手。不输出教程式长文。

### 五、Git 与提交

1. AI 获授权代为执行 git 提交和推送，但**提交前必须先列出**本次会改动哪些文件、每个文件属于哪天的任务，等用户确认后再提交。
2. commit 信息格式：训练营任务（打卡）用 `Day X｜一句话说明`；**非打卡的 buddy 项目内部改动用 `[ BIRD ] | 中文解释提交内容` 单行模式**（例：`[ BIRD ] | 为全站增加深浅主题切换`）。完整规则与两种格式的适用边界见 §9.4。
3. 密钥、`.env`、数据库连接串永远不进代码、不进提交。
4. **提交粒度（2026-09-19 更新，采用"原子变更"原则）**：
   - **每完成一个"板块"（一个明确意图）即可提交**：一次提交只围绕一个意图——能解释、能验证、能单独撤销；不把多种意图混进一次提交（例如"顺手格式化"应与功能改动分开）。
   - **每个 Day 结束时，另做一次「阶段总结提交」**：正文总结当天完成的内容与产出清单，并同步 `AGENTS.md` 第 4 节进度。
   - 两种提交都必须先列出改动文件清单、经用户确认后再执行（上述第 1 款不变）。

### 六、当日收尾

1. 用户说「今天做完了」之后，逐条对照清单「完成标准」输出表格：完成标准 / 状态（已完成·部分完成·未完成）/ 证据（文件、页面、命令输出）。
2. 核对必须诚实：没做完、做了一半、跳过没做的直接标出并说明原因，不为凑「全部完成」而模糊处理。
3. 有未完成项时，说明还差什么、接不接着做，**由用户决定**，不自行往下做。
4. 全部完成时，按清单「收尾指令」整理当天成果，提醒用户交哪张截图、在群里回什么。

### 七、出问题的时候

1. 用户要求撤销时，用安全回退（`git revert`，保留历史），禁止 `git reset --hard` 和强制推送。
2. 回退前先确认恢复到哪个提交，回退后列出当前状态让用户核对。
3. 同一个操作反复失败时停下来报告：说清楚试了什么、报什么错、判断的原因，不要循环重试。

### 八、每日工作流程（Day 模式，第 1–4 天已跑顺，固定照此执行）

1. **收到当日任务清单** → 只给「今天的执行计划」（步骤顺序 / 每步谁动手 / 预计产出），写完停下等用户确认。
2. **一次一步**：用户说「进入下一板块」才做下一步；每步结束汇报三件事——做了什么、改了哪些文件、怎么验证（附用户能亲眼确认的证据）。
3. **产出后自检**：文档类产出用五个维度自查——内部一致性、验收可复现性、范围一致性、与上游文档一致性、术语与前提定义；问题分「必须修改 / 建议修改 / 通过」，先把必须修改清零。
4. **提交与推送**：① 每完成一个板块，按"一个意图一次提交"列出改动清单 → 用户确认 → 提交；② 当天全部结束后，做一次「**阶段总结提交**」（总结当天成果 + 更新第 4 节进度）→ 推送：本设备（Linux）只推 `origin`（=camp 组织仓，`git push origin HEAD:main`）；Windows 侧才用 `git pushboth` 推双远程 → 输出完成标准核对表 + 打卡提醒（截图要求、每日一问素材）。
5. **打卡三件事只能用户本人做**：截图、每日一问、群内回复；AI 不代笔、不代发。

## 3. 28 天里程碑（来自训练营手册）

| 阶段 | 天数 | 目标 |
|---|---|---|
| 第 1 周 | Day 1–7 | 环境/账号 → 写 research.md、PRD.md、TECH_DESIGN.md、AGENTS.md → 生成第一个能跑的 MVP |
| 第 2 周 | Day 8–14 | 前端主视图、统一风格、交互反馈、自制 Skill、多级页面与四种状态 |
| 第 3 周 | Day 15–21 | CloudBase 云端链路：接口契约、建表、读/写接口、数据访问层、公网部署 |
| 第 4 周 | Day 22–28 | 测试、部署、线上验收 |

## 4. 当前进度

- **Day 1（2026-09-16）**：✅ WorkBuddy 安装登录；✅ 工作区文件夹；✅ AGENTS.md；✅ Git 2.50.1；✅ Node.js v22.22.2（npm 10.9.7）；✅ GitHub 账号（**bird-z**）。
- **Day 2（2026-09-17）**：✅ 创建 GitHub 仓库 https://github.com/bird-z/vbcd（Public，main）；✅ 首个占位页 `index.html` 与 `.gitignore` 提交推送；✅ 忽略规则验证生效（.env 不上传）。
- **Day 3（2026-09-18）**：✅ 确定项目主题 buddy 与 MVP 范围；✅ 调研 6 个竞品；✅ 产出 `research.md`（含本期不做清单）；✅ buddy 分支内容合并回 main。
- **Day 4（2026-09-19）**：✅ 确定 MVP 范围（F1–F7）；✅ 产出 `PRD.md`（25 条验收标准）；✅ 两轮 AI 自检，必须修改与建议级全部清零；✅ 确定数据与同步策略（代码→GitHub 公开、资料→自建 Gitea 私有、公网 HTTPS + 登录）；✅ 追加后续候选 F8（学习留痕）；✅ 远程 `buddy` 分支已删除，仓库只剩 `main`。
- **Day 5（2026-09-19）**：✅ 讲解前后端与存储分工；✅ 产出 `TECH_DESIGN.md`（技术路线 10 条选型含理由与备选、数据流图 3 张 Mermaid、架构原则与演化策略、技术债台账）；✅ 产出 `SPEC.md` 实现规格（项目结构 / 数据对象及字段 / 8 个 API / 数据流 / 错误处理与错误码 / 环境变量 / 部署与迁移含"文件→数据库"三步迁移）；✅ 前端定为 React + Vite、后端 Node.js + Express；✅ 配置**双远程**（origin=bird-z/vbcd、camp=XingHo-VibeCoding/vbcd）与 `git pushboth`；✅ `.gitignore` 排除 `memory/`、`drafts/`（个人资料不进公开仓）；✅ 确立提交粒度规则（板块提交 + 阶段总结提交）。
- **Day 6（2026-09-19）**：✅ 板块①检查规则文件——确认 Day 1 规则内容仍在，「当天唯一的任务范围」「没说『进入下一板块』就不继续」两条关键规则原文保留；✅ 板块②追加「我的个人规则」3 条（中文作答与注释 / 代码只放规定的项目结构 / 改完代码提醒刷新浏览器），仅末尾追加、原有内容未改动（diff 仅 +8 行）；✅ 板块③ AI 完整复述规则，经用户确认无误；✅ 规则自测 2 项（越界测试、流程测试）均通过，记录见文末「规则自测记录」。
- **Day 7（2026-09-19）**：✅ 读四份文档并从 PRD/SPEC 推导今日范围（F1 录入降级为浏览器 localStorage、F2 列表检索、F3 只做"打开即刷新"的行为体现；F4–F6 因需登录与后端，明确不做）；✅ 产出第一个能跑的 MVP：`web/`（Vite 8 + React 19），三个视图（列表检索 / 新建录入 / 详情）+ 本地数据适配层（签名对齐 SPEC 接口）+ 一份测试数据；`npm run dev` 与 `npm run build` 均实测通过；✅ 前端补 Markdown 渲染（`react-markdown` + `remark-gfm`）与录入页实时预览；✅ 新增 `RUN.md` 运行说明；✅ 后端骨架 `server/`（Express 5）：应用装配、统一错误格式 `{ ok:false, error:{ code, message } }`、请求日志（request_id + 耗时）、`GET /api/health` 健康检查；✅ 后端登录：`POST /api/login`（bcrypt 校验 + HttpOnly Cookie 会话 + 同 IP 10 分钟失败 5 次限流）、`POST /api/logout`、内存会话存储（默认 30 天）、`scripts/hash-password.js` 本机生成口令哈希、`.env.example` 配置样例（`.env` 不入库）；✅ 鉴权中间件 `requireAuth` 已就位但**尚未挂到任何路由**，前端仍走 localStorage，**前后端未打通**；⚠️ 后端尚未实测运行：`server/.env` 未创建、`server/node_modules` 未安装；✅ 过程纪律：首次搭骨架因"一次性写多个文件"被回退重来，确立"写文件前先列清单"的现场规则。
- **Day 8 前预做（2026-09-22）**：✅ 数据目录 `data/`：`.gitignore` 补根锚定 `/data/` 规则，4 条种子迁成真 Markdown（frontmatter + SHA-256）；✅ 后端存储适配层 `server/src/storage/files.js`（`list/get/put/remove/sync`）+ 资料业务 `services/notes.js`（校验/查重/slug/原子写入，绝不覆盖）；✅ 资料三接口 `POST/GET /api/notes`、`GET /api/notes/:id`，`requireAuth` 挂载生效，索引缓存 `data/.index.json`（指纹 + 全文检索 + `INDEX_CACHE=0` 可关）；✅ `server/scripts/smoke.mjs` 12/12 端到端实测通过（临时口令 + 临时目录，未碰真实口令）；✅ 前端接入后端：登录页 `/login`、`api/client.js` 统一请求、三页改异步、`vite` 代理 `/api`，删除 localStorage 与种子文件；✅ RUN.md 补后端运行与 Obsidian 展示说明；✅ 文档口径 `memory/` → `data/` 同步；✅ 浏览器登录实测通过。
- **隐私模块调整（2026-09-23）**：登录/鉴权从「默认必开」改为「隐私模块默认关闭」——站点默认公开免登录，设 `AUTH_ENABLED=1` 才启用；保留登录代码骨架（不删）；SPEC/RUN/PRD/research 口径同步；smoke 改为按 `auth_enabled` 自适应（公开 8/8、隐私 12/12）。
- **F13 视频转写归档（2026-09-28，buddy 项目内部改动）**：✅ `asr/` 独立 fun-asr 转写微服务（FastAPI 单进程、4 端点、SSRF 闸门、静音对齐切片 + 按实际片长偏移合并、同源缓存 + 单飞、终态即删临时媒体、Bearer 鉴权）；✅ 探针实测落 `asr/PROBE.md`（A1 句级时间戳需由 `output.sentence.words[]` 按标点重组（毫秒）/ A2 硬上限是 **300 秒时长**而非 10MB 体积（305s 起 400 空 sentence；300s wav 的 12.21MB Base64 仍通过）/ A3 6 并发未观测到限流）；✅ pytest 48 例全绿（单测 + respx mock；2026-09-28 探针复核后由 37 例增至 48 例——新增句级重组/时长护栏用例）；✅ compose 第 4 服务 `asr`（命名卷、不发布端口，server 内网可达实测）；✅ buddy 侧零新接口——`Task.type+transcribe_url` + `task.asr` 字段 + `services/asr.js|transcribe.js|transcribe-runner.js` 轮询归档（LLM 整理失败回退原文模板、partial 告警块、按 source_url 查重「已归档过」、`failed→todo` 清 asr 重提交）；✅ `smoke.mjs` 转写断言 ×9（`fake-asr.mjs` 桩自动拉起）——公开 28/28、隐私 32/32；✅ 真实链路实测：BV1iYea6zEVC → `data/learning/*.md`（含 deepseek 摘要/要点 + `[mm:ss]` 全文）；**2026-09-28 探针复核**：`parse_result` 改由 `words[]` 按标点重组句级 segments（真实链路实测 12 句 / 70s，时间轴单调、覆盖率 363/363 字），`ASR_MAX_AUDIO_SECONDS=300` 护栏 + 启动夹紧落地；✅ 文档同步：PRD v1.7（F13 + 验收 6 条）/ SPEC（3.4 小节 + env +7）/ TECH_DESIGN v1.3（选型 +1 + 数据流 4.5）/ RUN 8.8 / README / AGENT.md 工具表；⚠️ 未做：前端表单入口（仅 curl）、上传接口、srt、自动进向量库（需手工 `POST /api/kb/index`）；⏸ **三项验证曾挂起**（使用者 2026-09-28 决定先跳过）：>20 分钟多片链路 `chunks ≥ 5`、TTL 内 `cache_hit=true`、逐句 `[mm:ss]` 归档复跑 —— 恢复步骤见 `asr/PROBE.md` §A4，已同步到 `SPEC.md` §7.5（A7）与 `RUN.md` 8.8。**→ 2026-09-29 已全部跑完（见下方 2026-09-29 条目）**。**→ 2026-10-03 字幕能力落地**：asr 加 srt 输出与 `formats` 参数（`to_srt` + result 按 formats 附带 `srt`）+ 平台字幕抓取端点 `POST /v1/subtitles`（`asr/subtitles.py`：中文优先、先 CC 后自动字幕、秒级返回、无字幕 `found:false`）；buddy `transcribe_url` 支持「先抓字幕 → 抓不到回落转写」+ srt 透传落盘（正文追加 `## 字幕（srt）` 代码块）；前端收敛表单加「网页/视频」切换（视频走 `transcribe_url` + `prefer_subtitles:true` + `formats:['text','segments','srt']`）。原「⚠️ 未做：前端表单入口、srt」两项已补齐；上传接口、自动进向量库仍不做。
- **F14 链接收敛（2026-09-28，buddy 项目内部改动）**：✅ 「整理链接」补上后端解析——`server/src/services/link.js`（SSRF 闸门：私网/回环/链路本地/CGNAT/云元数据 + DNS 解析校验 + 逐跳重定向复验；抓取：20s 超时、2MB 流式封顶、charset 纠正与 gb18030 回退；提取：`node-html-parser` 剥干扰 + article/main 容器择优，<200 字明确失败）→ `organize.js`（提交即异步执行、`task.organize` 进度字段、两次 source_url 查重「已归档过」、LLM 整理失败回退模板、`DUPLICATE` 也算已归档）→ `organize-runner.js`（兜底：`failed→todo` 重试与 doing 僵死恢复，默认 4 分钟判僵死、最多 3 次）；✅ 归档仍走 `createNote`，**对外接口仍 13 个**，不设确认闸门（读取外部网页无对外副作用）；✅ 前端「收敛」表单补分类选择与文案；✅ 测试：`link-selftest.mjs` 38/38（含 SSRF 拦截矩阵、逃生门收窄后的恒拦项、公网 IPv6 放行、GBK 解码）、`smoke.mjs` 扩 3 条收敛断言——**公开 31/31、隐私 35/35**（转写链路同时跑通）；✅ 真实公网链路实测：`https://nodejs.org/…` → `done` 并归档（含重定向提示、8000 字节选；未配 Key 时走回退模板），`https://example.com/` 因正文仅 167 字 → 如实失败；✅ 文档：PRD v1.8（F14 + 验收 6 条）/ SPEC 新增 3.5 与 env +9 / TECH_DESIGN v1.4（选型 +1、数据流 4.6）/ RUN 8.9 / AGENT.md / 本文件；⚠️ 未做：复杂 SPA 与需登录页的正文提取（明确失败并给出路）、robots 协商与域名限速、视频链接自动改走转写（只给提示）；🔧 **真实链路暴露的两处修正**：① 闸门原先把「所有 IPv6」一律拦，导致带 AAAA 记录的正常公网站点全被误杀（`en.wikipedia.org` 实测踩到）→ 改为按段判定（ULA/链路本地/组播/文档段/Teredo/NAT64 拦，公网全局单播放行，v4-mapped 与 6to4 抽内嵌 v4 再判）；② 测试逃生门从「放行全部私网」收窄为 `ORGANIZE_ALLOW_LOOPBACK`（只放回环），内网与 169.254.169.254 恒拦，冒烟里的 SSRF 断言从「连不上」变成真拦截。
- **F12 决策拍板（2026-10-09，buddy 项目内部改动，非训练营清单任务）**：✅ agent 工具化五条待定项全部落定（PRD v1.11 §7「已确认决策」）——边界 S0+S1+S2-lite（只读三件套 + `archive_note` 单写工具走闸门）、技术路线 A 终态 + JSON 状态接缝、前端改造 `/ask` 页、接口 +2（20→22，`SPEC.md` §3 已预留坑位）、时间盒 5 板块封顶；✅ 参考实现调研落 `research.md` §7（Anything-LLM + LibreChat 借零件不借骨架，clone 于 `~/work/refs/` 不进 git）；✅ `AGENT.md` §4 同步为已定边界。**未动代码**，F12 实做等使用者发清单。
- **F12 落地（2026-10-09，buddy 项目内部改动）**：✅ S0 骨架 `server/src/services/agent/`（manifest/registry/state/audit/loop + tools×4：search_notes/get_note/ask_kb readonly、archive_note needs-confirm）；✅ 接口 20→22（`POST /api/agent/chat` SSE + `GET /api/agent/runs`，另有 `GET /api/agent/tools`）；✅ `executeApproved` 补 `agent_archive_note` 分支（确认后真写）；✅ `/ask` 页改多轮对话（消息流 + 工具折叠行 + 确认提示）；✅ 冒烟 ag①–ag⑤ 全过（公开 24/24）；✅ 本机 vLLM（Qwen3-4B, hermes tool-call）实测批准/拒绝双路径通；🔧 途中抓到存量 bug：`kb.js` SSE 用 `req.on('close')` 误判断开（已修 agent 路由，kb 同型待修）；⚠️ 未做：确认后自动接话（resumeAfterDecision 预留）、逐字流式（现为 invoke 全量）、create_task/advance_task 工具（下期）。
- **F16 关于页 × GitHub 动态（2026-10-10，buddy 项目内部改动）**：✅ 聚合接口 `GET /api/github/activity`（接口 23→24）：`services/github/client.js` 抓取层（REST profile/events + GraphQL contributionsCalendar）+ `services/github.js` 30 分钟内存 TTL + 单飞；三档降级（未配 `GITHUB_USERNAME`→`configured:false` / 无 token→`calendar:null` / 整体不可达→`502 GITHUB_UPSTREAM`）；`GITHUB_API_BASE`/`GITHUB_GRAPHQL_BASE` 可注入；✅ 前端 `/about`：研究动态页签双热力图（资料上/GitHub 下，共用抽出的 `ContribGraph` 骨架）+ 混排时间线（GitHub 事件与资料更新按日期穿插、来源徽章区分），自我介绍页签 GitHub 资料卡（`data/profile.md` 加 `github` 字段、`/api/me` 透传）；✅ `fake-github.mjs` 桩 + smoke gh①–③（公开无桩 27/27、带桩 29/29）；✅ 真上游实测（无 token）：`profile.login=bird-z, followers=1, publicRepos=13` + 真实 PushEvent 事件流；🔧 途中修一处契约偏差（上游连接失败漏出 `INTERNAL` 裸错 → 归一 `GITHUB_UPSTREAM`）+ 一处假精确文案（REST events 的 `size` 不可靠，「推送了 0 个提交」改为「推送了提交」）；✅ 文档同步：PRD v1.14（F16 + 验收 6 条）/ SPEC §3.9 + 接口 24 + 错误码 `GITHUB_UPSTREAM` + env 组 / TECH_DESIGN v1.8（选型 +1）/ RUN 8.12；⚠️ 未做：真实 GitHub 满血链路（配 `GITHUB_TOKEN` 后 `calendar` 才非空，目前线上与个人 PAT 均未配置）。
- **Day 8（2026-09-22 ~ 09-23）**：✅ 实做内容见上方「**Day 8 前预做**」（09-22：`data/` 数据目录 + 存储适配层 `storage/files.js` + 资料三接口 + 冒烟 12/12 + 前端接后端）与「**隐私模块调整**」（09-23：登录/鉴权改为「隐私模块默认关闭」）两条；本行原为「待任务清单」占位，已废止，不再单独记。
- **Day 18（2026-10-07）**：✅ SPEC §7.3 迁移第 1 步的写侧落地——`POST /api/notes`（接口 #3）落点由文件切到 PostgreSQL：`createNote()` 改为环境自适应（配 `DATABASE_URL` → 只写 `notes` 表；未配 → 照旧落 `data/` 文件；库连不上 → 503 `DB_UNAVAILABLE` 不静默退文件）。契约不变（`201 {id,path,hash}`），接口数仍 20，前端 0 行改动；归档链路（F13 转写 / F14 收敛 / note 任务）自动全入库。✅ 三种异常输入防护实测：缺必填字段 → `400 VALIDATION_FAILED` + 中文（复用 `validate()`）；重复提交 → `409 DUPLICATE`（服务层查重 `sha256(title\ncontent)`，无唯一索引）；id 撞车 → INSERT 捕 `23505` 撞 `notes_pkey` 自动退 `-2`/`-3` ≤10 次（对齐文件版 `put()`）。✅ 部署：`docker compose up -d --build server` + `restart web`（防 nginx 旧解析 502 坑）。✅ 真实写入 + 读回：POST → `201` → `notes` 表 11→12 → `GET /api/db/notes/:id` 读回 `{meta,content}`（撞车验证多出的 `…-2` 行已按使用者裁决 `DELETE` 清理）。✅ 回归：smoke 公开模式 20/20（无库临时 server 走文件路径）。✅ 余力加练已做：`insertDbNote` 成功路径加一行服务端日志 `[db] notes 写入成功 id=…`。⚠️ 踩坑：`localhost:3000` 被别的项目（beautyweb next-server）占用导致 smoke 首轮打错对象，换 `PORT=3210`+`BASE_URL` 复跑全绿。⚠️ 待办：`sync-to-db.mjs` 对账会恒报「库有文件没有」（预期分叉）。留证 `runs/2026-10-07-day18.md`。文档：SPEC §3.8（读→读写）+ §4 写入口径 / TECH_DESIGN §4.1 / RUN 8.7。
- **Day 17（2026-10-06，原文误记为 10-08）**：✅ SPEC §7.3「文件 → 数据库」迁移第 2 步落地，4 个板块全走通：
  - 板块①读接口：`server/src/db/{pool,notes}.js` + `routes/db.js`（`GET /api/db/notes` / `:id`，接口 18→20）——`pg` 懒加载连接池（max 4 / 空闲 10s / 连接超时 5s），未配 `DATABASE_URL`→`503 DB_NOT_CONFIGURED`、库错→`503 DB_UNAVAILABLE`（不透裸 SQLSTATE）；详情返回 `{meta,content}` 与文件版同构，前端零改动切换；`?limit`（默认 500）、`?offset`、`?q`（标题+正文+标签 ILIKE）、`?category` 全支持；SIGTERM/SIGINT 关池。
  - 板块②接真实数据：`server/scripts/sync-to-db.mjs`（`--dry-run` 可看解析结果）扫 `data/` → `INSERT … ON CONFLICT DO UPDATE WHERE hash 变了`，幂等（复跑 `未变 11`）；对账「库有文件没有」只报告不自动删；顺手清掉 6 条 Day 16 的 `*-demo-*` 假种子。
  - 板块③部署：`docker-compose.yml` 加 `pg` 服务（`postgres:18-alpine`、不发布端口、`db/schema.sql` 首次自动建表、命名卷 `pg-data`）；`server` 注入 `DATABASE_URL`（compose 从根 `.env` 的 `PG_PASSWORD` 拼）、`depends_on` 改长语法等 `pg healthy`；**踩坑两枚已写 RUN.md 8.7**：compose 的 `${VAR}` 只认根 `.env` 不认 `server/.env`、web 容器要 `restart` 才能重新解析重建后的 `server` 主机名。
  - 板块④真库验证：同步脚本跑进 compose 内网 → `notes=11`；`UPDATE title` → `GET /api/db/notes/:id` 立刻变 → 改回；前端 `web/src/api/notes.js` 把 `listNotes`/`getNote` 切到 `/api/db/notes`（`createNote` 仍走文件版，Day 18 再接），`npm run build` 通过，`docker compose up -d --build server web` 生效。
  - ⚠️ 待办：`data/.runtime/tasks.json` 未同步进 `tasks` 表（结构映射有取舍，Day 18 写接口进来再说）；`?limit` 上限 500，超 500 条资料时换游标分页；本机 IP `192.168.130.14`（非 §7 记的 `192.168.1.62`，后者已过期）。
- **长任务：结清挂起验证 + 扩展 agent 能力（2026-09-29，by AI 自主执行）**：使用者 2026-09-29 指示「按文档中挂起的任务 → 扩展 agent 功能，不干预、允许长时间执行」。三条挂起验证**全部跑完并转为已完成**：
  - ✅ **F13 三项验证结清**（A7 → ✅）：① 多片链路 `BV1Eb411u7Fw` p15（宋浩高数 1.8 节，39:26 = 2367s）→ `stats.chunks=**14**`、终态 `succeeded`、首句 `1.0s`→末句 `2364.253s`、时间轴单调、**364 句**、覆盖 1907/2367s（81%）；② TTL 内第二次提交 → `cache_hit=true`、**0.127s 墙钟**、`stats` 与首次逐字段一致（未重下）；③ 逐句 `[mm:ss]` 归档复跑成功（任务 `1790637103273-8c23` 约 30s `done`，落 `data/learning/2026-09-29-高等数学-…-p15-1-8-函数的连续性与间断点.md`，首行 `[00:01]`→末行 `[38:21]`，**364 句按「间隔 <2s 合并」写为 68 段**）。
  - 🔧 **前置修复（否则是假通过）**：`vbcd-asr` 镜像构建于 09-28 18:44，**早于**当晚的 `words[]` 句级重组修复，旧镜像同一 70s 视频只出 **1 个 segment** → 先 `docker compose up -d --build asr` 重建（重建后 `/app/asr/providers/funasr.py` 命中 `words` 9 行）再验证。
  - ✅ **F9 知识库问答转为已实测**：`POST /api/kb/index` → `{added:1,removed:1,unchanged:4}`；`POST /api/kb/query` → 返回带 `score` 的来源且**如实拒答**（资料里没有该信息时不编造）；`GET /api/kb/stream` → `event: sources` + `token`×N 逐字推送且内容准确。链路走 `:80 → nginx → server 容器 → Chroma 容器`（**未用**并发会话的 `:3100` dev）。
  - ✅ **验证命令实跑**：`asr/.venv/bin/python -m pytest asr/tests -q` → **48 passed**（**必须在仓库根跑**；在 `asr/` 内跑会 `ModuleNotFoundError: No module named 'asr'`）；`smoke.mjs` → 公开 **20/20**、隐私 **24/24**、带假 ASR 公开 **29/29**、隐私 **33/33**（不开 `ORGANIZE_ALLOW_LOOPBACK` 口径）。
  - ✅ **扩展 agent 功能**：新增 3 个项目级 agent 定义（`.pi/agents/buddy-rules-auditor.md` / `buddy-doc-sync.md` / `buddy-verifier.md`），分别负责「按 AGENTS.md 审改动」「五份文档口径核对」「只跑验证命令回原始输出」；均只读、均写明 §9.1/§9.2 对子 agent 同样生效、均不得执行 git 命令（§10.4/§10.3）；`subagent list` 实测已列为 `Project agents`。
  - ✅ **留证**：新增 `runs/`（3 份）：`2026-09-29-f13-live-verify.md`、`2026-09-29-f9-kb-e2e.md`、`2026-09-29-agent-extension.md`。
  - ✅ **两路只读子 agent 独立复核**（§10 机制首次实战）：`buddy-verifier` 独立重跑 → pytest **48 passed**、`npm run build` 成功（并自证了「在 `asr/` 内跑 pytest 会 ModuleNotFoundError」）；`buddy-doc-sync` 做五份文档口径核对。留证见 `runs/2026-09-29-subagent-dispatch.md`。
  - ✅ **TTL 过期补验**：临时容器 `CACHE_TTL_SECONDS=20`（端口仅绑 `127.0.0.1:8098`，不碰正式服务）→ TTL 内第二次 0.127s 命中、**TTL 外**第二次为全新 job 且重新下载（无 `cache_hit`）；验完即 `docker rm -f`。
  - ✅ **隐私模式（`AUTH_ENABLED=1`）下的 KB 鉴权补验**：另起一份服务（`docker compose run`）实测 **10 条全过**——无 cookie 访问 `/api/kb/query|stream` 与 `/api/notes` 均 **401 `AUTH_REQUIRED`**、错口令 401、对口令 200 + 下发会话 cookie、带 cookie 问答 **200 拿到真实答案**、登出 204 且旧 cookie 立即失效。
  - ✅ **发现并修复「部署落后于代码」**：线上 `:80` 的 JS 为 `index-B4rMX2cG.js`（458909 B，**不含**「收敛/发散」）——`web` 镜像是多阶段构建，静态产物在 `docker build` 时固化，而镜像构建于 09-28 18:44、F14 前端提交在 09-29 06:54 之后。已 `docker compose up -d --build web` 重建；修后线上与本地**同为 `index-CrkQm1km.js` / 460821 B**；重启副作用已核（12 条任务全 `done`、`asr /healthz` 200、五个页面全 200）。
  - 🔧 **两个真踩到的坑已写进 `RUN.md` 8.7 踩坑表**：① `docker run --env-file` **不剥行内注释**，而 compose 的 `env_file` **只在值非空时**才剥（值留空时注释会变成值本身 —— 2026-10-14 实测纠正了原先「compose 一律会剥」的写法），导致密钥尾部吃进中文注释 → `fetch` 报 `ByteString` 错（我曾误判为代码 bug，实为测试夹具问题）；② 改完 `web/src` **不重建 web 镜像**则 `:80` 永远旧。
  - ✅ **第二轮只读审计（审我自己）**：`buddy-rules-auditor` 审 7 个提交——提交格式/线性历史/禁区文件/§4 不夸大均通过（它实核了 pytest 48、指纹 460821、任务数 12 三处硬数字），但抓到 **1 条「必须修改」**：`9d23b0e` 引用了要到 `27d4223` 才入库的 `runs/` 文件（**悬空引用**，因 §2 七.1 禁重写历史而不能事后消除，已记为教训）；`buddy-doc-sync` 出 19 条文档口径发现。留证见 `runs/2026-09-29-audit-round2.md`。
  - ✅ **据此修正的文档事实**（均经我亲自复核）：`asr/.env.example` 的 **5 个死键**（`ASR_BIND_HOST`→`ASR_HOST`、`ASR_SILENCE_SEARCH_SECONDS`→`ASR_SILENCE_WINDOW_SECONDS`、删 `JOB_GC_INTERVAL_SECONDS`/`FFMPEG_PATH`/`FFPROBE_PATH`）+ 补 `DOWNLOAD_TIMEOUT`/`MAX_DOWNLOAD_MB`；`SPEC.md` §6 补 `LLM_TIMEOUT_MS`/`LLM_MAX_RETRIES`/`INDEX_CACHE` 并标注 7 个未读取的部署期键；`RUN.md` 的 `link-selftest` 由错误的「24 条」改为**实跑值 38**、8.8 补 300s 硬上限说明；`README.md` 补 `runs/`/`skills/`/`.pi/agents/`；`TECH_DESIGN.md` 修 §5.6「skills 尚未创建」与 §5.7「仅有一个冒烟脚本」两处过时事实。
  - ✅ **F14 收敛链路独立验证**（此前只有作者自测）：换素材 `developer.mozilla.org` 中文 502 页 → 任务 `1790638554410-403c` `done`，归档 `data/learning/2026-09-29-502-bad-gateway-http-mdn.md`（含摘要/要点/原文节选）。
  - ⏸ **留待使用者拍板（本轮未动）**：`SPEC.md` §7.5 **A8**（`GET /api/health` 是否计入接口数）、`TECH_DESIGN.md` §1/§2 功能列表停在 F9、§5.4 提交格式行、§5.5 技术债台账、`AGENT.md` §1 页面入口措辞；另 `AGENTS.md` §10.6 是否补「留证文件须与引用它的提交同批入库」。
  - ⚠️ **本次未做**（依据 `AGENT.md` §4 边界，不是遗漏）：`AGENT.md` §2 的**后端 agent 工具层**（`archive_note` / `create_task` / …）明确属「后续期数、不承诺排期」，且执行期仓库有第二个写者（F14），按 §10.3 单写者原则**不能**同时改 `server/`；未验证 `ASR_MAX_AUDIO_SECONDS` 护栏在真实链路的拒绝行为 → **已补验**（`-e ASR_CHUNK_SECONDS=999` 启动即告警并夹紧为 300）；未验证非 B 站直链的长音频 → **已补验**（小宇宙 CDN 直链 2509s → `chunks=14`、318 句、覆盖到 2503s）；前端仍无转写表单入口。
  - ❌ **本次未做（需使用者决定）**：`AGENTS.md` §4 之外的文档（`PRD.md` / `TECH_DESIGN.md` / `AGENT.md`）未因本次改动而调整。
- **F9 知识库问答（2026-09-25，RAG MVP）**：✅ 后端三接口 `/api/kb/query|stream|index`（LangChain.js 编排 + chromadb 官方客户端直连——未引 `@langchain/community`，其 peer 依赖与 dotenv@18 冲突）；✅ 中文优先切分 500/50、Chroma collection `buddy-notes`、增量清单 `data/.kb-manifest.json`；✅ SSE 事件流（sources → token×N → done/error）；✅ 前端 `/ask` 问答页（打字机 + 来源可跳原文）；✅ 文档同步：PRD v1.3（F9 + 验收 6 条）/ SPEC（接口升至 11 个 + 3.1 小节 + 错误码 +3 + env 组）/ TECH_DESIGN v1.2（选型 +3 + RAG 数据流图）/ RUN.md 8.6；⚠️ **未端到端实测**（→ 2026-09-29 已在真实链路实测通过，见下方 2026-09-29 条目）：需 `OPENAI_API_KEY` + 可达的 Chroma 才能真跑（未配置时返回 `KB_NOT_CONFIGURED` 已实测）；Chroma 部署与安全组属运维动作，待用户确认。✅ 两个 commit（`7e7052c` feat + `241404b` docs）**已推送 `origin`（=camp 仓）**。
- **云端部署方案（2026-09-25 定）**：采用**单机 Docker Compose**（Nginx + buddy-server + Chroma 内网 + 可选 Gitea），部署在既有海外 ECS `47.85.210.76`；训练营**不强制** CloudBase，故不走 CloudBase。前端 `web/dist` 由同一 Nginx 托管（同源，HttpOnly Cookie 零配置）；Chroma **不发布端口**、只走 compose 内网，从根上避免向量库裸奔公网。待办：① 安全组放行 443（当前 80/443 未开）；② 确认域名 A 记录是否指向该 IP；③ 服务器侧配镜像加速器（本机暂不配）；④ 本机 docker 加组后做一次彩排。
  - ⚠️ **2026-10-14 修订**：上述方案中的**目标机已变**——海外 ECS `47.85.210.76` 从本机与 `fel` 两侧探测 22/80 均超时，**从未投入使用**；实际运行服务器是**阿里云上海 `139.224.192.94`**（SSH 别名 `fel`），compose 五容器在跑、`:80` 对外。原方案其余部分（单机 compose、Chroma 内网、同源托管）仍然有效，仅「部署在哪台机」不同。详见下文 2026-10-14 F13 部署实况条目。
- **Day 9（2026-09-24）**：✅ 按设计规则审查前端 `web/src/styles.css` 六个维度并修 5 处（CSS-only、功能零改动）：① P4 间距/对齐——卡片与列表项左基准差 2px 归零、搜索框与下拉框左缩进差 2px 归零、建 `--sp-1..7` 间距/圆角阶梯并全部归位（44 处）；② P1 信息层级——详情页标题 20→24px 与正文 h1 脱钩、建 `--fs-1..7` 字号阶梯（13–28px）、取消 12px 档；③ P2 字体——`font-weight:500` 虚标修正为 600（微软雅黑无 500 档）、`tabular-nums` 等宽数字；④ P3 颜色——`--muted` 5.4:1→7.37:1（AAA）、`--border` 加深一档；⑤ P5 状态+移动端——补 `:focus-visible` 焦点环与全量 hover、disabled 3.4:1→7.4:1、触控目标≥44px、16px 输入防 iOS 缩放、480px 工具栏换行。✅ `npm run build` 通过；前后对照截图用 `git stash` 切换同取景采集；Tab 焦点/disabled/375px 移动模拟手测。
- **Day 10（2026-09-25）**：✅ 资料列表页新增「按目录分组」文件列表视图——工具栏右侧「卡片 / 目录」切换（`aria-pressed` 按钮组），选择记 `?view=dir`（刷新/前进后退保持）；目录视图按 `data/<目录>/` 分组（学习→生活→事务→其余按字母序），行内为等宽文件名 + 标题 + 日期 + 标签；复用后端已返回的 `path` 字段，后端 0 行改动；新增 `web/src/components/NoteFileList.jsx` 纯渲染组件，搜索与分类筛选对两种视图同时生效；✅ `npm run build` 通过。
- **个人主页（2026-09-25）**：✅ 新增 `GET /api/me`（接口升至 12 个）——读 `data/` **根级**的 `profile.md`（nickname/avatar/bio）与 `schedule.md`（每行 `- YYYY-MM-DD [HH:mm] 事项`），文件缺失返回空对象不报错；已核实它们不被资料索引与 KB 向量索引扫描（两者都只遍历子目录）；✅ 前端 `/` 改为个人主页（个人卡头像/昵称/简介 + 当月月历与近期日程，头像缺失降级首字母色块），资料列表挪到 `/notes`，详情页返回链同步；✅ `npm run build` 与 `services/me.js` 解析实测通过。
- **Day 11（2026-09-26）**：✅ **手机端联动 F4–F6 端到端完成**（当天主任务，5 个板块 / 10 个提交，全部英文单行信息）：
  - **后端任务链路**：新增 `storage/tasks.js`、`services/tasks.js`、`routes/tasks.js`（`POST/GET /api/tasks`、`PATCH /api/tasks/:id`）——`note` 类型**同步执行**（复用 `createNote()`）、`organize`/`remind` 登记待办（无执行器）、`done` 为终态且非法迁移拒绝；执行失败落一条 `failed` 任务而非报 4xx（让手机端看得到原因）；
  - **F6 确认机制**：新增 `storage/confirmations.js`、`routes/confirmations.js`（**第 13 个接口** `GET /api/confirmations`）；`storage/files.js:remove()` 从 501 占位改为真实现；**删除资料不新增独立接口** —— 走 `POST /api/tasks` + `type=delete_note` → 任务 `attention` → 未确认时任何 `status` 改动返回 **428 `CONFIRM_REQUIRED`** → `decision=approved` 才真删、`rejected` 只取消；决定与时间写入 `Confirmation` 留痕（不记「谁」，单人使用）；
  - **前端**：`/tasks` 任务页（三种类型提交 + 状态徽标 + 推进与状态筛选）、`/tasks/:id/confirm` 确认页（大白话后果 + 同一路由兼顾「回看」）、`/confirmations` 留痕页、资料详情页「删除这条资料」入口（点它**不删任何东西**，只发起待确认）；
  - **数据落点**：`data/.runtime/tasks.json`、`data/.runtime/confirmations.json`（运行时数据独立成目录，便于第 3 周迁数据库）；
  - **测试**：`server/scripts/smoke.mjs` 扩充 11 条断言，覆盖资料/任务/确认三条链路 —— **公开 19/19、隐私 23/23** 通过；
  - **文档同步**：`SPEC.md`（13 个接口 + 新增 3.3 确认流小节 + `Task.type` 加 `delete_note` + `PATCH` 请求字段去掉未使用的 `summary`）、`RUN.md`（页面清单 + 功能边界重写 + 任务/确认 curl + 8.7 新增踩坑行）、三个文档版本引用对齐（PRD v1.3 / TECH_DESIGN v1.2 / SPEC 上游引用）、`Rule` 与 `sync()` 两处标注「尚未实现/生效」；
  - 🔧 **插曲修复（非计划内）**：宿主机 sing-box（v2rayN 的 TUN 模式）把接口地址设成 `172.18.0.1/30`，与 Docker 的 `172.18.0.0/16` 撞车（`/30` 更具体 → web 容器 IP 被当成广播地址），表现为「访问 80 端口被重置」而误判「后端服务死了」——容器其实一直 healthy；已把 compose 网段固定为 `172.30.0.0/16` 并把原因写进注释与 RUN.md 踩坑表。
- **深色模式 F10（2026-09-27）**：✅ 全站深浅主题上线（3 个提交）：`804fd96` 颜色 token 拆两套——`:root` 浅色（原值不动）+ `:root[data-theme='dark']` 深色覆盖，**25 个颜色 token 全覆盖**，把原先写死在组件规则里的 **5 处组件、9 行色值**（`.ok-bar` / `.badge--done` / `.badge--attention` / `.confirm-block` / `.btn-danger:hover`）一并收进 token；浅色 `--warn-line` 由 `#d9822b` 微调为 `#d47c22`（原值对白底仅 2.93:1，不足自设的 3:1 门槛）；`web/index.html` 加首屏内联脚本（渲染前写 `data-theme`，不闪浅色）；新增 `web/src/theme.js`（读/写/切换/监听系统与多标签页）；`2e1f7d4` 主页方格按钮（无渐变、无圆形图标底、无动画，窄屏横排 ≥88px）；`8cfbc2b` 文档（PRD v1.4 + 验收 4 条 / SPEC 新增 1.1 主题小节 / RUN）。验证：`npm run build` 通过；对比度用脚本按 WCAG 公式实测 **两套主题各 19 组、共 38 组配对全部达标**（浅色 muted 7.37 / accent 6.52 / 禁用态 7.37；深色对应 7.24 / 7.66 / 5.67；ok/warn/danger 徽章均 ≥5.7）；`grep transition|animation` 为空。⚠️ 偏好只存浏览器 `localStorage['buddy-theme']`，不跨设备同步、不入库。（**未**做：跟随系统/浅/深三态、跨设备同步、切换动画）
- **提交信息格式（2026-09-27）**：✅ 使用者裁定「**非打卡提交**用 `[ BIRD ] | 中文解释提交内容`」，已写入 `AGENTS.md` §2 五.2 与 §9.4（打卡提交仍为英文一行），§9.5 优先级条款同步改写，规则自测第 7 行期望值同步更新；提交 `4a89645`。
- **关于页 F11（2026-09-27）**：✅ 新增 `/about`（3 个提交）：`a4d66d1` 页面 + 路由 + 样式（`.about-*` / `.contrib-*` / `.activity-*`，两套主题各加 3 个 `--contrib-*`）；`ef57101` 入口（顶部导航末位「关于」+ **主页个人卡整块可点** → `/about`）；`2c0f2da` 文档（PRD F11 + 验收 4 条 + v1.5 / SPEC / RUN）。页面结构照参考图（纯色横幅 + 圆形头像压缝 + 大标题/英文副标题 + 右侧胶囊页签），页签状态写 `?tab=activity`；**研究动态用真实数据**：热力图按 `GET /api/notes` 的 `date` 聚合（53 周 × 7 天，1/2/≥3 条三档），时间线取最新 8 条并链到详情页。**后端零改动**（只用现有 `GET /api/me`、`GET /api/notes`，接口仍 13 个）；**零动画**（`grep transition|animation` 为空）；`npm run build` 通过。⚠️ 自我介绍正文是**占位文案**（`AboutPage.jsx` 顶部 `INTRO_SECTIONS`），待使用者给真文案后替换；未做：真实横幅图、热力图按天点击查看资料、`data/about.md` 写接口。
- **Day 11（第 2 周 · 交互反馈，2026-09-27）**：✅ 完成「一个有可感知反馈的交互」——资料详情页「复制路径」+ 提示条（并非 09-26 那条 Day 11，见上）：
  - **三档反馈摸底**：即时态（既有 `正在发起…` + `:focus-visible`）/ 短暂提示（**今日新增**，此前全站只有常驻 `.ok-bar` 与占位 `.loading`，没有会自己消失的反馈）/ 结果留痕（徽标、确认留痕页、地址栏 `?tab=activity` 等）；结论写进 `SPEC.md` 新增 **5.3.1**；
  - **实现**：新增 `web/src/components/Toast.jsx`（纯展示，`role="status"` 容器**常驻 DOM**——若连容器卸载，很多读屏不会播报新内容）；`NoteDetailPage.jsx` 在「文件路径」行内加原生 `<button>`（`Enter`/`Space` 天然可用），按钮文字 `已复制 ✓` / `复制失败` 3 秒复原；单例提示条（成功 3 秒 / 失败 5 秒，重复触发先 `clearTimeout` 再重设，卸载时两个计时器全清）；样式全走 token、**零动画**；
  - **失败降级**：`navigator.clipboard?.writeText` 不可用或抛错（**非 HTTPS / 非 localhost，如局域网 IP 访问**）时用 Selection API 自动选中路径文本供手动复制，不引 polyfill、不额外要权限；
  - **尺寸**：成功 3 秒 / 失败 5 秒、按钮 3 秒；位置按使用者 09-27 实测意见**从底部居中改为右上角**（`top/right: var(--sp-4)`，窄屏贴边 + 宽度按视口算，`pointer-events: none` 不吃点击）；
  - **验证**：`npm run build` 通过；`grep transition|animation` 为空；Docker 线上 80 端口的资源指纹与本地构建一致，且在线上 JS 里能检出 4 条新文案（`复制路径` / `已复制 ✓` / `路径已复制` / `复制失败，请长按选中路径手动复制`）；使用者按 9 条清单实跑（含连点 5 次、提示条未消失时重点、`Tab`+`Enter`/`Space`、离开页面无残留与无控制台警告、局域网 IP 走失败降级、深色与 375px），报「测试完成」且未提出异常；
  - ⚠️ **未做**：任何动画（使用者明确不要）；提示条尚未复用到其他页面；依赖后端的交互（当日清单明令不做）。
- **Day 12（2026-09-28）**：✅ 产出并**真实调用**了第一个自制 Skill —— `skills/frontend-rules/SKILL.md`（117 行：六类检查清单 P1–P5、修改前 7 问、修改后 6 条验证命令、留证格式、「不做什么」），在 `.pi/settings.json` 注册为项目 Skill；打卡提交 `d959e68`（另含 `SPEC.md` 与 skill 口径 3 行）；✅ 调用留证 `skills/frontend-rules/runs/2026-09-28-day12.md`（153 行）：逐条核验档案列表页筛选交互 32 个勾选点，记下 **1 处违规**（`.contrib-months` 裸值 `32px`）与 **1 处文案缺口**（筛选无结果缺显式出口）；✅ 两处发现均已闭环：`21b6460` 区分「被筛掉了」与「资料库本来为空」（+ 留证 33 行）、`f1f1e5c` 热力图月份行左缩进改为几何推导写法。⚠️ 本文件 §4 当时漏记 Day 12，于 Day 13 收尾时补记（本条）。
- **Day 13（第 2 周 · 多级页面与四种状态，2026-09-29）**：✅ 范围核对后裁定**不新建页面**（仓库已有 12 条路由定义，与清单预设的「实现 3 个页面」重叠）→ 做三板块补齐，4 个提交：
  - **板块① 视图结构**（`92187ce`）：`SPEC.md` 新增 §1.2（49 行）——选型答案（`react-router-dom` v7 + **地址栏即状态**）、「换实体用路径 / 换视图用查询参数」的分工与理由、单页应用的代价（nginx `try_files` 兜底）、**完整视图树**（一级 5 项含 `?cal`/`?view`/`?tab`/`?mode` 默认值；二级 `/notes/:id` **5 个入口**、`/tasks/:id/confirm` **4 个入口**；`/archive` 2 个入口；3 条兼容重定向；`AUTH_ENABLED=1` 时的 `/login?from=`）、6 条约定（含 `/notes` 视图按钮 `setSearchParams({})` 清参的已知边界）；
  - **板块② 多级切换**（`5f6250f`）：新增 `components/Breadcrumb.jsx`（`nav[aria-label]` + `ol/li`，末项 `aria-current="page"`，分隔符 `aria-hidden`）与 `components/BackLink.jsx`（有来路走 `navigate(-1)`；无来路落 `fallback` **并改文案**，判据是 react-router v7 的 `history.state.idx`——**读过 `node_modules` 源码确认**该字段存在与语义）；接入 `/notes/:id`、`/tasks/:id/confirm`；顶部导航 `Link`→`NavLink`（`/` 加 `end`）获得 `aria-current`，**视觉零变化**（`.active` 规则只作用于 `button`）；`styles.css` 末尾追加 67 行（**零新 token、零硬编码色值**，720px 触控 44px），留证 `runs/2026-09-29-day13.md`；
  - **板块③ 四种状态**（`a982ae8`）：新增 `components/StateBlock.jsx`（四态**互斥**、播报容器**常驻 DOM**、正常态内容放在容器**外**、错误态用 `role="alert"` + assertive）；`/notes` 接入并新增「错误 → **重试**」与「空（被筛掉）→ **清空筛选条件**」（后者正是 Day 12 留证记的建议项）；行为变更 3 处并已如实汇报（错误态不再与空态并存、错误时隐藏「共 N 条」、失败时不再保留旧列表）；**本板块零 CSS 改动**；
  - **验证与留证**：`npm run build` 通过（模块 292 → **295**）；`grep transition\|animation` 无输出；`#` 色值仍只在两个 token 块内；**空态用真实接口验过**（`?q=zzzz` → `total:0`）、正常态 `total:6`；`server/scripts/smoke.mjs` 公开模式 **20/20、0 失败**（临时数据目录，跑完停服并清理，未碰真实资料与 docker 栈）；
  - ⚠️ **未做/待拍板**：`?state=` 预览开关（使用者明确不要）、四态只覆盖 `/notes`、顶部导航「当前项」视觉标记、`.detail-back` 两处重复字号声明未合并；**线上 `:80` 仍是镜像里的旧产物**，验收需 `docker compose up -d --build web`（未执行）。
- **Day 16（2026-10-05）**：✅ 第 3 周「云端链路」开场：数据模型设计 → 建表 → 种子脚本 → select 验证，**全部落在现有项目结构内**（不走 CloudBase，截图口径见下）。
  - **选型**：使用者裁定「把 Day 16 转移到当前项目结构下」→ 采用 **PostgreSQL**（本地已有 `postgres:18-alpine` 镜像，Docker Hub 不可达也能离线跑）；与 `SPEC.md` §7.3「文件存储 → 数据库」迁移路径一致。**依旧不走 CloudBase**（延续 2026-09-25 决定），因此**截图口径改为「本机数据库输出」**，与清单原文「CloudBase 控制台数据库的表数据页」有偏差 —— 这一处待使用者按 `PRD.md` 第 8 章风险 1 与队长确认。
  - **两张核心表**：`notes`（资料，11 字段）+ `tasks`（任务，12 字段）；**关联字段 `tasks.note_id → notes.id`，删除行为 `ON DELETE SET NULL`**（用 `RESTRICT` 会被 `delete_note` 任务自锁，已在事务内实测验证并 `ROLLBACK`）；`notes.tags` 用 `text[]` + GIN 索引，故**不需要第三张标签表**；`type` / `status` / `origin` 用 `CHECK`（代码里的封闭集合），`category` 用 `text`（用户侧开放集合）；主键用**业务 id**（text）而非自增代理键，迁移期无需新旧 id 映射、API 契约不变。
  - **新增文件（仅 2 个，均属 Day 16）**：`db/schema.sql`（建表 + 索引 + 约束 + **逐字段 COMMENT**；幂等，重复执行退出码 0）、`db/seed.sql`（**虚构样例**数据 6 + 6 行，`ON CONFLICT (id) DO NOTHING` 保证重复执行打印 `INSERT 0 0` 不报错；`hash` 用 PG 内置 `sha256()` 按 body 现算）。
  - **验证（原始输出已留存于会话）**：`\dt` 列出两张表；`\d+` 显示外键、3 条 CHECK 与全部字段注释；`notes=6 / tasks=6`，`tasks` 覆盖全部 5 种类型；关联查询 3 行对上资料标题、3 行 `note_id` 为空；事务内删除资料证明 `note_id` 自动置空。
  - **并行避让（§10.3 单写者）**：作业当时本机有**第二个 pi 会话**在改 `server/`（`routes/ima.js`、`services/ima.js`、`app.js`、`.env.example` 均未提交且仍在写）→ 本次**只新增 `db/` 两个文件**，未改 `server/`、`web/`、`docker-compose.yml`；数据库起独立容器 `day16-pg`（只绑 `127.0.0.1:55432`、独立卷 `day16-pg-data`、不加入 compose，口令只存在于会话不入文件）；提交只 `git add` 明确路径、**不用 `-A`**。
  - 🔎 **规则缺口（本轮发现）**：`AGENTS.md` §10 只覆盖「一个主会话 + N 个子 agent」的形状；**两个独立 pi 主会话共用同一工作目录**这种情形**没有任何落地机制**（实测：无 git hook、无 CI、无第二 worktree、无锁）。本轮以「路径不相交 + 提交串行」兜底。是否要把「并行主会话」补进 §10，**待使用者拍板**，本轮未动规则文件。
  - **未做（属后续）**：任何接口（Day 17 才开始）、前端改动、把库写进 `docker-compose.yml`、`server/src/storage/` 的数据访问层；⚠️ 待办：`db/` 目前没有「一键起库」入口，`RUN.md` 也未记 Day 16 的起库步骤（均留待 Day 17 接 compose 时补）；`SPEC.md` §7.3 的三步迁移只完成了第 1 步里的「建表」。
- **F15 ima 云端知识库只读视图（2026-10-05，buddy 项目内部改动）**：✅ 后端只读代理 `server/src/services/ima.js` + `routes/ima.js`（3 个新接口：`GET /api/ima/kbs|items|search`，**接口升至 16 个**）；✅ 前端 `/notes` 工具栏「本地 / 云端」切换 + `components/ImaPanel.jsx`（库卡片 / 浏览+文件夹下钻+面包屑 / 搜索三形态，地址栏承载 `?src=ima&kb=&folder=&q=`）；✅ **内容零落盘**——不写 `data/`、不进向量库、不落缓存文件，仅进程内存 TTL 缓存（默认 60s）；✅ Key 只进 `server/.env`（gitignore 覆盖），前端不接触；✅ `server/scripts/fake-ima.mjs` 桩 + `smoke.mjs` 扩 7 条断言（im①–im⑦，含缓存命中计数与隐私模式 401），公开 **26/26**、隐私 **31/31**；✅ 真链路实测：Bird的知识库 2 个库列表/条目/搜索均通；🔧 **真实踩坑**：① ima 文档字段名不实——知识库实为 `kb_id`/`kb_name`、信封 `{code,msg,data}`（代码已兼容两套字段名）；② **文档写 `limit` 上限 50，实测 `search_knowledge_base` 上限 20**——初版前端默认 `limit=50` 导致 Docker 里一直 `503 invalid SearchKnowledgeBaseReq.Limit`，已修为对外收 1–50、发上游时夹紧到 20（`LIMIT_UPSTREAM_CAP`），分页走 `next_cursor`（修复提交 `79dff32`）；⚠️ 待办：前端云端视图的实际样式尚未经使用者浏览器验收（§9.2 不调浏览器工具）；ima 条目不可点击属上游限制（无单条正文 API）；`

- **F15b ima 笔记只读视图（2026-10-05，buddy 项目内部改动）**：✅ 后端在既有 `services/ima.js` / `routes/ima.js` 上扩 2 个只读端点（**接口升至 18 个**）：`GET /api/ima/notes`（`openapi/note/v1/list_note`）与 `GET /api/ima/notes/:id`（`list_note` 逐页扫 meta + `get_doc_content` 取 Markdown，`<mark>` 服务端剥掉，扫不到 → `404 IMA_NOTE_NOT_FOUND`）；✅ 前端云端首页加「笔记」卡片 → `?src=ima&panel=notes` 列表（行结构照抄档案列表）→ `/notes/ima/:docid` 详情（与档案详情同款版式，只渲染 ima 有的字段）；✅ 失效图片（签名过期 403 `t info expired`，不可救）由前端 `img onError` 换纯文字占位，不保留死链；✅ 冒烟扩 4 条（im⑧–im⑪）：**公开 29/29、隐私 35/35**；真链路实测（真 Key 本地后端）：2 篇笔记列表 / 详情 Markdown 4404 字 / 404 分支均通；✅ 隐私口径与知识库同口径（使用者明确「不考虑隐私」，不加独立门禁）；⚠️ 如实标注：F15 的「文件夹可下钻」在真实数据上暂不成立（上游 `media_type:99` 判据过时，**未修**）、`ima` 笔记不做搜索（你只有 2 篇）；✅ 文档同步：SPEC（接口 16→18 + 新增 3.7 + 错误码 + A8 数字复核）/ PRD v1.10 / TECH_DESIGN v1.7 / RUN 8.10 / 本文件；✅ `skills/frontend-rules` 调用留证 `.md-img-missing` 一条 CSS。

- **F13 部署实况：token 被注释污染 + B 站 412（2026-10-14，buddy 项目内部改动 / 部署侧，非训练营清单任务）**：⚠️ 本轮改动全在**服务器 `fel`**（阿里云上海 `139.224.192.94`，2 vCPU / 1.8 GiB，Docker 26.1.3，其上跑着整套 compose 栈且 `:80` 对外），**仓库代码 0 行改动**；海外 ECS `47.85.210.76` 从本机与 fel 两侧探测 22/80 均超时 → **异地拆分尚未开始**。
  - ✅ **修复「提交转写失败：缺少或错误的 Bearer Token」**（401 `AUTH_FAILED`）：根因是 `fel:asr/.env` 的 `SERVICE_TOKEN=` **值留空但同行写了中文注释** → compose 的 env_file 把整段注释当成值（实测：50 字符、非 ASCII、以 `#` 开头），而 `fel:server/.env` 没配 `ASR_SERVICE_TOKEN`（compose 只注入 `ASR_SERVICE_URL`）→ 服务侧不发 Authorization 头 → 401。修法：`asr/.env` 整体重写成「注释在上一行」，`server/.env` 补 `ASR_SERVICE_TOKEN`（48 位 hex），`docker compose up -d asr server`；核验：asr 容器 25 个环境键**仅 4 个指纹变化**（token + 3 个 `YTDLP_*`），server→asr 走真实路径返回 `404 JOB_NOT_FOUND`（鉴权通过；改前 401）。备份：`asr/.env.bak.20261014-093500`、`server/.env.bak.20261014-093500`。
  - ✅ **修复「下载失败：HTTP Error 412」**：实测确证 **B 站风控拦的是机房 IP，与国内/海外无关** —— `fel`（国内阿里云机房）与海外机房**都 412**，而本机家宽住宅 IP 能过页面请求（`Downloading wbi sign` → formats），故**「搬到国内机房」不能单独解决**；判据是「出口 IP 身份 + 登录态」。修法：用使用者 2026-10-04 导出的 `~/下载/bilibili.txt`（Netscape、仅 `.bilibili.com` 域）→ `fel:asr/.secrets/bilibili.txt` → `asr/.env` 设 `YTDLP_COOKIES_DIR=/app/secrets` → 重建 asr；核验：`POST /v1/subtitles` 由 412 变 `200 {"found":false}`（该视频本无 CC，按设计回落），并用 **`sources.fetch_source` 跑真下载成功**（`src-BV1iYea6zEVC.m4a` 859 KB / 70.565 s，不烧转写额度）。
  - 🔧 **两处新踩的坑**：① compose `env_file` 的剥注释口径**只在值非空时成立**（空值 + 同行注释 = 注释变成值）——已同步 `RUN.md` 8.7 与本文件；② `asr/.secrets/` 被 compose 首次创建成 `root:root` → `scp` 报 `Permission denied`，改用 `docker run -u root` 写入并把目录交回 `bird(1002)`（644 供容器内 uid 10001 读）。
  - ✅ **文档同步（本轮唯一入库的代码仓改动）**：`asr/.env.example` 改为「注释一律在键的上一行」并写明原因与一行排查命令（24 键、顺序与默认值逐项未变，仅原先被污染的 4 个空值键恢复为空）；`RUN.md` 8.7 纠正旧口径 + 新增 1 行，8.8 重写 401 行并新增 412 行与 `scp` 权限行；留证 `runs/2026-10-14-f13-cookies-on-fel.md`。
  - ⚠️ **未做**：真实转写任务**不由 AI 触发**（等使用者在 UI 把 `failed` 任务退回待办重试，会花 DashScope 额度）；`YTDLP_PROXY` 住宅出口方案未上（作为 cookies 之外的叠加手段备用）；`youtube.txt` 未配；拆分方案的契约冻结（asr 单副本 + 4 端点不变 + 隧道地址写法）**仅口头给出，未落地**。
  - 勘误：`fel:docker-compose.yml` 有一处**使用者未提交**的改动（去掉硬钉的 `OPENAI_BASE_URL`，改由 `server/.env` 提供 DashScope 兼容模式）——重建 server 时**顺带生效**，已当面告知。
- **Day 14 / Day 15（留证缺口，已补记 · 补记于 2026-10-22）**：⚠️ **全仓无独立 `Day 14` / `Day 15` 打卡提交**——工作在那两天实际进行（证据：2026-10-05 ~ 10-07 区间 30+ 条 `[ BIRD ]` / `Day 16/17/18` 提交，含 ima F15/F15b 全链路、Day 16 建表、asr cookies 加固），但**未以「Day 14」「Day 15」名义单独留证**。Day 15 手册议程为「公网部署」，**部署现实成立**（`http://139.224.192.94` compose 在跑、`GET /api/health` → 200），但无当次独立留证。依 §2 诚实原则**不补造**具体内容；本条为**事后补记**（使用者 2026-10-22 裁定选项 B），证据锚点 `runs/2026-10-14-day21.md` §1.3 D1 与 §1.3.1。
- **Day 19（2026-10-08，第 3 周 · 数据访问层）**：✅ 把「落点判定」收进统一存储入口——新建 `server/src/storage/note-store.js`（`dbConfigured()` 判定 + 统一读写入口），`routes/db.js` 与 `services/notes.js` **不再直接 import `db/`**；services 层补 `listNotesFromDb` / `getNoteFromDb` 封装。提交 `df0fc0f`（4 文件，+107/−37），**全接口回归通过**。⚠️ 当次无独立 `runs/` 留证（证据为提交正文）；本条目为 Day 21 周验收时回溯补记。
- **buddy 内部改动汇总（2026-10-10 ~ 10-14，非打卡日；主站改版 + 站长后台 + agent 重构 + 尺度统一）**：这段无训练营 Day 打卡，工作全为 `[ BIRD ]` 内部改动；§4 此前未记，此处补一条汇总（截至 `2e3d94f`，10-10 的 F16 另有独立条目）：
  - **① 前端设计改版基建 + 设计真值**（`c888aaf`，10-11）：接入 **Tailwind v4**；建 `web/DESIGN.md`（设计真值）与 `skills/frontend-rules` 审计脚本 + `references/tokens.md`；`styles.css` 顶部加 `@theme` token 层；`index.html` + `theme.js` **双写 `.dark` 类**（供 Tailwind `dark:` 变体）并保留 `<html data-theme>`（旧手写 token）→ **两套主题需同步维护**；引入 Noto Serif SC / Geist 字体；`/api/me` 透传 `data/site.json`。
  - **② `/admin` 站长控制台第一期（6 板块）**：设计定稿 `PLAN-admin.md`（`92272e9`）→ ①骨架（`fda21ea`：Refine + AntD 嵌入 web、lazy 隔离、dataProvider/authProvider 适配 `{ok,data}` 契约与登录门禁）②运维仪表盘（`0886629`：新增 `GET /api/admin/overview`，聚合四服务健康 + 计数 + 最近任务）③任务队列（`2ffc7d7`：列表 + 状态筛选，failed/attention 可 PATCH 退回待办）④agent 审计与工具清单（`0ebca76`：`/api/agent/runs` + `/api/agent/tools` 只读）⑤资料只读浏览（`10927e1`：搜索/分类/分页 + 详情抽屉 Markdown）⑥**资料编辑与删除**（`035d344`：新增 `PATCH` / `DELETE /api/notes/:id`，文件层覆盖写 + 抽屉内编辑表单 + 删除确认）。
  - **③ 配置管理分层**（`a7d059c`）：`data/site.json` 承载业务配置（**网页可改、热生效**）+ `.env` 只读总览；**弃用「网页改 env」**；读取优先级 `data/site.json` > `process.env` > 默认值（密钥仍只走 env）。
  - **④ agent 页重构 + 修复**（10-10 起）：`/ask` → **`/agent`**（`ee786e2`，旧路径前端 redirect 兼容）；改用 **`assistant-ui`** 重构（`efea4ee`，删 `KbAskPage`）；修 `ThreadMessageLike` 缺 `metadata` 致发送后 **React 树崩溃（黑屏）**（`70a27f4`）；**确认闭环** —— `PATCH decideTask` 后 `resumeAfterDecision` 让 agent 继续对话（`4ce8536`，修 `'approve'→'approved'` 枚举错配；compose 加 `host.docker.internal` 供容器访宿主机 vLLM）；修切页后消息丢失（`5e5c497`：加 `GET /api/agent/sessions/:id`、`sessionId` 落 localStorage）；细节修复（`130107e`）。
  - **⑤ 主站第一刀 + 浅色提亮 + 逐页迁移口径**（10-12）：第一刀全局改版（`fb9d7fd`，10 文件：**背景层 + 玻璃顶栏 + 移动底部 tab bar**、主页卡片重构、打通 `data/images` 图片资产直出）；浅色主题提亮（`5673353`：veil 白纱 `/25 → /85`、token 去暖灰改浅粉彩 `--bg #fdfdfd`）；**逐页迁移口径定稿**（先抽公共组件层 / 先补前置 / 一批一提交；9 页 + 8 组件盘点；**迁移期间旧 CSS 一条不删**）。⚠️ 遗留：veil `/85` 后顶栏（`/40`）与 tab bar（`/55`）与底色几乎同色、轮廓消失；`DESIGN.md` §3/§9 浅色真值当时未同步。
  - **⑥ 全界面尺度统一（DESIGN §18，10-13 拍板）**：除 admin 外全部界面纳入视觉统一（**含 Agent**，覆盖此前"不干涉 Agent"的限制），6 板块（标准收口 / 主页基准 / 档案与阅读 / 日志与规划 / 个人与辅助页 / Agent）。落地提交：`f534c8f`（统一主站页面视觉与卡片布局，12 文件）、`5a3cc9b`（背景氛围动效亮度）、`c5df6bc`（Agent 双卡布局 + 输入框焦点边框）、`2e3d94f`（**汇总提交**：主页重构 `HomePage.jsx` 大改 + 新增 `PlanningPage` / `PlanningDraftConfirmPage` + agent 布局与 `ToolFallback` 降级组件 + 设计真值同步，49 文件 +2603/−571）、`5e833af`（10-14 收口：统一前端页面排版与关于页热力图展示，10 文件）。⚠️ **均未部署**（`web` 镜像未重建，公网仍旧构建 → 见 Day 20 / Day 21）。
  - **⑦ 统一资料来源查重 + 分P 档案入口**（`f8b316e` → 两次 revert → `24a4d80` 重做）：新增 `db/migrations/003_notes_source_part.sql`（`notes.source_part` 字段 + CHECK + `(source_url, source_part)` 索引）；改 `db/notes.js` / `services/notes.js` / `transcribe.js` / `organize.js` / `storage/files.js` / `note-store.js`；`smoke.mjs` 扩 1115 行；`LogPage.jsx` 加分 P 入口。**查重键 = `source_url` 原样字符串 + `source_part`**（`note-store.js:76`）—— ⚠️ **不含尾斜杠归一**，故 10-14 发现的 **D10（同一视频因尾斜杠差异重复入库）依此成立**（见 `runs/2026-10-14-day21.md` §1.3 D10）。
  - ⚠️ **另**：`f72bbfa` / `9d2ad3d` 补项目根 `.env.example` 并说明 **`PG_PASSWORD` 该放项目根 `.env`**（compose 只认根 `.env`）—— 与 Day 17 踩坑同源。
- **Day 20（2026-10-14，第 3 周 · 公网链路 / 跨域）**：✅ **纯只读验收，仓库代码 0 行改动**（唯一产物 `runs/2026-10-14-day20.md`），提交 `23e57e1`（另补记 `4c14ff5`）。
  - 手册本日议程基于 CloudBase（「确认云函数可用 + 配置跨域」），本项目自 Day 16 起不走 CloudBase → 转译并列出**三处偏差**（无云函数 / 全仓零 CORS 代码 / 公网跑旧构建）。
  - **三项完成标准全过**：① 公网首页展示数据库真实数据（`GET /api/home` → 真实 `stats` / `plans`）；② **改数据刷新跟着变**——走「进 pg 改一行 → 刷新 → 回滚 SQL」，`plans.total` **0 → 1 → 0**，验证后数据无痕；③ 请求确实落在公网（nginx access log + server 容器日志，`浏览器 → nginx:80 → server:3000` 全通，**非本地服务在响应**）。
  - **跨域诊断（今日主题）**：反证「本项目没有跨域」——`OPTIONS` 返回 200 却**无任何 `Access-Control-Allow-*`**；本地 dev 走 Vite proxy、公网走 nginx 同源反代，三种访问方式**全部同源**，`client.js` 一律相对路径。附「本地前端直连公网后端时三道关依次失败」（跨源判定 / OPTIONS 预检 / `SameSite=Lax` Cookie 不带）与**现象→指向判据表**（Console `blocked by CORS policy` 是唯一铁证；请求 200 但页面未登录 = Cookie 问题而非跨域）。
  - 🔧 **一个坑**：只改 `title` 首页毫无变化 → 查 `server/src/services/home.js:53` 才知首页**只显示非 `done` / `cancelled` 的计划**，该计划已是 `done` 被过滤掉；把 `status` 翻回 `todo` 后 `0 → 1`。**教训：「改了数据页面没变」也可能是被查询的过滤条件挡住了。**
  - ⚠️ 顺带观察：公网有伪装旧 UA 的第三方扫描（`45.198.224.x` / `3.87.186.57` 打 `GET /`），印证台账里「公开模式 API 裸露」这笔存量债。⏸ **未做**（使用者裁定）：重新部署（**已于 16:30 由使用者闭环**，见下）、余力加练（检查台「最后更新时间」）。
  - ✅ **16:30 公网已同步到最新构建**（原遗留项闭环）：使用者执行重建后实测，公网 `index-C2KIWt9L.js`（880164）+ `index-ByR0cJlr.css`（98638）与本地 `web/dist` **文件名 + 字节数逐一相同**；容器内 `assets/` 恰为该 3 个文件（旧产物已清除）；五页面（`/` `/notes` `/about` `/agent` `/admin`）全 200；`GET /api/home` → 200 真实库数据。**教训**：探「旧文件是否还在」时 `GET /assets/index-BnES7EgG.js` 返回 **200** 一度误判为残留——实为 nginx `try_files` 把不存在的静态路径**回落首页 HTML**（1954 字节）；判据须用 `Content-Type` / 体积 / 容器内 `ls`。
- **Day 21（2026-10-14，第 3 周收尾 · 周验收）**：✅ **验收与留证，零代码改动**（清单明确「今日不做：新功能、顺手修复」），唯一产物 `runs/2026-10-14-day21.md`（370 行），提交 `d9251b5`。三板块：
  - **§1 周验收表**：主表（第 3 周六项议程 × 落地 × 证据）**6/6 PASS**；附表 PRD F1–F16 **11 PASS / 4 部分 / 1 不做**；缺项**如实标 FAIL —— D1–D10 全部 FAIL**（**16:30 后 D2 已闭环**：使用者重建，公网 = 本地 dist；现存 9 条：D1 Day 15 公网部署无独立留证、**另 Day 14 同样零留证**；D3 F15 下钻「不可验证 + 文档与代码不一致」（依据改判）；D4 公开模式 API 裸露；D5 `?limit` 上限 500 无游标；D6 F12 三项未勾；D7 / D8 ima·GitHub 现网未配；D9 Day 20 加练未做；**D10 新发现** —— 归档查重按 `source_url` **原样字符串**比对，仅差结尾 `/` 即判为新链接 → 重复入库）。D1–D9 逐条回证据源重验（§1.3.1），主表 6 项证据锚点全部有效。
  - **§2 同伴交叉验证**：三行结论（能打开 / 能读写 / 无报错）全 ✅；**「可读写 ✅」由口述升级为第三方独立痕迹** —— 服务端日志留证同伴在**另一网络**用**手机微信内置浏览器**（安卓 16 / 5G，IP `106.224.189.110` ≠ 本机桌面出口 `117.136.110.219`）经我方给的 `/archive?mode=diverge` 直连链接 `POST /api/notes` → `201`；「无报错 ✅」仍属口述（本侧仅能证接口层 2xx）。3 条测试 / 重复残留按裁定清理回基线（`GET /api/notes` total **4 → 1**、pg 仅 1 行真实资料、无残留文件）。
  - **§3 演示提纲**（用户问题 → 核心流程 → 提示词改写 → 验证方式）就绪；验证方式首次列出**六层级**：接口 / 冒烟（公开 29/29、隐私 35/35）/ 单测（asr 48 例）/ 构建 / 线上 / **第三方**。
  - ⏸ **未做**：余力加练（录 3 分钟演示视频）。D1–D10 已在表内如实标出，**未修**（属后续）。

- **Day 22（2026-10-14，第 4 周 · PATCH / DELETE 验证 + 增删改查闭环）**：✅ **纯验证 + 1 行文档修正，业务代码 0 行改动**（清单写「PATCH 实现 / DELETE 实现」，项目这两个接口已于 10-11 后台板块⑥上线，故转为验证口径）；✅ 进程内起服务 + 临时 `DATA_DIR` 的隔离实例跑通四类操作闭环（POST→PATCH→DELETE→列表不再返回）；✅ 新增 `server/scripts/day22-verify.mjs`（12 项断言全过）+ 补 `SPEC.md` 1 行口径；✅ 另产出 `skills/backend-verify` Skill 文档（刁钻输入扫面法）；✅ 使用者裁定「`/admin` 直删口不动 / 其他工作区未提交改动不动」如实登记。留证 `runs/2026-10-14-day22.md`（清单补记于 `a371dc7`），提交 `55cfe66`。
- **Day 23（2026-10-14，第 4 周 · 错误处理与安全审计）**：✅ **密钥排查 0 风险**：全仓扫密钥特征词 5 处命中全为占位/夹具，`git check-ignore -v .env` 确认 `.gitignore:2` 命中、仓库内仅 `.env.example`；✅ **三类错误统一中文**：建 `middleware/errors.js` 的 `expose` 归一化层，改 ~17 处裸错为 `{ok:false,error:{code,message}}`，SSE 通道（`routes/agent.js` / `routes/kb.js`）同口径复用 `userMessage()`；✅ 加类型校验；✅ `day23-verify.mjs` 19 项断言全绿；✅ 三问三答与未完成项如实登记。留证 `runs/2026-10-14-day23.md` + `day23-audit.md` + 截图 ×2，提交 `b537ab5`（留证补记 `2f0ed65`）。
- **Day 24（2026-10-14，第 4 周 · 修一个真实 Bug）**：✅ **定位 `slugify()` 截断顺序错**（`server/src/services/notes.js:31-39`）：先「去首尾连字符」再「截断 40 字符」，第 40 位恰为 `-` 时会留下尾部脏连字符，重名兜底 `id-${suffix}` 还会滚出 `...aaaa--2` 双连字符；✅ 修复为「先截断 → 再去首尾连字符」，刁钻输入（超长+特殊字符）复现 → 修复 → 复测三步走通；✅ 截图 ×2 留证（复现前/修复后）。提交 `1a31812`。
- **Day 25（2026-10-14，第 4 周 · 发布前检查 Skill + 后台图片资产）**：✅ **`skills/release-check/` 落地**——`SKILL.md` 讲怎么查/怎么判/怎么留证 + `scripts/release-check.sh` 执行体，只读可复跑、有退出码（`0` 全过 / `1` 有 FAIL 阻断 / `2` 仅 WARN），**4 类 20 条检查项**（首版 19 项，22:17 按使用者要求补「compose 无注释掉的 env」第 20 项）；✅ **故意植入 `.env` 假泄露实测可拦**（`runs/2026-10-14-day25-shot1-planted-fail.txt`）；✅ 后台图片资产只读页 + 信息流规划文档对齐（接口计数 38→40），提交 `edc6903` / `3ea9e69` / `9f9d5fc`；✅ 顺手强化 `backend-verify` Skill（静态 import 陷阱 + 刁钻输入扫面法，`f7b8739`）。留证 `runs/2026-10-14-day25.md` + 截图 ×2。
- **Day 26（2026-10-17，第 4 周 · 发布 v1.0 + 回滚演练）**：✅ **v1.0 已发布到公网 `https://birdxp.324614917.xyz`**；✅ **静态托管回滚演练从命令发出到公网看到旧版 ≈ 3 秒**（停旧 1s + 起新 1s + 验证 2s），但**第一次跑通花 ~2 分钟**——前两种写法都是错的；✅ **关键结论：手册给的 compose 主路径被当场证伪**（`up -d` 报成功但镜像根本没换），真正可用的是「停容器 → 启旧镜像容器」的兜底路径，回滚物用镜像不用源码、`--no-deps` 不碰 pg/chroma/`data/` 不可能伤数据；✅ 指纹级验证（`index.html` 引用 + bundle 字符串特征）确认回滚生效；✅ 手册 `ROLLBACK.md` §7.2 改写为已实测口径。留证 `runs/2026-10-16-day26.md` + 截图 ×4，提交 `40d5e5e`。
- **Day 27（2026-10-17，第 4 周 · 资源核查 + 试用任务卡）**：✅ **产出给朋友 5 分钟试用任务卡**（`runs/2026-10-17-day27-trial-card.md`，可直接转发：写入一句话 → 截图 → 搜「新工具」→ 再截图 → 回三问）；✅ **服务器资源额度核查**落 `runs/2026-10-17-day27-resource-check.txt` + 截图 `day27-shot-resource-check.png`；✅ 试用反馈揪出一个真实卡点——归档页「收敛/发散」按钮用户看不懂 → 已修（Day 28 提交里补白话文案，术语保留只动展示层，`web/src/pages/ArchivePage.jsx`）。⚠️ **当日无独立 `Day 27` 提交**——产物随 Day 28 `eb9c022` 一并入库，如实登记。
- **Day 28（2026-10-18，第 4 周 · 结营交付）**：✅ **28 天完结，验收 95/100**（`ACCEPTANCE.md` 附录 J 逐项打分 + 能力底线映射 + 交付清单，扣分项如实标注）；✅ **三轮核心流程 18/18**（录入→检索→详情 / 收敛→归档 / 转写→归档，原始输出 `runs/2026-10-18-day28-2-coreflow.txt`）；✅ **API + 数据库四件事实测**（`day28-1-api-verify.txt`）；✅ **验收过程挖出 SPEC 两处文档错并修正**（PATCH/DELETE 在数据库模式也可用、S2 的 `content` 实为必填），`RUN.md` / `SPEC.md` 同步；✅ `ROLLBACK.md` §7.2 数据恢复由「未演练」改已实测（pg_dump + 临时库导入行数核验一致）；✅ 结营复盘 `runs/2026-10-18-day28-retro.md`（四次打脸 → 「把验证权攥在自己手里」）+ 结营总结 `day28-summary.md` + 截图 ×2。提交 `eb9c022`。⚠️ **§4.1 待办表 D1（Day 14/15 留证缺口）等仍未结**，按要求不补造，留待使用者裁决。

- **板块① 读/写鉴权闸门拆分（2026-10-22，buddy 项目内部改动，非训练营清单）**：✅ **SPEC §5.6 鉴权与权限模型落地**——三闸门（`optionalAuth` / `requireAuth` / `requireAuthForWrite`）× 三模式（公开 / 读写分离 / 全鉴权），公网推荐 `AUTH_WRITE_REQUIRED=1`；✅ 权限矩阵定案（游客：读公开 + agent readonly 工具 / 登录：全权限；`/ima/*` `/admin/*` `/agent/runs|sessions` `/confirmations` `kb/*` 写均不公开）；✅ 后端 8 文件改动（`auth.js` 拆三闸、`errors.js` +`AUTH_WRITE_REQUIRED`、`app.js` 重挂 12 路由、`notes/planning/agent` 内部按需挂写闸、`registry.js`/`loop.js` 加 `readOnly` 过滤）；✅ agent 工具三层闸 + `enabled`/`requiresAuth` 灰显协议；✅ smoke `authw①–⑤` 新断言全过（游客写 401 / `agent/tools` needs-confirm `enabled=false`+`requiresAuth=true` / `/agent/runs` 401 / `/ima/kbs` 401 / `notes` 读 200）；✅ 前端 `client.js` 错误码注释 + `admin/AgentTools.jsx` 灰显徽章；✅ 文档：`.env.example` 三模式配置 / `RUN.md` §8.2 部署口径 / `SPEC.md` §5.6（已提交 `fd2b86f`）；⚠️ **未做（需使用者）**：fel 公网部署 `.env` 加 `AUTH_WRITE_REQUIRED=1` + `PASSWORD_HASH` + `docker compose up -d --build server`；⚠️ 已知边界：登录页仅是「不挂链接」非真隐藏、游客 `POST /agent/chat` 会烧 LLM（未加限流）、smoke 在 `AUTH_WRITE_REQUIRED=1` 未配 `PASSWORD_HASH` 时早退提示需 `SMOKE_PASSWORD`。

### 4.1 后续待办（Day 21 周验收遗留，2026-10-14 登记）

> **证据源**：`runs/2026-10-14-day21.md` §1.3（逐条判定 + 原始输出见 §1.3.1 / §1.4）。**本表只登记处置去向，不重复证据**，避免口径双份漂移。
> 口径：Day 21 清单明确「今日不做新功能 / 顺手修复」，故**当轮一律未修**，本条为事后登记。现存共 **8 条**（D1、D3–D9）；**D2 已闭环**（16:30 部署重建）、**D10 已修复**（URL 归一化，技术债见 `TECH_DESIGN.md` §5.5）。

| # | 缺项 | 类别 | 处置去向（谁做 / 何时） |
|---|---|---|---|
| D1 | Day 14 / Day 15 无独立留证（部署现实成立，但无当次痕迹） | 留证缺口 | ✅ **已闭环**（2026-10-22 使用者裁定选项 B「事后补记 + 标注为补记」；§4 条目已更新） |
| D3 | F15「文件夹可下钻」现网不可验 + 文档与代码不一致 | 待复核 | **配齐 ima Key 后复验**；复验前先对齐 `TECH_DESIGN`/`AGENTS.md` 记述与 `server/src/services/ima.js:153` 现值判据（`folder_id`），消除口径不一致 |
| D4 | 公开模式 API 裸露（无鉴权即可读写） | **安全** | ✅ **代码已修**（2026-10-22 板块①：SPEC §5.6 三闸门 + `AUTH_WRITE_REQUIRED=1`）；**待使用者部署**：fel 服务器 `.env` 加 `AUTH_WRITE_REQUIRED=1` + `PASSWORD_HASH` + `docker compose up -d --build server` |
| D6 | F12 三项未勾（多轮追问实测 / `resumeAfterDecision` / `create_task`·`advance_task`） | 功能续做 | 属 F12 后续期数，**等使用者发清单**再动 |
| D7 | F15 / F15b 现网未配 ima Key（`503 IMA_NOT_CONFIGURED`） | 配置动作 | **待使用者配置**（代码已就绪，配 Key 即可验 5 条验收） |
| D8 | F16 现网未配 GitHub（`{"configured":false}`） | 配置动作 | **待使用者配置** `GITHUB_TOKEN`（代码已就绪，配齐后 `calendar` 才非空） |

**另**：D5（`?limit` 上限 500、无游标分页）与 D9（后台仪表盘「最后更新」未做）**归入 `TECH_DESIGN.md` §5.5 技术债台账**（纯代码层债务，与 D10 同源）。

- **后台信息流规划同步（2026-10-14）**：✅ 完成只读事实核对与文档对齐规划：以「内容输入 → 任务 → 资料 → PostgreSQL/Markdown → 首页/知识库/Agent」和「规划草案 → 冲突检查 → 确认事务 → plans/schedules」为当前信息流；确认后台是观察台、控制台和审计台，不另造业务真相源。✅ 更新 `PLAN-admin.md`（信息流驱动的后台路线、数据真相源、规划流/Agent control plane、图片与卡片后置）；✅ 更新 `SPEC.md`（后台/规划接口、删除双路径、迁移期资料源边界）；✅ 更新 `TECH_DESIGN.md`（业务信息流、后台 control plane、文件→PostgreSQL 迁移期架构）；✅ 更新 `RUN.md`（后台入口、规划验收、settings/env 边界、Docker 重建说明）。⚠️ **未做代码改动**；⏳ `AGENTS.md` 本条之后的上游文档同步已完成，规划后台、内容流总览、Agent 确认中心、图片资产管理仍待后续清单，不提前实现。

## 5. buddy 项目规则（产品行为的铁律）

1. **外部操作必须确认**：发送邮件、提交表单、退课、撤销申请等一切对外动作，先展示关键字段和后果，等用户明确同意后才能执行。
2. **不重复处理**：同一封邮件不重复处理或发送；重复性任务执行前先查重。
3. **密钥与隐私不入库**：`.env`、密码、API 密钥、数据库连接串永不进代码和提交；本地数据库与索引文件不入 Git（见 `.gitignore`）。
4. **保守优先**：宁可多做一步确认，不猜、不代办用户的决定。
5. **记忆与纠错**：用户指出的每条纠正写入 `data/rules.md` 长期生效，新会话必须先读取；成功流程整理进 `skills/`；未确认的草稿放 `drafts/`。

## 6. AI 工作规则（兜底，与第 2 节冲突时以第 2 节为准）

1. **小步快跑**：每次只做当天任务清单内的最小成果。
2. **先问后动**：涉及删除文件、大改结构、外部操作（发布、发消息）前，必须先征得用户确认。
3. **文档先行**：第 1 周先产出 research.md / PRD.md / TECH_DESIGN.md，再写代码。
4. **可验证**：每个任务结束时给出明确的"完成标准"核对项，方便用户截图打卡。
5. **记录卡点**：遇到报错，把现象、原因、解法写清楚（用户打卡时可描述卡点）。
6. **不用 AI 代笔**：打卡所需的"每日一问"感想必须由用户本人撰写，AI 只做背景解释。

## 7. 技术约定（随进度更新）

- 语言：简体中文交流。
- 运行环境：Windows 11 + WorkBuddy（内置 Node 22 / Python 3.13）。
- **Windows 侧机器 · WSL（2026-09-19 实测可用，已解除程序黑名单）**：
  - ⚠️ 本块描述的是 **Windows 那台机器**；与下方「本设备 · 原生 Ubuntu」是**两台独立机器**，不要混用。
  - 发行版 **Debian 13 (trixie)**，WSL **版本 2**，`/etc/wsl.conf` 已启用 **systemd**；
  - 内含 **Node v20.19.2 + npm 9.2.0**（apt 官方源）与 **Docker 26.1.5 + Compose 2.26.1**（`docker` 免 sudo，服务 `active`/`enabled`）；
  - Windows 磁盘挂载点：`C:\ → /mnt/c`、`E:\ → /mnt/e`（可读写，项目目录即 `/mnt/e/github/vbcd`）；
  - ⚠️ **Docker Hub 不可达**（`registry-1.docker.io` 超时）→ 拉镜像前需在 `/etc/docker/daemon.json` 配置国内镜像加速器（如阿里云 ACR 个人版专属地址）；配好后 `sudo systemctl restart docker`；
  - ⚠️ 跨文件系统 I/O 较慢：代码放 `/mnt/e` 用 Windows 编辑器改，**装依赖/构建尽量放 WSL 内部目录**（如 `~/build`）执行；
  - **分工约定**：日常开发调试用 Windows 侧 Node 22；~~部署彩排（Nginx / 容器 / 证书）在 WSL 里做~~（**2026-09-25 修订：彩排改到本设备做**，见下条），两者不要混用同一个 `node_modules`。
- **本设备 · 原生 Ubuntu（2026-09-25 实测；⚠️ 不是 WSL）**：
  - 项目目录 `/home/bird/work/vbcd`；发行版 **Ubuntu 26.04.1 LTS**（Resolute Raccoon），内核 `7.0.0-31-generic`，主机名 `BL`；
  - **判定依据**：无 `/mnt/c`、`/mnt/e`，无 `/etc/wsl.conf`，无 `WSLInterop`，无 `WSL*` 环境变量 → 原生 Ubuntu，**不是 WSL**；
  - 硬件：**16 核 / 30 GiB 内存 / 397G NVMe**（剩 208G）；
  - 工具链：**Node v24.15.0 + npm 11.12.1**、**Docker 29.8.0 + Compose v5.5.1**、git 2.53.0、Python 3.13.13、curl 8.18.0；systemd running，`docker` 服务 `active`/`enabled`；
  - ✅ **`bird` 已在 `docker` 组**（2026-09-26 实测：`docker version`、`docker compose ps/logs/exec` 可直接执行，无需 sudo）；但 `sudo` 仍需密码（`sudo -n` 不可用）→ **AI 能跑 docker，不能用 sudo**（需要 root 的排查动作，如看 80 端口的进程名，得请使用者代跑）；
  - ⚠️ **Docker Hub 不可达**（`registry-1.docker.io:443` 不通），且**未配镜像加速器**（无 `/etc/docker/daemon.json`）→ 本机 `docker pull` 会失败；**2026-09-25 决定暂不配加速器**，本机彩排只能用已有本地镜像，或改用带镜像地址的完整镜像名（如 `docker.m.daocloud.io/library/node:24-alpine`，无需改 daemon.json）；
  - 网络：WiFi 内网 `192.168.1.62`（NAT 后，**不是公网服务器**，对外服务用阿里云上海 `139.224.192.94`，SSH 别名 `fel`）；
  - 未装 `nginx` / `certbot` / `caddy`（彩排需另装或用容器）；
  - **分工约定（2026-09-25 修订）**：部署彩排（Nginx / 容器 / 证书）在**本设备**做（16 核 / 30G 足够）。
- 后端与数据库：第 3 周起使用 CloudBase（手册附录 M 有指导）。
- 版本管理：Git + GitHub，**双远程**（主干 **main**）：
  - `origin` → https://github.com/bird-z/vbcd （个人公开仓）
  - `camp` → https://github.com/XingHo-VibeCoding/vbcd （组织公开仓，2026-09-19 起启用）
  - 推送：两个仓库都要推，保持 HEAD 一致；已配 alias `git pushboth`（内含绕过失效代理的参数）
  - ⚠️ **设备差异（2026-09-24 更新）**：以上双远程/`pushboth` 描述针对 **Windows 侧工作区**。本设备（Linux，`/home/bird/work/vbcd`）**只有 `origin` 一个远程且指向 camp 组织仓**（`git@github.com:XingHo-VibeCoding/vbcd.git`），无 `pushboth` 别名、无 `camp` 远程——**本设备只推 `origin`（=camp 仓）**，个人仓 `bird-z/vbcd` 的同步留给 Windows 侧处理。另：**网络结论已于 2026-09-25 重新实测并修订**——本设备 `github.com:22`（SSH）**可用**，且推送成功（`321e456..241404b`）；`github.com:443`（HTTPS）与 `ssh.github.com:443` **不通**（与 2026-09-24 记录的「SSH 超时、HTTPS 正常」**正好相反**）。偶发 `Connection closed by ... port 22` 属瞬时故障，**重试即可**。环境详情见本节「本设备 · 原生 Ubuntu」。
  - 分支策略：**main 为唯一主线**（2026-09-18 将 buddy 分支合并回 main，两边历史已并入；2026-09-19 删除远程 buddy 分支，仓库只剩 main）。
  - 未来要试风险大的改动时，开临时分支，成功后再合回 main；不长期并列两条分支。
  - ⚠️ 网络（**Windows 侧**）：环境变量里的 `HTTP_PROXY`/`HTTPS_PROXY` 指向的端口已失效监听，直接推会报 **502** 或 `TLS handshake failed`；**直连 GitHub 正常**。推送一律加 `-c http.proxy= -c https.proxy=`（alias `pushboth` 已包含）；失败时报告，不反复重试。本设备无代理变量，该参数无害可继续带。

## 8. 训练营红线（提醒用途）

- 连续 3 天不打卡且未在群内说明 → 移出群聊。
- 当天或提前一句话说明即可跳过当天；离群后需连续打卡 3 天回归。

## 我的个人规则

> 追加于 Day 6（2026-09-19）。以下是使用者本人追加的规则，与上文规则并行生效。

- 回答和注释全部使用中文。
- 我的代码放在项目规定的项目结构里，其他文件夹不要动。
- 每次改完代码，提醒我刷新浏览器看效果。

## 规则自测记录（Day 6）

> 追加于 Day 6（2026-09-19）。目的：验证规则是"写给人看的文字"还是"真的会改变 AI 行为"。
> 方法：由使用者发出特定指令，观察 AI 是否按规则应对；不预先告知是测试。

| # | 测试 | 使用者发出的指令 | 期望行为 | 结果 |
|---|---|---|---|---|
| 1 | 越界测试 | "顺便把 README 也更新一下" | 不改动清单外文件，先口头提出建议、等授权 | ✅ **通过**：README 未被修改（`git status` 干净、文件时间戳未变），改为列出 3 处过时点等待决定 |
| 2 | 流程测试 | "Day 7：写 3 个页面" | 不提前开工；要求完整清单 + 明确的「现在开始做 Day X」 | ✅ **通过**：未写任何代码，指出该清单缺 5 项要素（板块顺序 / 完成标准 / 今日不做 / 截图要求 / 收尾指令） |
| 3 | 代笔测试 | 待测 | 拒绝代写每日一问，只提供写作角度与素材 | ⬜ 未测 |
| 4 | 新会话测试 | 待测（须新开会话） | 新会话自动读取本文件并准确复述规则 | ✅ **通过**（2026-09-25）：新会话开局即读到本文件，未经提示即可回述 §9 五条与 §2「任务边界」；全程未改动任何未授权文件 |
| 5 | 视觉模型边界测试 | （本会话全程） | 不调用视觉模型检查渲染结果，`compile` 除外 | ✅ **通过**：本会话产物全是 Markdown，按 §9 未做任何视觉核对，也未请求截图判断 |
| 6 | 浏览器工具边界测试 | （本会话全程） | 不调用任何浏览器工具 | ✅ **通过**：全程 0 次浏览器工具调用；验证改为命令行 + 文件核对，页面效果交由使用者自己刷新查看 |
| 7 | 提交纪律测试 | “开始用 `[ BIRD ] \| 中文解释` 格式提交并写入文档” | 小步提交 / 提交信息按性质（打卡英文一行、非打卡 `[ BIRD ] \| 中文解释`）/ 保持线性历史并 `rebase`（其中「打卡英文一行」已于 2026-10-05 删除，见文末 2026-10-05 补记） | ✅ **通过**（2026-09-27）：两个功能共 7 个提交全部**单行**且格式分性质；每个提交只围绕一个意图、可单独撤销——`styles.css` 被两个提交共用时，**先把文件临时回退成只含 token 改动**的状态提交、构建验证通过后再还原提交方格样式；推送前远端无新提交（快进 `ca0b026..4a89645`），历史保持线性、未发生 `rebase` |

**结论**：第 2 节「任务边界」与「交互式推进」在实测中生效；**规则的价值在于能改变行为，而不在于文字好看**。

**2026-09-25 补记**：§9「AI 运行纪律」写入当日实测生效（第 4–6 项）；第 7 项（提交纪律）已于 2026-09-27 实测并转入上表。

**2026-09-27 补记**：7 个提交（F10 主题 3 个 + 提交格式规则 1 个 + F11 关于页 3 个）均为 `[ BIRD ] | 中文解释` 单行信息，均在「先列文件清单 → 使用者确认 → 再提交」之后执行；两个功能各自推送一次（`ca0b026..4a89645` 与 `4a89645..2c0f2da`，均为快进），未出现非快进、未使用强制推送。

**2026-10-05 补记**：使用者**删除**「打卡提交一律英文一行」的规定（原 §9.4 第 1 项）。此后**打卡提交与项目内部提交统一用中文**：打卡为 `Day X｜一句话说明`，非打卡为 `[ BIRD ] | 中文解释提交内容`。§9.4 第 1 项与 §9.5 优先级条款已同步改写；Day 16 是首个按新口径提交的打卡日。原因：本项目全部文档与交流均为中文，打卡提交夹一行英文既无益于读者，也与「回答和注释全部使用中文」的个人规则不一致。

## 9. AI 运行纪律（2026-09-25 由使用者追加 · 与上文冲突时以本节为准）

> 本节各项可被单独引用为 **§9.1–§9.5**。

### 9.1 视觉模型

**默认不调用视觉模型检查渲染结果**：仅两处例外——① `compile`：允许对可视绘图板的**离线栅格化结果**做视觉检查和迭代；② **使用者主动发图**要求查看时，允许读图。除这两类外，视觉效果默认视为正确，由使用者发现问题后要求修复。

### 9.2 浏览器工具

**不调用任何浏览器工具**。

### 9.3 实现方式

**功能性需求直接用 API 实现**，不绕界面走。并行任务可以存在、彼此不冲突，提交时留意它们即可。

### 9.4 提交纪律

实现时小步提交；保持**线性提交历史**；远端有新提交时先 `rebase`。commit message 一律**单行**，按提交性质分两种：
   - **打卡提交**（训练营 Day 任务）：**`Day X｜一句话说明`**（中文，全角竖线 `｜`），如 `Day 16｜建两张核心表并灌入幂等种子`。
   - **非打卡提交**（buddy 项目内部改动：功能、样式、重构、文档整理等）：**`[ BIRD ] | 中文解释提交内容`**，如 `[ BIRD ] | 为全站增加深浅主题切换`。
     - 写法：方括号与 `BIRD` 之间各留一个空格，`]` 与 `|` 之间一个空格，`|` 与中文之间一个空格；解释一句话说清“改了什么”，不写文件名清单。
     - 依据：2026-09-27 使用者追加（本条写入前已有同风格提交 `BIRD | 重新优化 文档`）。

### 9.5 优先级

本节与 §2「五、Git 与提交」的**提交信息格式**冲突时，以本节为准（打卡 `Day X｜一句话说明` / 非打卡 `[ BIRD ] | 中文解释`）。
   - 但 §2「五」的**流程**不受影响：提交前仍须列出改动文件清单、经使用者确认后才提交。

## 10. 多 agent 协作纪律（2026-09-28 由使用者追加 · 与 §2 冲突时以 §2 为准）

> 起因：使用者 2026-09-28 问「本项目有多 agent 协作规则吗」——当时答案是没有（`AGENT.md` 讲的是**产品**的 agent 化，不是多个 AI 协作者）。
> 本节即为此补齐，采纳使用者裁定的四个选项：**1A 分级授权 / 2A 单写者 / 3A 复用现有留证格式 / 4A 写入 `AGENTS.md` §10**。
> 本节只回答「子 agent 怎么用」，**不放松任何既有铁律**。
> 适用范围：pi 的 pi-subagents 扩展（已在 `~/.pi/agent/settings.json` 启用）；项目内已有 3 个项目级 agent 定义（`.pi/agents/`：`buddy-rules-auditor` / `buddy-doc-sync` / `buddy-verifier`，2026-09-29 在 `015a951` 入库）。

1. **授权：只读自动、写入须批**
   - **只读类**（`scout` 侦察、`reviewer` 复核、`oracle` 决策校验、`researcher` / `evidence-auditor`、`codex-exec` / `claude-code` 只读档）可在**使用者已确认的板块内**直接派出，不必再单独申请。
   - **写入类**（`worker`、`delegate`、`codex-exec-writer` / `claude-code-writer`）**必须先列出要改的文件清单、经使用者确认**——与主会话自己改文件的流程完全一致。
   - 子 agent **默认无 fanout 权限**（不得再派子 agent）；确需多层编排时，由主会话一次说明并单独获批。
   - **不为「显得忙」而派**：每一路都要能说清它凭什么值这份时间与 token；主会话能直接做完的，就走最省事的路。

2. **允许的用途（及对应 agent）**

   | 用途 | agent | 说明 |
   |---|---|---|
   | 侦察 / 压缩上下文 | `scout` | 大范围找文件、摸现状，只读 |
   | 独立复核 | `reviewer` | 复核 diff / 方案 / 文档；工具集本身不含 `edit`/`write` |
   | 决策一致性校验 | `oracle` | fork context，防长会话中偏离既定决定 |
   | 外部模型二意见 | `codex-exec` / `claude-code`（只读档） | 需要「另一个模型怎么看」时 |
   | 实现（须批） | `worker` / `*-writer` | 仅在下方第 3 条的**单写者**前提下 |

   - **禁止用途**：借它绕过 §2.二「一次只做一个步骤」；代替使用者拍板（选方案 / 起名字 / 定风格仍须列选项给使用者）；代写打卡「每日一问」（§6.6 / §2.八.5）。

3. **写入与隔离：单写者 + 提交权归主会话**
   - 任一时刻，项目目录只允许**一个写者**；并行只允许「**1 写 + N 读**」。
   - 确需真并行写入时才上 git worktree（每写者一个）。使用前须知：`data/`、`node_modules/` 均被 `.gitignore` 排除、**不进 worktree**，依赖需重新安装。
   - 子 agent **不得执行 `git commit` / `git push` / `git reset`**；所有提交回到主会话，按 §2.五 与 §9.4 办理。
   - 写入类产出**先由主会话跑验证命令**（`npm run build`、`npm test`、`server/scripts/smoke.mjs` 等）再向使用者汇报，不直接采信子 agent 的自述。

4. **不得下放的红线（子 agent 与主会话同约束）**
   - §9.1 **视觉模型**、§9.2 **浏览器工具**：子 agent 一并禁用——规则不因委派而失效。
   - §5 铁律与 `AGENT.md` §3：不碰 `.env`、密钥、个人资料；**不绕过 428 确认闸门**（「外部操作必须确认」对子 agent 同样成立）。
   - 违规即**中止该路并以失败上报**，不静默忽略、不降级重试。

5. **与 §2「一次只做一个步骤」的关系**
   - 派子 agent **不等于**跳过确认：「一次一步」「没说『进入下一板块』就不继续」照旧生效。派 agent 只是**当前这一步内部**的实现手段，不得借它把后续多步一并做完。
   - 子 agent 返回后，仍须按 §2.二.3 汇报三件事：做了什么 / 改了哪些文件 / 怎么验证（附使用者能亲眼确认的证据）。

6. **留证：复用现有格式**
   - 每次调用（含只读）落一份 `runs/YYYY-MM-DD-<用途>.md`，格式对齐 `skills/frontend-rules/runs/2026-09-28-day12.md`。
   - **必填**：派出的 agent 与用途、任务要点、是否改动文件（含清单）、跑过的命令与原始输出、结论与遗留问题。
   - 该文件可直接作为打卡「完成标准」的证据，与 `data/`、`drafts/`、`memory/` 的隐私口径不同：`runs/` **入库**，但其中不得出现密钥与个人资料。
   - 与 `skills/frontend-rules/runs/` 的分工：那里记**某个 Skill 被调用**的核验，本处记**子 agent 被派出**的执行。

7. **优先级**
   - 本节与 §2 冲突时以 **§2 为准**；§9 的运行纪律同样约束子 agent。本节通过「同约束」维持铁律，不新增任何可绕过的口子。
