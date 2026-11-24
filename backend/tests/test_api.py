import io

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _png_bytes():
    img = np.full((64, 64, 3), 128, dtype=np.uint8)
    return cv2.imencode(".png", img)[1].tobytes()


def _upload(data: bytes, name: str):
    return client.post("/uploads", files={"file": (name, io.BytesIO(data))})


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_upload_roundtrip():
    r = _upload(b"hello-bytes", "a.png")
    assert r.status_code == 200
    url = r.json()["file_url"]
    assert url.endswith(".png")
    path = url.split("testserver", 1)[1]
    assert client.get(path).content == b"hello-bytes"


def test_upload_empty_rejected():
    assert _upload(b"", "a.png").status_code == 400


def test_predict_without_weights_returns_fallback(monkeypatch):
    from app.vessel_analysis import model as m
    monkeypatch.setattr(m, "_models_available", lambda: False)
    monkeypatch.setattr(m, "_vessel_session", None)
    url = _upload(_png_bytes(), "a.png").json()["file_url"]
    r = client.post("/vessel-analysis/predict", json={"file_url": url})
    assert r.status_code == 200
    assert "weights not found" in r.json()["summary"]


def test_predict_rejects_non_image():
    url = _upload(b"this is not an image", "notes.txt").json()["file_url"]
    r = client.post("/vessel-analysis/predict", json={"file_url": url})
    assert r.status_code == 422
    assert "detail" in r.json()


def test_report_endpoint_works_without_api_key():
    url = _upload(_png_bytes(), "a.png").json()["file_url"]
    r = client.post("/vessel-analysis/report", json={"file_url": url})
    assert r.status_code == 200
    assert "report" in r.json()


def test_predict_video_rejects_non_video():
    url = _upload(b"this is not a video", "notes.txt").json()["file_url"]
    r = client.post("/vessel-analysis/predict-video", json={"file_url": url})
    assert r.status_code == 422
