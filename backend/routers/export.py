"""Excel export endpoints"""
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from backend.models.schemas import ExtractionResult
from backend.services.extractor import generate_excel
from backend.db import get_project_extractions

router = APIRouter(prefix="/export", tags=["export"])


def _cleanup_temp_file(path: Path):
    """Remove the temp file after it has been sent."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


@router.post("/excel")
async def export_excel(results: list[ExtractionResult]):
    """Generate and download an Excel file from extraction results"""
    data_list = [r.model_dump(exclude_none=False) for r in results]

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    output_path = Path(tmp.name)
    tmp.close()

    generate_excel(data_list, output_path)

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="extracted_data.xlsx",
        background=BackgroundTask(_cleanup_temp_file, output_path),
    )


@router.get("/project/{project_name}")
async def export_project_excel(project_name: str):
    """Export all extractions for a project as Excel."""
    extractions = await get_project_extractions(project_name)
    if not extractions:
        raise HTTPException(404, f"No extractions found for project '{project_name}'")

    # Convert DB rows to ExtractionResult-like dicts
    standard_fields = [
        "line_no", "rev", "length", "pid", "pipe_class",
        "building", "floor", "dn", "insulation", "project",
        "ped_cat", "customer",
    ]
    data_list = []
    for ext in extractions:
        row = {f: ext["fields"].get(f) for f in standard_fields}
        data_list.append(row)

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    output_path = Path(tmp.name)
    tmp.close()

    generate_excel(data_list, output_path)

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{project_name}_extractions.xlsx",
        background=BackgroundTask(_cleanup_temp_file, output_path),
    )
