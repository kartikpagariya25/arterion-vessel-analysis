"""Create an account from the command line, e.g. the first doctor:

    python -m app.accounts.cli create-user --email doc@example.com --name "Dr Doc" --role doctor
"""
import argparse
import getpass
import sqlite3
import sys

from . import db, security
from .history import now_iso


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user")
    c.add_argument("--email", required=True)
    c.add_argument("--name", required=True)
    c.add_argument("--role", choices=["patient", "doctor"], default="patient")
    c.add_argument("--password", help="omit to be prompted")
    args = p.parse_args(argv)

    password = args.password or getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 2
    db.init_db()
    try:
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (args.email.strip().lower(), args.name.strip(), args.role, security.hash_password(password), now_iso()),
            )
    except sqlite3.IntegrityError:
        print("An account with that email already exists.", file=sys.stderr)
        return 1
    print(f"Created {args.role} account for {args.email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
