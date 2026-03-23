"""Excel export endpoints"""
import tempfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from backend.models.schemas import ExtractionResult
from backend.services.extractor import generate_excel

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
