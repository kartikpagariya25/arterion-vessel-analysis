import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import ops
from .accounts import db as accounts_db
from .accounts.router import router as accounts_router
from .common import UPLOAD_DIR, InvalidInput, invalid_input_handler, router as uploads_router
from .vessel_analysis.router import router as vessel_router

app = FastAPI(title="Arterion Vessel Analysis")
app.add_middleware(CORSMiddleware, allow_origins=ops.cors_origins(), allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-History-Id", "X-Request-Id"])
ops.install(app)
ops.start_purge_thread(UPLOAD_DIR)
app.add_exception_handler(InvalidInput, invalid_input_handler)
accounts_db.init_db()
app.include_router(accounts_router)
app.include_router(uploads_router)
app.include_router(vessel_router)
app.mount("/static_uploads", StaticFiles(directory=UPLOAD_DIR), name="static_uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
