# Security and privacy

- Uploaded files are stored on the machine running the API (`UPLOAD_DIR`, a Docker volume by default) and are not sent anywhere else. Delete the volume or directory to remove them.
- Do not upload identifiable patient data to a shared or public deployment. This project has no authentication, no access control and no audit log.
- The API accepts files up to 200 MB and rejects empty or wrongly typed files; run it behind a reverse proxy with its own limits if you expose it.
- To report a vulnerability, open a private security advisory on GitHub (Security tab) or an issue without exploit details.

Research prototype, not a medical device. Do not use for diagnosis or treatment decisions.
