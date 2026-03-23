#!/usr/bin/env python3
"""Helper script to add a user to users.json with a bcrypt-hashed password.

Usage:
    python -m backend.create_user <username> <password> [--role admin|user]

Or run directly:
    python backend/create_user.py <username> <password> [--role admin]
"""
import argparse
import sys
from pathlib import Path

# Allow running as a standalone script
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.auth import _load_users, _save_users, hash_password, USERS_FILE


def create_user(username: str, password: str, role: str = "user") -> None:
    users = _load_users()

    # Check for duplicates
    for u in users:
        if u["username"] == username:
            print(f"User '{username}' already exists. Updating password.")
            u["password"] = hash_password(password)
            u["role"] = role
            _save_users(users)
            print(f"Updated user '{username}' (role={role}).")
            return

    users.append({
        "username": username,
        "password": hash_password(password),
        "role": role,
    })
    _save_users(users)
    print(f"Created user '{username}' (role={role}).")
    print(f"Users file: {USERS_FILE}")


def main():
    parser = argparse.ArgumentParser(description="Create a user for PDF-Auszug")
    parser.add_argument("username", help="Username")
    parser.add_argument("password", help="Password (plain text, will be hashed)")
    parser.add_argument("--role", default="user", choices=["admin", "user"], help="User role")
    args = parser.parse_args()

    create_user(args.username, args.password, args.role)


if __name__ == "__main__":
    main()
