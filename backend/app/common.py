"""Shared plumbing: upload storage, file_url resolution, and the InvalidInput error."""
import os
import uuid

import requests
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "static_uploads"))
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(tags=["uploads"])


class InvalidInput(ValueError):
    """Raised when an uploaded file is the wrong kind of media for this model."""


async def invalid_input_handler(request, exc: InvalidInput):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@router.post("/uploads")
async def upload_file(request: Request, file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 200 MB.")
    ext = os.path.splitext(file.filename or "")[1].lower()[:8] or ".bin"
    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(data)
    base = str(request.base_url).rstrip("/")
    return {"file_url": f"{base}/static_uploads/{name}"}


def fetch_bytes(file_url: str) -> bytes:
    """Read an uploaded file straight from disk when it is ours, else download it."""
    marker = "/static_uploads/"
    if marker in file_url:
        name = os.path.basename(file_url.split(marker, 1)[1].split("?")[0])
        path = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(path):
            raise InvalidInput("Uploaded file was not found; please upload it again.")
        with open(path, "rb") as f:
            return f.read()
    try:
        r = requests.get(file_url, timeout=60)
        r.raise_for_status()
    except requests.RequestException as e:
        raise InvalidInput(f"Could not download the file: {e}")
    return r.content
