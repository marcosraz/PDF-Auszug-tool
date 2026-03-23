"""Analytics API endpoints."""
from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.auth import find_user

from backend.db import (
    get_overview_stats,
    get_field_accuracy_stats,
    get_daily_stats,
    get_project_stats,
    get_example_effectiveness,
    get_correction_heatmap,
    get_extraction_history,
    get_review_queue,
    approve_extraction,
    get_api_usage_stats,
)
from backend.models.schemas import (
    OverviewStats,
    FieldAccuracy,
    DailyTrend,
    ProjectStats,
    ExampleEffectiveness,
    CorrectionHeatmapEntry,
    ExtractionHistoryEntry,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])
limiter = Limiter(key_func=get_remote_address)


def _get_user_filter(request: Request) -> str | None:
    """Return the username to filter by, or None if admin (sees all)."""
    username = getattr(request.state, "username", "anonymous")
    user = find_user(username)
    if user and user.get("role") == "admin":
        return None  # admin sees everything
    return username


@router.get("/overview", response_model=OverviewStats)
@limiter.limit("30/minute")
async def overview(request: Request):
    """Total extractions, avg accuracy, correction rate, extractions today."""
    return await get_overview_stats()


@router.get("/field-accuracy", response_model=list[FieldAccuracy])
@limiter.limit("30/minute")
async def field_accuracy(request: Request):
    """Per-field accuracy stats (correction rate per field)."""
    return await get_field_accuracy_stats()


@router.get("/daily-trend", response_model=list[DailyTrend])
@limiter.limit("30/minute")
async def daily_trend(request: Request, days: int = Query(30, ge=1, le=365)):
    """Daily extraction counts and accuracy trend."""
    return await get_daily_stats(days)


@router.get("/project-stats", response_model=list[ProjectStats])
@limiter.limit("30/minute")
async def project_stats(request: Request):
    """Per-project extraction count and accuracy."""
    return await get_project_stats()


@router.get("/example-effectiveness", response_model=list[ExampleEffectiveness])
@limiter.limit("30/minute")
async def example_effectiveness(request: Request):
    """Which examples improve accuracy most."""
    return await get_example_effectiveness()


@router.get("/correction-heatmap", response_model=list[CorrectionHeatmapEntry])
@limiter.limit("30/minute")
async def correction_heatmap(request: Request):
    """Matrix of field x project correction rates."""
    return await get_correction_heatmap()


@router.get("/recent", response_model=list[ExtractionHistoryEntry])
@limiter.limit("30/minute")
async def recent(request: Request, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    """Recent extraction history with details. Non-admin users see only their own."""
    user_filter = _get_user_filter(request)
    return await get_extraction_history(limit, offset, user=user_filter)


@router.get("/review-queue", response_model=list[ExtractionHistoryEntry])
@limiter.limit("30/minute")
async def review_queue(request: Request):
    """Extractions with low-confidence fields that need manual review."""
    return await get_review_queue()


@router.post("/review/{extraction_id}/approve")
@limiter.limit("30/minute")
async def approve(request: Request, extraction_id: str):
    """Mark an extraction as reviewed/approved."""
    ok = await approve_extraction(extraction_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {"status": "approved", "id": extraction_id}


@router.get("/api-usage")
@limiter.limit("30/minute")
async def api_usage(request: Request, days: int = Query(30, ge=1, le=365)):
    """API token usage and cost statistics."""
    return await get_api_usage_stats(days)
