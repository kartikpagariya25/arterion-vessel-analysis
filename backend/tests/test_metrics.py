from fastapi.testclient import TestClient

from app.accounts.history import record_analysis
from app.main import app

client = TestClient(app)


def _register():
    r = client.post("/auth/register", json={"email": "a@example.com", "password": "correct horse battery", "name": "Alice"})
    return r.json()["access_token"], r.json()["user"]


def _points(token, task):
    r = client.get(f"/history/series?task={task}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return r.json()["points"]


def test_image_and_video_scans_both_trend_peak_stenosis():
    token, user = _register()
    lesions = [{"stenosis_percent": 31.5}, {"stenosis_percent": 72.0}, {"stenosis_percent": 48.0}]
    record_analysis(user, "vessel-analysis", "http://x/static_uploads/a.png", {"summary": "s", "lesions": lesions})
    record_analysis(user, "vessel-analysis-video", "http://x/static_uploads/b.mp4", {"summary": "s", "lesions": lesions[:2]})
    assert [p["value"] for p in _points(token, "vessel-analysis")] == [72.0]
    assert [p["value"] for p in _points(token, "vessel-analysis-video")] == [72.0]


def test_scans_without_lesions_are_left_out_of_the_trend():
    token, user = _register()
    record_analysis(user, "vessel-analysis", "http://x/static_uploads/a.png", {"summary": "clear", "lesions": []})
    record_analysis(user, "vessel-analysis-video", "http://x/static_uploads/b.mp4", {"summary": "clear"})
    assert _points(token, "vessel-analysis") == []
    assert _points(token, "vessel-analysis-video") == []
