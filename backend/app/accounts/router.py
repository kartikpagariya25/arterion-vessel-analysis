"""Accounts API: registration, login, patient history and the doctor dashboard."""
import hmac
import json
import os
import re
import sqlite3
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator

from . import db, exports, security
from .deps import current_user, require_doctor
from .history import now_iso

router = APIRouter(tags=["accounts"])
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- request models ----------

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    role: Literal["patient", "doctor"] = "patient"
    invite_code: Optional[str] = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        if len(v) > 254 or not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Enter your name.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str = Field(max_length=128)


class PasswordChange(BaseModel):
    old_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ReviewRequest(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        v = v.strip()
        if not v or len(v) > 2000:
            raise ValueError("A review note must be 1-2000 characters.")
        return v


# ---------- helpers ----------

def _public(user: dict) -> dict:
    return {k: user[k] for k in ("id", "email", "name", "role", "created_at")}


def _token_response(user: dict) -> dict:
    return {"access_token": security.create_token(user["id"]), "token_type": "bearer", "user": _public(user)}


def _summary_row(r) -> dict:
    return {"id": r["id"], "task": r["task"], "input_name": r["input_name"], "summary": r["summary"],
            "created_at": r["created_at"], "reviewed": r["reviewed_at"] is not None}


def _detail(r) -> dict:
    d = _summary_row(r)
    d.update(result=json.loads(r["result_json"]), doctor_note=r["doctor_note"],
             reviewed_by=r["reviewer_name"], reviewed_at=r["reviewed_at"])
    return d


_DETAIL_SQL = """
SELECT a.*, rv.name AS reviewer_name, p.id AS patient_id, p.name AS patient_name, p.email AS patient_email
FROM analyses a
JOIN users p ON p.id = a.user_id
LEFT JOIN users rv ON rv.id = a.reviewed_by
"""


# ---------- auth ----------

@router.post("/auth/register", status_code=201)
def register(req: RegisterRequest):
    if req.role == "doctor":
        code = os.environ.get("DOCTOR_INVITE_CODE", "")
        if not code or not hmac.compare_digest((req.invite_code or "").encode(), code.encode()):
            raise HTTPException(status_code=403, detail="Doctor registration needs a valid invite code.")
    try:
        with db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (req.email, req.name, req.role, security.hash_password(req.password), now_iso()),
            )
            row = conn.execute("SELECT id, email, name, role, created_at FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return _token_response(dict(row))


@router.post("/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    if security.is_locked(email):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None:
        security.burn_password_check(req.password)
    if row is None or not security.verify_password(req.password, row["password_hash"]):
        security.register_failure(email)
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    security.clear_failures(email)
    return _token_response(dict(row))


@router.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return _public(user)


@router.post("/auth/password", status_code=204)
def change_password(req: PasswordChange, user: dict = Depends(current_user)):
    with db.connect() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not security.verify_password(req.old_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Your current password is incorrect.")
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (security.hash_password(req.new_password), user["id"]))
    return Response(status_code=204)


@router.delete("/auth/me", status_code=204)
def delete_account(user: dict = Depends(current_user)):
    with db.connect() as conn:
        conn.execute("DELETE FROM analyses WHERE user_id = ?", (user["id"],))
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    return Response(status_code=204)


# ---------- patient history ----------

@router.get("/history")
def list_history(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), user: dict = Depends(current_user)):
    with db.connect() as conn:
        total = conn.execute("SELECT COUNT(*) FROM analyses WHERE user_id = ?", (user["id"],)).fetchone()[0]
        rows = conn.execute("SELECT * FROM analyses WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                            (user["id"], limit, offset)).fetchall()
    return {"items": [_summary_row(r) for r in rows], "total": total}


@router.get("/history/export.csv")
def export_history(user: dict = Depends(current_user)):
    with db.connect() as conn:
        rows = conn.execute(_DETAIL_SQL + " WHERE a.user_id = ? ORDER BY a.id DESC LIMIT ?",
                            (user["id"], exports.MAX_EXPORT_ROWS)).fetchall()
    return exports.csv_response("arterion-history.csv", exports.PATIENT_COLUMNS, (exports.export_row(r) for r in rows))


def _series_rows(user_id: int, task: str):
    with db.connect() as conn:
        return conn.execute("SELECT id, created_at, result_json FROM analyses WHERE user_id = ? AND task = ? ORDER BY id",
                            (user_id, task)).fetchall()


@router.get("/history/series")
def history_series(task: str = Query(..., max_length=60), user: dict = Depends(current_user)):
    return exports.series_for(task, _series_rows(user["id"], task))


@router.get("/history/{analysis_id}")
def get_history_item(analysis_id: int, user: dict = Depends(current_user)):
    with db.connect() as conn:
        row = conn.execute(_DETAIL_SQL + " WHERE a.id = ? AND a.user_id = ?", (analysis_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="That analysis was not found.")
    return _detail(row)


@router.delete("/history/{analysis_id}", status_code=204)
def delete_history_item(analysis_id: int, user: dict = Depends(current_user)):
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user["id"]))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="That analysis was not found.")
    return Response(status_code=204)


# ---------- doctor dashboard ----------

@router.get("/doctor/patients")
def doctor_patients(q: Optional[str] = Query(None, max_length=80), doctor: dict = Depends(require_doctor)):
    sql = ("SELECT u.id, u.name, u.email, u.created_at, COUNT(a.id) AS analyses, MAX(a.created_at) AS last_activity, "
           "SUM(CASE WHEN a.id IS NOT NULL AND a.reviewed_at IS NULL THEN 1 ELSE 0 END) AS awaiting_review "
           "FROM users u LEFT JOIN analyses a ON a.user_id = u.id WHERE u.role = 'patient'")
    args = []
    if q:
        sql += " AND (LOWER(u.name) LIKE ? OR u.email LIKE ?)"
        like = f"%{q.strip().lower()}%"
        args += [like, like]
    sql += " GROUP BY u.id ORDER BY (MAX(a.created_at) IS NULL), MAX(a.created_at) DESC, u.name"
    with db.connect() as conn:
        rows = conn.execute(sql, args).fetchall()
    return {"items": [{**dict(r), "awaiting_review": r["awaiting_review"] or 0} for r in rows]}


@router.get("/doctor/analyses")
def doctor_analyses(patient_id: Optional[int] = None, task: Optional[str] = Query(None, max_length=60),
                    reviewed: Optional[bool] = None, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                    doctor: dict = Depends(require_doctor)):
    clause, args = _doctor_filters(patient_id, task, reviewed)
    with db.connect() as conn:
        total = conn.execute("SELECT COUNT(*) FROM analyses a JOIN users p ON p.id = a.user_id" + clause, args).fetchone()[0]
        rows = conn.execute(_DETAIL_SQL + clause + " ORDER BY a.id DESC LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
    items = [{**_summary_row(r), "patient": {"id": r["patient_id"], "name": r["patient_name"], "email": r["patient_email"]}} for r in rows]
    return {"items": items, "total": total}


def _doctor_detail(analysis_id: int) -> dict:
    with db.connect() as conn:
        row = conn.execute(_DETAIL_SQL + " WHERE a.id = ? AND p.role = 'patient'", (analysis_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="That analysis was not found.")
    d = _detail(row)
    d["patient"] = {"id": row["patient_id"], "name": row["patient_name"], "email": row["patient_email"]}
    return d


def _doctor_filters(patient_id, task, reviewed):
    where, args = ["p.role = 'patient'"], []
    if patient_id is not None:
        where.append("a.user_id = ?")
        args.append(patient_id)
    if task:
        where.append("a.task = ?")
        args.append(task)
    if reviewed is not None:
        where.append("a.reviewed_at IS NOT NULL" if reviewed else "a.reviewed_at IS NULL")
    return " WHERE " + " AND ".join(where), args


@router.get("/doctor/analyses/export.csv")
def doctor_export(patient_id: Optional[int] = None, task: Optional[str] = Query(None, max_length=60),
                  reviewed: Optional[bool] = None, doctor: dict = Depends(require_doctor)):
    clause, args = _doctor_filters(patient_id, task, reviewed)
    with db.connect() as conn:
        rows = conn.execute(_DETAIL_SQL + clause + " ORDER BY a.id DESC LIMIT ?", args + [exports.MAX_EXPORT_ROWS]).fetchall()
    return exports.csv_response("arterion-analyses.csv", exports.DOCTOR_COLUMNS, (exports.export_row(r) for r in rows))


@router.get("/doctor/patients/{patient_id}/series")
def doctor_patient_series(patient_id: int, task: str = Query(..., max_length=60), doctor: dict = Depends(require_doctor)):
    with db.connect() as conn:
        patient = conn.execute("SELECT id FROM users WHERE id = ? AND role = 'patient'", (patient_id,)).fetchone()
    if patient is None:
        raise HTTPException(status_code=404, detail="That patient was not found.")
    return exports.series_for(task, _series_rows(patient_id, task))


@router.get("/doctor/analyses/{analysis_id}")
def doctor_analysis(analysis_id: int, doctor: dict = Depends(require_doctor)):
    return _doctor_detail(analysis_id)


@router.post("/doctor/analyses/{analysis_id}/review")
def review_analysis(analysis_id: int, req: ReviewRequest, doctor: dict = Depends(require_doctor)):
    _doctor_detail(analysis_id)  # 404 if missing
    with db.connect() as conn:
        conn.execute("UPDATE analyses SET doctor_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
                     (req.note, doctor["id"], now_iso(), analysis_id))
    return _doctor_detail(analysis_id)
