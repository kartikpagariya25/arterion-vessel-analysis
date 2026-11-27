"""Operations layer: security headers, request ids, CORS configuration, readiness and upload retention."""
import logging
import os
import re
import threading
import time
import uuid

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from . import common
from .accounts import db

VERSION = "1.2.0"
log = logging.getLogger("arterion.ops")
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

router = APIRouter(tags=["operations"])


# ---------- configuration ----------

def cors_origins() -> list:
    """Allowed browser origins from CORS_ORIGINS (comma separated); any origin when unset."""
    raw = os.environ.get("CORS_ORIGINS", "")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["*"]


def upload_ttl_hours() -> float:
    """How long uploaded files are kept. 0 (the default) keeps them until you remove them."""
    try:
        return max(0.0, float(os.environ.get("UPLOAD_TTL_HOURS", "0")))
    except ValueError:
        return 0.0


# ---------- middleware ----------

def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def _headers(request: Request, call_next):
        rid = request.headers.get("x-request-id", "")
        if not _SAFE_ID.match(rid):
            rid = uuid.uuid4().hex[:16]
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
        return response

    app.include_router(router)


# ---------- readiness ----------

@router.get("/ready")
def ready():
    """Is the service able to do work: database reachable and upload directory writable."""
    status, code = {"status": "ok", "version": VERSION}, 200
    try:
        with db.connect() as conn:
            conn.execute("SELECT 1").fetchone()
        status["database"] = "ok"
    except Exception:
        log.exception("readiness: database check failed")
        status["database"], status["status"], code = "unavailable", "degraded", 503
    probe = os.path.join(common.UPLOAD_DIR, f".ready-{uuid.uuid4().hex[:8]}")
    try:
        with open(probe, "wb") as f:
            f.write(b"ok")
        os.remove(probe)
        status["uploads"] = "writable"
    except OSError:
        log.exception("readiness: upload directory is not writable")
        status["uploads"], status["status"], code = "read-only", "degraded", 503
    return JSONResponse(status, status_code=code)


# ---------- upload retention ----------

def purge_old_uploads(directory: str, max_age_hours: float, now: float = None) -> int:
    """Delete files older than max_age_hours from the upload directory. Returns how many were removed."""
    if max_age_hours <= 0 or not os.path.isdir(directory):
        return 0
    cutoff = (now if now is not None else time.time()) - max_age_hours * 3600
    removed = 0
    for entry in os.scandir(directory):
        try:
            if entry.is_file(follow_symlinks=False) and entry.stat().st_mtime < cutoff:
                os.remove(entry.path)
                removed += 1
        except OSError:
            log.warning("could not remove %s", entry.path)
    return removed


def start_purge_thread(directory: str, interval_seconds: int = 3600):
    """Purge once now and then hourly, when UPLOAD_TTL_HOURS is set. Returns the thread, or None when disabled."""
    hours = upload_ttl_hours()
    if hours <= 0:
        return None

    def loop():
        while True:
            try:
                n = purge_old_uploads(directory, hours)
                if n:
                    log.info("removed %d uploads older than %s h", n, hours)
            except Exception:
                log.exception("upload purge failed")
            time.sleep(interval_seconds)

    t = threading.Thread(target=loop, name="upload-purge", daemon=True)
    t.start()
    return t
