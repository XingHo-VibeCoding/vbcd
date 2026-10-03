# 字幕抓取纯函数 + 编排单测（不碰网络：yt-dlp / httpx 均 monkeypatch）。
import pytest

from asr import subtitles
from asr.config import Settings
from asr.models import ServiceError
from asr.subtitles import _pick_format_url, _pick_subtitle, _vtt_ts, parse_vtt


def test_parse_vtt_standard():
    text = "WEBVTT\n\n00:00:00.000 --> 00:00:03.240\n第一句\n\n00:00:03.240 --> 00:00:05.000\n第二句\n"
    segs = parse_vtt(text)
    assert len(segs) == 2
    assert segs[0] == {"start": 0.0, "end": 3.24, "text": "第一句"}
    assert segs[1]["start"] == 3.24


def test_parse_vtt_note_and_identifier():
    text = "WEBVTT\n\nNOTE\n这是注释\n\n1\n00:00:00.000 --> 00:00:02.000\n你好\n"
    segs = parse_vtt(text)
    assert len(segs) == 1
    assert segs[0]["text"] == "你好"
    assert segs[0]["start"] == 0.0


def test_parse_vtt_hours_and_multiline():
    text = "WEBVTT\n\n01:02:03.000 --> 01:02:05.500\n第一行\n第二行\n"
    segs = parse_vtt(text)
    assert segs[0]["start"] == 3723.0
    assert segs[0]["end"] == 3725.5
    assert segs[0]["text"] == "第一行\n第二行"


def test_parse_vtt_srt_comma():
    text = "1\n00:00:00,000 --> 00:00:03,240\n逗号格式\n"
    segs = parse_vtt(text)
    assert len(segs) == 1
    assert segs[0]["end"] == 3.24


def test_parse_vtt_empty():
    assert parse_vtt("") == []
    assert parse_vtt(None) == []
    assert parse_vtt("WEBVTT\n\n") == []


def test_vtt_ts():
    assert _vtt_ts("00:00:00.000") == 0.0
    assert _vtt_ts("00:01:02,500") == 62.5
    assert _vtt_ts("1:02:03.000") == 3723.0
    assert _vtt_ts("") == 0.0


def test_pick_subtitle_zh_preferred():
    info = {"subtitles": {"en": [{"ext": "vtt", "url": "u"}], "zh-Hans": [{"ext": "vtt", "url": "u"}]}}
    assert _pick_subtitle(info)["lang"] == "zh-Hans"


def test_pick_subtitle_automatic_fallback():
    info = {"automatic_captions": {"ai-zh": [{"ext": "vtt", "url": "u"}]}}
    assert _pick_subtitle(info)["lang"] == "ai-zh"


def test_pick_subtitle_zh_fallback_key():
    # 非标准键但含 zh → 兜底命中
    info = {"subtitles": {"zh-SG": [{"ext": "vtt", "url": "u"}]}}
    assert _pick_subtitle(info)["lang"] == "zh-SG"


def test_pick_subtitle_none():
    assert _pick_subtitle({"subtitles": {"en": [{"ext": "vtt", "url": "u"}]}}) is None
    assert _pick_subtitle({}) is None


def test_pick_format_url_prefers_vtt():
    assert _pick_format_url([{"ext": "srt", "url": "s"}, {"ext": "vtt", "url": "v"}]) == "v"
    assert _pick_format_url([{"ext": "srt", "url": "s"}]) == "s"
    assert _pick_format_url([]) == ""


async def test_fetch_subtitles_found(monkeypatch):
    async def ok_check(url):
        return url

    def fake_info(url, part, settings):
        return {"id": "BV1", "title": "测试", "uploader": "up", "duration": 100,
                "webpage_url": url, "subtitles": {"zh-Hans": [{"ext": "vtt", "url": "https://cdn/sub.vtt"}]}}

    async def fake_download(url, settings):
        return "WEBVTT\n\n00:00:00.000 --> 00:00:03.240\n第一句\n"

    monkeypatch.setattr(subtitles, "check_url_allowed", ok_check)
    monkeypatch.setattr(subtitles, "_extract_subtitle_info", fake_info)
    monkeypatch.setattr(subtitles, "_download_subtitle_text", fake_download)

    result = await subtitles.fetch_subtitles("https://www.bilibili.com/video/BV1", None, Settings())
    assert result is not None
    assert result["language"] == "zh-Hans"
    assert result["text"] == "第一句"
    assert result["segments"] == [{"start": 0.0, "end": 3.24, "text": "第一句"}]
    assert result["srt"].startswith("1\n00:00:00,000 --> 00:00:03,240\n第一句")


async def test_fetch_subtitles_none_when_no_chinese(monkeypatch):
    async def ok_check(url):
        return url

    def fake_info(url, part, settings):
        return {"id": "BV1", "title": "t", "subtitles": {"en": [{"ext": "vtt", "url": "u"}]}}

    monkeypatch.setattr(subtitles, "check_url_allowed", ok_check)
    monkeypatch.setattr(subtitles, "_extract_subtitle_info", fake_info)
    result = await subtitles.fetch_subtitles("https://x.com/v", None, Settings())
    assert result is None


async def test_fetch_subtitles_download_error(monkeypatch):
    async def ok_check(url):
        return url

    def fake_info(url, part, settings):
        return {"subtitles": {"zh": [{"ext": "vtt", "url": "https://cdn/sub.vtt"}]}}

    async def bad_download(url, settings):
        raise ServiceError("DOWNLOAD_FAILED", "HTTP 404")

    monkeypatch.setattr(subtitles, "check_url_allowed", ok_check)
    monkeypatch.setattr(subtitles, "_extract_subtitle_info", fake_info)
    monkeypatch.setattr(subtitles, "_download_subtitle_text", bad_download)

    with pytest.raises(ServiceError) as ei:
        await subtitles.fetch_subtitles("https://x.com/v", None, Settings())
    assert ei.value.code == "DOWNLOAD_FAILED"
