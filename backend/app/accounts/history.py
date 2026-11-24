"""Saving analyses to a user's history, and remembering the original names of uploads."""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Iterable, Optional, Union

from . import db

log = logging.getLogger(__name__)

MAX_TEXT = 2000   # longer strings (images as base64, ...) are not stored
MAX_LIST = 200    # longer lists (signals, per-beat arrays, ...) are not stored


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def compact(value):
    """Keep the findings, drop bulky payloads: images, signals and long arrays."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            c = compact(v)
            if c is not _DROP:
                out[k] = c
        return out
    if isinstance(value, (list, tuple)):
        if len(value) > MAX_LIST:
            return _DROP
        items = [compact(v) for v in value]
        return [i for i in items if i is not _DROP]
    if isinstance(value, str) and len(value) > MAX_TEXT:
        return _DROP
    return value


class _Drop:
    pass


_DROP = _Drop()


def remember_upload(name: str, original_name: str, user_id: Optional[int] = None) -> None:
    try:
        with db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO uploads (name, original_name, user_id, created_at) VALUES (?, ?, ?, ?)",
                (name, (original_name or name)[:200], user_id, now_iso()),
            )
    except Exception:  # an upload must never fail because of bookkeeping
        log.exception("could not remember upload name")


def _input_name(file_refs: Iterable[str]) -> str:
    names = []
    with db.connect() as conn:
        for ref in file_refs:
            base = os.path.basename(str(ref).split("?")[0])
            row = conn.execute("SELECT original_name FROM uploads WHERE name = ?", (base,)).fetchone()
            names.append(row["original_name"] if row else base)
    return ", ".join(names)[:300] or "upload"


def record_analysis(user: Optional[dict], task: str, file_refs: Union[str, Iterable[str]], result: dict, response=None) -> Optional[int]:
    """Save a finished analysis for a signed-in user; anonymous callers are not recorded. Never raises."""
    if user is None:
        return None
    try:
        refs = [file_refs] if isinstance(file_refs, str) else list(file_refs)
        stored = compact(result)
        summary = result.get("summary") if isinstance(result, dict) else None
        input_name = _input_name(refs)
        with db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO analyses (user_id, task, input_name, summary, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user["id"], task, input_name, (summary or "")[:500] if isinstance(summary, str) else None,
                 json.dumps(stored), now_iso()),
            )
            hid = cur.lastrowid
        if response is not None:
            response.headers["X-History-Id"] = str(hid)
        return hid
    except Exception:
        log.exception("could not save analysis to history")
        return None
