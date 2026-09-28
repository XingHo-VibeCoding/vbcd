# fun-asr-flash 主通道（PLAN §4.4）：逐片提交多模态生成端点。
# 请求体沿用 test5.py 实测可用的结构：messages → input_audio(data URI) + parameters(format/sample_rate)。
# 注意：日志中绝不出现 API Key 与 Base64 内容（验收标准 AC8）。
from __future__ import annotations

import asyncio
import base64
import random
from pathlib import Path
from typing import Any

import httpx

from ..config import Settings
from ..models import ServiceError

_ENDPOINT = "/api/v1/services/aigc/multimodal-generation/generation"


def build_payload(wav: Path, model: str, language: str | None = None) -> dict:
    """组装请求体（与 test5.py 实测结构一致）。Base64 只在内存里过一遍，不进日志。"""
    b64 = base64.b64encode(wav.read_bytes()).decode()
    params: dict[str, Any] = {"format": "wav", "sample_rate": "16000"}
    if language:
        params["language"] = language
    return {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_audio", "input_audio": {"data": f"data:audio/wav;base64,{b64}"}}
                    ],
                }
            ]
        },
        "parameters": params,
    }


def _sentence_objects(body: dict) -> list[dict]:
    """A1 实测格式：body.sentence / body.output.sentence，单个 dict 或 dict 列表，
    每个含 begin_time/end_time（毫秒）+ text + words[]。"""
    output = (body or {}).get("output") or {}
    for container in (output, body or {}):
        sent = container.get("sentence") or container.get("sentences")
        if isinstance(sent, dict):
            return [sent]
        if isinstance(sent, list) and sent and isinstance(sent[0], dict):
            return sent
    return []


def parse_result(body: dict, chunk_duration: float) -> dict:
    """把上游响应解析成 {text, segments, granularity, language}。
    segments 时间为本片内相对时间（秒）；上游不给时间戳时降级为整片一段（granularity=chunk）。
    实测（2026-09-28 探针）：返回 output.sentence{begin_time,end_time,text,words[]}，时间戳毫秒。"""
    output = (body or {}).get("output") or {}
    text, segments = "", []

    sents = _sentence_objects(body)
    if sents:
        for s in sents:
            seg_text = str(s.get("text") or "").strip()
            if not seg_text:
                continue
            segments.append(
                {
                    "start": _to_seconds(s.get("begin_time", 0)),
                    "end": _to_seconds(s.get("end_time", chunk_duration)),
                    "text": seg_text,
                    "speaker": s.get("speaker_id"),
                }
            )
        text = str(output.get("text") or body.get("text") or "").strip()
        if not text:
            text = "\n".join(s["text"] for s in segments)

    if not text and not segments:
        # 兜底：choices 风格 / 纯字符串（兼容性防御，实测未走到）
        choices = output.get("choices") or []
        content = (choices[0].get("message") or {}).get("content") if choices else output
        if isinstance(content, str):
            text = content.strip()
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    text += item["text"]
            text = text.strip()
        elif isinstance(content, dict):
            text = str(content.get("text") or "").strip()

    if not text and not segments:
        raise ServiceError("ASR_FAILED", "上游返回结构中没有转写文本", retryable=False)

    if segments:
        granularity = "sentence"
    else:
        # 只有整段文本：用整片边界作为唯一一段（A1 降级路径）
        segments = [{"start": 0.0, "end": float(chunk_duration), "text": text}]
        granularity = "chunk"

    usage = (body or {}).get("usage") or {}
    language = str(usage.get("language") or (body or {}).get("language") or "") or None
    return {"text": text, "segments": segments,
            "granularity": granularity, "language": language}


def _to_seconds(value: Any) -> float:
    """A1 实测：上游时间戳一律为毫秒（40s 片段返回 end_time=40000）。"""
    return float(value or 0) / 1000


def _upstream_code(resp: httpx.Response) -> str:
    """从错误响应体里抠 code（DashScope 风格 {"code": "...", "message": "..."}）。"""
    try:
        return str(resp.json().get("code") or "")
    except Exception:
        return ""


def _classify_http(resp: httpx.Response) -> ServiceError:
    """HTTP 错误 → 统一错误码。401/InvalidApiKey 不重试；429/Throttling/5xx 可重试。"""
    code = _upstream_code(resp)
    if resp.status_code in (401, 403) or code == "InvalidApiKey":
        return ServiceError(
            "AUTH_FAILED",
            "上游鉴权失败（Key 无效或欠费），已停止重试",
            hint="检查 DASHSCOPE_API_KEY 与账户额度",
        )
    if resp.status_code == 429 or "Throttling" in code:
        return ServiceError("RATE_LIMITED", f"上游限流（HTTP {resp.status_code} {code or ''}）".strip(), retryable=True)
    if resp.status_code >= 500:
        return ServiceError("ASR_FAILED", f"上游服务错误（HTTP {resp.status_code}）", retryable=True)
    return ServiceError("ASR_FAILED", f"上游拒绝请求（HTTP {resp.status_code} {code or ''}）".strip(), retryable=False)


async def transcribe_chunk(
    wav: Path,
    settings: Settings,
    *,
    language: str | None = None,
    client: httpx.AsyncClient | None = None,
    chunk_duration: float = 0.0,
) -> dict:
    """转写一个切片：重试（429/5xx/超时，指数退避+抖动，最多 asr_max_retries 次）。
    返回 {text, segments, granularity, language}；最终失败抛 ServiceError。"""
    if not settings.provider_configured:
        raise ServiceError(
            "AUTH_FAILED",
            "未配置上游 ASR Key（DASHSCOPE_API_KEY / MAAS_API_KEY）",
            hint="在 asr/.env 里填 DASHSCOPE_API_KEY 后重启",
        )

    # 体积闸门：超过 10MB Base64 上限的片直接失败（不切到这里就不会超，双保险）
    b64_bytes = wav.stat().st_size * 4 / 3
    if b64_bytes > settings.asr_max_b64_bytes:
        raise ServiceError(
            "ASR_FAILED",
            f"切片 Base64 体积约 {b64_bytes/1048576:.1f}MB，超过上限 {settings.asr_max_b64_bytes/1048576:.0f}MB",
            hint="调小 ASR_CHUNK_SECONDS",
        )

    url = f"{settings.maas_base_url.rstrip('/')}{_ENDPOINT}"
    headers = {"Authorization": f"Bearer {settings.dashscope_api_key}"}
    payload = build_payload(wav, settings.asr_model, language)

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=settings.asr_request_timeout)
    last_err: ServiceError | None = None

    try:
        for attempt in range(settings.asr_max_retries + 1):
            try:
                resp = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException:
                last_err = ServiceError("TIMEOUT", "ASR 请求超时", retryable=True)
            except httpx.HTTPError as err:
                last_err = ServiceError("ASR_FAILED", f"网络错误：{type(err).__name__}", retryable=True)
            else:
                if resp.status_code == 200:
                    try:
                        body = resp.json()
                    except Exception:
                        raise ServiceError("INTERNAL", "上游返回非 JSON", retryable=False)
                    return parse_result(body, chunk_duration)
                last_err = _classify_http(resp)

            if last_err and not last_err.retryable:
                raise last_err
            if attempt < settings.asr_max_retries:
                await asyncio.sleep((2 ** attempt) + random.uniform(0, 0.5))

        # 重试耗尽：限流单独报 RATE_LIMITED，其余归 ASR_FAILED
        if last_err and last_err.code == "RATE_LIMITED":
            raise ServiceError("RATE_LIMITED", "上游持续限流，重试已耗尽", retryable=True,
                               hint="稍后再试或调低 ASR_CHUNK_CONCURRENCY")
        raise last_err or ServiceError("ASR_FAILED", "转写失败（未知原因）")
    finally:
        if own_client:
            await client.aclose()


async def transcribe_chunks(
    chunks: list[dict],
    settings: Settings,
    *,
    language: str | None = None,
    on_progress=None,
) -> tuple[list[dict], str | None]:
    """逐片转写（片间默认串行；asr_chunk_concurrency>1 时用信号量并行）。
    返回 (chunk_results, detected_language)。任一片最终失败时抛带 details.partial 的错误。"""
    sem = asyncio.Semaphore(max(1, settings.asr_chunk_concurrency))
    results: list[dict] = [None] * len(chunks)  # type: ignore
    detected = language
    done_count = 0

    async with httpx.AsyncClient(timeout=settings.asr_request_timeout) as client:
        async def run_one(i: int, chunk: dict) -> None:
            nonlocal detected, done_count
            async with sem:
                res = await transcribe_chunk(
                    chunk["file"], settings, language=detected,
                    client=client, chunk_duration=chunk["duration"],
                )
                if detected is None and res.get("language"):
                    detected = res["language"]
                results[i] = {
                    "offset": chunk["start"],
                    "duration": chunk["duration"],
                    **res,
                }
                done_count += 1
                if on_progress:
                    on_progress(done_count, len(chunks))

        try:
            await asyncio.gather(*(run_one(i, c) for i, c in enumerate(chunks)))
        except ServiceError as err:
            # 单片段最终失败：job 置 failed，但把已完成片段挂到 error.details.partial，避免全量白跑（PLAN §3.4）
            completed = [r for r in results if r is not None]
            if completed:
                from ..audio import merge_chunk_results
                merged = merge_chunk_results(completed)
                if merged["text"]:
                    err.details = {"partial": {"text": merged["text"], "segments": merged["segments"]}}
            raise

    return results, detected
