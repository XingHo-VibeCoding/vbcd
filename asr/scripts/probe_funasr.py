#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fun-asr 探针（PLAN.md 第 6 章「第 0 步」）：回答三个必须先实测的问题。

    A1  多模态 generation 端点是否返回**句级时间戳**？
        → 有：时间戳精度标 sentence；只有整段文本：标 chunk；完全没有：标 none。
    A2  单请求 Base64 体积边界与**时长上限**各是多少？
        → 据此校正 ASR_CHUNK_SECONDS 默认值与闸门数值。
    A3  限流（429）的 HTTP 状态与错误 code 长什么样？
        → 用于重试判定表（默认不跑，加 --burst N 才跑）。

本脚本**不进主链路**，只落盘到 asr/.tmp-probe/（已被 .gitignore 的 .tmp-* 规则忽略）。
用法（不需要装依赖到项目里，用现成的 conda 环境即可）：

    # 用本地已有音轨（最省事，不重复下载）
    /home/bird/miniconda3/envs/llmp/bin/python asr/scripts/probe_funasr.py \\
        --local-file /home/bird/work/LLMP/laya/downloads/t1.mp3

    # 或者给一个链接，脚本自己用 yt-dlp 取音轨
    /home/bird/miniconda3/envs/llmp/bin/python asr/scripts/probe_funasr.py \\
        --url https://www.bilibili.com/video/BV1iYea6zEVC

    # 顺带观察限流（会额外发 N 个并发请求，费额度，按需再跑）
    ... --burst 6

Key 来源：环境变量 DASHSCOPE_API_KEY / MAAS_API_KEY，或 asr/.env（见 asr/.env.example）。
脚本只打印密钥是否存在，**绝不打印密钥本身与 Base64 内容**。
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as futures
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:  # 依赖缺失时给一句人话，而不是抛栈
    sys.exit("缺少 requests：请用 /home/bird/miniconda3/envs/llmp/bin/python 运行本脚本")

CST = timezone(timedelta(hours=8))
GEN_PATH = "/api/v1/services/aigc/multimodal-generation/generation"
HTTP_TIMEOUT = 300

# 判定时间戳结构时认这些字段名（大小写不敏感）
SENTENCE_KEYS = ("sentence", "sentences", "sentence_info", "sentence_id")
TIME_KEYS = ("begin", "end", "begin_time", "end_time", "start", "timestamp", "start_time", "time", "sentence_end")


# ---------------------------------------------------------------- 基础设施

def load_env_file(path: Path) -> None:
    """极简 .env 读取（只填 os.environ 里没有的键）：不引第三方依赖，也不覆盖已有值。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip("'\"")
        if key and value and not os.environ.get(key):
            os.environ[key] = value


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"命令失败：{' '.join(cmd[:3])}…\n{proc.stderr.strip()[:800]}")


def duration_of(path: Path) -> float | None:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return None


def download_audio(url: str, workdir: Path) -> Path:
    """yt-dlp 只取音轨；文件名带平台 id，避免同名互相覆盖（test5 的 outtmpl="t1" 就踩过）。"""
    try:
        import yt_dlp  # noqa: PLC0415  —— 只有给链接时才需要，本地文件不需要这个依赖
    except ImportError:
        sys.exit("缺少 yt_dlp：请改用 --local-file，或用 /home/bird/miniconda3/envs/llmp/bin/python 运行")

    opts = {
        "outtmpl": str(workdir / "%(id)s.%(ext)s"),
        "format": "bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "http_headers": {"Referer": "https://www.bilibili.com/", "User-Agent": "Mozilla/5.0"},
    }
    if os.environ.get("YTDLP_COOKIES_FILE"):
        opts["cookiefile"] = os.environ["YTDLP_COOKIES_FILE"]
    if os.environ.get("YTDLP_PROXY"):
        opts["proxy"] = os.environ["YTDLP_PROXY"]

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = Path(ydl.prepare_filename(info))
    print(f"  下载完成：{path.name}（{duration_of(path) or 0:.1f} 秒）")
    return path


def normalize(src: Path, dst: Path) -> Path:
    """归一化为 16k / 单声道 / pcm_s16le —— 声明与实际一致的音频格式。"""
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)])
    return dst


def cut(src: Path, dst: Path, seconds: int, *, codec: str = "wav", bitrate: str | None = None) -> Path:
    cmd = ["ffmpeg", "-v", "error", "-y", "-t", str(seconds), "-i", str(src)]
    if codec == "wav":
        cmd += ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"]
    else:  # mp3：用于「同样的体积塞更长时间」，单独回答有无时长上限
        cmd += ["-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", bitrate or "32k"]
    run(cmd + [str(dst)])
    return dst


# ---------------------------------------------------------------- 调用与判定

def submit(path: Path, *, key: str, base_url: str, model: str, fmt: str, timeout: int) -> dict:
    """提交单个音频文件，返回一条可落盘的记录（不含 Base64 原文）。"""
    raw = path.read_bytes()
    data = f"data:audio/{fmt};base64," + base64.b64encode(raw).decode()
    payload = {
        "model": model,
        "input": {"messages": [{"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": data}}]}]},
        "parameters": {"format": fmt, "sample_rate": "16000"},
    }
    record = {
        "file": path.name,
        "audio_seconds": round(duration_of(path) or 0, 1),
        "raw_mb": round(len(raw) / 1024 / 1024, 2),
        "b64_mb": round(len(data) / 1024 / 1024, 2),
    }
    started = time.time()
    try:
        resp = requests.post(
            f"{base_url}{GEN_PATH}",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as err:  # 网络层失败也算结论，不能裸崩
        record |= {"http": 0, "error_kind": type(err).__name__, "message": str(err)[:300], "elapsed_ms": int((time.time() - started) * 1000)}
        return record

    record["elapsed_ms"] = int((time.time() - started) * 1000)
    record["http"] = resp.status_code
    record["headers"] = {k.lower(): v for k, v in resp.headers.items() if k.lower() in ("retry-after", "x-ratelimit-limit", "x-ratelimit-remaining")}
    try:
        body = resp.json()
    except ValueError:
        record |= {"error_kind": "NON_JSON", "message": resp.text[:300]}
        return record

    record["response"] = body
    record["code"] = str(body.get("code") or (body.get("error") or {}).get("code") or "")
    record["message"] = str(body.get("message") or (body.get("error") or {}).get("message") or "")[:300]
    # 这套接口超限时是「静默拒绝」：HTTP 400 + text 为空 + 没有 code/message，只能这样判
    text = str(body.get("text") or "")
    record["text_len"] = len(text.strip())
    record["text_empty"] = not text.strip()
    return record


def find_key(node, key: str, path: str = "") -> list[tuple[str, object]]:
    """按字段名找节点（与 walk 不同：不截断列表，能完整看到 words[] 这类长数组）。"""
    hits: list[tuple[str, object]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            here = f"{path}.{k}" if path else str(k)
            if k == key:
                hits.append((here, v))
            hits += find_key(v, key, here)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            hits += find_key(v, key, f"{path}[{i}]")
    return hits


def walk(node, prefix: str = "") -> list[tuple[str, object]]:
    """把嵌套 JSON 摊平成 (路径, 值) 列表，用来找时间戳字段在哪。"""
    flat: list[tuple[str, object]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            flat += walk(v, f"{prefix}.{k}" if prefix else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node[:5]):  # 只探前 5 个元素即可判断结构
            flat += walk(v, f"{prefix}[{i}]")
    else:
        flat.append((prefix, node))
    return flat


SENTENCE_END_CHARS = "。！？!?…；;"


def reconstruct_sentences(sentence_obj: dict, sample: int = 3) -> dict:
    """把 words[]（词级、毫秒）按标点重组为句级时间戳 —— 这是 S3 解析的核心算法，先在探针里验证。

    返回 {count, samples:[{start,end,text}], monotonic, covered_text_len}；start/end 已换算成秒。
    """
    words = sentence_obj.get("words") or []
    if not words:
        return {"count": 0, "samples": [], "monotonic": False, "covered_text_len": 0}

    sentences: list[dict] = []
    buf: list[str] = []
    start_ms: int | None = None
    end_ms: int | None = None

    def flush() -> None:
        nonlocal buf, start_ms, end_ms
        text = "".join(buf).strip()
        if text and start_ms is not None:
            sentences.append({"start": round(start_ms / 1000, 2), "end": round((end_ms or start_ms) / 1000, 2), "text": text})
        buf, start_ms, end_ms = [], None, None

    for w in words:
        if buf == []:
            start_ms = int(w.get("begin_time") or 0)
        buf.append(str(w.get("text") or ""))
        punct = str(w.get("punctuation") or "")
        if punct:
            buf.append(punct)
        end_ms = int(w.get("end_time") or 0)
        if punct and any(ch in SENTENCE_END_CHARS for ch in punct):
            flush()
    flush()

    starts = [s["start"] for s in sentences]
    return {
        "count": len(sentences),
        "samples": sentences[:sample],
        "monotonic": starts == sorted(starts),
        "covered_text_len": sum(len(s["text"]) for s in sentences),
    }


def classify(body: object, audio_seconds: float | None = None) -> dict:
    """按实测结构判定时间戳精度，并留下证据路径。

    真实结构（2026-09-28 实测 fun-asr-flash-2026-06-15）：
        body.sentence = {sentence_id, begin_time, end_time, text, channel_id, speaker_id, sentence_end, words[]}
        body.output.sentence = 同上（重复一份）；body.usage.duration = 音频秒数
        → 「sentence」是**整片一个对象**，真正的时间戳在 words[] 里（毫秒，带 punctuation）。
        所以句级时间戳必须由 words 按标点重组得到。
    """
    flat = walk(body)
    sentence_hits = [(p, v) for p, v in flat if any(s in p.lower() for s in SENTENCE_KEYS)]
    time_hits = [(p, v) for p, v in flat if any(p.lower().endswith(k) for k in TIME_KEYS) and isinstance(v, (int, float))]
    words_lists = [(p, v) for p, v in find_key(body, "words") if isinstance(v, list)]
    sentence_objs = [(p, v) for p, v in find_key(body, "sentence") if isinstance(v, dict)]

    texts = [(p, v) for p, v in flat if isinstance(v, str) and len(v) > 20]
    longest = max(texts, key=lambda kv: len(kv[1]), default=("", ""))

    max_time = max((v for _, v in time_hits), default=0)
    time_unit = "unknown"
    if audio_seconds:
        time_unit = "ms" if max_time > audio_seconds * 2 else "s"

    if words_lists:
        granularity = "sentence"  # 可由词级 + punctuation 精确重组出句级
    elif sentence_hits and time_hits:
        granularity = "sentence"
    elif time_hits:
        granularity = "chunk"
    else:
        granularity = "none"

    return {
        "granularity": granularity,
        "time_unit": time_unit,
        "has_word_timestamps": bool(words_lists),
        "word_count": len(words_lists[0][1]) if words_lists else 0,
        "sentence_obj_paths": [p for p, _ in sentence_objs][:4],
        "sentence_obj_count": len(sentence_objs),
        "usage_duration": (body.get("usage") or {}).get("duration") if isinstance(body, dict) else None,
        "sentence_fields": [p for p, _ in sentence_hits[:8]],
        "time_fields": [p for p, _ in time_hits[:8]],
        "text_path": longest[0],
        "text_preview": longest[1][:200],
        "top_keys": list(body.keys()) if isinstance(body, dict) else [],
    }


# ---------------------------------------------------------------- 主流程

def main() -> int:
    ap = argparse.ArgumentParser(description="fun-asr 探针：A1 时间戳 / A2 体积与时长边界 / A3 限流特征")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--url", help="平台页链接（用 yt-dlp 取音轨）")
    src.add_argument("--input", "--local-file", dest="local_file", help="本地已有音视频文件（跳过下载）；与 --input 同义，兼容 RUN.md 里的写法")
    ap.add_argument("--big", action="store_true", help="兼容旧用法：不改其他参数，仅把默认台阶换成体积/时长边界那几档")
    ap.add_argument("--steps", default="120,180,210,240,300", help="A2 的 wav 切片时长（秒），逗号分隔")
    ap.add_argument("--long-test-seconds", type=int, default=600, help="A2 的单条 mp3 长音频时长（秒），0 = 跳过；等价于 --mp3-steps 只写一个值")
    ap.add_argument("--mp3-steps", default="", help="A2 的 mp3 时长台阶（秒，逗号分隔）；给empty 时用 --long-test-seconds")
    ap.add_argument("--repeat", type=int, default=1, help="源音频不足时把它循环拼接 N 次当长音频（用于测体积/时长边界，不重复下载）")
    ap.add_argument("--burst", type=int, default=0, help="A3：并发发 N 个请求观察限流；0 = 跳过")
    ap.add_argument("--out", default="asr/.tmp-probe", help="探针产物目录（默认已被 .gitignore 忽略）")
    ap.add_argument("--timeout", type=int, default=HTTP_TIMEOUT, help="单次请求超时（秒）")
    args = ap.parse_args()

    load_env_file(Path("asr/.env"))
    load_env_file(Path(__file__).resolve().parents[1] / ".env")

    key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("MAAS_API_KEY") or ""
    base_url = os.environ.get("MAAS_BASE_URL", "https://maas.qianwenaiapi.com").rstrip("/")
    model = os.environ.get("ASR_MODEL", "fun-asr-flash-2026-06-15")
    if not key:
        sys.stderr.write("未找到 DASHSCOPE_API_KEY / MAAS_API_KEY（可写在 asr/.env 里，见 asr/.env.example）\n")
        return 1
    for exe in ("ffmpeg", "ffprobe"):
        if not which(exe):
            sys.exit(f"缺少 {exe}：请先安装 ffmpeg（本机在 /usr/bin/{exe}）")

    if not args.url and not args.local_file:
        ap.error("需要 --url 或 --local-file 之一")

    if args.big:
        args.steps = args.steps if args.steps != "120,180,210,240,300" else "180,240,300"
        args.mp3_steps = args.mp3_steps or "300,305,330,600"

    stamp = datetime.now(CST).strftime("%Y%m%d-%H%M%S")
    outdir = Path(args.out) / stamp
    (outdir / "raw").mkdir(parents=True, exist_ok=True)
    print(f"探针开始 → {outdir}")
    print(f"  端点：{base_url}{GEN_PATH}\n  模型：{model}\n  Key：已设置（长度 {len(key)}，不打印内容）")

    if args.local_file:
        media = Path(args.local_file).expanduser().resolve()
        if not media.exists():
            sys.exit(f"本地文件不存在：{media}")
        print(f"  来源：本地文件 {media.name}")
    else:
        print(f"  来源：{args.url}")
        media = download_audio(args.url, outdir)

    summary: dict = {
        "generated_at": datetime.now(CST).isoformat(timespec="seconds"),
        "base_url": base_url,
        "model": model,
        "source": str(media),
        "source_seconds": round(duration_of(media) or 0, 1),
    }

    normalized = normalize(media, outdir / "normalized-16k-mono.wav")
    print(f"  归一化完成：{normalized.name}（{summary['source_seconds']:.1f} 秒）")

    # 源音频太短时把它循环拼接，专门用来回答 A2 的「体积/时长边界」（内容重复不影响边界判定）
    if args.repeat > 1:
        looped = outdir / f"normalized-x{args.repeat}.wav"
        run(["ffmpeg", "-v", "error", "-y", "-stream_loop", str(args.repeat - 1), "-i", str(normalized), "-c", "copy", str(looped)])
        normalized = looped
        print(f"  循环拼接 ×{args.repeat} → {duration_of(normalized) or 0:.1f} 秒（仅用于 A2 边界测试）")
    probe_seconds = round(duration_of(normalized) or 0, 1)
    summary["probe_seconds"] = probe_seconds

    # ---- A2 + A1：wav 切片，逐个体积台阶试；最小的那片用来判定时间戳结构
    steps = [int(s) for s in args.steps.split(",") if s.strip()]
    if steps and probe_seconds and probe_seconds < max(steps):
        steps = [s for s in steps if s <= int(probe_seconds)] or [int(probe_seconds)]

    table = []
    first_body = None
    if not steps:
        print("  A2 wav 台阶为空：跳过 wav 体积测试")
    for seconds in steps:
        clip = cut(normalized, outdir / f"clip-{seconds}s.wav", seconds)
        rec = submit(clip, key=key, base_url=base_url, model=model, fmt="wav", timeout=args.timeout)
        table.append(rec)
        (outdir / "raw" / f"wav-{seconds}s.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
        ok = rec.get("http") == 200 and not rec.get("text_empty")
        print(
            f"  A2 wav {seconds:>4}s  b64 {rec['b64_mb']:>5.2f}MB → HTTP {rec.get('http')}  "
            f"{'空结果（被静默拒绝）' if rec.get('text_empty') else f'文本 {rec.get("text_len", 0)} 字'}  {rec.get('message', '')[:50]}"
        )
        if ok and first_body is None:
            first_body = rec.get("response")
    summary["a2_wav"] = table
    # wav 台阶全被拒时（如只跑 mp3 时长测试），用 mp3 的成功响应来判定 A1 结构
    if first_body is None:
        for rec in table:
            if rec.get("http") == 200 and not rec.get("text_empty"):
                first_body = rec.get("response")
                break

    # ---- A2（时长上限）：mp3 32kbps 体积极小，用来看「跟体积无关的时长限幅」
    mp3_steps = [int(s) for s in args.mp3_steps.split(",") if s.strip()] if args.mp3_steps else []
    if not mp3_steps and args.long_test_seconds:
        mp3_steps = [args.long_test_seconds]

    mp3_table = []
    for seconds in mp3_steps:
        if probe_seconds < seconds:
            print(f"  A2 mp3 {seconds:>4}s 跳过：探测音频只有 {probe_seconds:.0f} 秒")
            continue
        clip = cut(normalized, outdir / f"clip-{seconds}s.mp3", seconds, codec="mp3", bitrate="32k")
        rec = submit(clip, key=key, base_url=base_url, model=model, fmt="mp3", timeout=args.timeout)
        mp3_table.append(rec)
        (outdir / "raw" / f"mp3-{seconds}s.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
        # 400 空 sentence 是这套接口「静默拒绝」的形态：没有 code、没有 message，只能靠 text 是否为空判断
        empty = not str((rec.get("response") or {}).get("text") or "").strip()
        print(
            f"  A2 mp3 {seconds:>4}s  b64 {rec['b64_mb']:>5.2f}MB → HTTP {rec.get('http')}  "
            f"{'空结果（被静默拒绝）' if empty else '有文本'}  {rec.get('message', '')[:50]}"
        )
    summary["a2_mp3"] = mp3_table
    if first_body is None:
        for rec in mp3_table:
            if rec.get("http") == 200 and not rec.get("text_empty"):
                first_body = rec.get("response")
                break

    # ---- A1：拿第一条成功响应的结构判定
    if first_body is not None:
        a1 = classify(first_body, audio_seconds=probe_seconds)
        sentence_obj = (first_body.get("output") or first_body).get("sentence") if isinstance(first_body, dict) else None
        if isinstance(sentence_obj, dict) and sentence_obj.get("words"):
            a1["sentence_reconstruction"] = reconstruct_sentences(sentence_obj)
        summary["a1"] = a1
        print(f"\n  A1 时间戳精度判定：{a1['granularity']}（时间单位 {a1['time_unit']}，词级 {a1['has_word_timestamps']} × {a1['word_count']}）")
        print(f"     句级字段：{a1['sentence_fields'] or '（无）'}")
        print(f"     时间字段：{a1['time_fields'] or '（无）'}")
        print(f"     文本预览：{a1['text_preview'][:80]}")
        rec = a1.get("sentence_reconstruction")
        if rec:
            print(f"     词→句重组：{rec['count']} 句，时间轴单调 {rec['monotonic']}，覆盖 {rec['covered_text_len']} 字（原文本 {len(a1['text_preview'])} 字预览）")
            for s in rec["samples"]:
                print(f"       [{s['start']:.1f}s → {s['end']:.1f}s] {s['text'][:50]}")
    else:
        summary["a1"] = {"granularity": "unknown", "reason": "所有 wav 切片都没成功，无法判定"}
        print("\n  A1 判定失败：没有成功的响应")

    # ---- A3：并发观察限流（可选）
    if args.burst and steps:
        clip = cut(normalized, outdir / f"clip-{min(steps)}s.wav", min(steps))
        print(f"\n  A3 并发 {args.burst} 个请求（会费额度）…")
        with futures.ThreadPoolExecutor(max_workers=args.burst) as pool:
            jobs = [pool.submit(submit, clip, key=key, base_url=base_url, model=model, fmt="wav", timeout=args.timeout) for _ in range(args.burst)]
            burst = [job.result() for job in jobs]
        summary["a3"] = [
            {"http": r.get("http"), "code": r.get("code"), "elapsed_ms": r.get("elapsed_ms"), "headers": r.get("headers", {})} for r in burst
        ]
        (outdir / "raw" / "burst.json").write_text(json.dumps(burst, ensure_ascii=False, indent=2), encoding="utf-8")
        for r in summary["a3"]:
            print(f"     HTTP {r['http']}  {r['code']}  {r['elapsed_ms']}ms  {r['headers']}")

    (outdir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结论已落盘：{outdir / 'summary.json'}（原始响应在 {outdir / 'raw'}/）")
    print("请把 A1/A2/A3 的结论回填到 asr/PROBE.md 的结论表，并据此校正 asr/.env.example 的默认值。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
