"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.auth import (
    UserInfo,
    TokenResponse,
    find_user,
    verify_password,
    hash_password,
    create_token,
    create_sse_token,
    get_current_user,
    _load_users,
    _save_users,
)
from backend.db import log_audit

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


class UserListEntry(BaseModel):
    username: str
    role: str


def _require_admin(current_user: UserInfo):
    """Raise 403 if the user is not an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin-Rechte erforderlich",
        )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest):
    """Authenticate with username/password and receive a JWT."""
    user = find_user(body.username)
    if user is None or not verify_password(body.password, user["password"]):
        await log_audit("login_failed", user=body.username, details={"reason": "bad_credentials"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falscher Benutzername oder Passwort",
        )

    role = user.get("role", "user")
    token = create_token(body.username, role)

    await log_audit("login_success", user=body.username)

    return TokenResponse(token=token, username=body.username, role=role)


@router.get("/me", response_model=UserInfo)
async def me(current_user: UserInfo = Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return current_user


@router.post("/sse-token")
async def get_sse_token(current_user: UserInfo = Depends(get_current_user)):
    """Get a short-lived token for SSE connections (60s, single-use)."""
    token = create_sse_token(current_user.username)
    return {"sse_token": token}


# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserListEntry])
async def list_users(current_user: UserInfo = Depends(get_current_user)):
    """List all users (admin only)."""
    _require_admin(current_user)
    users = _load_users()
    return [{"username": u["username"], "role": u.get("role", "user")} for u in users]


@router.post("/users", response_model=UserListEntry)
async def create_user(body: CreateUserRequest, current_user: UserInfo = Depends(get_current_user)):
    """Create a new user (admin only)."""
    _require_admin(current_user)

    if body.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be 'admin' or 'user'")

    if find_user(body.username):
        raise HTTPException(409, f"User '{body.username}' already exists")

    users = _load_users()
    users.append({
        "username": body.username,
        "password": hash_password(body.password),
        "role": body.role,
    })
    _save_users(users)

    await log_audit("user_created", user=current_user.username, details={"new_user": body.username, "role": body.role})

    return {"username": body.username, "role": body.role}


@router.delete("/users/{username}")
async def delete_user(username: str, current_user: UserInfo = Depends(get_current_user)):
    """Delete a user (admin only). Cannot delete yourself."""
    _require_admin(current_user)

    if username == current_user.username:
        raise HTTPException(400, "Cannot delete your own account")

    users = _load_users()
    new_users = [u for u in users if u["username"] != username]
    if len(new_users) == len(users):
        raise HTTPException(404, f"User '{username}' not found")

    _save_users(new_users)
    await log_audit("user_deleted", user=current_user.username, details={"deleted_user": username})

    return {"status": "deleted", "username": username}


@router.patch("/users/{username}")
async def update_user(username: str, body: CreateUserRequest, current_user: UserInfo = Depends(get_current_user)):
    """Update a user's password and/or role (admin only)."""
    _require_admin(current_user)

    if body.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be 'admin' or 'user'")

    users = _load_users()
    found = False
    for u in users:
        if u["username"] == username:
            u["password"] = hash_password(body.password) if body.password else u["password"]
            u["role"] = body.role
            found = True
            break

    if not found:
        raise HTTPException(404, f"User '{username}' not found")

    _save_users(users)
    await log_audit("user_updated", user=current_user.username, details={"updated_user": username})

    return {"username": username, "role": body.role}
