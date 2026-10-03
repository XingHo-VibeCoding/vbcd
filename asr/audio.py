# 音频处理（PLAN §4.2–4.5）：ffprobe 时长 → ffmpeg 归一化 16k/单声道/wav
# → 静音对齐切片（找不到静音回退定长）→ 合并结果时按「实际片长」累计偏移。
import asyncio
import json
import re
from pathlib import Path

from .models import ServiceError

_DURATION_RE = re.compile(r'"duration"\s*:\s*"([\d.]+)"')
_SILENCE_RE = re.compile(r"silence_(start|end):\s*([\d.]+)")


async def _run(cmd: list[str], missing_code: str = "INTERNAL") -> tuple[str, str]:
    """跑外部命令；FileNotFoundError → FFMPEG_MISSING；非零返回 → ServiceError。"""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
    except FileNotFoundError:
        raise ServiceError(
            "FFMPEG_MISSING",
            f"找不到命令 {cmd[0]}，请先安装 ffmpeg（含 ffprobe）",
            hint="Debian/Ubuntu: apt install ffmpeg",
        )
    if proc.returncode != 0:
        tail = err.decode("utf-8", "replace")[-400:] if err else ""
        raise ServiceError(missing_code, f"{cmd[0]} 执行失败：{tail.strip() or '无输出'}")
    return out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


async def probe_duration(file: Path) -> float:
    """ffprobe 取媒体时长（秒）；失败抛 FFMPEG_MISSING 或 DOWNLOAD_FAILED。"""
    out, _ = await _run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams", str(file),
        ],
        missing_code="DOWNLOAD_FAILED",
    )
    m = _DURATION_RE.search(out)
    if not m:
        raise ServiceError("DOWNLOAD_FAILED", "无法读取媒体时长（文件可能损坏）")
    return float(m.group(1))


async def normalize(src: Path, dst: Path) -> None:
    """统一转 16kHz 单声道 pcm_s16le wav —— 与送给 ASR 的 sample_rate 声明一致。"""
    await _run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", str(src),
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst),
        ],
        missing_code="ASR_FAILED",
    )


async def detect_silences(wav: Path, noise_db: str = "-35dB", min_silence: float = 0.5) -> list[tuple[float, float]]:
    """ffmpeg silencedetect → [(start,end)] 静音区间表（供切点对齐）。"""
    _, err = await _run(
        [
            "ffmpeg", "-v", "info", "-i", str(wav),
            "-af", f"silencedetect=noise={noise_db}:d={min_silence}",
            "-f", "null", "-",
        ],
        missing_code="ASR_FAILED",
    )
    silences: list[tuple[float, float]] = []
    pending: float | None = None
    for kind, value in _SILENCE_RE.findall(err):
        if kind == "start":
            pending = float(value)
        elif pending is not None:
            silences.append((pending, float(value)))
            pending = None
    return silences


def plan_chunks(
    duration: float,
    chunk_seconds: int,
    silences: list[tuple[float, float]],
    window: int = 20,
) -> tuple[list[tuple[float, float]], list[str]]:
    """纯函数（可单测）：按时长 + 静音区间规划切点。
    每个标称切点（chunk_seconds 的倍数）在其 ±window 内找静音中点；
    找不到就用标称点直接定长切，并记 warning。返回 [(start,end)] 与 warnings。"""
    if duration <= chunk_seconds:
        return [(0.0, duration)], []

    bounds: list[float] = [0.0]
    warnings: list[str] = []
    cursor = 0.0
    idx = 1
    while duration - cursor > chunk_seconds:
        nominal = cursor + chunk_seconds
        lo, hi = nominal - window, nominal + window
        # 取落在窗口内、最靠近标称点的静音区间中点
        candidates = [
            (s + e) / 2 for s, e in silences
            if lo <= (s + e) / 2 <= hi and (s + e) / 2 > cursor + 1
        ]
        if candidates:
            cut = min(candidates, key=lambda c: abs(c - nominal))
        else:
            cut = nominal
            warnings.append(f"片 {idx} 附近 ±{window}s 无静音边界，回退为定长切分")
        bounds.append(round(cut, 3))
        cursor = cut
        idx += 1
    bounds.append(duration)

    chunks = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]
    return chunks, warnings


async def split_wav(wav: Path, chunks: list[tuple[float, float]], out_dir: Path) -> list[dict]:
    """按规划切片：ffmpeg -ss/-to + pcm_s16le 重写出每片，返回
    [{index, file, start, duration}]——offset 用实际片长累计而非标称值，避免漂移。"""
    results: list[dict] = []
    for i, (start, end) in enumerate(chunks):
        dst = out_dir / f"chunk-{i:04d}.wav"
        await _run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
                "-i", str(wav), "-c:a", "pcm_s16le", str(dst),
            ],
            missing_code="ASR_FAILED",
        )
        actual = await probe_duration(dst)
        results.append({"index": i, "file": dst, "start": start, "duration": actual})
    return results


def fmt_timestamp(seconds: float) -> str:
    """合并展示用的 [mm:ss] / [h:mm:ss] 时间戳。"""
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _srt_ts(seconds: float) -> str:
    """SRT 时间戳 HH:MM:SS,mmm（恒带小时与毫秒，逗号分隔，标准 SRT 格式）。"""
    ms = max(0, int(round(seconds * 1000)))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(segments: list[dict]) -> str:
    """segments（{start, end, text}，秒）→ SRT 字幕文本；空段跳过、序号连续。"""
    out: list[str] = []
    n = 0
    for seg in segments or []:
        text = str((seg or {}).get("text") or "").strip()
        if not text:
            continue
        n += 1
        start = _srt_ts(float(seg.get("start") or 0))
        end = _srt_ts(float(seg.get("end") or seg.get("start") or 0))
        out.append(f"{n}\n{start} --> {end}\n{text}\n")
    return "\n".join(out)


def merge_chunk_results(chunk_results: list[dict]) -> dict:
    """合并逐片转写结果：时间戳平移（offset 已带实际片长）、排序、去空。
    返回 {text, segments, granularity}；granularity 取各片里最低的一档。"""
    segments: list[dict] = []
    texts: list[str] = []
    order = ["none", "chunk", "sentence"]
    granularity = "sentence"

    for chunk in sorted(chunk_results, key=lambda c: c["offset"]):
        offset = chunk["offset"]
        for seg in chunk.get("segments") or []:
            text = str(seg.get("text") or "").strip()
            if not text:
                continue
            segments.append(
                {
                    "i": len(segments),
                    "start": round(float(seg["start"]) + offset, 3),
                    "end": round(float(seg["end"]) + offset, 3),
                    "text": text,
                    "speaker": seg.get("speaker"),
                }
            )
        chunk_text = str(chunk.get("text") or "").strip()
        if chunk_text:
            texts.append(chunk_text)
        g = chunk.get("granularity", "sentence")
        if order.index(g) < order.index(granularity):
            granularity = g

    segments.sort(key=lambda s: (s["start"], s["end"]))
    for i, seg in enumerate(segments):
        seg["i"] = i

    return {
        "text": "\n".join(texts),
        "segments": segments,
        "granularity": granularity if segments else "none",
    }
