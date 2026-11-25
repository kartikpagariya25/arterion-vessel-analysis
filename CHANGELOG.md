# Changelog

## Unreleased
- Motion upgrade: word-by-word headline with overshoot, depth-layered parallax background, focus-pull reveals, and a live hero graphic (ECG, ejection rings, ventricle contour or arterial flow) that is capped at 30 fps and freezes on slow devices.
- Redesigned site: soft cool and warm palette, new type, motion (aurora background, staggered entrance, scroll reveals, spotlight cards), restyled account dialog and history page.
- Accounts: JWT sign-in for patients and doctors, SQLite storage, saved analysis history, a doctor dashboard with review notes, an admin CLI, and `REQUIRE_AUTH` to enforce sign-in.
- Project hygiene: CI, model card, contributing guide, issue templates, no-Docker run scripts.

## v1.0.0
- First public release: site, FastAPI backend, training code, Docker setup and trained weights as a release asset.

## v1.1.0
- Stenosis model fine-tuned from the vessel model: Dice 0.594 (was 0.575). Video endpoint returns the original frame with the report.
