# to_srt 纯函数单测：时间戳格式、序号连续、空段跳过、毫秒舍入。
from asr.audio import to_srt


def test_srt_timestamp_format():
    out = to_srt([{"start": 0.0, "end": 3.24, "text": "第一句"}])
    assert out == "1\n00:00:00,000 --> 00:00:03,240\n第一句\n"


def test_srt_numbering_skips_empty():
    segs = [
        {"start": 0.0, "end": 1.0, "text": "一句"},
        {"start": 1.0, "end": 2.0, "text": "   "},
        {"start": 2.0, "end": 3.0, "text": "三句"},
    ]
    out = to_srt(segs)
    lines = out.split("\n")
    assert lines[0] == "1"
    assert "2\n00:00:02,000 --> 00:00:03,000\n三句" in out   # 空段被跳过，序号仍连续
    assert "\n\n\n" not in out                                # 空段不留多余空行


def test_srt_millisecond_rounding():
    out = to_srt([{"start": 0.0, "end": 1.9996, "text": "x"}])
    assert "00:00:02,000" in out   # 1999.6ms 四舍五入到 2000ms


def test_srt_hours_always_present():
    out = to_srt([{"start": 3723.0, "end": 3725.5, "text": "长视频末尾"}])
    assert "01:02:03,000 --> 01:02:05,500" in out


def test_srt_empty_segments():
    assert to_srt([]) == ""
    assert to_srt(None) == ""


def test_srt_from_merged_chunks():
    """merge_chunk_results 的真实输出直接喂给 to_srt（等价 jobs.py 里的调用）。"""
    from asr.audio import merge_chunk_results
    merged = merge_chunk_results(
        [
            {"offset": 0.0, "duration": 4.0, "text": "第一片",
             "granularity": "sentence",
             "segments": [{"start": 0.0, "end": 3.8, "text": "片一句一"}]},
            {"offset": 4.0, "duration": 4.0, "text": "第二片",
             "granularity": "sentence",
             "segments": [{"start": 0.1, "end": 3.9, "text": "片二句一"}]},
        ]
    )
    out = to_srt(merged["segments"])
    assert out.split("\n")[0] == "1"
    assert "00:00:00,000 --> 00:00:03,800\n片一句一" in out
    assert "00:00:04,100 --> 00:00:07,900\n片二句一" in out   # 偏移按实际片长累计后转 srt
