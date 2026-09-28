# test6 优化方案：fun-asr 转写微服务（供 agent 调用、产出笔记素材）

## 1. 摘要

`test5.py` 是一段硬编码的调试脚本（下载固定 B 站视频 → 整文件 Base64 → 打一次同步接口 → `print` 原始 JSON）。`test6` 不延续它的形态，而是在同一目录下把「远程/上传媒体 → 转写」做成一个 **FastAPI 单进程微服务**，供你云端 web 项目的 agent 以 HTTP 调用，返回**结构化转写包**（全文 + 带时间戳分段 + 源元数据），笔记的归纳排版由 agent 侧 LLM 完成。

关键取舍（已确认）：FastAPI 微服务 / 结构化转写包 / 下载+切片合并 / 单进程 + 磁盘 job 状态 / URL + 文件上传 / **产物仅调用期间落盘，用完清理**。

核心优化方向（相对 test5）：

| test5 现状 | test6 方向 |
|---|---|
| URL、文件名、模型、端点全硬编码；import 即执行 | 服务化：参数化接口 + 显式 CLI 调试入口 |
| `outtmpl="t1"` 覆盖同名文件、每次重下 | 按平台 id 命名 + 短期结果缓存 + 同源单飞（single-flight） |
| 原始 192kbps 立体声 mp3 直接送检，却声明 `sample_rate=16000` | ffmpeg 归一化 16k/单声道/pcm_s16le，声明与实际一致 |
| 无 10MB Base64 上限判断，长视频必然失败 | 静音对齐切片 + 逐段转写 + 时间偏移合并，长视频可跑 |
| 无 timeout / 无重试 / 无 SSE | 全链路超时、指数退避重试、限流识别 |
| `os.environ[...]` KeyError、`resp.json()` 崩溃、无错误分支 | 统一结构化错误码 + 提示，绝不裸崩 |
| key 只认 `DASHSCOPE_API_KEY`，域名写死 | env 驱动（`MAAS_*`/`DASHSCOPE_API_KEY`），保留 filetrans 兜底通道 |
| 只 print，不落盘、不提取 text/时间戳 | 返回 `text`/`segments`/可选 `srt`，笔记可直接用 |
| 无鉴权，任何能访问的人都能烧你的 Key | 服务层 Bearer Token + SSRF 防护 + Key 脱敏 |
| `tep=` 无用变量、中间产物残留、无 `noplaylist` | 清理临时目录、显式 yt-dlp 选项、B 站 Cookie/UA 支持 |

## 2. 架构与文件布局

入口保持 `test6.py`（`uvicorn test6:app` 或 `python test6.py <url>` 做本地调试），核心逻辑拆到包以便测试：

```
laya/
├── test6.py               # 入口：FastAPI app 装配 + CLI 调试模式
├── asr/
│   ├── config.py          # env 读取与默认值
│   ├── models.py          # pydantic 请求/响应/错误模型（= agent 契约）
│   ├── sources.py         # 来源解析与媒体获取（yt-dlp / 直链 / 上传）
│   ├── audio.py           # ffprobe / 归一化 / 静音对齐切片 / 时间轴合并
│   ├── providers/
│   │   ├── funasr.py      # 同步 multimodal-generation（主通道，逐片调用）
│   │   └── filetrans.py   # 异步转录（可选兜底，仅公网直链显式启用）
│   ├── jobs.py            # job 状态机、单飞、TTL 清理、临时目录生命周期
│   ├── cache.py           # (source, options) → 结果 的短期缓存
│   └── api.py             # 路由、鉴权、SSRF 校验、错误映射
├── tests/                 # 单测 + mock 集成测试（respx）
├── requirements.txt
└── .env.example
```

- 单进程：`uvicorn test6:app --workers 1`（不要多 workers，job 状态在进程内 + 本地磁盘）。
- 外部依赖仅 `ffmpeg/ffprobe`（已确认在 `/usr/bin`）与 Python 包；不引入 Redis/Celery/DB。
- 容器化：提供 `Dockerfile`（python:3.11-slim + ffmpeg），jobs 目录挂载可选（不挂也不会丢正在跑的结果）。

## 3. 对外接口（agent 契约）

所有接口需 `Authorization: Bearer $SERVICE_TOKEN`；未设置 `SERVICE_TOKEN` 时服务只绑 `127.0.0.1` 并在启动日志告警。

### 3.1 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/transcribe` | body: `{source, language?, formats?, engine?, part?, wait_seconds?}`。`wait_seconds`（0–120）内完成则直接 200 返回结果，否则 202 返回 job 信封 |
| POST | `/v1/transcribe/upload` | multipart：`file` + 同名字段（表单形式）。同样语义 |
| GET | `/v1/jobs/{job_id}` | job 信封：状态、进度、结果或错误 |
| DELETE | `/v1/jobs/{job_id}` | 立即清理该 job 的临时文件与状态（用隐私场景显式调用） |
| GET | `/v1/tools` | 返回 OpenAI function-calling 格式的 `transcribe_media` / `get_job` / `delete_job` 三个工具 schema，便于你的 agent 注册 |
| GET | `/healthz` | 检查 ffmpeg/ffprobe 可用性、yt-dlp 可导入、API Key 是否配置（不含 Key 值） |

`formats` 取值：`text`（默认）、`segments`（默认）、`srt`（可选，返回 `srt` 字符串）。

### 3.2 job 信封

```json
{
  "job_id": "01J...",
  "status": "queued|running|succeeded|failed|cancelled",
  "progress": {"stage": "download|normalize|chunk|transcribe|merge", "done": 2, "total": 5, "percent": 46},
  "created_at": "2026-09-28T16:20:11Z",
  "updated_at": "2026-09-28T16:21:40Z",
  "result": null,
  "error": null
}
```

### 3.3 结构化转写包（`result`）

```json
{
  "source": {
    "kind": "page_url|media_url|upload",
    "input": "https://www.bilibili.com/video/BV1iYea6zEVC",
    "platform": "bilibili",
    "id": "BV1iYea6zEVC",
    "title": "视频标题",
    "uploader": "UP 主",
    "duration_sec": 621.4,
    "webpage_url": "...",
    "thumbnail": "...",
    "part": null
  },
  "language": "zh",
  "text": "合并后的全文（按段落换行）",
  "segments": [
    {"i": 0, "start": 0.0, "end": 3.24, "text": "第一句", "speaker": null}
  ],
  "timestamp_granularity": "sentence|chunk|none",
  "srt": "1\n00:00:00,000 --> 00:00:03,240\n第一句\n",
  "stats": {"chunks": 5, "download_ms": 8123, "ffmpeg_ms": 1500, "asr_ms": 41200, "total_ms": 52400},
  "warnings": ["片 3 静音切分回退为定长切分"]
}
```

- `segments` 按时间升序、时间轴已加片偏移，可直接被 agent 用来做时间戳引用、章节切分、写笔记的「原文定位」。
- `timestamp_granularity` 明确标注时间戳精度来源，agent 不必猜（见 §6 假设 A1 的降级规则）。

### 3.4 错误信封

`error: {"code", "message", "retryable", "hint"}`，错误码固定集合：

`INVALID_SOURCE` / `SSRF_BLOCKED` / `UPLOAD_TOO_LARGE` / `DOWNLOAD_FAILED` / `FFMPEG_MISSING` / `AUTH_FAILED`（我方 Key 或调用方 Token）/ `RATE_LIMITED` / `ASR_FAILED` / `TIMEOUT` / `CANCELLED` / `INTERNAL`。

单片段最终失败时：job 置 `failed`，但 `error.details.partial` 仍带已完成片段的 `segments`/`text`，避免全量白跑。

## 4. 处理流水线（行为级）

1. **来源解析**（`sources.py`）
   - 平台页链接（bilibili/youtube/其他）→ yt-dlp 仅取音轨（`format: bestaudio/best`，`noplaylist`，`outtmpl` 含 `%(id)s`），B 站支持 `part` 指定分 P。
   - 直链媒体 URL → 直接下载到 job 临时目录（不走 yt-dlp）。
   - 上传文件 → 落 job 临时目录，校验大小上限。
   - SSRF 防护：只允许 `http(s)`；解析目标主机后拒绝私网/回环/链路本地（含 `169.254.169.254`）地址字面量；yt-dlp 也走同一校验。
   - 可选 `YTDLP_COOKIES_FILE`（会员/番剧）、`YTDLP_PROXY`、`YTDLP_USER_AGENT`；B 站默认带 Referer。
2. **归一化**（`audio.py`）：`ffprobe` 取时长 → `ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le`。
3. **切片**：目标 `ASR_CHUNK_SECONDS=180`（16k 单声道 ≈5.8MB raw ≈7.7MB base64，稳在 10MB 上限内）。优先用 `silencedetect` 在标称点 ±20s 内找静音边界切；找不到则定长切并写 warning。片文件用 `-f segment -reset_timestamps 1`，时间偏移由片序号 × 实际片长累计（不用标称值，避免漂移）。
4. **逐片转写**：`funasr.py` 把每片转 data URI 提交 `POST {MAAS_BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`，`parameters: {format: wav, sample_rate: "16000"}`。
   - 首片用于语种探测；后续片带上探测结果，保证同视频语种一致。
   - 并发：片间默认串行（`ASR_CHUNK_CONCURRENCY=1`，可调 2）；全局 ASR 并发用信号量限制（默认 3）。
   - 重试：429/`Throttling`/5xx/超时 → 指数退避 + 抖动，最多 3 次；401/`InvalidApiKey` 直接失败不重试。
5. **合并**：按偏移平移每片句级时间戳，排序、去空、拼接 `text`；生成 `srt`（若请求）。
6. **收尾**：任务终态时**删除 job 临时目录（原媒体、归一化 wav、切片文件全部清掉）**；仅保留体积很小的 job 状态 JSON（含结果），按 `JOB_TTL_SECONDS=1800` 由后台 GC 清理，`DELETE /v1/jobs/{id}` 可立即清。
7. **缓存**：`cache.py` 以 `sha256(规范化 source + 影响结果的 options)` 为键，TTL 默认 1800s，内存 + jobs 目录双写。命中即跳过下载与转写，日志与 `stats` 标注 `cache_hit`。同源并发请求走单飞，只有一个真跑。

## 5. 配置（env，全部有默认值）

`DASHSCOPE_API_KEY`（或 `MAAS_API_KEY`）/ `MAAS_BASE_URL=https://maas.qianwenaiapi.com` / `ASR_MODEL=fun-asr-flash-2026-06-15` / `SERVICE_TOKEN` / `ASR_CHUNK_SECONDS=180` / `ASR_MAX_B64_BYTES=10485760` / `ASR_CHUNK_CONCURRENCY=1` / `ASR_GLOBAL_CONCURRENCY=3` / `ASR_REQUEST_TIMEOUT=300` / `JOB_TIMEOUT_SECONDS=1800` / `JOB_TTL_SECONDS=1800` / `JOBS_DIR=./data/jobs` / `MAX_UPLOAD_MB=200` / `YTDLP_*`。启动时校验缺失即报明确错误，不静默。

## 6. 实现前必须确认的假设（第 0 步：探针）

先写一个一次性的 `probe_funasr.py`（不进主链路）实测三件事，结论直接决定细节：

- **A1｜返回结构**：fun-asr-flash 在该 multimodal 端点是否返回**句级时间戳**。→ 有：`timestamp_granularity="sentence"`，出 srt；只有整段文本：降级为 `"chunk"`（以片边界为时间戳）；完全没有：`"none"` 且不出 srt。降级不影响 `text` 可用性。
- **A2｜上限**：实测单请求 Base64 体积边界与是否存在时长上限，据此校正 `ASR_CHUNK_SECONDS` 默认值与闸门数值。
- **A3｜限流特征**：制造/观察 429 的 HTTP 状态与 `code` 字段，用于重试判定表。

若 A1/A2 与预期不符，§4 的切片与合并逻辑不变，只调整时间戳标注与阈值——不会推翻架构。

## 7. 明确不做（本期边界）

不出笔记（摘要/大纲/金句）——那是 agent 侧 LLM 的活；不做说话人分离、视频画面/OCR、实时麦克风流、多租户配额、MCP Server 封装、持久化资料库；不改写 `test2.py`/`test4.py`/`test5.py`（保留作对照基线）。

## 8. 测试与验收

**单元测试**
- 切片规划：不同时长/码率 → 片数、每片 ≤ 上限、偏移累计正确；静音切分与定长回退两条分支。
- 合并：多片句级时间戳平移后全局单调、无重叠越界；`srt` 时间戳格式 `00:00:00,000`。
- 缓存键：同一源不同 options 不互相命中；`cache_hit` 判定。
- 错误映射：401/429/500/非 JSON 响应/超时 → 对应错误码与 `retryable`。
- SSRF：`http://127.0.0.1/x`、`http://169.254.169.254/`、`file:///etc/passwd` 一律 `SSRF_BLOCKED`。

**集成测试（respx mock，不烧 Key）**
- 2 片假 ASR 响应 → 结果结构符合 §3.3，时间戳带片偏移。
- 第 2 片先 500 后 200 → 重试成功；持续失败 → `ASR_FAILED` 且 `error.details.partial` 含第 1 片内容。
- 上传接口：小 wav → 走同步并 200 返回完整结果。

**Live 冒烟（`-m live`，需真实 Key）**
1. test5 的原视频 `BV1iYea6zEVC` → `text` 非空、`segments` 非空、任务结束后 job 临时目录为空（验证「用完清理」）。
2. 一个 >20 分钟 B 站视频 → `stats.chunks ≥ 5`、全部成功、`text` 覆盖全片；墙钟时间记录进验收报告。
3. 同一 URL 在 TTL 内二次调用 → `cache_hit=true`、无重新下载（以 stats 与日志为证）。
4. 负例：无 Key 启动 → `AUTH_FAILED` 且 `/healthz` 报未配置；错误 BV 号 → `INVALID_SOURCE`/`DOWNLOAD_FAILED`；缺失 ffmpeg（PATH 屏蔽模拟）→ `FFMPEG_MISSING`，均不得出现未捕获异常或 500 裸栈。

**验收标准**：以上全部通过；agent 只需「提交 → 轮询 → 取包 → 自己写笔记」四步即可接入，且服务日志中不出现 API Key 与 Base64 内容。

## 9. 假设与默认值（未额外确认项，均取低风险默认）

- 单一 ASR 供应商按主通道 fun-asr-flash 实现；`engine=filetrans` 仅在 `source` 为公网直链且显式指定时启用（复用 test2 的异步轮询逻辑）。
- job 状态用「进程内 + 磁盘 JSON」双写：单副本部署下的重启恢复与 `GET /v1/jobs` 一致；多副本不做保证（已按你的选择锁定）。
- 结果不长期落盘：临时媒体在终态删除，结果 JSON 由 TTL 与 `DELETE` 清理；若将来要留存，加 `ASR_ARTIFACT_DIR` 即可，不改接口。
- 默认 `formats=["text","segments"]`；`srt` 需显式请求，避免响应体无谓变大。
- 上传上限 200MB、请求超时 300s、全局 ASR 并发 3 —— 均为 env 可调。
