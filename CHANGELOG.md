# Changelog

## Unreleased
- Operations: security headers and an `X-Request-Id` on every response, `CORS_ORIGINS`, `GET /ready` (database and upload directory), and `UPLOAD_TTL_HOURS` to purge old uploads.
- History tools: CSV export for patients and doctors, per-task trend series, and a Trends tab with a theme-aware chart on the history page.
- Containers: the API runs as a non-root user, both images have health checks and compose waits for the API. The web server gzips, sets security headers and cache rules, and returns a real 404 page.
- Quality: ruff and a frontend syntax check run in CI (`make lint` locally), Dependabot watches pip, Docker and Actions, and there is a deployment guide in `docs/DEPLOYMENT.md`.
- Dark mode: token-driven dark theme for the landing page, the tool, the account dialog and the history page, with a navigation toggle that follows the system and remembers your choice.
- Redesigned the site as a landing page: floating navigation, serif hero, feature cards, four-step process, dark evidence section with the real held-out metrics, GSAP ScrollTrigger scroll animation and Motion springs. Heart imagery removed.
- Motion upgrade: word-by-word headline with overshoot, depth-layered parallax background, focus-pull reveals, and a live hero graphic (ECG, ejection rings, ventricle contour or arterial flow) that is capped at 30 fps and freezes on slow devices.
- Redesigned site: soft cool and warm palette, new type, motion (aurora background, staggered entrance, scroll reveals, spotlight cards), restyled account dialog and history page.
- Accounts: JWT sign-in for patients and doctors, SQLite storage, saved analysis history, a doctor dashboard with review notes, an admin CLI, and `REQUIRE_AUTH` to enforce sign-in.
- Project hygiene: CI, model card, contributing guide, issue templates, no-Docker run scripts.

## v1.0.0
- First public release: site, FastAPI backend, training code, Docker setup and trained weights as a release asset.

## v1.1.0
- Stenosis model fine-tuned from the vessel model: Dice 0.594 (was 0.575). Video endpoint returns the original frame with the report.
