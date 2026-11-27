import csv
import io

from fastapi.testclient import TestClient

from app.accounts.history import record_analysis
from app.main import app

client = TestClient(app)
PW = "correct horse battery"


def register(email, name, role="patient", invite=None):
    body = {"email": email, "password": PW, "name": name, "role": role}
    if invite:
        body["invite_code"] = invite
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    return r.json()["access_token"], r.json()["user"]


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def rows(resp):
    assert resp.headers["content-type"].startswith("text/csv")
    return list(csv.DictReader(io.StringIO(resp.text)))


# ---------- patient CSV export ----------

def test_history_export_is_csv_with_every_analysis(task_request):
    t, _ = register("a@example.com", "Alice")
    for _ in range(3):
        client.post(task_request.url, json=task_request.body, headers=auth(t))
    r = client.get("/history/export.csv", headers=auth(t))
    assert "attachment" in r.headers["content-disposition"] and ".csv" in r.headers["content-disposition"]
    data = rows(r)
    assert len(data) == 3
    assert list(data[0].keys()) == ["id", "task", "input_name", "created_at", "summary", "reviewed", "doctor_note"]
    assert data[0]["task"] == task_request.task and data[0]["reviewed"] == "no"


def test_history_export_requires_login_and_stays_private(task_request):
    assert client.get("/history/export.csv").status_code == 401
    a, _ = register("a@example.com", "Alice")
    b, _ = register("b@example.com", "Bob")
    client.post(task_request.url, json=task_request.body, headers=auth(a))
    assert rows(client.get("/history/export.csv", headers=auth(b))) == []


def test_export_neutralises_spreadsheet_formulas():
    t, user = register("a@example.com", "Alice")
    record_analysis(user, "ef-estimation", "http://x/static_uploads/a.avi", {"summary": "=HYPERLINK(\"http://evil\",\"x\")"})
    record_analysis(user, "ef-estimation", "http://x/static_uploads/b.avi", {"summary": "+1+1"})
    cells = [r["summary"] for r in rows(client.get("/history/export.csv", headers=auth(t)))]
    assert all(c.startswith("'") for c in cells), cells


def test_export_includes_the_doctors_note(task_request):
    p, _ = register("p@example.com", "Pat")
    d, _ = register("d@example.com", "Dr Doc", "doctor", "invite-123")
    hid = int(client.post(task_request.url, json=task_request.body, headers=auth(p)).headers["x-history-id"])
    client.post(f"/doctor/analyses/{hid}/review", headers=auth(d), json={"note": "Repeat in 3 months."})
    row = rows(client.get("/history/export.csv", headers=auth(p)))[0]
    assert row["reviewed"] == "yes" and row["doctor_note"] == "Repeat in 3 months."


# ---------- doctor CSV export ----------

def test_doctor_export_covers_all_patients_and_filters(task_request):
    a, ua = register("a@example.com", "Alice")
    b, _ = register("b@example.com", "Bob")
    d, _ = register("d@example.com", "Dr Doc", "doctor", "invite-123")
    client.post(task_request.url, json=task_request.body, headers=auth(a))
    client.post(task_request.url, json=task_request.body, headers=auth(b))
    allrows = rows(client.get("/doctor/analyses/export.csv", headers=auth(d)))
    assert {r["patient_name"] for r in allrows} == {"Alice", "Bob"}
    assert "patient_email" in allrows[0]
    only = rows(client.get(f"/doctor/analyses/export.csv?patient_id={ua['id']}", headers=auth(d)))
    assert [r["patient_name"] for r in only] == ["Alice"]


def test_doctor_export_is_for_doctors_only():
    p, _ = register("p@example.com", "Pat")
    assert client.get("/doctor/analyses/export.csv", headers=auth(p)).status_code == 403
    assert client.get("/doctor/analyses/export.csv").status_code == 401


# ---------- trend series ----------

def test_series_returns_the_headline_value_over_time(task_request):
    t, _ = register("a@example.com", "Alice")
    ids = [int(client.post(task_request.url, json=task_request.body, headers=auth(t)).headers["x-history-id"]) for _ in range(2)]
    r = client.get(f"/history/series?task={task_request.task}", headers=auth(t))
    assert r.status_code == 200
    j = r.json()
    assert j["task"] == task_request.task and j["label"]
    assert [p["id"] for p in j["points"]] == ids
    assert all(p["value"] == task_request.metric_value and p["created_at"] for p in j["points"])


def test_series_skips_analyses_without_the_value_and_is_private(task_request):
    a, ua = register("a@example.com", "Alice")
    b, _ = register("b@example.com", "Bob")
    record_analysis(ua, task_request.task, "http://x/static_uploads/n.bin", {"summary": "no number here"})
    client.post(task_request.url, json=task_request.body, headers=auth(a))
    assert len(client.get(f"/history/series?task={task_request.task}", headers=auth(a)).json()["points"]) == 1
    assert client.get(f"/history/series?task={task_request.task}", headers=auth(b)).json()["points"] == []


def test_series_validation_and_auth():
    t, _ = register("a@example.com", "Alice")
    assert client.get("/history/series?task=nope", headers=auth(t)).status_code == 404
    assert client.get("/history/series", headers=auth(t)).status_code == 422
    assert client.get("/history/series?task=x").status_code == 401


def test_doctor_can_read_a_patients_series(task_request):
    p, up = register("p@example.com", "Pat")
    d, _ = register("d@example.com", "Dr Doc", "doctor", "invite-123")
    client.post(task_request.url, json=task_request.body, headers=auth(p))
    r = client.get(f"/doctor/patients/{up['id']}/series?task={task_request.task}", headers=auth(d))
    assert r.status_code == 200 and len(r.json()["points"]) == 1
    assert client.get(f"/doctor/patients/{up['id']}/series?task={task_request.task}", headers=auth(p)).status_code == 403
    assert client.get(f"/doctor/patients/99999/series?task={task_request.task}", headers=auth(d)).status_code == 404
