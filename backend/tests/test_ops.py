import os
import time

from fastapi.testclient import TestClient

from app import ops
from app.main import app

client = TestClient(app)


# ---------- security headers and request ids ----------

def test_responses_carry_security_headers():
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"
    assert "camera=()" in r.headers["permissions-policy"]


def test_every_response_has_a_request_id_and_a_client_one_is_echoed():
    assert len(client.get("/health").headers["x-request-id"]) >= 8
    assert client.get("/health", headers={"X-Request-Id": "abc-123"}).headers["x-request-id"] == "abc-123"


def test_unsafe_client_request_ids_are_replaced():
    r = client.get("/health", headers={"X-Request-Id": "bad id\twith spaces<script>"})
    rid = r.headers["x-request-id"]
    assert "<" not in rid and " " not in rid and rid != "bad id\twith spaces<script>"


# ---------- CORS configuration ----------

def test_cors_defaults_to_any_origin_and_can_be_restricted(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert ops.cors_origins() == ["*"]
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example ,")
    assert ops.cors_origins() == ["https://a.example", "https://b.example"]
    monkeypatch.setenv("CORS_ORIGINS", "   ")
    assert ops.cors_origins() == ["*"]


# ---------- readiness ----------

def test_ready_reports_database_and_upload_directory():
    r = client.get("/ready")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["database"] == "ok" and j["uploads"] == "writable"
    assert j["version"] == ops.VERSION


# ---------- upload retention ----------

def _touch(path, age_hours):
    with open(path, "wb") as f:
        f.write(b"x")
    t = time.time() - age_hours * 3600
    os.utime(path, (t, t))


def test_purge_removes_only_files_older_than_the_limit(tmp_path):
    _touch(tmp_path / "old.bin", 100)
    _touch(tmp_path / "recent.bin", 1)
    os.makedirs(tmp_path / "keepdir")
    removed = ops.purge_old_uploads(str(tmp_path), max_age_hours=48)
    assert removed == 1
    assert sorted(os.listdir(tmp_path)) == ["keepdir", "recent.bin"]


def test_purge_with_no_limit_keeps_everything(tmp_path):
    _touch(tmp_path / "old.bin", 10000)
    assert ops.purge_old_uploads(str(tmp_path), max_age_hours=0) == 0
    assert os.listdir(tmp_path) == ["old.bin"]


def test_purge_tolerates_a_missing_directory(tmp_path):
    assert ops.purge_old_uploads(str(tmp_path / "nope"), max_age_hours=1) == 0


def test_purge_hours_come_from_the_environment(monkeypatch):
    monkeypatch.delenv("UPLOAD_TTL_HOURS", raising=False)
    assert ops.upload_ttl_hours() == 0
    monkeypatch.setenv("UPLOAD_TTL_HOURS", "72")
    assert ops.upload_ttl_hours() == 72
    monkeypatch.setenv("UPLOAD_TTL_HOURS", "nonsense")
    assert ops.upload_ttl_hours() == 0
