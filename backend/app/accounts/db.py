"""SQLite storage for users, saved analyses and remembered upload names."""
import os
import sqlite3
from contextlib import contextmanager

_DEFAULT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('patient', 'doctor')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    input_name TEXT NOT NULL,
    summary TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    doctor_note TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, id DESC);
CREATE TABLE IF NOT EXISTS uploads (
    name TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
);
"""


def data_dir() -> str:
    return os.environ.get("DATA_DIR") or _DEFAULT_DIR


def database_path() -> str:
    return os.environ.get("DATABASE_PATH") or os.path.join(data_dir(), "arterion.db")


@contextmanager
def connect():
    conn = sqlite3.connect(database_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    path = database_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with connect() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
