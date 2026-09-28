# fun-asr 转写微服务入口（PLAN §2）。
#   启动：python -m uvicorn asr.app:app --host 127.0.0.1 --port 8000（仓库根目录执行）
#   健康：GET /healthz 无需鉴权；/v1/* 需 Bearer $SERVICE_TOKEN。
#   SERVICE_TOKEN 未设时只应绑 127.0.0.1 —— 由启动脚本/Dockerfile 的默认 host 保证，
#   这里打 WARN 日志提醒，不静默裸奔。
from __future__ import annotations

import asyncio
import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import jobs
from .api import err_response, router
from .config import get_settings
from .models import ServiceError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("asr")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    Path(s.jobs_dir).mkdir(parents=True, exist_ok=True)
    if not s.service_token:
        log.warning("SERVICE_TOKEN 未设置：请确保服务只绑定 127.0.0.1 / compose 内网，否则任何人都能烧你的 ASR Key")
    if not s.provider_configured:
        log.warning("上游 ASR Key 未配置（DASHSCOPE_API_KEY）：/v1/transcribe 将返回 AUTH_FAILED")
    gc = asyncio.create_task(jobs.gc_loop(s))
    log.info("asr 服务就绪 jobs_dir=%s model=%s", s.jobs_dir, s.asr_model)
    yield
    gc.cancel()


def create_app() -> FastAPI:
    app = FastAPI(title="buddy-asr", version=get_settings().version, lifespan=lifespan)

    @app.exception_handler(ServiceError)
    async def _service_err(_req: Request, err: ServiceError):
        status = 401 if err.code == "AUTH_FAILED" else (404 if err.code == "JOB_NOT_FOUND" else 400)
        return err_response(err, status)

    @app.get("/healthz")
    async def healthz():
        s = get_settings()
        jobs_dir = Path(s.jobs_dir)
        writable = False
        try:
            jobs_dir.mkdir(parents=True, exist_ok=True)
            probe = jobs_dir / ".probe"
            probe.write_text("ok")
            probe.unlink()
            writable = True
        except Exception:
            pass
        try:
            import yt_dlp  # noqa: F401
            ytdlp_ok = True
        except ImportError:
            ytdlp_ok = False
        return {
            "ok": True,
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "ffprobe": bool(shutil.which("ffprobe")),
            "ytdlp": ytdlp_ok,
            "provider_configured": s.provider_configured,
            "jobs_dir_writable": writable,
            "version": s.version,
        }

    app.include_router(router)
    return app


app = create_app()


def main() -> None:
    """CLI 入口：python -m asr.app（默认绑 127.0.0.1:8000，安全缺省）。"""
    import os
    import uvicorn

    s = get_settings()
    # SERVICE_TOKEN 未设时强制只允许环回；设了才允许对外（容器内仍走内网网段）
    default_host = "127.0.0.1" if not s.service_token else "0.0.0.0"
    host = os.environ.get("ASR_HOST", default_host)
    port = int(os.environ.get("ASR_PORT", "8000"))
    uvicorn.run("asr.app:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
