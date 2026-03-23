"""Simple JWT-based authentication module."""
import json
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_env_secret = os.environ.get("JWT_SECRET_KEY", "")
if not _env_secret:
    import logging as _logging
    _logging.getLogger(__name__).warning(
        "JWT_SECRET_KEY not set — generating random key. "
        "All tokens will be invalidated on restart!"
    )
    _env_secret = secrets.token_urlsafe(32)
SECRET_KEY = _env_secret
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

USERS_FILE = Path(__file__).parent / "users.json"

bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UserInfo(BaseModel):
    username: str
    role: str


class TokenResponse(BaseModel):
    token: str
    username: str
    role: str


# ---------------------------------------------------------------------------
# User store helpers
# ---------------------------------------------------------------------------

def _load_users() -> list[dict]:
    """Load users from the JSON file."""
    if not USERS_FILE.exists():
        return []
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("users", [])


def _save_users(users: list[dict]) -> None:
    """Persist users list back to the JSON file."""
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump({"users": users}, f, indent=2, ensure_ascii=False)


def find_user(username: str) -> Optional[dict]:
    """Look up a user by username."""
    for u in _load_users():
        if u["username"] == username:
            return u
    return None


# ---------------------------------------------------------------------------
# Password + token helpers
# ---------------------------------------------------------------------------

def verify_password(plain: str, hashed: str) -> bool:
    """Check a plain-text password against its bcrypt hash."""
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    """Return the bcrypt hash for a plain-text password."""
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def create_token(username: str, role: str = "user") -> str:
    """Create a JWT with 24-hour expiry."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "nbf": now,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> UserInfo:
    """FastAPI dependency that extracts and validates the JWT Bearer token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role", "user")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Verify the user still exists
    user = find_user(username)
    if user is None:
        raise credentials_exception

    return UserInfo(username=username, role=role)


# ---------------------------------------------------------------------------
# Short-lived SSE tokens (avoid passing JWT in query params)
# ---------------------------------------------------------------------------

_sse_tokens: dict[str, tuple[str, datetime]] = {}  # token -> (username, expires)
_sse_lock = threading.Lock()


def create_sse_token(username: str, ttl_seconds: int = 60) -> str:
    """Create a short-lived opaque token for SSE connections."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    with _sse_lock:
        _sse_tokens[token] = (username, expires)
    return token


def validate_sse_token(token: str) -> Optional[str]:
    """Validate and consume an SSE token. Returns username if valid."""
    with _sse_lock:
        entry = _sse_tokens.pop(token, None)
    if entry is None:
        return None
    username, expires = entry
    if datetime.now(timezone.utc) > expires:
        return None
    return username
