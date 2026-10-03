# 缓存键与读写单测（tmp_path，不碰真实 jobs 目录）
import time

from asr.cache import cache_key, get, put


def test_key_same_source_same_options():
    assert cache_key(" https://a.com/v ", {"language": "zh"}) == cache_key(
        "https://a.com/v", {"language": "zh"}
    )


def test_key_differs_by_options():
    base = cache_key("https://a.com/v", {})
    assert base != cache_key("https://a.com/v", {"language": "zh"})
    assert base != cache_key("https://a.com/v", {"part": 2})
    assert base != cache_key("https://a.com/v", {"formats": ["srt"]})
    assert base != cache_key("https://a.com/v2", {})


def test_key_ignores_irrelevant_options():
    # wait_seconds / 请求附带的杂项不影响命中
    assert cache_key("https://a.com/v", {"wait_seconds": 30}) == cache_key(
        "https://a.com/v", {}
    )


def test_put_get_roundtrip(tmp_path):
    key = cache_key("https://a.com/v", {})
    result = {"text": "你好", "segments": []}
    put(key, result, ttl=60, jobs_dir=tmp_path)
    assert get(key, ttl=60, jobs_dir=tmp_path) == result


def test_expired_returns_none(tmp_path):
    key = cache_key("https://a.com/v", {})
    put(key, {"text": "x"}, ttl=1, jobs_dir=tmp_path)
    assert get(key, ttl=1, jobs_dir=tmp_path) is not None
    # 人为过期：改磁盘文件的 expires
    f = tmp_path / ".cache" / f"{key}.json"
    import json
    f.write_text(json.dumps({"expires": time.time() - 1, "result": {"text": "x"}}))
    # 内存里还留着 → 直接看磁盘路径：清内存模拟重启
    from asr import cache as cache_mod
    cache_mod._MEM.clear()
    assert get(key, ttl=1, jobs_dir=tmp_path) is None
