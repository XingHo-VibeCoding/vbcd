# 切片规划与时间轴合并的纯函数单测（不碰网络/文件系统）
from asr.audio import fmt_timestamp, merge_chunk_results, plan_chunks


def test_plan_single_chunk():
    chunks, warnings = plan_chunks(120.0, 180, [])
    assert chunks == [(0.0, 120.0)]
    assert warnings == []


def test_plan_fixed_cut_when_no_silence():
    # 400s / 180s → 3 片；无静音 → 两个切点都记 warning，且落在标称点
    chunks, warnings = plan_chunks(400.0, 180, [], window=20)
    assert len(chunks) == 3
    assert chunks[0] == (0.0, 180.0)
    assert chunks[1] == (180.0, 360.0)
    assert chunks[2] == (360.0, 400.0)
    assert len(warnings) == 2


def test_plan_silence_aligned_cut():
    # 标称切点 180 的 ±20s 窗口内有静音区间 (170, 178) → 切在区间中点 174；
    # 下一个标称点 174+180=354 的窗口内没有静音 → 定长切 + 记一条 warning
    chunks, warnings = plan_chunks(400.0, 180, [(170.0, 178.0)], window=20)
    assert chunks[0] == (0.0, 174.0)
    assert chunks[1] == (174.0, 354.0)
    assert len(warnings) == 1 and "片 2" in warnings[0]
    # 单调不重叠
    for i in range(1, len(chunks)):
        assert chunks[i][0] == chunks[i - 1][1]


def test_plan_stays_within_duration():
    chunks, _ = plan_chunks(181.0, 180, [])
    assert chunks[-1][1] == 181.0
    assert len(chunks) == 2


def test_merge_offsets_and_order():
    merged = merge_chunk_results(
        [
            {
                "offset": 4.0, "duration": 4.0, "text": "第二片",
                "granularity": "sentence",
                "segments": [{"start": 0.1, "end": 3.9, "text": "片二句一"}],
            },
            {
                "offset": 0.0, "duration": 4.0, "text": "第一片",
                "granularity": "sentence",
                "segments": [{"start": 0.0, "end": 3.8, "text": "片一句一"}],
            },
        ]
    )
    starts = [s["start"] for s in merged["segments"]]
    assert starts == sorted(starts)                 # 全局单调
    assert merged["segments"][0]["start"] == 0.0
    assert merged["segments"][1]["start"] == 4.1    # 偏移已按实际片长平移
    assert merged["text"] == "第一片\n第二片"
    assert merged["granularity"] == "sentence"
    assert [s["i"] for s in merged["segments"]] == [0, 1]


def test_merge_granularity_degrades_to_lowest():
    merged = merge_chunk_results(
        [
            {"offset": 0.0, "duration": 4.0, "text": "a", "granularity": "sentence",
             "segments": [{"start": 0, "end": 3, "text": "a"}]},
            {"offset": 4.0, "duration": 4.0, "text": "b", "granularity": "chunk",
             "segments": [{"start": 0, "end": 4, "text": "b"}]},
        ]
    )
    assert merged["granularity"] == "chunk"


def test_fmt_timestamp():
    assert fmt_timestamp(0) == "00:00"
    assert fmt_timestamp(61.9) == "01:01"
    assert fmt_timestamp(3723) == "1:02:03"
