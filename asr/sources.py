# 来源解析与媒体获取（PLAN §4.1）：平台页链接走 yt-dlp 只取音轨，
# 直链媒体走 httpx 直接下载。两者入口都先过 SSRF 校验。
# 产物统一为 job 临时目录下的一个媒体文件 + SourceInfo（转写包里的 source 字段）。
from __future__ import annotations

import asyncio
import ipaddress
import shutil
import socket
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .config import Settings
from .models import ServiceError

# 常见直链媒体扩展名：命中则跳过 yt-dlp，直接下载（更快、更省依赖行为差异）
MEDIA_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus",
    ".mp4", ".mkv", ".mov", ".webm", ".m4v", ".m4s",
}

_YT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


@dataclass
class SourceInfo:
    kind: str                      # page_url | media_url
    input: str
    platform: str = "other"        # bilibili | youtube | direct | other
    id: str = ""
    title: str = ""
    uploader: str = ""
    duration_sec: float | None = None
    webpage_url: str = ""
    thumbnail: str = ""
    part: int | None = None
    file: Path | None = field(default=None, repr=False)   # 落盘后的媒体文件


def _is_forbidden_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    # 私网 / 回环 / 链路本地（含 169.254.169.254 云元数据）/ 保留段 / 未指定地址
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


async def check_url_allowed(url: str) -> str:
    """SSRF 闸门：只允许 http/https；主机解析出的每一个 IP 都必须是公网地址。
    通过则返回规范化 url；拒绝时抛 SSRF_BLOCKED / INVALID_SOURCE。"""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ServiceError(
            "SSRF_BLOCKED",
            f"只允许 http/https 来源，收到协议：{parsed.scheme or '（无）'}",
            hint="换一个公网网页或直链地址",
        )
    if not parsed.hostname:
        raise ServiceError("INVALID_SOURCE", "来源地址缺少主机名")

    if _is_forbidden_ip(parsed.hostname):
        raise ServiceError("SSRF_BLOCKED", f"目标主机 {parsed.hostname} 是内网/保留地址")

    # 域名也要解析出全部 IP 逐个校验（防 DNS 指向内网）
    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, parsed.hostname, None, proto=socket.IPPROTO_TCP
        )
    except socket.gaierror:
        raise ServiceError(
            "DOWNLOAD_FAILED",
            f"域名 {parsed.hostname} 解析失败",
            hint="检查地址拼写或本机 DNS",
        )
    for info in infos:
        ip = info[4][0]
        if _is_forbidden_ip(ip):
            raise ServiceError(
                "SSRF_BLOCKED",
                f"{parsed.hostname} 解析到内网/保留地址 {ip}，已拒绝",
            )
    return url.strip()


def _looks_like_direct_media(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in MEDIA_EXTENSIONS)


def _platform_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "bilibili.com" in host or "b23.tv" in host:
        return "bilibili"
    if "youtube.com" in host or "youtu.be" in host:
        return "youtube"
    return "other"


def resolve_cookie_file(settings: Settings, source: str) -> str:
    """按来源平台在 cookies 目录里找 {platform}.txt；找不到回落单文件配置。
    cookies 目录机制（YTDLP_COOKIES_DIR）用于多平台并存（B 站 / YouTube 各一份），
    比手工合并 Netscape 文件省事，也比单文件配置好扩展。"""
    if settings.ytdlp_cookies_dir:
        candidate = Path(settings.ytdlp_cookies_dir) / f"{_platform_of(source)}.txt"
        if candidate.is_file():
            return str(candidate)
    return settings.ytdlp_cookies_file


def _ytdlp_opts(settings: Settings, job_dir: Path, source: str, part: int | None) -> dict:
    opts: dict = {
        "format": "bestaudio/best",
        "outtmpl": str(job_dir / "src-%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": part is None,          # 指定分 P 时需要处理播放列表的那一项
        "socket_timeout": int(settings.download_timeout),
        "retries": 3,
        "http_headers": {"User-Agent": settings.ytdlp_user_agent or _YT_UA},
    }
    if part is not None:
        opts["playlist_items"] = str(part)
    if "bilibili.com" in source or "b23.tv" in source:
        # B 站校验 Referer（PLAN §4.1）
        opts["http_headers"]["Referer"] = "https://www.bilibili.com/"
    cookie = resolve_cookie_file(settings, source)
    if cookie:
        # yt-dlp 会以读写方式打开 cookiefile（下载后回写更新的登录态）。
        # /app/secrets 是只读挂载 → 复制一份到 job 临时目录（可写，用完即删）。
        writable = job_dir / "cookies.txt"
        shutil.copyfile(cookie, writable)
        opts["cookiefile"] = str(writable)
    if settings.ytdlp_proxy:
        opts["proxy"] = settings.ytdlp_proxy
    return opts


def _download_ytdlp(source: str, part: int | None, job_dir: Path, settings: Settings) -> SourceInfo:
    """同步执行（yt-dlp 无异步 API），由调用方包进 asyncio.to_thread。"""
    try:
        import yt_dlp
    except ImportError:
        raise ServiceError(
            "DOWNLOAD_FAILED", "yt-dlp 未安装",
            hint="pip install yt-dlp 后重启服务",
        )

    opts = _ytdlp_opts(settings, job_dir, source, part)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(source, download=True)
    except Exception as err:  # yt_dlp.utils.DownloadError 等
        msg = _clip(str(err))
        # B 站 412 = WAF 风控拦 IP（海外/机房出口几乎必中）。此时 cookies/代理是唯一解法，
        # 同 IP 重试无意义，故保持 retryable=False。
        if "412" in msg and _platform_of(source) == "bilibili":
            raise ServiceError(
                "DOWNLOAD_FAILED", f"下载失败：{msg}",
                hint="B 站风控拦截（海外/机房 IP 常见）：配 YTDLP_COOKIES_FILE 登录态 cookies，或走国内出口代理",
            )
        raise ServiceError(
            "DOWNLOAD_FAILED",
            f"下载失败：{msg}",
            hint="检查链接是否可公开访问；会员/番剧内容需配 YTDLP_COOKIES_FILE",
        )

    entry = info
    if part is not None and info.get("entries"):
        entry = info["entries"][0]

    file_path = None
    try:
        file_path = Path(ydl.prepare_filename(entry)) if entry else None
    except Exception:
        file_path = None
    if not file_path or not file_path.exists():
        # 兜底：在 job 目录里找刚下好的文件（排除隐藏的 part 临时文件）
        candidates = sorted(
            (p for p in job_dir.glob("src-*") if p.is_file() and not p.name.endswith(".part")),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        file_path = candidates[0] if candidates else None
    if not file_path:
        raise ServiceError("DOWNLOAD_FAILED", "yt-dlp 执行完成但未找到落盘文件")

    size_mb = file_path.stat().st_size / (1024 * 1024)
    if size_mb > settings.max_download_mb:
        raise ServiceError(
            "DOWNLOAD_FAILED",
            f"媒体文件 {size_mb:.0f}MB 超过上限 {settings.max_download_mb}MB",
        )

    return SourceInfo(
        kind="page_url",
        input=source,
        platform=_platform_of(source),
        id=str(entry.get("id") or info.get("id") or ""),
        title=str(entry.get("title") or info.get("title") or ""),
        uploader=str(entry.get("uploader") or info.get("uploader") or ""),
        duration_sec=entry.get("duration") or info.get("duration"),
        webpage_url=str(entry.get("webpage_url") or info.get("webpage_url") or source),
        thumbnail=str(entry.get("thumbnail") or info.get("thumbnail") or ""),
        part=part,
        file=file_path,
    )


def _direct_headers(source: str, settings: Settings) -> dict:
    """直链下载请求头。B 站 CDN（bilivideo.com）无 Referer 一律 412，必须带上。"""
    headers = {"User-Agent": settings.ytdlp_user_agent or _YT_UA}
    host = (urlparse(source).hostname or "").lower()
    if "bilivideo" in host or "bilibili" in host or "b23" in host:
        headers["Referer"] = "https://www.bilibili.com/"
    return headers


async def _download_direct(source: str, job_dir: Path, settings: Settings) -> SourceInfo:
    """直链媒体：httpx 流式下载。重定向目标每次都要重新过 SSRF 校验。"""
    name = Path(urlparse(source).path).name or "media"
    dest = job_dir / f"src-{name}"

    timeout = httpx.Timeout(settings.download_timeout)
    headers = _direct_headers(source, settings)
    try:
        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=False, max_redirects=5,
            headers=headers,
        ) as client:
            url = source
            for _ in range(5):
                resp = await client.get(url)
                if resp.is_redirect:
                    url = str(resp.next_request.url)
                    await check_url_allowed(url)   # 每一跳都校验
                    continue
                break
            else:
                raise ServiceError("DOWNLOAD_FAILED", "重定向次数过多")

            if resp.status_code != 200:
                raise ServiceError(
                    "DOWNLOAD_FAILED", f"直链返回 HTTP {resp.status_code}",
                    retryable=resp.status_code >= 500,
                )
            dest.write_bytes(resp.content)
    except ServiceError:
        raise
    except httpx.TimeoutException:
        raise ServiceError("DOWNLOAD_FAILED", "直链下载超时", retryable=True)
    except Exception as err:
        raise ServiceError("DOWNLOAD_FAILED", f"直链下载失败：{_clip(str(err))}", retryable=True)

    size_mb = dest.stat().st_size / (1024 * 1024)
    if size_mb > settings.max_download_mb:
        raise ServiceError(
            "DOWNLOAD_FAILED",
            f"媒体文件 {size_mb:.0f}MB 超过上限 {settings.max_download_mb}MB",
        )

    return SourceInfo(
        kind="media_url",
        input=source,
        platform="direct",
        id=Path(name).stem,
        title=Path(name).stem,
        webpage_url=source,
        file=dest,
    )


async def fetch_source(source: str, part: int | None, job_dir: Path, settings: Settings) -> SourceInfo:
    """流水线第 1 步：校验 → 下载 → 返回 SourceInfo（含落盘文件路径）。"""
    source = source.strip()
    if not source:
        raise ServiceError("INVALID_SOURCE", "source 不能为空")
    url = await check_url_allowed(source)

    if _looks_like_direct_media(url) and _platform_of(url) == "other":
        return await _download_direct(url, job_dir, settings)
    return await asyncio.to_thread(_download_ytdlp, url, part, job_dir, settings)


def _clip(text: str, limit: int = 300) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"
