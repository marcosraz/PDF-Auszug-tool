"""Few-shot example management endpoints"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.models.schemas import ExampleInfo, ExtractionResult, SaveExampleRequest
from backend.services.example_store import (
    list_examples,
    get_example_image_path,
    save_example,
    delete_example,
)
from backend.db import log_correction, log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/examples", tags=["examples"])


@router.get("", response_model=list[ExampleInfo])
async def get_examples():
    """List all few-shot training examples"""
    examples = list_examples()
    return [
        ExampleInfo(
            name=ex["name"],
            image_url=ex["image_url"],
            data=ExtractionResult(**ex["data"]),
        )
        for ex in examples
    ]


@router.post("", response_model=ExampleInfo)
async def create_example(req: SaveExampleRequest):
    """Save a corrected extraction as a new few-shot example"""
    try:
        data_dict = req.data.model_dump(exclude_none=False)
        result = save_example(
            name=req.name,
            extraction_id=req.extraction_id,
            data=data_dict,
        )

        # Log corrections for each changed field
        try:
            for field_name, new_value in data_dict.items():
                # We don't have the original values here, so log each field
                # as a potential correction; the DB tracks via extraction_id
                await log_correction(
                    extraction_id=req.extraction_id,
                    field_name=field_name,
                    old_value=None,
                    new_value=str(new_value) if new_value is not None else None,
                )
            await log_audit(
                "save_example",
                details={"name": req.name, "extraction_id": req.extraction_id},
            )
        except Exception:
            logger.exception("Failed to log correction analytics")

        return ExampleInfo(
            name=result["name"],
            image_url=result["image_url"],
            data=ExtractionResult(**result["data"]),
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.delete("/{name}")
async def remove_example(name: str):
    """Delete a few-shot example"""
    try:
        deleted = delete_example(name)
    except ValueError:
        raise HTTPException(400, "Invalid example name")
    if not deleted:
        raise HTTPException(404, f"Example '{name}' not found")
    try:
        await log_audit("delete_example", details={"name": name})
    except Exception:
        logger.exception("Failed to log delete_example audit")
    return {"deleted": name}


@router.get("/{name}/image")
async def get_example_image(name: str):
    """Serve the PNG image for an example"""
    try:
        path = get_example_image_path(name)
    except ValueError:
        raise HTTPException(400, "Invalid example name")
    if not path:
        raise HTTPException(404, f"Image for '{name}' not found")
    return FileResponse(path, media_type="image/png")
