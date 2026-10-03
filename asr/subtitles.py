# 平台字幕抓取（板块②）：优先抓 CC / 自动字幕，命中返回结构化字幕包（含 srt），
# 抓不到返回 None，由调用方回落到 fun-asr 转写。不下载音轨，秒级返回。
from __future__ import annotations

import asyncio
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from .audio import to_srt
from .config import Settings
from .models import ServiceError
from .sources import check_url_allowed

# 中文优先语种候选（CC 与自动字幕都试，按顺序取第一个命中）
ZH_LANGS = ("zh-Hans", "zh-CN", "zh", "ai-zh", "zh-Hant", "zh-TW", "zh-HK")

_YT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def _platform_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "bilibili.com" in host or "b23.tv" in host:
        return "bilibili"
    if "youtube.com" in host or "youtu.be" in host:
        return "youtube"
    return "other"


def _vtt_ts(ts: str) -> float:
    """VTT/SRT 时间戳 → 秒。兼容 HH:MM:SS.mmm 与 MM:SS.mmm，毫秒分隔符点或逗号。"""
    m = re.match(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})", (ts or "").strip())
    if not m:
        return 0.0
    h = int(m.group(1) or 0)
    return h * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + int(m.group(4)) / 1000


def parse_vtt(text: str) -> list[dict]:
    """VTT/SRT 文本 → segments [{start, end, text}]（秒）。跳过 WEBVTT header / NOTE 块 / cue 序号行。"""
    segments: list[dict] = []
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i, n = 0, len(lines)
    while i < n:
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("WEBVTT"):
            i += 1
            continue
        if line.startswith("NOTE"):
            i += 1
            while i < n and lines[i].strip():
                i += 1
            continue
        if " --> " not in line:
            i += 1
            continue
        m = re.match(r"^\s*(.*?)\s*-->\s*(.*?)\s*$", line)
        if not m:
            i += 1
            continue
        start, end = _vtt_ts(m.group(1)), _vtt_ts(m.group(2))
        i += 1
        buf: list[str] = []
        while i < n and lines[i].strip():
            buf.append(lines[i].strip())
            i += 1
        text = "\n".join(buf).strip()
        if text:
            segments.append({"start": start, "end": end, "text": text})
    return segments


def _pick_subtitle(info: dict[str, Any]) -> dict | None:
    """从 extract_info 结果里选中文字幕：先人工 CC，后自动字幕；返回 {lang, formats}。"""
    merged: dict[str, Any] = {}
    merged.update(info.get("subtitles") or {})
    merged.update(info.get("automatic_captions") or {})
    for lang in ZH_LANGS:
        if merged.get(lang):
            return {"lang": lang, "formats": merged[lang]}
    for key, val in merged.items():
        if "zh" in str(key).lower() and val:
            return {"lang": key, "formats": val}
    return None


def _pick_format_url(formats: list[dict]) -> str:
    """字幕多格式里优先 vtt，其次 srt，兜底第一个。"""
    for ext in ("vtt", "srt", "json3"):
        for f in formats or []:
            if f.get("ext") == ext and f.get("url"):
                return f["url"]
    if formats:
        return formats[0].get("url") or ""
    return ""


def _extract_subtitle_info(url: str, part: int | None, settings: Settings) -> dict[str, Any]:
    """同步取元信息（含字幕清单）。不下载音轨；失败抛 DOWNLOAD_FAILED。"""
    try:
        import yt_dlp
    except ImportError:
        raise ServiceError("DOWNLOAD_FAILED", "yt-dlp 未安装", hint="pip install yt-dlp 后重启服务")
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": part is None,
        "socket_timeout": int(settings.download_timeout),
        "http_headers": {"User-Agent": settings.ytdlp_user_agent or _YT_UA},
    }
    if part is not None:
        opts["playlist_items"] = str(part)
    if "bilibili" in url or "b23.tv" in url:
        opts["http_headers"]["Referer"] = "https://www.bilibili.com/"
    if settings.ytdlp_cookies_file:
        opts["cookiefile"] = settings.ytdlp_cookies_file
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as err:
        raise ServiceError(
            "DOWNLOAD_FAILED", f"字幕抓取失败：{_clip(str(err))}",
            hint="检查链接可访问性；会员内容需配 YTDLP_COOKIES_FILE",
        )
    if part is not None and info.get("entries"):
        info = info["entries"][0]
    return info


async def _download_subtitle_text(fmt_url: str, settings: Settings) -> str:
    """拉字幕文件文本。url 来自 yt-dlp（公网 CDN），非用户直接输入，不再逐跳 SSRF 复验。"""
    timeout = httpx.Timeout(settings.download_timeout)
    headers = {"User-Agent": settings.ytdlp_user_agent or _YT_UA}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = await client.get(fmt_url)
        if resp.status_code != 200:
            raise ServiceError(
                "DOWNLOAD_FAILED", f"字幕文件返回 HTTP {resp.status_code}",
                retryable=resp.status_code >= 500,
            )
        return resp.text


def _clip(text: str, limit: int = 200) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[:limit] + "…"


async def fetch_subtitles(source: str, part: int | None, settings: Settings) -> dict[str, Any] | None:
    """抓平台字幕。命中返回 {source, language, text, segments, srt}；无中文/无字幕返回 None。"""
    url = await check_url_allowed(source.strip())
    info = await asyncio.to_thread(_extract_subtitle_info, url, part, settings)
    picked = _pick_subtitle(info)
    if not picked:
        return None
    fmt_url = _pick_format_url(picked["formats"])
    if not fmt_url:
        return None
    text = await _download_subtitle_text(fmt_url, settings)
    segments = parse_vtt(text)
    if not segments:
        return None
    source_meta = {
        "kind": "subtitles",
        "input": source.strip(),
        "platform": _platform_of(url),
        "id": str(info.get("id") or ""),
        "title": str(info.get("title") or ""),
        "uploader": str(info.get("uploader") or ""),
        "duration_sec": info.get("duration"),
        "webpage_url": str(info.get("webpage_url") or url),
        "thumbnail": str(info.get("thumbnail") or ""),
        "part": part,
    }
    return {
        "source": source_meta,
        "language": picked["lang"],
        "text": "\n".join(s["text"] for s in segments),
        "segments": segments,
        "srt": to_srt(segments),
    }
