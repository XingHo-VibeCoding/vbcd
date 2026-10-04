# 下载选项层单测：cookies 目录选择、412 风控 hint、.m4s 直链、B 站 Referer。
# 不触网：yt_dlp 用假模块桩，httpx 层只测请求头构造函数。
import sys
import types
from pathlib import Path

import pytest

from asr.config import Settings
from asr.models import ServiceError
from asr.sources import (
    _direct_headers,
    _looks_like_direct_media,
    _platform_of,
    _ytdlp_opts,
    _download_ytdlp,
    resolve_cookie_file,
)


class TestResolveCookieFile:
    """YTDLP_COOKIES_DIR 按平台选文件，回落 YTDLP_COOKIES_FILE。"""

    def test_platform_file_wins(self, tmp_path):
        (tmp_path / "bilibili.txt").write_text("x")
        (tmp_path / "youtube.txt").write_text("y")
        s = Settings(ytdlp_cookies_dir=str(tmp_path), ytdlp_cookies_file="/fallback.txt")
        assert resolve_cookie_file(s, "https://www.bilibili.com/video/BV1") == str(tmp_path / "bilibili.txt")
        assert resolve_cookie_file(s, "https://www.youtube.com/watch?v=a") == str(tmp_path / "youtube.txt")

    def test_fallback_when_platform_file_missing(self, tmp_path):
        (tmp_path / "bilibili.txt").write_text("x")
        s = Settings(ytdlp_cookies_dir=str(tmp_path), ytdlp_cookies_file="/fallback.txt")
        # 目录里没 youtube.txt → 回落单文件
        assert resolve_cookie_file(s, "https://www.youtube.com/watch?v=a") == "/fallback.txt"

    def test_no_dir_configured_uses_file(self):
        s = Settings(ytdlp_cookies_file="/one.txt")
        assert resolve_cookie_file(s, "https://www.bilibili.com/video/BV1") == "/one.txt"

    def test_nothing_configured(self):
        assert resolve_cookie_file(Settings(), "https://x.com") == ""

    def test_other_platform_no_match(self, tmp_path):
        (tmp_path / "bilibili.txt").write_text("x")
        s = Settings(ytdlp_cookies_dir=str(tmp_path))
        assert resolve_cookie_file(s, "https://example.com/v.mp4") == ""


class TestYtdlpOpts:
    def test_cookiefile_from_dir(self, tmp_path):
        secrets = tmp_path / "secrets"
        secrets.mkdir()
        (secrets / "bilibili.txt").write_text("c")
        s = Settings(ytdlp_cookies_dir=str(secrets))
        opts = _ytdlp_opts(s, tmp_path, "https://www.bilibili.com/video/BV1", None)
        assert opts["cookiefile"] == str(secrets / "bilibili.txt")

    def test_proxy_passthrough(self, tmp_path):
        s = Settings(ytdlp_proxy="socks5://127.0.0.1:1080")
        opts = _ytdlp_opts(s, tmp_path, "https://x.com/v", None)
        assert opts["proxy"] == "socks5://127.0.0.1:1080"


class TestBilibili412Hint:
    """412 + bilibili → 针对性 hint；其他平台 412 不套这个文案。"""

    def _stub_yt_dlp(self, monkeypatch, err_text):
        fake = types.ModuleType("yt_dlp")
        class YoutubeDL:
            def __init__(self, opts): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def extract_info(self, url, download=True):
                raise Exception(err_text)
        fake.YoutubeDL = YoutubeDL
        monkeypatch.setitem(sys.modules, "yt_dlp", fake)

    def test_412_bilibili_hint(self, monkeypatch, tmp_path):
        self._stub_yt_dlp(monkeypatch, "HTTP Error 412: Precondition Failed")
        with pytest.raises(ServiceError) as ei:
            _download_ytdlp("https://www.bilibili.com/video/BV1", None, tmp_path, Settings())
        assert ei.value.code == "DOWNLOAD_FAILED"
        assert "风控" in ei.value.hint
        assert ei.value.retryable is False

    def test_412_non_bilibili_generic_hint(self, monkeypatch, tmp_path):
        self._stub_yt_dlp(monkeypatch, "HTTP Error 412: Precondition Failed")
        with pytest.raises(ServiceError) as ei:
            _download_ytdlp("https://example.com/v", None, tmp_path, Settings())
        assert "风控" not in ei.value.hint

    def test_non_412_bilibili_generic_hint(self, monkeypatch, tmp_path):
        self._stub_yt_dlp(monkeypatch, "HTTP Error 403")
        with pytest.raises(ServiceError) as ei:
            _download_ytdlp("https://www.bilibili.com/video/BV1", None, tmp_path, Settings())
        assert "风控" not in ei.value.hint


class TestDirectDownload:
    def test_m4s_is_direct_media(self):
        assert _looks_like_direct_media("https://upos-sz-mirror.bilivideo.com/abc.m4s")

    def test_bilivideo_gets_referer(self):
        h = _direct_headers("https://upos-sz-mirror.bilivideo.com/a.m4s", Settings())
        assert h["Referer"] == "https://www.bilibili.com/"

    def test_non_bilibili_no_referer(self):
        h = _direct_headers("https://cdn.example.com/a.mp3", Settings())
        assert "Referer" not in h
