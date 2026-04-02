"""Few-shot example management endpoints"""
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from backend.models.schemas import (
    AssignExampleProjectRequest,
    ExampleInfo,
    ExtractionResult,
    SaveExampleRequest,
)
from backend.services.example_store import (
    list_examples,
    get_example_image_path,
    save_example,
    delete_example,
)
from backend.db import (
    log_correction,
    log_audit,
    get_example_metadata_all,
    set_example_project,
    get_examples_by_project_name,
    get_example_effectiveness,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/examples", tags=["examples"])


@router.get("", response_model=list[ExampleInfo])
async def get_examples(project: str | None = Query(None)):
    """List all few-shot training examples, optionally filtered by project."""
    examples = list_examples()
    metadata = await get_example_metadata_all()

    # Load effectiveness data (times_used, accuracy per example)
    effectiveness_rows = await get_example_effectiveness()
    effectiveness = {
        r["example_name"]: r for r in effectiveness_rows
    }

    # Filter by project if requested
    if project:
        project_examples = await get_examples_by_project_name(project)
        project_set = set(project_examples)
        examples = [ex for ex in examples if ex["name"] in project_set]

    return [
        ExampleInfo(
            name=ex["name"],
            image_url=ex["image_url"],
            data=ExtractionResult(**ex["data"]),
            project_name=metadata.get(ex["name"]),
            times_used=effectiveness.get(ex["name"], {}).get("times_used", 0),
            accuracy=effectiveness.get(ex["name"], {}).get("accuracy"),
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

        # Assign to project if provided
        if req.project_name:
            await set_example_project(req.name, req.project_name)

        # Log corrections for each changed field
        try:
            for field_name, new_value in data_dict.items():
                if field_name == "custom_fields":
                    continue
                await log_correction(
                    extraction_id=req.extraction_id,
                    field_name=field_name,
                    old_value=None,
                    new_value=str(new_value) if new_value is not None else None,
                )
            await log_audit(
                "save_example",
                details={"name": req.name, "extraction_id": req.extraction_id, "project": req.project_name},
            )
        except Exception:
            logger.exception("Failed to log correction analytics")

        return ExampleInfo(
            name=result["name"],
            image_url=result["image_url"],
            data=ExtractionResult(**result["data"]),
            project_name=req.project_name,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.put("/{name}/project")
async def assign_example_project(name: str, body: AssignExampleProjectRequest):
    """Assign or clear the project for an example."""
    ok = await set_example_project(name, body.project_name)
    if not ok and body.project_name is not None:
        raise HTTPException(404, f"Project '{body.project_name}' not found")
    await log_audit("assign_example_project", details={"name": name, "project": body.project_name})
    return {"name": name, "project_name": body.project_name}


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
