# Deployment

How to run Arterion Vessel Analysis somewhere other than your own laptop. It is a research prototype: read [SECURITY.md](../SECURITY.md) first, and do not put real patient data on a public instance.

## Containers

```
docker compose up --build        # site on :8080, API on :8000
```

- The trained weights are not in git. Run `scripts/fetch_weights.sh` (or `.ps1`) first; compose mounts `backend/app/vessel_analysis/weights` read-only.
- The API image runs as an unprivileged user (uid 10001). The named volume `data` holds the database and the uploads.
- Both images define a health check. The API reports through `/ready`, the site through `/healthz`, and compose starts the site only once the API is healthy.

## Configuration

Copy `.env.example` to `.env` (it is git-ignored). Compose passes these through to the API.

| Variable | Default | What it does |
|---|---|---|
| `JWT_SECRET` | generated and kept in the data volume | Signs sign-in tokens. Set it explicitly to share tokens across replicas. |
| `JWT_EXPIRE_MINUTES` | `480` | How long a token lasts. |
| `DOCTOR_INVITE_CODE` | empty | Code needed to register as a doctor. Empty means nobody can. |
| `REQUIRE_AUTH` | empty | `1` makes every endpoint, uploads included, require a signed-in user. |
| `CORS_ORIGINS` | empty (any origin) | Comma-separated origins allowed to call the API from a browser, for example `https://app.example.com`. |
| `UPLOAD_TTL_HOURS` | empty (keep) | Delete uploads older than this many hours. Checked at start-up and then hourly. |
| `DATA_DIR` | next to the app | Where the database and generated secret live (`/data` in the container). |
| `DATABASE_PATH` | `$DATA_DIR/arterion.db` | Location of the SQLite file. |
| `UPLOAD_DIR` | `app/static_uploads` | Where uploaded files are stored (`/data/uploads` in the container). |
| `GEMINI_API_KEY` | empty | Optional. Enables the written patient report; without it the report is a fixed template. |

## Health checks

- `GET /health` answers as long as the process is up.
- `GET /ready` also checks that the database answers and the upload directory is writable. It returns 503 with `"status": "degraded"` when either fails, and always reports the version.

## Putting it on a server

1. Run the API behind a reverse proxy that terminates TLS and sets its own request size and rate limits. The API accepts files up to 200 MB.
2. Set `CORS_ORIGINS` to the origin the site is served from.
3. Point the site at the API by editing `window.API_BASE` in `frontend/js/config.js` before building the site image. The default is `http://localhost:8000`.
4. Set `JWT_SECRET` and `DOCTOR_INVITE_CODE`, and consider `REQUIRE_AUTH=1` and `UPLOAD_TTL_HOURS`.

## Data and backups

- Accounts and saved analyses live in one SQLite file, `/data/arterion.db` in the container. Saved history keeps the findings only; it does not contain the uploaded media, so purging uploads never breaks history.
- A consistent copy while the API is running:

```
docker compose exec backend python -c "import sqlite3; sqlite3.connect('/data/arterion.db').backup(sqlite3.connect('/data/backup.db'))"
docker compose cp backend:/data/backup.db ./backup.db
```

- Create an account or reset a password from the command line: `python -m app.accounts.cli create-user --email doc@example.com --name "Dr Doc" --role doctor` and `python -m app.accounts.cli set-password --email someone@example.com`.

## Observability

- Every response carries `X-Request-Id`. Send your own (letters, digits, `.`, `_`, `-`, up to 64 characters) to line API logs up with your proxy's; anything else is replaced.
- `X-Process-Time-Ms` reports how long the request took on the server.
- Logs go to standard output.

## Upgrading

Pull, rebuild and restart. The database tables are created on start-up with `CREATE TABLE IF NOT EXISTS`, so there is nothing to migrate for the current schema; back up the data volume before you upgrade anyway.
