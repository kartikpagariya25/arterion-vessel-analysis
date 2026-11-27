"""CSV export and trend series built from saved analyses."""
import csv
import io
import json
from typing import Iterable, List, Sequence

from fastapi import HTTPException
from fastapi.responses import Response

from .metrics_map import METRICS

MAX_EXPORT_ROWS = 5000
MAX_SERIES_POINTS = 500
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

PATIENT_COLUMNS = ["id", "task", "input_name", "created_at", "summary", "reviewed", "doctor_note"]
DOCTOR_COLUMNS = ["id", "patient_id", "patient_name", "patient_email", "task", "input_name", "created_at",
                  "summary", "reviewed", "doctor_note"]


def safe_cell(value) -> str:
    """Stop spreadsheets from running a cell as a formula (CSV injection)."""
    if value is None:
        return ""
    text = str(value)
    return "'" + text if text.startswith(_FORMULA_PREFIXES) else text


def csv_response(filename: str, columns: Sequence[str], rows: Iterable[dict]) -> Response:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([safe_cell(row.get(c)) for c in columns])
    return Response(out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def export_row(r) -> dict:
    """One analyses row (joined with its patient and reviewer) as a flat dict for CSV."""
    return {"id": r["id"], "patient_id": r["patient_id"], "patient_name": r["patient_name"],
            "patient_email": r["patient_email"], "task": r["task"], "input_name": r["input_name"],
            "created_at": r["created_at"], "summary": r["summary"],
            "reviewed": "yes" if r["reviewed_at"] else "no", "doctor_note": r["doctor_note"]}


def series_for(task: str, rows) -> dict:
    """Headline value over time for one task. Analyses that did not record the value are skipped."""
    if task not in METRICS:
        raise HTTPException(status_code=404, detail=f"Unknown task '{task}'.")
    label, unit, extract = METRICS[task]
    points: List[dict] = []
    for r in rows:
        try:
            value = extract(json.loads(r["result_json"]))
        except (ValueError, TypeError, AttributeError):
            value = None
        if value is not None:
            points.append({"id": r["id"], "created_at": r["created_at"], "value": value})
    return {"task": task, "label": label, "unit": unit, "points": points[-MAX_SERIES_POINTS:]}
