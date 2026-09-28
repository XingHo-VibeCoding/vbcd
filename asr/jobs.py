# job 状态机 + 处理流水线编排（PLAN §4）。
# 布局：JOBS_DIR/<id>/    —— 临时目录（原媒体 / 归一化 wav / 切片），终态即删
#       JOBS_DIR/<id>.json —— 小体积 job 信封（状态 + 结果），TTL 到期由 GC 清理
# 单副本部署：进程内 _JOBS 为准，磁盘 JSON 供重启后仍能 GET 到终态结果。
from __future__ import annotations

import asyncio
import json
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import audio, cache, sources
from .config import Settings
from .models import JobEnvelope, Progress, ServiceError
from .providers import funasr

_JOBS: dict[str, dict] = {}
_INFLIGHT: dict[str, str] = {}   # 同源单飞：cache_key → job_id（并发提交同一源只真跑一次）
_GC_STARTED = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id() -> str:
    return uuid.uuid4().hex[:20]


def _job_dir(jobs_dir: Path, job_id: str) -> Path:
    return jobs_dir / job_id


def _state_file(jobs_dir: Path, job_id: str) -> Path:
    return jobs_dir / f"{job_id}.json"


def _persist(job: dict, settings: Settings) -> None:
    try:
        Path(settings.jobs_dir).mkdir(parents=True, exist_ok=True)
        _state_file(Path(settings.jobs_dir), job["job_id"]).write_text(
            json.dumps(job, ensure_ascii=False), "utf-8"
        )
    except Exception:
        pass  # 持久化失败不阻塞主链路（进程内状态仍可用）


def _set(job: dict, *, status=None, stage=None, done=None, total=None,
         error=None, result=None, settings: Settings) -> dict:
    if status is not None:
        job["status"] = status
    p = job["progress"]
    if stage is not None:
        p["stage"] = stage
    if done is not None:
        p["done"] = done
    if total is not None:
        p["total"] = total
    p["percent"] = round(100 * p["done"] / p["total"]) if p["total"] else 0
    if error is not None:
        job["error"] = error
    if result is not None:
        job["result"] = result
    job["updated_at"] = _now()
    _persist(job, settings)
    return job


async def _run_pipeline(job: dict, source: str, options: dict, settings: Settings) -> None:
    """下载 → 归一化 → 切片 → 逐片转写 → 合并 → 缓存。终态统一清理临时目录。"""
    job_id = job["job_id"]
    jobs_dir = Path(settings.jobs_dir)
    work = _job_dir(jobs_dir, job_id)
    work.mkdir(parents=True, exist_ok=True)
    stats: dict[str, Any] = {}
    warnings: list[str] = []

    try:
        t0 = time.monotonic()
        info = await sources.fetch_source(source, options.get("part"), work, settings)
        stats["download_ms"] = int((time.monotonic() - t0) * 1000)

        _set(job, status="running", stage="normalize", settings=settings)
        t0 = time.monotonic()
        wav = work / "normalized.wav"
        await audio.normalize(info.file, wav)
        duration = await audio.probe_duration(wav)
        if info.duration_sec is None:
            info.duration_sec = duration
        stats["ffmpeg_ms"] = int((time.monotonic() - t0) * 1000)

        _set(job, stage="chunk", settings=settings)
        silences = await audio.detect_silences(wav)
        plan, warn = audio.plan_chunks(
            duration, settings.asr_chunk_seconds, silences,
            settings.asr_silence_window_seconds,
        )
        warnings.extend(warn)
        chunks = await audio.split_wav(wav, plan, work)

        _set(job, stage="transcribe", total=len(chunks), done=0, settings=settings)
        t0 = time.monotonic()
        chunk_results, language = await funasr.transcribe_chunks(
            chunks, settings,
            language=options.get("language"),
            on_progress=lambda d, t: _set(job, stage="transcribe", done=d, total=t, settings=settings),
        )
        stats["asr_ms"] = int((time.monotonic() - t0) * 1000)
        stats["chunks"] = len(chunks)

        _set(job, stage="merge", settings=settings)
        merged = audio.merge_chunk_results(chunk_results)
        stats["total_ms"] = int((time.monotonic() - t0) * 1000) + stats["asr_ms"] + stats["ffmpeg_ms"] + stats["download_ms"]

        result = {
            "source": {
                "kind": info.kind, "input": info.input, "platform": info.platform,
                "id": info.id, "title": info.title, "uploader": info.uploader,
                "duration_sec": info.duration_sec, "webpage_url": info.webpage_url,
                "thumbnail": info.thumbnail, "part": info.part,
            },
            "language": language or options.get("language") or "unknown",
            "text": merged["text"],
            "segments": merged["segments"],
            "timestamp_granularity": merged["granularity"],
            "stats": stats,
            "warnings": warnings,
        }
        cache.put(cache.cache_key(source, options), result, settings.cache_ttl_seconds, jobs_dir)
        _set(job, status="succeeded", stage="merge", done=len(chunks),
             total=len(chunks), result=result, settings=settings)
    except ServiceError as err:
        _set(job, status="failed",
             error={"code": err.code, "message": err.message, "retryable": err.retryable,
                    "hint": err.hint, "details": err.details},
             settings=settings)
    except Exception as err:  # 绝不裸崩（PLAN 核心要求）
        _set(job, status="failed",
             error={"code": "INTERNAL", "message": f"未预期错误：{type(err).__name__} {err}",
                    "retryable": False, "hint": "查看服务日志"},
             settings=settings)
    finally:
        # 终态即删临时目录（原媒体 / wav / 切片全清），仅保留 job JSON
        shutil.rmtree(work, ignore_errors=True)


async def submit(source: str, options: dict, settings: Settings) -> tuple[dict, bool]:
    """提交转写。返回 (job, cache_hit)。同源并发单飞：同一 cache_key 只真跑一次。"""
    key = cache.cache_key(source, options)
    jobs_dir = Path(settings.jobs_dir)

    hit = cache.get(key, settings.cache_ttl_seconds, jobs_dir)
    if hit is not None:
        hit = {**hit, "stats": {**hit.get("stats", {}), "cache_hit": True}}
        job = {
            "job_id": new_id(), "status": "succeeded",
            "progress": {"stage": "merge", "done": 1, "total": 1, "percent": 100},
            "created_at": _now(), "updated_at": _now(), "result": hit, "error": None,
        }
        _JOBS[job["job_id"]] = job
        _persist(job, settings)
        return job, True

    inflight_id = _INFLIGHT.get(key)
    if inflight_id:
        existing = get(inflight_id, settings)
        if existing and existing["status"] in ("queued", "running"):
            return existing, False  # 跟随者拿到同一个 job_id，不重复下载/转写

    job = {
        "job_id": new_id(), "status": "queued",
        "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
        "created_at": _now(), "updated_at": _now(), "result": None, "error": None,
        "_key": key,
    }
    _JOBS[job["job_id"]] = job
    _persist(job, settings)

    _INFLIGHT[key] = job["job_id"]
    asyncio.create_task(_run_and_release(job, source, options, settings, key))
    return job, False


async def _run_and_release(job: dict, source: str, options: dict, settings: Settings, key: str) -> None:
    try:
        await _run_pipeline(job, source, options, settings)
    finally:
        if _INFLIGHT.get(key) == job["job_id"]:
            _INFLIGHT.pop(key, None)
        job.pop("_key", None)


def get(job_id: str, settings: Settings) -> dict | None:
    """取 job 信封：先进程内，再磁盘（重启后终态结果仍可读）。"""
    job = _JOBS.get(job_id)
    if job is None:
        path = _state_file(Path(settings.jobs_dir), job_id)
        try:
            job = json.loads(path.read_text("utf-8"))
            _JOBS[job_id] = job
        except Exception:
            return None
    return {k: v for k, v in job.items() if not k.startswith("_")}


def delete(job_id: str, settings: Settings) -> bool:
    """立即清理：job JSON + 临时目录全删。返回是否真的删到了东西。"""
    removed = False
    job = _JOBS.pop(job_id, None)
    if job is not None:
        removed = True
    path = _state_file(Path(settings.jobs_dir), job_id)
    if path.exists():
        path.unlink()
        removed = True
    work = _job_dir(Path(settings.jobs_dir), job_id)
    if work.is_dir():
        shutil.rmtree(work, ignore_errors=True)
        removed = True
    return removed


async def gc_loop(settings: Settings, interval: int = 60) -> None:
    """后台 GC：清超过 JOB_TTL_SECONDS 的终态 job JSON + 过期缓存。"""
    while True:
        await asyncio.sleep(interval)
        try:
            now = time.time()
            for path in Path(settings.jobs_dir).glob("*.json"):
                try:
                    job = json.loads(path.read_text("utf-8"))
                    if job.get("status") in ("succeeded", "failed"):
                        updated = datetime.fromisoformat(
                            str(job.get("updated_at", "")).replace("Z", "+00:00")
                        ).timestamp()
                        if now - updated > settings.job_ttl_seconds:
                            delete(job["job_id"], settings)
                except Exception:
                    continue
            removed = cache.gc(Path(settings.jobs_dir))
            if removed:
                pass  # 数量写进日志由调用方决定；这里保持静默
        except Exception:
            continue  # GC 出错绝不带出循环
