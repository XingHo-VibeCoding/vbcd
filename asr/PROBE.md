# PROBE.md — fun-asr-flash 探针实测结论（2026-09-28）

> 探针脚本：`asr/scripts/probe_funasr.py`（PLAN §6 第 0 步）。
> 素材：`/home/bird/work/LLMP/laya/downloads/t1.mp3`（B 站 `BV1iYea6zEVC`，test5 原视频音轨）。
> 原始响应：`asr/probe-result-a1.json` / `asr/probe-result-a2.json`。

## A1｜返回结构：✅ 有句级时间戳（但字段名与预想不同）

- 响应顶层：`{sentence, text, request_id, output, usage}`；`output` 内嵌套同样结构。
- **句级对象**：`output.sentence`（dict；多句时应为 list），字段：
  `sentence_id / begin_time / end_time / text / channel_id / speaker_id / sentence_end / words[]`
- **时间戳单位：毫秒**（40 秒片段返回 `begin_time=360, end_time=40000`）——解析一律 `/1000`，不做启发式猜测。
- `words[]` 是**词级**时间戳（本例 112 词），bonus：未来要做逐词高亮可直接用。
- `text` 为整段拼接文本；`usage.duration` 为音频秒数。
- 未返回语种类字段 → `language` 只能取请求参数或 `unknown`（服务已按此处理）。
- **结论**：`timestamp_granularity="sentence"`，不改架构；`parse_result` 已按 `output.sentence` 实测格式实现（非 PLAN 预想的 `choices[].content[].sentences[]`）。

## A2｜上限：13.8MB base64 被拒（HTTP 400 + 空 sentence）

- 送检 340s 正弦波 wav（10.38MB raw ≈ 13.83MB base64，超 10MB 上限）：
  **HTTP 400**，响应体是普通空结果（`sentence.text=""`），**不是标准错误信封**——
  即上游对超限输入返回 400 而非 413/明确 code。
- 对服务的影响：`funasr.py` 侧按「≤10MB base64」本地先闸（`ASR_MAX_B64_BYTES`），
  `ASR_CHUNK_SECONDS=180` 保持不动（180s ≈ 7.7MB base64，有余量）。
- 附带发现：无声/超限音频上游可能返回 200 或 400 + 空 sentence → `parse_result` 对空文本抛 `ASR_FAILED`，不会产生"成功的空结果"。

## A3｜限流特征：未观测到

- 两次正常请求均 HTTP 200（6.1s / 未计）；没有主动制造 429（避免烧额度）。
- 重试判定按既有表执行：HTTP 429 或响应 `code` 含 `Throttling` → `RATE_LIMITED` 可重试；
  401/`InvalidApiKey` → `AUTH_FAILED` 不重试。若实测发现 429 形式不同，改 `_classify_http` 一处即可。

## Live 端到端补记（2026-09-28 晚，真实链路）

- `BV1iYea6zEVC`（70.5s）：job `succeeded`，`chunks=1`，`download_ms≈29s`（yt-dlp 取音轨，B 站限速明显）、`ffmpeg_ms≈0.1s`、`asr_ms≈16s`、`total_ms≈61s`。
- buddy 侧同一视频：POST task → `doing` → 轮询器推进约 4 拍 → `done`，`data/learning/*.md` 落盘（含 LLM 摘要/要点 + `[mm:ss]` 分段全文）；同一 URL 二次提交返回「已归档过 …」未写第二份。
- 容器链路：compose 内 server → `http://asr:8000` 真实调用成功（Bearer 鉴权生效）；宿主机直连 `localhost:8000` 拒绝连接（未发布端口）。

## 对照 PLAN 的偏差记录

| PLAN 假设 | 实测 | 处置 |
|---|---|---|
| `choices[].message.content[].sentences[]` | `output.sentence`（顶层也镜像一份） | `parse_result` 按实测实现 + 兜底旧结构 |
| 时间戳"毫秒或秒，>1e4 判定" | 一律毫秒 | `_to_seconds` 恒 `/1000` |
| 超 10MB 返回明确错误码 | HTTP 400 + 空 sentence（非错误信封） | 本地体积闸门兜底 + 400 归 `ASR_FAILED` 不重试 |
