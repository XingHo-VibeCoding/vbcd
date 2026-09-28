# PROBE.md — fun-asr-flash 探针实测结论（PLAN.md §6「第 0 步」）

> 探针脚本：`asr/scripts/probe_funasr.py`（一次性，不进主链路）。
> 实测日期：**2026-09-28** ｜ 模型 `fun-asr-flash-2026-06-15` ｜ 端点 `https://maas.qianwenaiapi.com`（`/api/v1/services/aigc/multimodal-generation/generation`）
> 素材：`/home/bird/work/LLMP/laya/downloads/t1.mp3`（B 站 `BV1iYea6zEVC` 音轨，**实际只有 70.6 秒**）；长音频用 `--repeat` 循环拼接（测边界足够，不重复下载）。
> 原始响应：`asr/probe-result-a1.json` / `asr/probe-result-a2.json`（旧一轮）与 `asr/.tmp-probe/<时间戳>/raw/`（本轮，均已被 `.gitignore` 忽略）。

## 0. 怎么跑

```bash
# 用本地音轨（本机依赖在 conda llmp 环境里，不必为探针单装依赖）
/home/bird/miniconda3/envs/llmp/bin/python asr/scripts/probe_funasr.py \
    --input /home/bird/work/LLMP/laya/downloads/t1.mp3

# 只测 mp3 时长台阶（不给 --steps 就跳过 wav 体积台阶），源太短时用 --repeat 循环拼接
... --repeat 6 --steps "" --mp3-steps 300,305,310,330 --long-test-seconds 0

# 或给链接自己下载（需要 yt-dlp）
... --url https://www.bilibili.com/video/BV1iYea6zEVC

# 顺带观察限流（额外费额度，按需再跑）
... --burst 6
```

Key 取环境变量 `DASHSCOPE_API_KEY` / `MAAS_API_KEY`，或 `asr/.env`（样例见 `asr/.env.example`）。
脚本只打印「Key 已设置（长度 N）」，**不打印密钥与 Base64 内容**。

## A1｜返回结构：✅ 有句级时间戳能力（字段名与预想不同，需由词级重组）

- 响应顶层：`{sentence, text, request_id, output, usage}`；`output` 内**镜像同一份** `sentence/text/request_id`。
- **`sentence` 在整片里只有「一个」对象**（不是句子数组），字段：
  `sentence_id / begin_time / end_time / text / channel_id / speaker_id / sentence_end / words[]`；
  多句时应为 list 的判断未成立——**不论片长，始终是单个对象**（70s、300s 两次实测一致）。
- **时间戳单位：毫秒**（70s 片段 `begin_time=360, end_time=70000`）→ 解析一律 `/1000`，不做启发式猜测。
- **`words[]` 是词级时间戳**（毫秒 + `text` + `punctuation`），这才是真正的句级信息来源：
  - 300s 切片：872 词 / 43 句；70s 切片：205 词 / 12 句；
  - 按 `punctuation`（`。！？!?…；;`）重组句后：**时间轴严格单调**，重组文本合计字数与 `sentence.text` **完全一致**（362/362 字）；
  - → 服务可对外提供**真正的句级 `segments[]`**（PLAN §3.3 的承诺），而不是整片一段。
- `text` 为整段拼接文本；`usage.duration` 为音频秒数（可当「片偏移是否对齐」的自检量，差值 > 2s 记 warning）。
- `speaker_id` 恒为 `null`（`words[].speaker_id` 同）→ 本期不做说话人分离，符合 PLAN §7。
- 未返回语种类字段 → `language` 只能取请求参数或 `unknown`。
- **结论**：`timestamp_granularity="sentence"`，**前提是从 `words[]` 重组**；只取 `sentence.text` 时实际只有「整片一段」，那属于 `chunk`。

## A2｜上限：**硬上限 300 秒（与体积无关）**；旧口径「Base64 < 10MB」不成立

| 输入 | 音频时长 | raw 体积 | Base64 体积 | HTTP | 结果 |
|---|---|---|---|---|---|
| wav 16k 单声道 | 180s | 5.49 MiB | 7.32 MB | 200 | 有文本 ✅ |
| wav 16k 单声道 | 240s | 7.32 MiB | 9.77 MB | 200 | 有文本 ✅ |
| wav 16k 单声道 | **300s** | 9.16 MiB | **12.21 MB** | 200 | 有文本 ✅ |
| wav 16k 单声道 | 330s / 360s / 420s | 10.07–12.81 MiB | 13.43–17.09 MB | 400 | 空结果 ❌ |
| wav 正弦波（旧一轮） | 340s | 10.38 MiB | 13.83 MB | 400 | 空结果 ❌ |
| mp3 16k 32kbps | **300s** | 1.10 MiB | 1.53 MB | 200 | 有文本 ✅ |
| mp3 16k 32kbps | **305s** | 1.12 MiB | 1.55 MB | **400** | 空结果 ❌ |
| mp3 16k 32kbps | 310s / 330s / 450s / 540s / 600s | — | 1.6–3.05 MB | 400 | 空结果 ❌ |

- **结论 1（时长硬上限）**：**单请求音频 ≤ 300 秒**。305s 起一律 400，而此时 Base64 只有 1.55MB —— **与体积无关，是纯时长限幅**。
- **结论 2（体积）**：`PLAN.md` / `test4.py` 里「Base64 < 10MB」的旧认知**不成立**：300s wav 的 Base64 已达 **12.21MB** 仍是 200。340s 那次 400 是被**时长**拒的，不是被体积拒的（两者在同一区间，容易误判）。
- **超限失败形态（重要）**：HTTP **400** + `sentence` 为空对象（`end_time: null`、`words: []`）、**`code` 与 `message` 都为空**，不是标准错误信封。服务侧必须把「400 且文本为空」归为 `ASR_FAILED`（不可重试），hint 写明「音频超过 300 秒上限或格式不受支持」。
- **落地动作**：`ASR_CHUNK_SECONDS=180` **保持不变**（距硬上限 40% 余量、重试成本更低）；`ASR_MAX_B64_BYTES=10485760` 降级为**我方发送前护栏**（不是接口限制）；新增 `ASR_MAX_AUDIO_SECONDS=300` 并在启动时校验 `ASR_CHUNK_SECONDS ≤ 300`。

## A3｜限流特征：6 并发未触发（未观测到 429）

- 本轮 6 个并发请求（各 180s 切片）→ **全部 HTTP 200**，单请求 **23.4–29.0s**；响应头无 `Retry-After` / `X-RateLimit-*`。
- 早前两次正常请求同样 200（约 6.1s / 70s 音频）。**未主动制造 429**（避免烧额度）。
- 耗时参考（配超时用）：**≈5.5s / 70s 音频、≈25s / 180s 音频** → `ASR_REQUEST_TIMEOUT=300` 余量充足。
- 重试判定按既有表执行：HTTP 429 或响应 `code` 含 `Throttling` → `RATE_LIMITED` 可重试；`401` / `InvalidApiKey` → `AUTH_FAILED` 不重试。真出现 429 且形式不同时，只改 `_classify_http` 一处。

## A4（附带）｜Live 端到端补记（2026-09-28 晚，真实链路）

- `BV1iYea6zEVC`（70.5s）：job `succeeded`，`chunks=1`，`download_ms≈29s`（yt-dlp 取音轨，B 站限速明显）、`ffmpeg_ms≈0.1s`、`asr_ms≈16s`、`total_ms≈61s`。
- buddy 侧同一视频：POST task → `doing` → 轮询器推进约 4 拍 → `done`，`data/learning/*.md` 落盘（含 LLM 摘要/要点 + `[mm:ss]` 分段全文）；同一 URL 二次提交返回「已归档过 …」，未写第二份。
- 容器链路：compose 内 server → `http://asr:8000` 真实调用成功（Bearer 鉴权生效）；宿主机直连 `localhost:8000` 拒绝连接（未发布端口）。
- ⏸ **本轮挂起（使用者 2026-09-28 决定先跳过）**：以下三项验证**没做**，恢复办法已写明，随时可拣起：
  1. **多片链路**：另下一个 >20 分钟的视频（本地 `t1.mp3` 只有 70.6 秒；`--repeat` 拼出来的是重复内容，不适合验「内容覆盖全片」）→ 期望 `stats.chunks ≥ 5`、各片均成功、`text` 覆盖全片；
  2. **缓存命中**：同一 URL 在 `CACHE_TTL_SECONDS`（默认 1800）内第二次提交 → 期望 `stats.cache_hit=true`、无重新下载；
  3. **逐句 `[mm:ss]` 归档复跑**：用新的句级重组（`words[]` → 句）跑一次 `transcribe_url` 归档（**换一个没归档过的 URL**，否则命中查重只会返回「已归档过」）→ 看 `data/learning/*.md` 的「全文（带时间戳）」是否逐句。

  挂起状态同时记在 `SPEC.md` §7.5 行动项与 `AGENTS.md` §4 F13；命令与断言见 `RUN.md` 8.8。

## 对照 PLAN 的偏差记录

| # | PLAN 的假设 | 实测 | 处置 |
|---|---|---|---|
| 1 | `choices[].message.content[].sentences[]` | `output.sentence`（顶层镜像一份），且**整片只有一个对象** | `parse_result` 按实测实现 + 保留旧结构兜底 |
| 2 | 时间戳「毫秒或秒，>1e4 判定」 | 一律毫秒 | `_to_seconds` 恒 `/1000` |
| 3 | 超限返回明确错误码 | HTTP 400 + 空 `sentence`，无 `code` / `message` | 归 `ASR_FAILED` 不重试；本地加时长/体积护栏 |
| 4 | 句级时间戳直接可用（出 `srt`） | 句级需由 `words[]` + `punctuation` **重组**（已验证 100% 覆盖、单调） | 见「待办 1」 |
| 5 | 「Base64 < 10MB」为上游闸门 | 真闸门是**时长 ≤ 300 秒**；12.21MB Base64 可通过 | 见「待办 2」 |
| 6 | job 状态含 `cancelled` | 本期只有四端点、无取消入口 | 状态枚举只实现 `queued/running/succeeded/failed` |
| 7 | 首片探测语种、后续片沿用 | 未实测（接口未回传语种字段） | 保留该策略，失败不影响正确性 |

## 由探针引出的待办（尚未落地，等确认）

1. **句级 `segments[]`**：`asr/providers/funasr.py:parse_result` 目前把单个 `sentence` 当作**整片一段**（标注却是 `sentence`）。改为：有 `words[]` 时按标点重组句（毫秒→秒、句内取首词 `begin_time` 与末词 `end_time`），无 `words[]` 才降级为整片一段并标 `chunk`。
2. **时长口径统一**：`.env.example` / 文档里「10MB base64 上限」改为「上游 300 秒时长上限 + 我方 10MiB 发送前护栏」，并加 `ASR_MAX_AUDIO_SECONDS=300` 的启动校验与对应 hint。
