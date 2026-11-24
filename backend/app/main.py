import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .common import UPLOAD_DIR, InvalidInput, invalid_input_handler, router as uploads_router
from .vessel_analysis.router import router as vessel_router

app = FastAPI(title="Arterion Vessel Analysis")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(InvalidInput, invalid_input_handler)
app.include_router(uploads_router)
app.include_router(vessel_router)
app.mount("/static_uploads", StaticFiles(directory=UPLOAD_DIR), name="static_uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
