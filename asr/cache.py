# 结果缓存（PLAN §4.7）：键 = sha256(规范化 source + 影响结果的 options)，
# TTL 默认 1800s；内存 + jobs 目录双写（重启也能命中），命中时 stats.cache_hit=true。
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

_MEM: dict[str, tuple[float, dict]] = {}


def cache_key(source: str, options: dict[str, Any]) -> str:
    """规范化：去首尾空白 + 小写协议/主机；options 只取影响结果的字段。"""
    src = source.strip()
    affecting = {
        k: options.get(k)
        for k in ("language", "part")
        if options.get(k) is not None
    }
    raw = json.dumps({"source": src, "options": affecting}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def _file(jobs_dir: Path, key: str) -> Path:
    return jobs_dir / ".cache" / f"{key}.json"


def get(key: str, ttl: int, jobs_dir: Path) -> dict | None:
    """命中返回缓存的结果 dict（调用方补 stats.cache_hit），未命中/过期返回 None。"""
    now = time.time()
    hit = _MEM.get(key)
    if hit and hit[0] > now:
        return hit[1]

    path = _file(jobs_dir, key)
    try:
        data = json.loads(path.read_text("utf-8"))
        if data.get("expires", 0) > now:
            _MEM[key] = (data["expires"], data["result"])
            return data["result"]
        path.unlink(missing_ok=True)
    except Exception:
        pass
    _MEM.pop(key, None)
    return None


def put(key: str, result: dict, ttl: int, jobs_dir: Path) -> None:
    expires = time.time() + ttl
    _MEM[key] = (expires, result)
    try:
        path = _file(jobs_dir, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"expires": expires, "result": result}, ensure_ascii=False), "utf-8"
        )
    except Exception:
        pass  # 磁盘缓存失败不影响主链路


def gc(jobs_dir: Path) -> int:
    """清掉过期磁盘缓存，返回删除数。"""
    removed = 0
    cache_dir = jobs_dir / ".cache"
    if not cache_dir.is_dir():
        return 0
    now = time.time()
    for f in cache_dir.glob("*.json"):
        try:
            if json.loads(f.read_text("utf-8")).get("expires", 0) <= now:
                f.unlink()
                removed += 1
        except Exception:
            f.unlink(missing_ok=True)
            removed += 1
    return removed
