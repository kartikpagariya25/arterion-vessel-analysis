"""Admin commands for accounts (run from the backend folder, or inside the container).

Create the first doctor, or any account:
    python -m app.accounts.cli create-user --email doc@example.com --name "Dr Doc" --role doctor

Reset a forgotten password (there is no email-based reset):
    python -m app.accounts.cli set-password --email someone@example.com
"""
import argparse
import getpass
import sqlite3
import sys

from . import db, security
from .history import now_iso


def _password(args) -> str:
    password = args.password or getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        raise SystemExit(2)
    return password


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user", help="create a patient or doctor account")
    c.add_argument("--email", required=True)
    c.add_argument("--name", required=True)
    c.add_argument("--role", choices=["patient", "doctor"], default="patient")
    c.add_argument("--password", help="omit to be prompted")
    s = sub.add_parser("set-password", help="set a new password for an existing account")
    s.add_argument("--email", required=True)
    s.add_argument("--password", help="omit to be prompted")
    args = p.parse_args(argv)

    try:
        password = _password(args)
    except SystemExit as e:
        return int(e.code)
    db.init_db()
    email = args.email.strip().lower()

    if args.cmd == "create-user":
        try:
            with db.connect() as conn:
                conn.execute(
                    "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                    (email, args.name.strip(), args.role, security.hash_password(password), now_iso()),
                )
        except sqlite3.IntegrityError:
            print("An account with that email already exists.", file=sys.stderr)
            return 1
        print(f"Created {args.role} account for {email}.")
        return 0

    with db.connect() as conn:
        cur = conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (security.hash_password(password), email))
    if cur.rowcount == 0:
        print("No account with that email.", file=sys.stderr)
        return 1
    security.clear_failures(email)
    print(f"Password updated for {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
