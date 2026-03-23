"""Feedback API endpoints – users report extraction issues for model improvement."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.auth import find_user
from backend.db import create_feedback, get_feedback_list, update_feedback_status, delete_feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])
limiter = Limiter(key_func=get_remote_address)


class FeedbackCreate(BaseModel):
    pdf_filename: str
    project: str | None = None
    reported_by: str
    field_name: str | None = None
    expected_value: str | None = None
    actual_value: str | None = None
    category: str = "wrong_value"
    description: str | None = None


class FeedbackEntry(BaseModel):
    id: int
    pdf_filename: str
    project: str | None = None
    reported_by: str
    field_name: str | None = None
    expected_value: str | None = None
    actual_value: str | None = None
    category: str
    description: str | None = None
    status: str
    created_at: str | None = None


class FeedbackStatusUpdate(BaseModel):
    status: str  # "open", "in_progress", "resolved", "wont_fix"


def _get_user_filter(request: Request) -> str | None:
    """Return username to filter by, or None if admin (sees all)."""
    username = getattr(request.state, "username", "anonymous")
    user = find_user(username)
    if user and user.get("role") == "admin":
        return None
    return username


@router.post("", response_model=FeedbackEntry)
@limiter.limit("30/minute")
async def add_feedback(request: Request, body: FeedbackCreate):
    """Submit feedback about an incorrect extraction."""
    username = getattr(request.state, "username", body.reported_by)
    new_id = await create_feedback(
        pdf_filename=body.pdf_filename,
        reported_by=username,
        project=body.project,
        field_name=body.field_name,
        expected_value=body.expected_value,
        actual_value=body.actual_value,
        category=body.category,
        description=body.description,
    )
    # Return the created entry
    entries = await get_feedback_list(limit=1, offset=0)
    for e in entries:
        if e["id"] == new_id:
            return e
    # Fallback: return minimal response
    return {**body.model_dump(), "id": new_id, "status": "open", "created_at": None}


@router.get("", response_model=list[FeedbackEntry])
@limiter.limit("30/minute")
async def list_feedback(
    request: Request,
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List feedback entries. Non-admin users see only their own."""
    user_filter = _get_user_filter(request)
    return await get_feedback_list(status=status, limit=limit, offset=offset, user=user_filter)


@router.patch("/{feedback_id}", response_model=FeedbackEntry)
@limiter.limit("30/minute")
async def patch_feedback(request: Request, feedback_id: int, body: FeedbackStatusUpdate):
    """Update the status of a feedback entry."""
    ok = await update_feedback_status(feedback_id, body.status)
    if not ok:
        raise HTTPException(status_code=404, detail="Feedback entry not found")
    entries = await get_feedback_list(limit=500)
    for e in entries:
        if e["id"] == feedback_id:
            return e
    raise HTTPException(status_code=404, detail="Feedback entry not found")


@router.delete("/{feedback_id}")
@limiter.limit("30/minute")
async def remove_feedback(request: Request, feedback_id: int):
    """Delete a feedback entry."""
    ok = await delete_feedback(feedback_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Feedback entry not found")
    return {"status": "deleted", "id": feedback_id}
