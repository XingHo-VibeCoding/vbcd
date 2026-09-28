# pydantic 请求/响应模型 —— 这是 buddy 后端与 agent 消费的契约（PLAN §3）。
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "running", "succeeded", "failed"]
Stage = Literal["download", "normalize", "chunk", "transcribe", "merge"]

# 固定错误码集合（PLAN §3.4；cancelled 本期无入口，不实现）
ERROR_CODES = {
    "INVALID_SOURCE",   # 来源不合法（非 http(s)、空串等）
    "SSRF_BLOCKED",     # 指向私网/回环/链路本地/云元数据地址，或非 http(s) 协议
    "DOWNLOAD_FAILED",  # yt-dlp / 直链下载失败
    "FFMPEG_MISSING",   # ffmpeg/ffprobe 不可用
    "AUTH_FAILED",      # 上游 Key 无效（401），或调用方 Bearer 无效
    "RATE_LIMITED",     # 429 / Throttling，退避重试后仍失败
    "ASR_FAILED",       # 上游转写失败（重试后仍失败或返回结构异常）
    "TIMEOUT",          # 超过 job/request 时限
    "JOB_NOT_FOUND",    # 查询/删除不存在的 job
    "INTERNAL",         # 其他未预期错误（含上游返回非 JSON）
}


class TranscribeRequest(BaseModel):
    source: str
    language: Optional[str] = None        # 显式指定语种；缺省由首片探测
    part: Optional[int] = None            # B 站分 P（1 起）
    wait_seconds: float = 0.0             # >0 时限内完成则 200 直接返回结果
    options: dict[str, Any] = Field(default_factory=dict)


class Progress(BaseModel):
    stage: Optional[Stage] = None
    done: int = 0
    total: int = 0
    percent: int = 0


class JobError(BaseModel):
    code: str
    message: str
    retryable: bool = False
    hint: Optional[str] = None
    details: Optional[dict[str, Any]] = None   # 片段最终失败时带 partial 转写


class JobEnvelope(BaseModel):
    job_id: str
    status: JobStatus
    progress: Progress = Field(default_factory=Progress)
    created_at: str
    updated_at: str
    result: Optional[dict[str, Any]] = None    # §3.3 结构化转写包
    error: Optional[JobError] = None


class ServiceError(Exception):
    """业务错误：code 取 ERROR_CODES，api 层转成统一错误信封。"""

    def __init__(self, code: str, message: str, *, retryable: bool = False,
                 hint: str | None = None, details: dict | None = None):
        super().__init__(message)
        self.code = code if code in ERROR_CODES else "INTERNAL"
        self.message = message
        self.retryable = retryable
        self.hint = hint
        self.details = details
