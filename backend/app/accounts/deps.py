"""FastAPI dependencies: who is calling, and are they allowed to."""
import os
from typing import Optional

from fastapi import Depends, HTTPException, Request

from . import db, security


def _unauthorized(detail: str = "Sign in to continue.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def _bearer(request: Request) -> Optional[str]:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def _load_user(user_id: int):
    with db.connect() as conn:
        row = conn.execute("SELECT id, email, name, role, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def optional_user(request: Request) -> Optional[dict]:
    """The signed-in user, or None for anonymous use. A bad token is an error, never silently anonymous."""
    token = _bearer(request)
    if token is None:
        if os.environ.get("REQUIRE_AUTH", "").lower() in ("1", "true", "yes"):
            raise _unauthorized()
        return None
    user_id = security.decode_token(token)
    user = _load_user(user_id) if user_id is not None else None
    if user is None:
        raise _unauthorized("Your session has expired. Please sign in again.")
    return user


def current_user(request: Request) -> dict:
    token = _bearer(request)
    if token is None:
        raise _unauthorized()
    user_id = security.decode_token(token)
    user = _load_user(user_id) if user_id is not None else None
    if user is None:
        raise _unauthorized("Your session has expired. Please sign in again.")
    return user


def require_doctor(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="This area is for doctor accounts.")
    return user
