#!/usr/bin/env bash
# Runs the API (http://localhost:8000) and the site (http://localhost:8080) without Docker. Needs Python 3.11.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3.11}"
command -v "$PY" >/dev/null 2>&1 || PY=python
[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate
pip install -q -r backend/requirements.txt
(cd backend && uvicorn app.main:app --port 8000) &
API=$!
trap 'kill $API 2>/dev/null || true' EXIT
cd frontend && python -m http.server 8080
