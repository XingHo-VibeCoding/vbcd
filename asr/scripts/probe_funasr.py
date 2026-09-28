#!/usr/bin/env python3
# 一次性探针（不进主链路，PLAN §6）：实测三件事——
#   A1  fun-asr-flash 在 multimodal 端点是否返回【句级时间戳】→ 决定 timestamp_granularity
#   A2  Base64 体积/时长实际上限（--big 生成超限 wav 观察拒绝特征）
#   A3  429 限流特征（HTTP 状态 + code 字段；只有真撞上限流才能观测，平时打印"未观测到"）
#
# 用法（仓库根目录）：
#   asr/.venv/bin/python asr/scripts/probe_funasr.py --input /path/to/audio.mp3
#   asr/.venv/bin/python asr/scripts/probe_funasr.py --input x.mp3 --big   # 追加体积边界探测
#
# 需要 env：DASHSCOPE_API_KEY（或 MAAS_API_KEY）。
# 输出：原始 JSON 落盘 asr/probe-result-*.json（人工核对），结论打印到 stdout 供写进 asr/PROBE.md。
import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path

ENDPOINT = "/api/v1/services/aigc/multimodal-generation/generation"
BASE_URL = os.environ.get("MAAS_BASE_URL", "https://maas.qianwenaiapi.com")
MODEL = os.environ.get("ASR_MODEL", "fun-asr-flash-2026-06-15")


def to_wav(src: Path, dst: Path, seconds: int | None = None) -> float:
    """ffmpeg 归一化 16k/单声道/pcm_s16le；返回实际时长（秒）。"""
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src)]
    if seconds:
        cmd += ["-t", str(seconds)]
    cmd += ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)]
    subprocess.run(cmd, check=True)
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(dst)],
        check=True, capture_output=True, text=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def sine_wav(dst: Path, seconds: int) -> None:
    """生成指定时长的正弦波 wav（A2 体积边界探测用；正弦波内容无所谓，只为凑体积）。"""
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=" + str(seconds),
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst),
        ],
        check=True,
    )


def send(wav: Path) -> tuple[int, dict | str]:
    """发一次请求；返回 (http_status, json|raw_text)。Key 只进请求头，绝不打印。"""
    key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("MAAS_API_KEY")
    if not key:
        sys.exit("缺少 DASHSCOPE_API_KEY（或 MAAS_API_KEY），探针无法运行")
    b64 = base64.b64encode(wav.read_bytes()).decode()
    payload = {
        "model": MODEL,
        "input": {"messages": [{"role": "user", "content": [
            {"type": "input_audio", "input_audio": {"data": f"data:audio/wav;base64,{b64}"}}]}]},
        "parameters": {"format": "wav", "sample_rate": "16000"},
    }
    req = urllib.request.Request(
        f"{BASE_URL.rstrip('/')}{ENDPOINT}",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body


def analyze_a1(body: dict) -> str:
    """A1：找句级时间戳字段（实测格式为 output.sentence，含 begin_time/end_time/words[]）。"""
    output = (body or {}).get("output") or {}
    for container in (output, body or {}):
        sent = container.get("sentence") or container.get("sentences")
        if isinstance(sent, dict):
            sent = [sent]
        if isinstance(sent, list) and sent:
            first = sent[0]
            has_ts = "begin_time" in first and "end_time" in first
            words = len(first.get("words") or [])
            return (
                f"✅ 句级时间戳：sentence 对象（{len(sent)} 句，begin/end 毫秒，words {words} 个词级时间戳）"
                if has_ts
                else f"sentence 存在但无 begin_time/end_time"
            )
    text = output.get("text") or (body or {}).get("text")
    if text:
        return "只有整段 text，无句级时间戳 → granularity 应降级为 chunk"
    return "响应结构未识别（需人工看原始 JSON）"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="本地媒体文件（mp3/mp4/wav 均可）")
    ap.add_argument("--seconds", type=int, default=60, help="只取前 N 秒送检（默认 60）")
    ap.add_argument("--big", action="store_true", help="追加 A2 体积边界探测（生成 >10MB base64 的 wav）")
    args = ap.parse_args()

    out_dir = Path(__file__).resolve().parent.parent
    tmp = Path(tempfile.mkdtemp(prefix="probe-"))

    # ===== A1：句级时间戳 =====
    wav = tmp / "clip.wav"
    dur = to_wav(Path(args.input), wav, args.seconds)
    size_mb = wav.stat().st_size / 1048576
    print(f"[A1] 送检 {wav.name}：时长 {dur:.1f}s，{size_mb:.2f}MB raw ≈ {size_mb*4/3:.2f}MB base64")
    t0 = time.monotonic()
    status, body = send(wav)
    elapsed = time.monotonic() - t0
    print(f"[A1] HTTP {status}，耗时 {elapsed:.1f}s")
    raw_path = out_dir / "probe-result-a1.json"
    raw_path.write_text(json.dumps(body, ensure_ascii=False, indent=2) if isinstance(body, dict) else str(body))
    print(f"[A1] 原始响应已写 {raw_path}")
    if status == 200 and isinstance(body, dict):
        print(f"[A1] 结论：{analyze_a1(body)}")
        print(f"[A1] 顶层字段：{list(body.keys())}")
        usage = body.get("usage")
        if usage:
            print(f"[A1] usage={json.dumps(usage, ensure_ascii=False)}")
    else:
        print(f"[A1] 请求失败，先看上面状态码与 {raw_path}")

    # ===== A2：体积/时长上限（可选）=====
    if args.big:
        # 16k 单声道 pcm_s16le：每秒 32KB → 340s ≈ 10.4MB raw ≈ 13.9MB base64（必超 10MB）
        big = tmp / "big.wav"
        sine_wav(big, 340)
        raw_mb = big.stat().st_size / 1048576
        print(f"[A2] 送检超限 wav：340s，{raw_mb:.2f}MB raw ≈ {raw_mb*4/3:.2f}MB base64")
        status, body = send(big)
        (out_dir / "probe-result-a2.json").write_text(
            json.dumps(body, ensure_ascii=False, indent=2) if isinstance(body, dict) else str(body)
        )
        print(f"[A2] HTTP {status} ｜ 响应：{json.dumps(body, ensure_ascii=False)[:300] if isinstance(body, dict) else str(body)[:300]}")

    # ===== A3：限流特征 =====
    print("[A3] 限流探测未主动执行（避免烧额度）；若上面任一请求返回 429，其响应体已落盘供查 code 字段")

    import shutil
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
