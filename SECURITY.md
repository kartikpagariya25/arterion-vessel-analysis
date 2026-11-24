# Security and privacy

## What the accounts give you
- Passwords are hashed with scrypt; sign-in returns an HS256 JWT (8 hours by default). Five failed logins for one email lock it for 15 minutes, and unknown emails behave the same as wrong passwords.
- Roles come from the database on every request. Patients only ever see their own history; doctor endpoints return 403 to anyone else.
- Doctor registration needs `DOCTOR_INVITE_CODE`; if it is not set, nobody can register as a doctor through the API.
- Deleting an account deletes its saved analyses. Saved results keep the findings only: images, signals and other large arrays are not stored.

## What it does not give you
- **Not clinical-grade or regulated.** There is no audit log, no email verification, no email-based password reset (use the `set-password` command) and no multi-factor sign-in.
- The site keeps the token in the browser's `localStorage`. That is convenient for a prototype, but any script injected into the page could read it. For a real deployment, serve over HTTPS and move to `httpOnly` cookies.
- Uploaded files are stored on the server under unguessable names and are readable by anyone who has the link (`/static_uploads/...`). Saved history does not contain the media itself, but the uploads folder does until you clear it. Do not run a public instance with real patient data.
- Every doctor account can see every patient's analyses; there is no per-patient assignment.
- The API accepts files up to 200 MB. Put it behind a reverse proxy with its own limits, rate limiting and TLS if you expose it. CORS is open (`*`) by default for local use.
- Set `JWT_SECRET` explicitly and keep `DOCTOR_INVITE_CODE` private. Copy `.env.example` to `.env` (it is git-ignored) and fill them in.

To report a vulnerability, open a private security advisory on GitHub (Security tab) or an issue without exploit details.

Research prototype, not a medical device. Do not use for diagnosis or treatment decisions.
