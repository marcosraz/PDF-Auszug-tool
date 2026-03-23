"""Statistics endpoint"""
from fastapi import APIRouter

from backend.config import PROJECT_ROOT
from backend.models.schemas import StatsResponse
from backend.services.example_store import count_examples
from backend.routers.extraction import get_extraction_count

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get dashboard statistics"""
    # Find available project folders
    project_dirs = []
    for d in PROJECT_ROOT.iterdir():
        if d.is_dir() and any(d.glob("*.pdf")):
            project_dirs.append(d.name)

    return StatsResponse(
        example_count=count_examples(),
        total_extractions=get_extraction_count(),
        available_projects=sorted(project_dirs),
    )
