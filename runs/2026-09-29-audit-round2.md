# 留证 · 第二轮只读审计（自查 + 文档口径）2026-09-29

> 按 `AGENTS.md` §10.6 产出。上一轮的派出记录见 `runs/2026-09-29-subagent-dispatch.md`。
> 本轮目的：**让独立 agent 审我自己刚做的改动**，并补齐第一轮没覆盖的文档口径。

## 1. 派出概况

| 项 | 内容 |
|---|---|
| 形态 | 一个异步 workflow（`runs.all`），两个只读子 agent 并行 |
| 子 agent 1 | `buddy-rules-auditor` —— 审我 7 个提交是否符合 `AGENTS.md`（任务边界 / §9.4 提交纪律 / §10 协作纪律 / §2 八.3 自检） |
| 子 agent 2 | `buddy-doc-sync` —— 补查第一轮未覆盖的三项：env 键一致性、`TECH_DESIGN.md` 漂移、`README.md` 与 `AGENT.md` |
| 结果 | **两个都 completed**（对比第一轮 `buddy-doc-sync` 首次超时失败，本轮的窄任务都稳） |
| 隔离 | 无 worktree；两者工具集无 `edit`/`write`，且提示词禁止 git 写操作 |

## 2. `buddy-rules-auditor` 的结论（审我自己）

| # | 检查项 | 判定 | 要点 |
|---|---|---|---|
| ① | 提交信息单行 + §9.4 格式 | ✅ 通过 | 7 条逐字核对均为 `[ BIRD ] \| 中文解释`，无多行 body、无打卡格式误用 |
| ② | 单意图 / 可单独撤销 | ⚠️ 建议修改 | 指出 `f5f8df6` 混了两件事、`6cf8c57` 混了三件事（隐私鉴权补验 + 部署落后修复 + RUN 踩坑表）→ 无法只回滚其中一件 |
| ③ | 提交粒度 | ⚠️ 建议修改 | 同上，`6cf8c57` 偏粗 |
| ④ | 线性历史 | ✅ 通过 | `git log --oneline --graph` 单线、无 merge、每个提交单亲、`HEAD == origin/main` |
| ⑤ | 禁区文件 | ✅ 通过 | 7 次提交文件全集只有 `.pi/agents/*`、`AGENTS.md`、`RUN.md`、`SPEC.md`、`asr/PROBE.md`、`runs/*`；密钥正则扫描唯一命中是 `-e PASSWORD_HASH="$H"`（变量引用，非字面值） |
| ⑥ | §10 多 agent 纪律 | ❌ **必须修改（1 条）** | `9d23b0e` 在 `AGENTS.md` 写「留证见 `runs/2026-09-29-subagent-dispatch.md`」，但该提交里 **`runs/` 只有 3 份**——被引用的文件要到 `27d4223` 才入库 → 该 revision 是**悬空引用** |
| ⑦ | §4 记录是否夸大 | ✅ 通过（抽样实核） | 它去核对了我写的三处硬数字：pytest 48（有子 agent 独立复跑证据）、线上/本地同指纹 `index-CrkQm1km.js` 460821 B（本地实核一致）、「12 条任务全 done」（提交时刻恰为 12，第 13 条 07:35:54 晚于提交 07:35:22）→ **无夸大** |

**关于「必须修改」的处置**：§2 七.1 明令禁止 `git reset --hard` 与强制推送，**历史不可重写**，所以这条**不能事后消除**——它已成历史事实。正确做法是记下来当规则教训（见 §5）。当前 `HEAD` 上引用是有效的（文件已入库）。

## 3. `buddy-doc-sync` 的结论（19 条）

它给了完整清单，以下是**我亲自复核过**的部分与处置：

### 3.1 已复核为真并已修（本轮）

| # | 问题 | 我的复核 | 处置 |
|---|---|---|---|
| 1 | `asr/.env.example` 有 **5 个死键**：`ASR_BIND_HOST` / `ASR_SILENCE_SEARCH_SECONDS` / `JOB_GC_INTERVAL_SECONDS` / `FFMPEG_PATH` / `FFPROBE_PATH` | 全仓 grep：这 5 个键**代码命中 0 处**；代码认的是 `ASR_HOST`（`app.py` 直读）、`ASR_SILENCE_WINDOW_SECONDS`（`config.py` 的 `f.name.upper()` 映射）、GC 间隔**硬编码** `gc_loop(settings, interval=60)`、ffmpeg/ffprobe 走 PATH 裸命令 | ✅ 改 `asr/.env.example`：改名 2 个、删 3 个并留说明 |
| 2 | `asr/.env.example` 缺代码真在用的 `DOWNLOAD_TIMEOUT` / `MAX_DOWNLOAD_MB` | `config.py` 确有 `download_timeout: float = 300.0`、`max_download_mb: int = 500` | ✅ 补进样例（含默认值） |
| 3 | `SPEC.md` §6 缺 `INDEX_CACHE` | `.env.example` 有、代码读 | ✅ 补 |
| 4 | `SPEC.md` §6 缺 `LLM_TIMEOUT_MS` / `LLM_MAX_RETRIES` | 线上在用（`RUN.md` 8.7 踩坑表提过） | ✅ 补（并写明须 < Nginx 60s） |
| 5 | `SPEC.md` §6 列了 7 个代码不读的键 | 复核为真 | ✅ 加一条 ⚠️ 说明（标注为部署期预留），**不改数字、不删行** |
| 6 | `SPEC.md` §6 的 asr 概述漏 `ASR_MAX_AUDIO_SECONDS=300` 护栏 | 这是 F13 最关键的护栏，`RUN.md` 8.8 也没写 | ✅ 补进 SPEC 概述句 + `RUN.md` 8.8 新增一段 |
| — | `RUN.md` 8.9 写 `link-selftest.mjs` **24 条**，而 `AGENTS.md` 写 **38/38**（它标为「数字打架」，但没跑） | **实跑**：`node scripts/link-selftest.mjs` → **38 通过 / 0 失败** | ✅ `RUN.md` 24 → 38（并注明复核日期） |
| 11 | `TECH_DESIGN.md` §5.6 写 `skills/` 「尚未创建」 | 实际已有 `skills/frontend-rules/SKILL.md` + `runs/` | ✅ 改为「已建」 |
| 12 | `TECH_DESIGN.md` §5.7 写「仅有一个冒烟脚本」 | 实际 3 个脚本 + pytest 48 例 | ✅ 更新（并保留「仍未接 CI」这个真结论） |
| 16 | `README.md` 文档表与结构缺 `runs/`、`skills/`、`.pi/agents/` | 三个目录都真实存在且 `runs/` 按 §10.6 必须入库 | ✅ 补 |

### 3.2 未处理，留给使用者拍板（口径类 / 结构性）

| # | 事项 | 为什么我没动 |
|---|---|---|
| A8 | `GET /api/health` 是否计入「N 个接口」 | 属**口径选择**（维持 13 → 加脚注；改为计入 → 五处 13→14）。已登记为 `SPEC.md` §7.5 **A8** 待拍板项 |
| 10 | `TECH_DESIGN.md` §1/§2 的功能列表停在 F9，缺 F10 / F11 / F13 / F14 | 涉及对整份设计文档的框架重述，属你的表述权 |
| 13 | `TECH_DESIGN.md` §5.4 提交格式仍写 `Day X｜一句话` | §9.4 自 2026-09-27 起改双轨；改它等于替你把规则写进设计文档，等你确认 |
| 14 | `TECH_DESIGN.md` §5.5 技术债台账疑似有「已解决仍列着」 | 该条在报告里被截断，我未逐条复核，不猜 |
| 19 | `AGENT.md` §1 页面入口措辞（「主页『归档』卡」vs 实际 `/archive` 页） | 与你 09-28 的页面收编改动相关，措辞口径由你定 |
| — | `9d23b0e` 的悬空引用 | 历史不可重写（§2 七.1） |
| — | `AGENTS.md` §10.6 是否补「留证文件须与引用它的提交同批入库」 | 改 §10 规则需你点头 |

## 4. 顺带完成：F14 收敛链路的独立验证

`AGENTS.md` §4 的 F14 条目是**作者自测**的结论，我没验过。本轮独立跑了一条（**刻意换素材**，不用作者测过的 `nodejs.org`）：

| 项 | 值 |
|---|---|
| 任务 | `POST /api/tasks` `type=organize`，url = `https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Reference/Status/502`（中文 MDN） |
| 任务 id | `1790638554410-403c` |
| 过程 | `organize.stage`: `fetch` → `archive`，`attempts=1`，无 `last_error` |
| 终态 | `done`，`result` = 已归档到 `learning/2026-09-29-502-bad-gateway-http-mdn.md` |
| 产物 | 55 行；frontmatter 含 `source_url` / `hash` / `schema_version`；正文含 `## 摘要` / `## 要点` / `## 原文节选（前 8000 字）` |

✅ 中文站点、非作者素材同样走通 → F14 链路结论可独立复现。

## 5. 教训（供决定是否写进 §10.6）

> **引用与被引用物必须同批入库。** 我在 `9d23b0e` 里先写了「留证见 `runs/…-subagent-dispatch.md`」，而那份文件在下一个提交才入库，导致该 revision 的引用悬空。每个提交都要能自证——引用一份尚不存在的文件，等于给那个 revision 埋了一个坏链接。

## 6. 纪律核对

| 条款 | 执行情况 |
|---|---|
| §10.1 只读自动、写入须批 | ✅ 只派只读类 |
| §10.3 单写者 | ✅ 两个子 agent 无写权限；本轮所有文件改动均由主会话执行 |
| §10.4 红线不下放 | ✅ 提示词含 §9.1/§9.2 与禁 git 写；审计员自述未改任何文件 |
| §10.6 留证 | ✅ 本文件（且本轮引用与文件同批入库） |
