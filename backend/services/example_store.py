"""CRUD operations for the examples/ directory"""
import json
import re
import shutil
import threading
from pathlib import Path

from backend.config import EXAMPLES_DIR, IMAGES_DIR

_lock = threading.Lock()

# Only allow alphanumeric, underscore, hyphen, and dot in example names
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def _validate_name(name: str) -> str:
    """Validate example name to prevent path traversal."""
    if not name or not _SAFE_NAME_RE.match(name) or ".." in name:
        raise ValueError(f"Invalid example name: {name!r}")
    return name


def list_examples() -> list[dict]:
    """List all few-shot examples"""
    examples = []
    for json_file in sorted(EXAMPLES_DIR.glob("*.json")):
        image_file = json_file.with_suffix(".png")
        if not image_file.exists():
            continue

        with open(json_file) as f:
            data = json.load(f)

        examples.append({
            "name": json_file.stem,
            "image_url": f"/api/examples/{json_file.stem}/image",
            "data": data,
        })

    return examples


def get_example_image_path(name: str) -> Path | None:
    """Get the image path for an example"""
    _validate_name(name)
    image_path = EXAMPLES_DIR / f"{name}.png"
    return image_path if image_path.exists() else None


def save_example(name: str, extraction_id: str, data: dict) -> dict:
    """Save a correction as a new few-shot example"""
    _validate_name(name)
    with _lock:
        # Copy the extraction image to examples
        source_image = IMAGES_DIR / f"{extraction_id}.png"
        if not source_image.exists():
            raise FileNotFoundError(f"Image not found for extraction {extraction_id}")

        dest_image = EXAMPLES_DIR / f"{name}.png"
        dest_json = EXAMPLES_DIR / f"{name}.json"

        shutil.copy2(source_image, dest_image)

        with open(dest_json, "w") as f:
            json.dump(data, f, indent=2)

    return {
        "name": name,
        "image_url": f"/api/examples/{name}/image",
        "data": data,
    }


def delete_example(name: str) -> bool:
    """Delete a few-shot example"""
    _validate_name(name)
    with _lock:
        image_path = EXAMPLES_DIR / f"{name}.png"
        json_path = EXAMPLES_DIR / f"{name}.json"

        deleted = False
        if image_path.exists():
            image_path.unlink()
            deleted = True
        if json_path.exists():
            json_path.unlink()
            deleted = True

        return deleted


def count_examples() -> int:
    """Count the number of few-shot examples"""
    return len(list(EXAMPLES_DIR.glob("*.json")))
