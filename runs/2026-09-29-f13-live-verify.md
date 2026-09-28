# 留证 · F13 转写链路三项挂起验证（2026-09-29 结清）

> 执行者：主会话（非子 agent）。本文件是长任务的执行留证，格式对齐 `skills/frontend-rules/runs/2026-09-28-day12.md`。
> 背景：三项验证于 2026-09-28 由使用者决定**挂起**，恢复步骤写在 `asr/PROBE.md` §A4。
> 本次在**本机 compose 真实链路**上跑完，不再挂起。

## 0. 一句话结论

三项全部通过；其中 V1/V3 是在**重建后的 asr 镜像**上跑的——重建前的镜像是 2026-09-28 18:44 构建，**不含**当晚才落地的 `words[]` 句级重组修复，直接跑会得到「整片一段」的假通过。

## 1. 前置修复：asr 镜像过期（本次发现）

| 项 | 事实 |
|---|---|
| 旧镜像构建时间 | `vbcd-asr` 2026-09-28 18:44 |
| 旧镜像行为 | 同一 70s 视频只出 **1 个 segment**（`{"i":0,"start":0.36,"end":70.57}`），句级重组未生效 |
| 容器内是否含新代码 | `grep -rn "words" /app/asr/providers/funasr.py` → **0 命中** |
| 处理 | `docker compose up -d --build asr`；重建后同文件 **9 行命中** |
| 重建后容器 | `StartedAt=2026-09-28T17:28:00Z`，`RestartCount=0` |

> 注：首次 grep 用了错路径（`/app/funasr.py`），误判「代码没进去」；实际代码在 `/app/asr/providers/funasr.py`。教训：容器内路径要与 `Dockerfile` 的 `WORKDIR`/`COPY` 对齐后再下结论。

## 2. V2 · 缓存命中（`cache_hit=true`）

均通过容器内 httpx 调用 `http://127.0.0.1:8000/v1/transcribe`（`Bearer $SERVICE_TOKEN`），同一 URL 连提两次。

| 次序 | job_id | 结论 | 耗时 |
|---|---|---|---|
| 第 1 次 | `1d6131c64f3145eaa3de` | `succeeded`，`chunks=1`（70s 视频） | 27.1s（`download_ms=3937`） |
| 第 2 次 | `5ac0e1a1403d4d1e889e` | `succeeded`，**`cache_hit:true`** | **0.127s 墙钟** |

原始 `stats`（第 2 次）：

```json
{"download_ms":3937,"ffmpeg_ms":137,"asr_ms":11500,"chunks":1,"total_ms":27077,"cache_hit":true}
```

**判定依据**：第 2 次在 0.127s 内返回，且 `stats` 与第 1 次**逐字段一致**（含 `download_ms=3937`）——缓存带回的是首次结果快照，**没有重新下载、没有重跑转写**。✅ 通过

## 3. V1 · 多片链路（`stats.chunks ≥ 5`）

素材：`https://www.bilibili.com/video/BV1Eb411u7Fw`，`part=15`（宋浩《高等数学》同济版 p15「1.8 函数的连续性与间断点」，视频时长 **39:26 = 2367s**）。

选材过程（踩过的坑）：B 站 `ranking`/`archive` 接口命中风控 `-352`；`bilisearch` 只回 AV 号、不带时长；国际源（BBC / TED / Feedburner）**全部不可达**（`http=000`）；小宇宙播客单集只有 2–7 分钟、机核 gapi 不返回音频地址。最终用 `api.bilibili.com/x/web-interface/view?aid=48624233` 拿到 195 个分 P 的**时长表**，挑出 >1500s 的 p15。

```bash
docker exec vbcd-asr-1 python3 /app/asr_probe.py \
  'https://www.bilibili.com/video/BV1Eb411u7Fw' 15 5400
```

终态 `succeeded`（07:11:30），原始 `stats`：

```json
{"download_ms":14763,"ffmpeg_ms":1555,"asr_ms":211255,"chunks":14,"total_ms":438833}
```

| 验收点 | 实测 | 判定 |
|---|---|---|
| `stats.chunks ≥ 5` | **14** 片（静音对齐，均长 ≈169s） | ✅ |
| 各片均成功 | 终态 `succeeded`，无 `partial` 告警块 | ✅ |
| 全文覆盖全片 | 首句 `1.0s` → 末句 `2364.253s`（片长 2367s）；时间轴**单调递增** | ✅ |
| 句级重组生效 | **364** 句（同源旧镜像只出 1 段） | ✅ |
| 语句覆盖时长 | 1907s / 2367s = **81%**（缺口为讲课静音间隙） | ✅ 合理 |

`text_len=7642` 字，单句样例：`{"i":0,"start":1.0,"end":4.92,"text":"那这部分的内容啊，叫做函数的连续性。","speaker":null}`。

## 4. V3 · 逐句 `[mm:ss]` 归档复跑（走 buddy 任务链路）

用**未被归档过**的 p15 提交（ASR 侧已有缓存 → 秒回，省掉重复下载）：

```bash
curl -s -X POST http://localhost/api/tasks -H 'Content-Type: application/json' \
  -d '{"type":"transcribe_url","payload":{"url":"https://www.bilibili.com/video/BV1Eb411u7Fw","part":15,"category":"learning","tags":["高数","函数连续性"]}}'
```

| 项 | 结果 |
|---|---|
| 任务 id | `1790637103273-8c23` |
| 终态 | `done`（07:11:43 提交 → 07:12:00 完成，约 30s，走缓存） |
| 归档产物 | `data/learning/2026-09-29-高等数学-同济版-2024年更新-宋浩老师-p15-1-8-函数的连续性与间断点.md` |
| 产物结构 | frontmatter（含 `source_url` / `hash` / `schema_version`）→ 来源行 → `## 摘要` → `## 要点` → `## 全文（带时间戳）` |
| 时间戳 | 首行 `[00:01]` → 末行 `[38:21]`（视频 39:26），共 **68 段**带时间戳 |
| LLM 整理 | 生效（正文标明「由 deepseek-v4.1-flash 整理」），有摘要 3–5 句 + 要点若干 |
| 计费口径 | 无第二份文件（同 URL 未重复归档） |

**关于「逐句」的精确口径**（避免误读）：ASR 返回 **364 句**，写盘时按 `server/src/services/transcribe.js:segmentsToTranscript` 的既定规则**把相邻间隔 < 2 秒的句子合并成一段、每段一行标段首时间戳** → 落成 68 段。`SPEC.md` §3.4 已写明该规则，**非文档漂移**。✅ 通过

## 5. 顺带跑的命令（当前工作区，含并发会话的 F14 代码）

| 命令 | 结果 | 备注 |
|---|---|---|
| `asr/.venv/bin/python -m pytest asr/tests -q`（**在仓库根**跑） | **48 passed**，6.70s | 在 `asr/` 目录内直接跑会 `ModuleNotFoundError: No module named 'asr'`（测试 import 的是包名） |
| `BASE_URL=http://localhost:3199 node scripts/smoke.mjs` | **20 通过 / 0 失败** | 需自起后端（`smoke.mjs` 不拉后端）；用 `DATA_DIR=/tmp/...` 临时目录，未碰真实数据 |
| 同上 + `SMOKE_FAKE_ASR_PORT=8099` | **29 通过 / 0 失败** | 转①–转⑨ 全绿 |

## 6. 补充验证：TTL 到期后缓存失效（同日补跑）

§3 只验了「TTL 内命中」。为了不留半边，另起一个**临时 asr 容器**（同镜像、`CACHE_TTL_SECONDS=20`、端口只绑 `127.0.0.1:8098`，不碰正式服务）：

```bash
docker run -d --name asr-ttl-test --env-file asr/.env \
  -e CACHE_TTL_SECONDS=20 -e JOBS_DIR=/app/jobs -p 127.0.0.1:8098:8000 vbcd-asr
```

| 次序 | 时机 | job_id | `stats` | 判定 |
|---|---|---|---|---|
| 第 1 次 | 冷启动 | `5a54692626c44127a9d1` | `{"download_ms":3871,"ffmpeg_ms":133,"asr_ms":11765,"chunks":1,"total_ms":27539}`（**无 `cache_hit`**） | 冷跑 |
| 第 2 次 | **等 30s（> TTL 20s）后** | `419ac09d9f8449ab9710`（**全新 job**） | `{"download_ms":3313,"ffmpeg_ms":214,"asr_ms":7933,"chunks":1,"total_ms":19398}`（**无 `cache_hit`**） | ✅ 已失效、完整重跑 |

两侧对照合起来才完整：**TTL 内**第二次是 0.127s 秒回 + `cache_hit:true`；**TTL 外**第二次是全新 job、重新下载（`download_ms` 重新出现）、无 `cache_hit`。验证后容器已 `docker rm -f`。

附带收获：该临时容器（就是本次重建后的镜像）对同一 70s 视频给出 **12 句**，与 `asr/PROBE.md` 的探针复核结论一致（旧镜像为 1 段）——再次交叉印证句级重组已生效。

## 7. 遗留 / 未做

- 未验证 **`ASR_MAX_AUDIO_SECONDS` 护栏在真实链路的拒绝行为**（只验证了 300s 硬上限的探针结论，见 `asr/PROBE.md`）。
- ~~未验证 TTL 到期后缓存失效~~ → **已补验**，见 §6（TTL 内外两侧都验到）。
- 前端仍无转写表单入口（`RUN.md` §4 已列为「不能做」），本次仍只有 curl / 任务接口入口。
- V1 素材是 B 站长课程，**未覆盖非 B 站直链的长音频**（直链路径只在 180s m4a 上隐式走过）。
