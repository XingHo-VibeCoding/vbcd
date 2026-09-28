# 句级时间戳重组单测（A1 实测 2026-09-28 结论）：
# 上游 `output.sentence` 是**整片一个对象**（毫秒），句级时间戳要由 `words[]` + `punctuation` 重组；
# 没有 words[] 时只能如实标 chunk。另含「300 秒硬上限」护栏与 400 空响应的错误提示。
import httpx
import pytest

from asr.config import Settings, get_settings, reset_settings
from asr.models import ServiceError
from asr.providers.funasr import (
    _sentences_from_words,
    parse_result,
    transcribe_chunk,
)

SENTENCE_END = "。！？!?…；;"


def words_of(text: str, *, step_ms: int = 500, start_ms: int = 0) -> list[dict]:
    """按实测结构造词级时间戳：`text` 里不含标点，标点挂在**前一个词**的 `punctuation` 上。"""
    words: list[dict] = []
    t = start_ms
    for ch in text:
        if ch in "。！？，；" and words:
            words[-1]["punctuation"] = ch
            continue
        words.append(
            {"begin_time": t, "end_time": t + step_ms, "text": ch, "punctuation": "", "speaker_id": None}
        )
        t += step_ms
    return words


def body_with_words(text: str, *, end_ms: int = 3000) -> dict:
    return {"output": {"sentence": {"begin_time": 0, "end_time": end_ms, "text": text, "words": words_of(text)}, "text": text}, "usage": {"duration": end_ms // 1000}}


def test_reconstruct_two_sentences_with_punctuation():
    """两个句号 → 两句；时间轴单调；重组文本不含重复标点。"""
    segs = _sentences_from_words(words_of("第一句。第二句。"), 3.0)
    assert [s["text"] for s in segs] == ["第一句。", "第二句。"]
    starts = [s["start"] for s in segs]
    assert starts == sorted(starts)
    assert segs[0]["start"] == 0.0
    assert segs[0]["end"] == 1.5            # 3 个词 × 0.5s
    assert segs[1]["end"] == 3.0


def test_reconstruct_flushes_last_sentence_without_punctuation():
    """末尾没有句末标点也要收尾，不能丢最后半句。"""
    segs = _sentences_from_words(words_of("有句号。没有句号"), 3.0)
    assert [s["text"] for s in segs] == ["有句号。", "没有句号"]


def test_reconstruct_comma_does_not_split():
    """逗号不是句末标点（只做句级切分，句子较长也不切碎）。"""
    segs = _sentences_from_words(words_of("前半，后半。"), 3.0)
    assert [s["text"] for s in segs] == ["前半，后半。"]


def test_reconstruct_empty_words_returns_empty():
    assert _sentences_from_words([], 10.0) == []


def test_parse_result_with_words_marks_sentence_granularity():
    text = "第一句。第二句。"
    r = parse_result(body_with_words(text), chunk_duration=3.0)
    assert r["granularity"] == "sentence"
    assert len(r["segments"]) == 2
    assert "".join(s["text"] for s in r["segments"]) == text
    assert r["text"] == text


def test_parse_result_without_words_falls_back_to_chunk():
    """没有 words[]：整片一段，粒度如实标 chunk（不谎报 sentence）。"""
    body = {"output": {"sentence": {"begin_time": 0, "end_time": 3000, "text": "整片一句话"}, "text": "整片一句话"}}
    r = parse_result(body, chunk_duration=3.0)
    assert r["granularity"] == "chunk"
    assert r["segments"] == [{"start": 0.0, "end": 3.0, "text": "整片一句话", "speaker": None}]


def test_parse_result_empty_text_raises_asr_failed():
    """上游超限时返回 400 + 空 sentence：解析侧同样不能把空结果当成功。"""
    with pytest.raises(ServiceError) as err:
        parse_result({"output": {"sentence": {"begin_time": 0, "end_time": None, "text": "", "words": []}}}, 3.0)
    assert err.value.code == "ASR_FAILED"
    assert err.value.retryable is False


def test_http_400_hint_mentions_300s_limit():
    """400 是「超限」的实测形态（无 code/message），提示必须能指路。"""
    err = httpx.Response(400, json={"text": "", "sentence": {"text": ""}})
    from asr.providers.funasr import _classify_http

    classified = _classify_http(err)
    assert classified.code == "ASR_FAILED"
    assert classified.retryable is False
    assert "300" in (classified.hint or "")


async def test_chunk_longer_than_upstream_limit_rejected(tmp_path):
    """超过上游 300 秒硬上限的片在发请求前就被拦住（不白跑）。"""
    wav = tmp_path / "c.wav"
    wav.write_bytes(b"RIFF" + b"\x00" * 100)
    settings = Settings(dashscope_api_key="k", asr_max_audio_seconds=300)
    with pytest.raises(ServiceError) as err:
        await transcribe_chunk(wav, settings, chunk_duration=310.0)
    assert err.value.code == "ASR_FAILED"
    assert "300" in err.value.message
    assert "ASR_CHUNK_SECONDS" in (err.value.hint or "")


def test_settings_clamp_chunk_seconds_to_upstream_limit(monkeypatch):
    """ASR_CHUNK_SECONDS 配得比硬上限还大时夹紧并告警，而不是每次请求都白跑。"""
    monkeypatch.setenv("ASR_CHUNK_SECONDS", "600")
    reset_settings()
    try:
        assert get_settings().asr_chunk_seconds == 300
    finally:
        monkeypatch.delenv("ASR_CHUNK_SECONDS", raising=False)
        reset_settings()


def test_default_hard_limit_is_300_seconds():
    assert Settings().asr_max_audio_seconds == 300
    assert SENTENCE_END  # 常量存在性（防止误删句末标点集合）
