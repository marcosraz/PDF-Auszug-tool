"""Project management endpoints"""
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import PROJECT_ROOT
from backend.db import (
    get_projects,
    create_project,
    update_project,
    delete_project,
    get_project_by_name,
    get_custom_fields,
    add_custom_field,
    update_custom_field,
    delete_custom_field,
)
from backend.models.schemas import CustomFieldCreate, CustomFieldInfo, CustomFieldUpdate
from backend.services.extractor import invalidate_project_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    order_number: str | None = None
    create_folder: bool = False


_UNSET = "__UNSET__"


class ProjectUpdate(BaseModel):
    name: str | None = None
    order_number: str | None = _UNSET  # type: ignore[assignment]


class ProjectResponse(BaseModel):
    id: int
    name: str
    order_number: str | None = None
    display_name: str
    has_folder: bool = False
    created_at: str | None = None
    custom_fields: list[CustomFieldInfo] = []


def _make_display_name(name: str, order_number: str | None) -> str:
    if order_number:
        return f"{order_number} {name}"
    return name


def _to_response(row: dict, fields: list[dict] | None = None) -> ProjectResponse:
    return ProjectResponse(
        id=row["id"],
        name=row["name"],
        order_number=row["order_number"],
        display_name=_make_display_name(row["name"], row["order_number"]),
        has_folder=bool(row.get("has_folder", False)),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
        custom_fields=[CustomFieldInfo(**f) for f in fields] if fields else [],
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects():
    """List all projects with their order numbers and custom fields."""
    rows = await get_projects()
    result = []
    for r in rows:
        fields = await get_custom_fields(r["id"])
        result.append(_to_response(r, fields))
    return result


@router.post("", response_model=ProjectResponse, status_code=201)
async def add_project(body: ProjectCreate):
    """Create a new project."""
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Project name must not be empty")

    existing = await get_project_by_name(name)
    if existing:
        raise HTTPException(409, f"Project '{name}' already exists")

    # Optionally create the folder on disk
    if body.create_folder:
        folder = PROJECT_ROOT / name
        folder.mkdir(parents=True, exist_ok=True)
        logger.info("Created project folder: %s", folder)

    row = await create_project(name, body.order_number)

    # Update has_folder based on actual disk state
    folder = PROJECT_ROOT / name
    if folder.is_dir():
        from backend.db import _connect
        db = await _connect()
        try:
            await db.execute(
                "UPDATE projects SET has_folder = TRUE WHERE id = ?", (row["id"],)
            )
            await db.commit()
        finally:
            await db.close()
        row["has_folder"] = True

    invalidate_project_cache()
    fields = await get_custom_fields(row["id"])
    return _to_response(row, fields)


@router.put("/{project_id}", response_model=ProjectResponse)
async def edit_project(project_id: int, body: ProjectUpdate):
    """Update a project's name or order number."""
    # Build update kwargs
    kwargs: dict = {}
    if body.name is not None:
        kwargs["name"] = body.name.strip()
    # Allow setting order_number to None (clearing it) or a new value
    if body.order_number != _UNSET:
        kwargs["order_number"] = body.order_number

    if not kwargs:
        raise HTTPException(400, "No fields to update")

    ok = await update_project(project_id, **kwargs)
    if not ok:
        raise HTTPException(404, "Project not found")

    # Return updated project
    rows = await get_projects()
    invalidate_project_cache()
    for r in rows:
        if r["id"] == project_id:
            fields = await get_custom_fields(project_id)
            return _to_response(r, fields)
    raise HTTPException(404, "Project not found")


@router.delete("/{project_id}", status_code=204)
async def remove_project(project_id: int):
    """Delete a project (does NOT delete the folder on disk)."""
    ok = await delete_project(project_id)
    if not ok:
        raise HTTPException(404, "Project not found")
    invalidate_project_cache()


# ---------------------------------------------------------------------------
# Custom Fields per Project
# ---------------------------------------------------------------------------


@router.get("/{project_id}/fields", response_model=list[CustomFieldInfo])
async def list_custom_fields(project_id: int):
    """List custom fields for a project."""
    return [CustomFieldInfo(**f) for f in await get_custom_fields(project_id)]


@router.post("/{project_id}/fields", response_model=CustomFieldInfo, status_code=201)
async def create_custom_field(project_id: int, body: CustomFieldCreate):
    """Add a custom field to a project."""
    key = body.field_key.strip().lower().replace(" ", "_")
    if not key:
        raise HTTPException(400, "field_key must not be empty")
    try:
        row = await add_custom_field(
            project_id, key, body.field_label.strip(),
            body.field_type, body.sort_order,
        )
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, f"Field '{key}' already exists for this project")
        raise
    return CustomFieldInfo(**row)


@router.put("/{project_id}/fields/{field_id}", response_model=CustomFieldInfo)
async def edit_custom_field(project_id: int, field_id: int, body: CustomFieldUpdate):
    """Update a custom field."""
    kwargs = {}
    if body.field_label is not None:
        kwargs["field_label"] = body.field_label.strip()
    if body.field_type is not None:
        kwargs["field_type"] = body.field_type
    if body.sort_order is not None:
        kwargs["sort_order"] = body.sort_order
    if not kwargs:
        raise HTTPException(400, "No fields to update")
    ok = await update_custom_field(field_id, **kwargs)
    if not ok:
        raise HTTPException(404, "Custom field not found")
    fields = await get_custom_fields(project_id)
    for f in fields:
        if f["id"] == field_id:
            return CustomFieldInfo(**f)
    raise HTTPException(404, "Custom field not found")


@router.delete("/{project_id}/fields/{field_id}", status_code=204)
async def remove_custom_field(project_id: int, field_id: int):
    """Delete a custom field from a project."""
    ok = await delete_custom_field(field_id)
    if not ok:
        raise HTTPException(404, "Custom field not found")
