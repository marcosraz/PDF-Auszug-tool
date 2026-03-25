"""Statistics endpoint"""
from fastapi import APIRouter

from backend.models.schemas import StatsResponse, ProjectInfo
from backend.services.example_store import count_examples
from backend.routers.extraction import get_extraction_count
from backend.db import get_projects

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get dashboard statistics"""
    rows = await get_projects()
    project_list = [
        ProjectInfo(
            name=r["name"],
            order_number=r["order_number"],
            display_name=f"{r['order_number']} {r['name']}" if r["order_number"] else r["name"],
        )
        for r in rows
    ]

    return StatsResponse(
        example_count=count_examples(),
        total_extractions=get_extraction_count(),
        available_projects=[p.display_name for p in project_list],
        projects=project_list,
    )
