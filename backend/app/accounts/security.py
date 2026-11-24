"""Password hashing (scrypt), JWT creation/verification and a small login-failure lockout."""
import hashlib
import hmac
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from . import db

ALGORITHM = "HS256"
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60

_secret_cache: Optional[str] = None
_failures: dict = {}
_lock = threading.Lock()


# ---------- passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(candidate, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_password("dummy-password-for-timing")


def burn_password_check(password: str) -> None:
    """Spend the same time as a real check so unknown emails cannot be told apart by timing."""
    verify_password(password, _DUMMY_HASH)


# ---------- tokens ----------

def _secret() -> str:
    global _secret_cache
    env = os.environ.get("JWT_SECRET")
    if env:
        return env
    if _secret_cache:
        return _secret_cache
    path = os.path.join(db.data_dir(), "jwt_secret")
    if os.path.isfile(path):
        _secret_cache = open(path, encoding="utf-8").read().strip()
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        _secret_cache = secrets.token_hex(32)
        with open(path, "w", encoding="utf-8") as f:
            f.write(_secret_cache)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    return _secret_cache


def create_token(user_id: int, expires_minutes: Optional[int] = None) -> str:
    minutes = expires_minutes if expires_minutes is not None else int(os.environ.get("JWT_EXPIRE_MINUTES", "480"))
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[int]:
    try:
        data = jwt.decode(token, _secret(), algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        return int(data["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


# ---------- login lockout ----------

def register_failure(email: str) -> None:
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(email, []) if now - t < LOCKOUT_SECONDS]
        recent.append(now)
        _failures[email] = recent


def is_locked(email: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(email, []) if now - t < LOCKOUT_SECONDS]
        _failures[email] = recent
        return len(recent) >= MAX_FAILURES


def clear_failures(email: str) -> None:
    with _lock:
        _failures.pop(email, None)


def reset_login_failures() -> None:
    with _lock:
        _failures.clear()
