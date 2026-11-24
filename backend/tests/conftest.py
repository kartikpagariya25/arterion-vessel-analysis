import os
import sqlite3
import sys
import tempfile

import pytest

_data = tempfile.mkdtemp(prefix="data_")
os.environ.setdefault("UPLOAD_DIR", os.path.join(_data, "uploads"))
os.environ["DATABASE_PATH"] = os.path.join(_data, "test.db")
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret"
os.environ["DOCTOR_INVITE_CODE"] = "invite-123"
os.environ.pop("REQUIRE_AUTH", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(autouse=True)
def clean_db():
    """Start every test with empty accounts tables."""
    from app.accounts import db, security

    db.init_db()
    with sqlite3.connect(os.environ["DATABASE_PATH"]) as c:
        for table in ("analyses", "uploads", "users"):
            c.execute(f"DELETE FROM {table}")
    security.reset_login_failures()
    yield

@pytest.fixture
def task_request(monkeypatch):
    """Patch this repo's predict to a canned result and describe how to call it."""
    from types import SimpleNamespace

    from app.vessel_analysis import router

    monkeypatch.setattr(router, "predict", lambda url: {"summary": "ok", "lesion_count": 60.0, "big_image": "x" * 5000, "series": list(range(500))})

    def make_body(url):
        return {"file_url": url}

    return SimpleNamespace(url="/vessel-analysis/predict", task="vessel-analysis", key="lesion_count",
                           make_body=make_body, body=make_body("http://testserver/static_uploads/abc123.png"))
