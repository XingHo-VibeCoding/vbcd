# 路由、鉴权与错误映射（PLAN §3）。
# 端点就 4 个：POST /v1/transcribe、GET/DELETE /v1/jobs/{id}、GET /healthz。
# /v1/* 需 Bearer $SERVICE_TOKEN；未设 token 时由 app.py 绑定 127.0.0.1 兜底。
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from . import jobs
from .config import get_settings
from .models import ServiceError, TranscribeRequest

log = logging.getLogger("asr.api")

router = APIRouter()


def error_body(err: ServiceError) -> dict:
    return {
        "error": {
            "code": err.code,
            "message": err.message,
            "retryable": err.retryable,
            "hint": err.hint,
        }
    }


def err_response(err: ServiceError, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status, content=error_body(err))


async def require_token(request: Request) -> None:
    """Bearer 鉴权：SERVICE_TOKEN 未设时放行（此时服务应只绑 127.0.0.1）。"""
    token = get_settings().service_token
    if not token:
        return
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {token}":
        raise ServiceError(
            "AUTH_FAILED", "缺少或错误的 Bearer Token",
            hint="请求头加 Authorization: Bearer <SERVICE_TOKEN>",
        )


@router.post("/v1/transcribe")
async def transcribe(req: TranscribeRequest, _=Depends(require_token)):
    settings = get_settings()
    source = req.source.strip()
    if not source:
        return err_response(ServiceError("INVALID_SOURCE", "source 不能为空"))

    wait = max(0.0, min(float(req.wait_seconds or 0), 120.0))
    options = {"language": req.language, "part": req.part, "formats": req.formats, **(req.options or {})}
    options = {k: v for k, v in options.items() if v is not None}

    try:
        job, _hit = await jobs.submit(source, options, settings)
        job = jobs.get(job["job_id"], settings) or job   # get() 会剔除 _key 等内部字段
    except ServiceError as err:
        return err_response(err)

    if wait > 0 and job["status"] in ("queued", "running"):
        # 时限内完成 → 200 带结果；超时未完成 → 202 带 job 信封
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait
        while loop.time() < deadline:
            await asyncio.sleep(0.3)
            fresh = jobs.get(job["job_id"], settings)
            if fresh and fresh["status"] not in ("queued", "running"):
                job = fresh
                break

    status_code = 200 if job["status"] in ("succeeded", "failed") else 202
    return JSONResponse(status_code=status_code, content=job)


@router.get("/v1/jobs/{job_id}")
async def get_job(job_id: str, _=Depends(require_token)):
    job = jobs.get(job_id, get_settings())
    if job is None:
        return err_response(ServiceError("JOB_NOT_FOUND", f"job {job_id} 不存在或已被清理"), 404)
    return job


@router.delete("/v1/jobs/{job_id}")
async def delete_job(job_id: str, _=Depends(require_token)):
    removed = jobs.delete(job_id, get_settings())
    if not removed:
        return err_response(ServiceError("JOB_NOT_FOUND", f"job {job_id} 不存在或已被清理"), 404)
    return {"deleted": True}
