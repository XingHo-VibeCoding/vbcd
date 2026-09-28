# SSRF 闸门单测：四例必须拒绝 + 公网 IP 字面量放行
import pytest

from asr.models import ServiceError
from asr.sources import check_url_allowed


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/x.mp3",                # 回环
        "http://169.254.169.254/latest/meta",    # 云元数据（链路本地）
        "file:///etc/passwd",                    # 非 http(s) 协议
        "http://localhost/x.mp3",                # 解析到回环的域名
    ],
)
async def test_blocked(url):
    with pytest.raises(ServiceError) as exc:
        await check_url_allowed(url)
    assert exc.value.code == "SSRF_BLOCKED"


async def test_public_ip_literal_allowed():
    # IP 字面量无需 DNS；8.8.8.8 是公网地址，应放行
    assert await check_url_allowed("http://8.8.8.8/x.mp3") == "http://8.8.8.8/x.mp3"


async def test_private_ranges_blocked():
    for url in ("http://10.0.0.5/x", "http://172.16.0.1/x", "http://192.168.1.1/x"):
        with pytest.raises(ServiceError) as exc:
            await check_url_allowed(url)
        assert exc.value.code == "SSRF_BLOCKED"


async def test_missing_host():
    with pytest.raises(ServiceError) as exc:
        await check_url_allowed("http://")
    assert exc.value.code == "INVALID_SOURCE"
