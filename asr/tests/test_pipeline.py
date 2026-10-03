# respx mock 集成测试（PLAN §8，不烧 Key）：
# 2 片合并 / 第 2 片先 500 后 200 / 持续失败带 partial / 终态清理 / 缓存命中。
# 下载环节用 monkeypatch 造本地 wav（yt-dlp 不进测试），ASR 端点走 respx。
import wave

import httpx
import pytest
import respx

from asr import jobs, sources
from asr.config import Settings
from asr.sources import SourceInfo

URL = "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation"


def make_settings(tmp_path, **over):
    base = dict(
        dashscope_api_key="test-key",
        maas_base_url="https://maas.qianwenaiapi.com",
        asr_chunk_seconds=3,          # 小片长方便造多片场景
        asr_silence_window_seconds=1,
        asr_max_retries=1,
        asr_request_timeout=5.0,
        jobs_dir=str(tmp_path),
        cache_ttl_seconds=60,
    )
    base.update(over)
    return Settings(**{k: v for k, v in base.items() if k in Settings.__dataclass_fields__})


def make_wav(path, seconds: float):
    """造 16k 单声道静音 wav（有声调内容也无所谓，ASR 是 mock 的）。"""
    frames = b"\x00\x00" * int(16000 * seconds)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(frames)


def fake_fetch(src_wav: str, seconds: float):
    async def _fetch(source, part, job_dir, settings):
        import shutil
        src = job_dir / "src-test.wav"
        shutil.copy(src_wav, src)
        return SourceInfo(
            kind="page_url", input=source, platform="bilibili",
            id="BV-TEST", title="测试视频", uploader="up",
            duration_sec=seconds, webpage_url=source, file=src,
        )
    return _fetch


def asr_body(text: str, begin_ms: int = 0, end_ms: int = 3000):
    """按实测形状造响应：`sentence` 是整片一个对象，句级时间戳在 `words[]`（毫秒 + punctuation）里。
    句级时间戳由 `parse_result` 从 words 重组（A1 结论），所以 mock 也必须带 words。"""
    chars = list(text) or ["…"]
    span = max(int((end_ms - begin_ms) / len(chars)), 1)
    words: list[dict] = []
    t = begin_ms
    for ch in text:
        if ch in "。！？，；" and words:
            words[-1]["punctuation"] = ch      # 标点挂在前一个词上（与实测一致）
            continue
        words.append({"begin_time": t, "end_time": t + span, "text": ch, "punctuation": "", "speaker_id": None})
        t += span
    return {
        "output": {
            "sentence": {"begin_time": begin_ms, "end_time": end_ms, "text": text, "words": words},
            "text": text,
        },
        "usage": {},
    }


@respx.mock
async def test_two_chunks_merge_with_offsets(tmp_path, monkeypatch):
    """7s wav / 3s 片长 → 3 片；ASR 回包带片内时间戳，合并后偏移累计。"""
    src = tmp_path / "src.wav"
    make_wav(src, 7.0)
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 7.0))

    calls = []
    def responder(request):
        calls.append(1)
        return httpx.Response(200, json=asr_body(f"第{len(calls)}片", 0, 2500))
    respx.post(URL).mock(side_effect=responder)

    settings = make_settings(tmp_path / "jobs")
    job = {"job_id": "t1", "status": "queued",
           "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
           "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job, "https://www.bilibili.com/video/BVTEST", {}, settings)

    assert job["status"] == "succeeded"
    r = job["result"]
    assert r["stats"]["chunks"] == 3
    starts = [s["start"] for s in r["segments"]]
    assert starts == sorted(starts) and len(starts) == 3
    assert starts[1] > 0                       # 偏移生效
    assert r["timestamp_granularity"] == "sentence"
    assert r["text"] == "第1片\n第2片\n第3片"
    # 终态清理：job 临时目录已删
    assert not (settings.jobs_dir and (tmp_path / "jobs" / "t1").exists())


@respx.mock
async def test_chunk_retry_then_succeed(tmp_path, monkeypatch):
    """第 2 片先 500 后 200 → 重试成功，整体 succeeded。"""
    src = tmp_path / "src.wav"
    make_wav(src, 4.0)   # 4s / 3s → 2 片
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 4.0))

    calls = []
    def responder(request):
        calls.append(1)
        if len(calls) == 2:
            return httpx.Response(500, text="boom")
        return httpx.Response(200, json=asr_body(f"片{len(calls)}", 0, 2000))
    route = respx.post(URL).mock(side_effect=responder)

    settings = make_settings(tmp_path / "jobs")
    job = {"job_id": "t2", "status": "queued",
           "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
           "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job, "https://x.com/v", {}, settings)

    assert job["status"] == "succeeded"
    assert route.call_count == 3   # 片1 ok + 片2 先500后200


@respx.mock
async def test_persistent_failure_carries_partial(tmp_path, monkeypatch):
    """第 2 片持续 500 → job failed，error.details.partial 带第 1 片结果。"""
    src = tmp_path / "src.wav"
    make_wav(src, 4.0)
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 4.0))

    calls = []
    def responder(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(200, json=asr_body("第一片成了", 0, 2000))
        return httpx.Response(500, text="boom")
    respx.post(URL).mock(side_effect=responder)

    settings = make_settings(tmp_path / "jobs", asr_max_retries=0)
    job = {"job_id": "t3", "status": "queued",
           "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
           "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job, "https://x.com/v", {}, settings)

    assert job["status"] == "failed"
    assert job["error"]["code"] == "ASR_FAILED"
    partial = (job["error"].get("details") or {}).get("partial")
    assert partial and "第一片成了" in partial["text"]


@respx.mock
async def test_cache_hit_skips_asr(tmp_path, monkeypatch):
    """同一 source+options TTL 内二次跑 → 第二次不调 ASR 且 cache_hit。"""
    src = tmp_path / "src.wav"
    make_wav(src, 2.0)
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 2.0))
    route = respx.post(URL).mock(return_value=httpx.Response(200, json=asr_body("缓存测试", 0, 1500)))

    settings = make_settings(tmp_path / "jobs")
    job1 = {"job_id": "c1", "status": "queued",
            "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
            "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job1, "https://x.com/v", {}, settings)
    assert job1["status"] == "succeeded"

    job2, hit = await jobs.submit("https://x.com/v", {}, settings)
    assert hit is True
    assert job2["status"] == "succeeded"
    assert job2["result"]["stats"]["cache_hit"] is True
    assert route.call_count == 1   # 第二次没打 ASR


@respx.mock
async def test_srt_included_when_requested(tmp_path, monkeypatch):
    """formats 含 srt → result 带 srt 字段；不含 → 无 srt 键。"""
    src = tmp_path / "src.wav"
    make_wav(src, 2.0)
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 2.0))
    respx.post(URL).mock(return_value=httpx.Response(200, json=asr_body("一句字幕", 0, 1500)))

    settings = make_settings(tmp_path / "jobs")
    job = {"job_id": "s1", "status": "queued",
           "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
           "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job, "https://x.com/v", {"formats": ["srt"]}, settings)

    assert job["status"] == "succeeded"
    srt = job["result"].get("srt")
    assert srt and srt.startswith("1\n00:00:00,000 --> ")
    assert "一句字幕" in srt


@respx.mock
async def test_no_srt_when_not_requested(tmp_path, monkeypatch):
    """不传 formats → result 不含 srt 键（默认 text+segments）。"""
    src = tmp_path / "src.wav"
    make_wav(src, 2.0)
    monkeypatch.setattr(sources, "fetch_source", fake_fetch(str(src), 2.0))
    respx.post(URL).mock(return_value=httpx.Response(200, json=asr_body("一句", 0, 1500)))

    settings = make_settings(tmp_path / "jobs")
    job = {"job_id": "s2", "status": "queued",
           "progress": {"stage": "download", "done": 0, "total": 0, "percent": 0},
           "created_at": "x", "updated_at": "x", "result": None, "error": None}
    await jobs._run_pipeline(job, "https://x.com/v", {}, settings)

    assert job["status"] == "succeeded"
    assert "srt" not in job["result"]
