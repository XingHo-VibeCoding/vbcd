# API 层测试：Bearer 鉴权、job 信封 404、DELETE 立即清理。
# 不跑真实流水线（ASR/下载由其他用例覆盖）。
import pytest
from fastapi.testclient import TestClient

from asr import jobs
from asr.config import reset_settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SERVICE_TOKEN", "test-token")
    monkeypatch.setenv("JOBS_DIR", str(tmp_path / "jobs"))
    reset_settings()
    from asr.app import create_app
    with TestClient(create_app()) as c:
        yield c
    reset_settings()


def test_healthz_public(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    for key in ("ok", "ffmpeg", "ffprobe", "ytdlp", "provider_configured",
                "jobs_dir_writable", "version"):
        assert key in body


def test_v1_requires_token(client):
    assert client.get("/v1/jobs/x").status_code == 401
    assert client.post("/v1/transcribe", json={"source": "https://x.com/v"}).status_code == 401
    assert client.delete("/v1/jobs/x").status_code == 401


def test_wrong_token_rejected(client):
    r = client.get("/v1/jobs/x", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "AUTH_FAILED"


def test_unknown_job_404(client):
    r = client.get("/v1/jobs/nope", headers={"Authorization": "Bearer test-token"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "JOB_NOT_FOUND"


def test_delete_cleans_state_and_dir(client, tmp_path):
    # 手工造一份 job 状态 + 临时目录，验证 DELETE 全清
    settings = __import__("asr.config", fromlist=["get_settings"]).get_settings()
    work = tmp_path / "jobs" / "j1"
    work.mkdir(parents=True)
    (work / "chunk.wav").write_bytes(b"x")
    jobs._JOBS["j1"] = {
        "job_id": "j1", "status": "succeeded",
        "progress": {"stage": "merge", "done": 1, "total": 1, "percent": 100},
        "created_at": "x", "updated_at": "x", "result": {"text": "a"}, "error": None,
    }
    (tmp_path / "jobs" / "j1.json").write_text("{}")

    r = client.delete("/v1/jobs/j1", headers={"Authorization": "Bearer test-token"})
    assert r.status_code == 200 and r.json() == {"deleted": True}
    assert not work.exists()
    assert not (tmp_path / "jobs" / "j1.json").exists()
    assert "j1" not in jobs._JOBS


def test_delete_unknown_404(client):
    r = client.delete("/v1/jobs/nope", headers={"Authorization": "Bearer test-token"})
    assert r.status_code == 404


def test_transcribe_empty_source_400(client):
    r = client.post(
        "/v1/transcribe",
        json={"source": "   "},
        headers={"Authorization": "Bearer test-token"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_SOURCE"
