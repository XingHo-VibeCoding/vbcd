# 配置：env 驱动，全部有默认值；缺失的关键配置（API Key）不在这里崩溃，
# 由 /healthz 与首次真实调用时给出明确错误（供 buddy 侧与运维看健康状态）。
from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        return default


@dataclass
class Settings:
    # 上游 ASR（fun-asr-flash，多模态生成端点）
    dashscope_api_key: str = ""
    maas_base_url: str = "https://maas.qianwenaiapi.com"
    asr_model: str = "fun-asr-flash-2026-06-15"

    # 调用方鉴权：未设时只应绑 127.0.0.1（api.py/app.py 会在启动日志告警）
    service_token: str = ""

    # 切片与体积闸门：16kHz 单声道 pcm_s16le ≈ 32KB/s；180s ≈ 5.8MB raw ≈ 7.7MB base64
    asr_chunk_seconds: int = 180
    asr_max_b64_bytes: int = 10 * 1024 * 1024  # 上游 10MB Base64 上限（PLAN §4）
    asr_silence_window_seconds: int = 20       # 静音边界搜索窗口（标称切点前后）
    asr_chunk_concurrency: int = 1             # 片内并发（串行为 1）
    asr_global_concurrency: int = 3            # 全局同时在转的片数上限
    asr_request_timeout: float = 300.0         # 单次 ASR 请求超时（秒）
    asr_max_retries: int = 3                   # 429/5xx/超时 的退避重试次数

    # job 生命周期
    job_timeout_seconds: int = 1800
    job_ttl_seconds: int = 1800                # 终态后状态 JSON 保留时长（GC）
    # 默认落在 asr/data/jobs（随包定位、不依赖 cwd）；compose 里覆盖为 /app/jobs
    jobs_dir: str = str(Path(__file__).resolve().parent / "data" / "jobs")

    # 下载
    ytdlp_cookies_file: str = ""
    ytdlp_proxy: str = ""
    ytdlp_user_agent: str = ""
    download_timeout: float = 300.0
    max_download_mb: int = 500                 # 源媒体体积闸门（防超大文件塞爆磁盘）

    # 结果缓存（规范化 source + options → 转写包）
    cache_ttl_seconds: int = 1800

    version: str = "0.1.0"

    @property
    def provider_configured(self) -> bool:
        return bool(self.dashscope_api_key)


_SETTINGS: Settings | None = None


def get_settings() -> Settings:
    """进程内单例；测试里改 env 后调用 reset_settings() 重建。"""
    global _SETTINGS
    if _SETTINGS is None:
        _SETTINGS = _load()
    return _SETTINGS


def reset_settings() -> None:
    global _SETTINGS
    _SETTINGS = None


def _load() -> Settings:
    kwargs = {}
    for f in fields(Settings):
        env_name = f.name.upper()
        if env_name not in os.environ:
            continue
        raw = os.environ[env_name]
        if f.type == "int":
            kwargs[f.name] = _int(env_name, f.default)
        elif f.type == "float":
            kwargs[f.name] = _float(env_name, f.default)
        else:
            kwargs[f.name] = raw
    # 兼容别名：MAAS_API_KEY 也可作为上游 Key
    s = Settings(**kwargs)
    if not s.dashscope_api_key:
        s.dashscope_api_key = os.environ.get("MAAS_API_KEY", "")
    return s
