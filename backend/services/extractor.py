"""Wraps pdf_extractor.py functions for use in FastAPI"""
import hashlib
import io
import json
import sys
import asyncio
import logging
import tempfile
import shutil
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

# Add project root to path so we can import pdf_extractor
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pdf_extractor import (
    load_examples,
    select_examples,
    pdf_to_image,
    image_to_base64,
    extract_with_gemini,
    create_excel,
    EXTRACTION_PROMPT,
)
from backend.config import (
    IMAGES_DIR, SERVICE_ACCOUNT_JSON, GEMINI_API_KEY,
    FALLBACK_GEMINI_MODEL, CONFIDENCE_RETRY_THRESHOLD, MAX_EMPTY_FIELDS_RETRY,
)
from backend.db import get_cached_result, cache_result, get_custom_fields_by_project_name, get_example_effectiveness

logger = logging.getLogger(__name__)


def _compute_pdf_hash(pdf_path: Path) -> str:
    """Compute SHA-256 hash of a PDF file for caching."""
    h = hashlib.sha256()
    with open(pdf_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _noop_echo(*args, **kwargs):
    """Replacement for click.echo when running inside the web server."""
    msg = args[0] if args else ""
    logger.debug("pdf_extractor: %s", msg)


_cached_project_names: list[str] | None = None


async def _load_project_names() -> list[str]:
    """Load project names from DB (cached in-process)."""
    global _cached_project_names
    if _cached_project_names is None:
        from backend.db import get_project_names
        _cached_project_names = await get_project_names()
    return _cached_project_names


def invalidate_project_cache():
    """Clear the cached project names so next call reloads from DB."""
    global _cached_project_names
    _cached_project_names = None


def _detect_project_from_filename(filename: str, known_projects: list[str] | None = None) -> str | None:
    """Try to detect project name from PDF filename or parent directory."""
    name_lower = filename.lower()
    if known_projects is None:
        known_projects = ["kujira", "5k", "boxmeer", "lpp5", "lpp6", "orca", "bi-cip"]
    for proj in known_projects:
        if proj.lower() in name_lower:
            return proj
    return None


def _build_custom_fields_prompt(custom_fields: list[dict]) -> str:
    """Build additional extraction prompt lines for project-specific custom fields."""
    if not custom_fields:
        return ""
    lines = ["\n\nZUSÄTZLICHE PROJEKT-SPEZIFISCHE FELDER - Extrahiere auch diese:"]
    for i, cf in enumerate(custom_fields, 13):
        lines.append(f"\n{i}. {cf['field_key']}: {cf['field_label']} - NUR wenn sichtbar im Titelblock")
    return "".join(lines)


def _extract_single_sync(
    pdf_path: Path, use_fewshot: bool = True,
    custom_fields: list[dict] | None = None,
) -> tuple[str, Path, dict, dict]:
    """Synchronous extraction of a single PDF.

    Returns (image_id, image_path, data, confidence).
    """
    image_id = str(uuid4())

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        images = pdf_to_image(pdf_path, tmpdir)

        if not images:
            raise RuntimeError(f"No images generated from {pdf_path.name}")

        # Copy first page to static images dir for web serving
        dest_image = IMAGES_DIR / f"{image_id}.png"
        shutil.copy2(images[0], dest_image)

        # Get base64 for API
        image_b64 = image_to_base64(images[0])

    # Detect project from filename for smart example selection
    project = _detect_project_from_filename(pdf_path.name)

    # Load and select few-shot examples (score-based selection)
    if use_fewshot:
        all_examples = load_examples()
        try:
            eff_rows = await get_example_effectiveness()
            eff_map = {r["example_name"]: r for r in eff_rows}
        except Exception:
            eff_map = None
        examples = select_examples(all_examples, project=project, effectiveness=eff_map)
    else:
        examples = []

    # Build prompt with custom fields if available
    extra_prompt = _build_custom_fields_prompt(custom_fields or [])

    # Call Gemini - now returns (data, confidence)
    data, confidence = extract_with_gemini(
        image_b64,
        api_key=GEMINI_API_KEY,
        examples=examples,
        credentials_path=SERVICE_ACCOUNT_JSON,
        project=project,
        extra_prompt=extra_prompt,
    )

    # Separate custom field values from standard fields
    if custom_fields:
        cf_keys = {cf["field_key"] for cf in custom_fields}
        custom_data = {}
        custom_conf = {}
        for key in cf_keys:
            if key in data:
                custom_data[key] = data.pop(key)
            if key in confidence:
                custom_conf[key] = confidence.pop(key)
        data["custom_fields"] = custom_data
        confidence["custom_fields"] = custom_conf

    return image_id, dest_image, data, confidence


def _should_retry_with_fallback(data: dict, confidence: dict) -> bool:
    """Check if extraction quality is too low and should retry with a different model."""
    # Too many empty fields
    empty_count = sum(1 for v in data.values() if v is None or v == "")
    if empty_count >= MAX_EMPTY_FIELDS_RETRY:
        return True

    # Average confidence too low
    conf_values = [v for v in confidence.values() if v is not None and isinstance(v, (int, float))]
    if conf_values:
        avg_conf = sum(conf_values) / len(conf_values)
        if avg_conf < CONFIDENCE_RETRY_THRESHOLD:
            return True

    return False


def _extract_single_sync_with_model(
    pdf_path: Path, use_fewshot: bool, model_override: str,
    custom_fields: list[dict] | None = None,
) -> tuple[str, Path, dict, dict]:
    """Like _extract_single_sync but with explicit model override."""
    from pdf_extractor import DEFAULT_GEMINI_MODEL

    # Temporarily override model
    import pdf_extractor
    original_model = pdf_extractor.DEFAULT_GEMINI_MODEL
    pdf_extractor.DEFAULT_GEMINI_MODEL = model_override
    try:
        return _extract_single_sync(pdf_path, use_fewshot, custom_fields)
    finally:
        pdf_extractor.DEFAULT_GEMINI_MODEL = original_model


async def extract_single(
    pdf_path: Path, use_fewshot: bool = True
) -> tuple[str, Path, dict, dict]:
    """Async wrapper for extraction with caching. Returns (image_id, image_path, data, confidence)."""
    pdf_hash = _compute_pdf_hash(pdf_path)

    # Check cache first
    cached = await get_cached_result(pdf_hash)
    if cached is not None:
        logger.info("Cache hit for %s (hash=%s)", pdf_path.name, pdf_hash[:12])
        data, confidence = cached
        # Still need to generate image for display
        image_id = str(uuid4())
        with tempfile.TemporaryDirectory() as tmpdir:
            images = pdf_to_image(pdf_path, Path(tmpdir))
            if images:
                dest_image = IMAGES_DIR / f"{image_id}.png"
                shutil.copy2(images[0], dest_image)
                return image_id, dest_image, data, confidence

    # Load project custom fields for dynamic prompt
    project = _detect_project_from_filename(pdf_path.name)
    custom_fields: list[dict] = []
    if project:
        try:
            custom_fields = await get_custom_fields_by_project_name(project)
        except Exception:
            logger.exception("Failed to load custom fields for project %s", project)

    # Cache miss - run extraction
    image_id, image_path, data, confidence = await asyncio.to_thread(
        _extract_single_sync, pdf_path, use_fewshot, custom_fields
    )

    # Check if we should retry with fallback model
    if FALLBACK_GEMINI_MODEL and _should_retry_with_fallback(data, confidence):
        logger.info(
            "Low quality extraction for %s, retrying with fallback model %s",
            pdf_path.name, FALLBACK_GEMINI_MODEL,
        )
        try:
            fb_id, fb_path, fb_data, fb_confidence = await asyncio.to_thread(
                _extract_single_sync_with_model, pdf_path, use_fewshot, FALLBACK_GEMINI_MODEL, custom_fields,
            )
            # Use fallback if it produced better results
            fb_empty = sum(1 for v in fb_data.values() if v is None or v == "")
            orig_empty = sum(1 for v in data.values() if v is None or v == "")
            if fb_empty < orig_empty:
                logger.info("Fallback model produced better results (%d vs %d empty)", fb_empty, orig_empty)
                image_id, image_path, data, confidence = fb_id, fb_path, fb_data, fb_confidence
        except Exception:
            logger.exception("Fallback model extraction failed, using original result")

    # Store in cache
    try:
        await cache_result(pdf_hash, data, confidence)
    except Exception:
        logger.exception("Failed to cache extraction result")

    return image_id, image_path, data, confidence


def generate_excel(data_list: list[dict], output_path: Path):
    """Generate Excel file from extraction results.

    Patches click.echo to avoid errors when called outside a CLI context.
    """
    import click

    with patch.object(click, "echo", _noop_echo):
        create_excel(data_list, output_path)
