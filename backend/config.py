"""Backend configuration"""
import os
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).parent
PROJECT_ROOT = BACKEND_DIR.parent
EXAMPLES_DIR = PROJECT_ROOT / "examples"
IMAGES_DIR = BACKEND_DIR / "static" / "images"
SERVICE_ACCOUNT_JSON = PROJECT_ROOT / "zg-visual-recognition-65464-f332a04f02a3.json"

# Vertex AI
VERTEX_AI_PROJECT = "zg-visual-recognition-65464"
VERTEX_AI_LOCATION = "global"
DEFAULT_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-pro-preview")
FALLBACK_GEMINI_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")

# Confidence threshold below which to retry with Pro model
CONFIDENCE_RETRY_THRESHOLD = float(os.environ.get("CONFIDENCE_RETRY_THRESHOLD", "0.5"))
# Max empty fields before retrying with fallback
MAX_EMPTY_FIELDS_RETRY = int(os.environ.get("MAX_EMPTY_FIELDS_RETRY", "6"))

# API Keys (fallback)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Upload / resource limits
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50 MB default
MAX_EXAMPLES = int(os.environ.get("MAX_EXAMPLES", 50))

# Job cleanup
JOB_MAX_AGE_SECONDS = int(os.environ.get("JOB_MAX_AGE_SECONDS", 3600))  # 1 hour

# Ensure directories exist
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)
