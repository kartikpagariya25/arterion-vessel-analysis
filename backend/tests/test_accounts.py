import io
import os
import sqlite3

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PW = "correct horse battery"


def register(email="pat@example.com", name="Pat", role="patient", invite=None, password=PW):
    body = {"email": email, "password": password, "name": name, "role": role}
    if invite:
        body["invite_code"] = invite
    return client.post("/auth/register", json=body)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def patient(email="pat@example.com", name="Pat"):
    return register(email, name).json()["access_token"]


def doctor(email="doc@example.com"):
    r = register(email, "Dr Doc", role="doctor", invite="invite-123")
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


# ---------- registration and login ----------

def test_register_returns_token_and_user_without_password():
    r = register()
    assert r.status_code == 201
    j = r.json()
    assert j["token_type"] == "bearer" and j["access_token"]
    assert j["user"]["email"] == "pat@example.com" and j["user"]["role"] == "patient"
    assert "password" not in r.text and "hash" not in r.text


def test_duplicate_email_is_rejected_case_insensitively():
    register("a@example.com")
    assert register("A@Example.com").status_code == 409


def test_weak_password_and_bad_email_are_rejected():
    assert register(password="short").status_code == 422
    assert register(email="not-an-email").status_code == 422


def test_password_is_stored_hashed():
    register()
    with sqlite3.connect(os.environ["DATABASE_PATH"]) as c:
        stored = c.execute("SELECT password_hash FROM users").fetchone()[0]
    assert PW not in stored and stored.startswith("scrypt$")


def test_login_success_and_failures_look_the_same():
    register()
    ok = client.post("/auth/login", json={"email": "pat@example.com", "password": PW})
    assert ok.status_code == 200 and ok.json()["user"]["name"] == "Pat"
    wrong = client.post("/auth/login", json={"email": "pat@example.com", "password": "nope-nope-nope"})
    unknown = client.post("/auth/login", json={"email": "who@example.com", "password": PW})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_locks_out_after_repeated_failures():
    register()
    for _ in range(5):
        client.post("/auth/login", json={"email": "pat@example.com", "password": "bad-bad-bad-bad"})
    r = client.post("/auth/login", json={"email": "pat@example.com", "password": PW})
    assert r.status_code == 429


def test_doctor_registration_needs_the_invite_code(monkeypatch):
    assert register("d1@example.com", role="doctor").status_code == 403
    assert register("d2@example.com", role="doctor", invite="wrong").status_code == 403
    assert register("d3@example.com", role="doctor", invite="invite-123").json()["user"]["role"] == "doctor"
    monkeypatch.delenv("DOCTOR_INVITE_CODE")
    assert register("d4@example.com", role="doctor", invite="invite-123").status_code == 403


# ---------- tokens ----------

def test_me_requires_a_valid_token():
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=auth("garbage")).status_code == 401
    t = patient()
    assert client.get("/auth/me", headers=auth(t)).json()["email"] == "pat@example.com"
    assert client.get("/auth/me", headers=auth(t[:-3] + "abc")).status_code == 401


def test_expired_token_is_rejected():
    from app.accounts import security

    t = patient()
    uid = client.get("/auth/me", headers=auth(t)).json()["id"]
    expired = security.create_token(uid, expires_minutes=-1)
    assert client.get("/auth/me", headers=auth(expired)).status_code == 401


def test_change_password():
    t = patient()
    bad = client.post("/auth/password", headers=auth(t), json={"old_password": "wrong-wrong", "new_password": "a brand new pass"})
    assert bad.status_code == 400
    ok = client.post("/auth/password", headers=auth(t), json={"old_password": PW, "new_password": "a brand new pass"})
    assert ok.status_code == 204
    assert client.post("/auth/login", json={"email": "pat@example.com", "password": "a brand new pass"}).status_code == 200
    assert client.post("/auth/login", json={"email": "pat@example.com", "password": PW}).status_code == 401


def test_delete_account_removes_history_and_invalidates_token(task_request):
    t = patient()
    url, body = task_request.url, task_request.body
    client.post(url, json=body, headers=auth(t))
    assert client.delete("/auth/me", headers=auth(t)).status_code == 204
    assert client.get("/auth/me", headers=auth(t)).status_code == 401
    with sqlite3.connect(os.environ["DATABASE_PATH"]) as c:
        assert c.execute("SELECT COUNT(*) FROM analyses").fetchone()[0] == 0


# ---------- history ----------

def test_anonymous_prediction_works_and_is_not_saved(task_request):
    url, body = task_request.url, task_request.body
    r = client.post(url, json=body)
    assert r.status_code == 200 and "x-history-id" not in r.headers
    with sqlite3.connect(os.environ["DATABASE_PATH"]) as c:
        assert c.execute("SELECT COUNT(*) FROM analyses").fetchone()[0] == 0


def test_signed_in_prediction_is_saved_compactly(task_request):
    t = patient()
    url, body = task_request.url, task_request.body
    r = client.post(url, json=body, headers=auth(t))
    assert r.status_code == 200 and r.json()[task_request.key] == 60.0
    hid = int(r.headers["x-history-id"])
    items = client.get("/history", headers=auth(t)).json()["items"]
    assert [i["id"] for i in items] == [hid]
    detail = client.get(f"/history/{hid}", headers=auth(t)).json()
    assert detail["task"] == task_request.task and detail["input_name"]
    assert detail["result"][task_request.key] == 60.0
    assert "big_image" not in detail["result"] and "series" not in detail["result"]
    assert detail["reviewed"] is False and detail["doctor_note"] is None


def test_history_is_private_to_each_patient(task_request):
    a, b = patient("a@example.com"), patient("b@example.com")
    url, body = task_request.url, task_request.body
    hid = int(client.post(url, json=body, headers=auth(a)).headers["x-history-id"])
    assert client.get("/history", headers=auth(b)).json()["items"] == []
    assert client.get(f"/history/{hid}", headers=auth(b)).status_code == 404
    assert client.delete(f"/history/{hid}", headers=auth(b)).status_code == 404
    assert client.delete(f"/history/{hid}", headers=auth(a)).status_code == 204
    assert client.get("/history", headers=auth(a)).json()["items"] == []


def test_history_requires_login_and_paginates(task_request):
    assert client.get("/history").status_code == 401
    t = patient()
    url, body = task_request.url, task_request.body
    for _ in range(3):
        client.post(url, json=body, headers=auth(t))
    page = client.get("/history?limit=2&offset=0", headers=auth(t)).json()
    assert len(page["items"]) == 2 and page["total"] == 3
    assert len(client.get("/history?limit=2&offset=2", headers=auth(t)).json()["items"]) == 1
    assert client.get("/history?limit=0", headers=auth(t)).status_code == 422


def test_upload_remembers_the_original_filename(task_request):
    t = patient()
    up = client.post("/uploads", files={"file": ("my echo.avi", io.BytesIO(b"abc"))}, headers=auth(t))
    url = up.json()["file_url"]
    r = client.post(task_request.url, json=task_request.make_body(url), headers=auth(t))
    hid = int(r.headers["x-history-id"])
    assert client.get(f"/history/{hid}", headers=auth(t)).json()["input_name"] == "my echo.avi"


# ---------- doctor dashboard ----------

def test_patients_cannot_use_doctor_endpoints():
    t = patient()
    for path in ("/doctor/patients", "/doctor/analyses"):
        assert client.get(path, headers=auth(t)).status_code == 403
        assert client.get(path).status_code == 401


def test_doctor_sees_patients_and_their_analyses(task_request):
    a, b = patient("a@example.com", "Alice"), patient("b@example.com", "Bob")
    d = doctor()
    url, body = task_request.url, task_request.body
    client.post(url, json=body, headers=auth(a))
    client.post(url, json=body, headers=auth(a))
    client.post(url, json=body, headers=auth(b))
    patients = client.get("/doctor/patients", headers=auth(d)).json()["items"]
    by_name = {p["name"]: p for p in patients}
    assert set(by_name) == {"Alice", "Bob"}  # doctors are not listed as patients
    assert by_name["Alice"]["analyses"] == 2 and by_name["Bob"]["analyses"] == 1
    all_items = client.get("/doctor/analyses", headers=auth(d)).json()
    assert all_items["total"] == 3 and all_items["items"][0]["patient"]["name"] in ("Alice", "Bob")
    only_alice = client.get(f"/doctor/analyses?patient_id={by_name['Alice']['id']}", headers=auth(d)).json()
    assert only_alice["total"] == 2


def test_doctor_review_is_visible_to_the_patient(task_request):
    p = patient()
    d = doctor()
    url, body = task_request.url, task_request.body
    hid = int(client.post(url, json=body, headers=auth(p)).headers["x-history-id"])
    assert client.get("/doctor/analyses?reviewed=false", headers=auth(d)).json()["total"] == 1
    r = client.post(f"/doctor/analyses/{hid}/review", headers=auth(d), json={"note": "Looks consistent; repeat in 3 months."})
    assert r.status_code == 200 and r.json()["reviewed"] is True
    mine = client.get(f"/history/{hid}", headers=auth(p)).json()
    assert mine["doctor_note"] == "Looks consistent; repeat in 3 months."
    assert mine["reviewed_by"] == "Dr Doc" and mine["reviewed_at"]
    assert client.get("/doctor/analyses?reviewed=false", headers=auth(d)).json()["total"] == 0


def test_review_validation_and_permissions(task_request):
    p, d = patient(), doctor()
    url, body = task_request.url, task_request.body
    hid = int(client.post(url, json=body, headers=auth(p)).headers["x-history-id"])
    assert client.post(f"/doctor/analyses/{hid}/review", headers=auth(p), json={"note": "hi"}).status_code == 403
    assert client.post(f"/doctor/analyses/{hid}/review", headers=auth(d), json={"note": "  "}).status_code == 422
    assert client.post(f"/doctor/analyses/{hid}/review", headers=auth(d), json={"note": "x" * 2001}).status_code == 422
    assert client.post("/doctor/analyses/99999/review", headers=auth(d), json={"note": "ok"}).status_code == 404


def test_doctor_can_open_any_analysis(task_request):
    p, d = patient(), doctor()
    url, body = task_request.url, task_request.body
    hid = int(client.post(url, json=body, headers=auth(p)).headers["x-history-id"])
    j = client.get(f"/doctor/analyses/{hid}", headers=auth(d)).json()
    assert j["patient"]["email"] == "pat@example.com" and j["result"][task_request.key] == 60.0


# ---------- enforcing login ----------

def test_require_auth_blocks_anonymous_use(monkeypatch, task_request):
    monkeypatch.setenv("REQUIRE_AUTH", "1")
    url, body = task_request.url, task_request.body
    assert client.post(url, json=body).status_code == 401
    assert client.post("/uploads", files={"file": ("a.avi", io.BytesIO(b"abc"))}).status_code == 401
    t = patient()
    assert client.post(url, json=body, headers=auth(t)).status_code == 200


def test_cors_exposes_the_history_header(task_request):
    t = patient()
    url, body = task_request.url, task_request.body
    r = client.post(url, json=body, headers={**auth(t), "Origin": "http://localhost:8080"})
    assert "x-history-id" in r.headers.get("access-control-expose-headers", "").lower()
