# Contributing

Thanks for looking at Arterion Vessel Analysis. This is a research prototype, so small, focused changes are easiest to review.

## Set up
```bash
cd backend
pip install -r requirements-dev.txt     # Python 3.11
pytest tests -q                         # 31 tests, no weights needed
```
The tests use stand-in ONNX sessions, so they run without the trained weights. To try the real model, run `scripts/fetch_weights.sh` (or `.ps1`) first.

## Guidelines
- Add or update a test with every behaviour change; write it first and watch it fail.
- Keep the API contract stable: `POST /uploads`, the task's `predict` endpoint, `GET /health`, and a readable `detail` with HTTP 422 for the wrong kind of file.
- Do not commit weights, datasets, sample patient data or logs. Weights are published as GitHub Release assets.
- If you change the model or evaluation, update `training/artifacts/metrics.json` and the numbers in the README together.

Research prototype, not a medical device. Do not use for diagnosis or treatment decisions.
