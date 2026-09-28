# 错误映射单测（PLAN §8）：401/429/500/非 JSON → 对应错误码与 retryable
import pytest
import respx
import httpx

from asr.config import Settings
from asr.models import ServiceError
from asr.providers.funasr import transcribe_chunk

URL = "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation"


def make_settings(**over):
    base = dict(
        dashscope_api_key="test-key",
        maas_base_url="https://maas.qianwenaiapi.com",
        asr_max_retries=2,
        asr_request_timeout=5.0,
        asr_max_b64_bytes=10 * 1024 * 1024,
    )
    base.update(over)
    return Settings(**{k: v for k, v in base.items() if k in Settings.__dataclass_fields__})


@pytest.fixture
def wav(tmp_path):
    f = tmp_path / "c.wav"
    f.write_bytes(b"RIFF" + b"\x00" * 100)  # 内容无所谓，只走 Base64
    return f


def ok_body():
    return {
        "output": {
            "sentence": {"begin_time": 0, "end_time": 1000, "text": "你好"},
            "text": "你好",
        },
        "usage": {"duration": 1},
    }


@respx.mock
async def test_401_no_retry(wav):
    route = respx.post(URL).mock(return_value=httpx.Response(401, json={"code": "InvalidApiKey"}))
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(wav, make_settings(), chunk_duration=1.0)
    assert exc.value.code == "AUTH_FAILED"
    assert exc.value.retryable is False
    assert route.call_count == 1   # 不重试


@respx.mock
async def test_429_retries_then_rate_limited(wav):
    route = respx.post(URL).mock(return_value=httpx.Response(429, json={"code": "Throttling"}))
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(wav, make_settings(asr_max_retries=1), chunk_duration=1.0)
    assert exc.value.code == "RATE_LIMITED"
    assert route.call_count == 2   # 首试 + 1 次重试


@respx.mock
async def test_500_retries_then_asr_failed(wav):
    route = respx.post(URL).mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(wav, make_settings(asr_max_retries=1), chunk_duration=1.0)
    assert exc.value.code == "ASR_FAILED"
    assert route.call_count == 2


@respx.mock
async def test_500_then_200_succeeds(wav):
    route = respx.post(URL).mock(
        side_effect=[httpx.Response(500, text="boom"), httpx.Response(200, json=ok_body())]
    )
    res = await transcribe_chunk(wav, make_settings(), chunk_duration=1.0)
    assert res["text"] == "你好"
    assert res["granularity"] == "sentence"
    assert res["segments"][0]["start"] == 0.0 and res["segments"][0]["end"] == 1.0
    assert route.call_count == 2


@respx.mock
async def test_non_json_internal(wav):
    respx.post(URL).mock(return_value=httpx.Response(200, text="<html>oops</html>"))
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(wav, make_settings(), chunk_duration=1.0)
    assert exc.value.code == "INTERNAL"


async def test_no_key_auth_failed(wav):
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(wav, make_settings(dashscope_api_key=""), chunk_duration=1.0)
    assert exc.value.code == "AUTH_FAILED"


async def test_too_big_chunk_rejected(tmp_path):
    big = tmp_path / "big.wav"
    big.write_bytes(b"\x00" * 100)
    s = make_settings(asr_max_b64_bytes=10)  # 10 字节上限
    with pytest.raises(ServiceError) as exc:
        await transcribe_chunk(big, s, chunk_duration=1.0)
    assert exc.value.code == "ASR_FAILED"
    assert "上限" in exc.value.message
