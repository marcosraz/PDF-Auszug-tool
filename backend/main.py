"""FastAPI application entry point"""
import asyncio
import logging
import os
import re
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from backend.config import IMAGES_DIR, MAX_UPLOAD_SIZE
from backend.auth import SECRET_KEY, ALGORITHM
from backend.routers import extraction, examples, export, stats, analytics, feedback
from backend.routers import auth as auth_router
from backend.services.job_manager import start_cleanup_task
from backend.db import init_db, log_audit, cleanup_old_audit_logs, cleanup_old_cache, backup_database
from backend.logging_config import setup_logging, generate_request_id, request_id_var

# ---------------------------------------------------------------------------
# Simple request metrics (#26)
# ---------------------------------------------------------------------------

_request_count = 0
_request_count_lock = threading.Lock()
_total_response_time = 0.0
_response_time_lock = threading.Lock()
_app_start_time = time.time()

# Initialize structured logging
setup_logging(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    json_output=os.environ.get("LOG_FORMAT", "json") == "json",
)

logger = logging.getLogger(__name__)

# Rate limiter (in-memory storage, sufficient for single-server)
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

API_VERSION = "1.0.0"

app = FastAPI(
    title="PDF-Auszug API",
    description="Extract piping isometric data from PDFs using Gemini Vision AI",
    version=API_VERSION,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS – allow localhost dev servers and any internal-network origin
_INTERNAL_ORIGIN_RE = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$"
)


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_INTERNAL_ORIGIN_RE.pattern,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)


# ---------------------------------------------------------------------------
# Security headers middleware (#11)
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-API-Version"] = API_VERSION
        return response


app.add_middleware(SecurityHeadersMiddleware)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Assign a unique request ID for log correlation."""
    req_id = request.headers.get("X-Request-ID", generate_request_id())
    request_id_var.set(req_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Count requests and track response times for /api/metrics (#26)."""
    global _request_count, _total_response_time
    t0 = time.time()
    response = await call_next(request)
    elapsed = time.time() - t0
    with _request_count_lock:
        _request_count += 1
    with _response_time_lock:
        _total_response_time += elapsed
    return response


@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    """Reject requests whose Content-Length exceeds MAX_UPLOAD_SIZE."""
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            413,
            f"Upload too large. Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
        )
    return await call_next(request)


# Paths that do NOT require authentication
_AUTH_EXEMPT = {"/api/auth/login", "/api/health", "/api/version", "/api/metrics"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Check JWT Bearer token for all /api/ routes except login and health."""
    path = request.url.path

    # Skip non-API routes, exempt paths, static images, SSE streams, and CORS preflight
    if (
        not path.startswith("/api/")
        or path in _AUTH_EXEMPT
        or path.startswith("/api/images/")
        or path.startswith("/api/extract/stream/")
        or request.method == "OPTIONS"
    ):
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    token = auth_header[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub", "anonymous")
        # Attach username to request state so downstream handlers can use it
        request.state.username = username
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    return await call_next(request)


@app.middleware("http")
async def audit_logging_middleware(request: Request, call_next):
    """Log every API request to the audit log."""
    response = await call_next(request)
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        try:
            client_ip = request.client.host if request.client else None
            username = getattr(request.state, "username", "anonymous")
            await log_audit(
                action=f"{request.method} {request.url.path}",
                user=username,
                details={"status_code": response.status_code, "query": str(request.query_params) or None},
                ip=client_ip,
            )
        except Exception:
            logger.exception("Failed to write audit log entry")
    return response


# ---------------------------------------------------------------------------
# Periodic cleanup task (#8 cache TTL, #9 audit retention)
# ---------------------------------------------------------------------------

async def _periodic_db_cleanup():
    """Run cleanup and backup tasks every 6 hours."""
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            deleted_audits = await cleanup_old_audit_logs(retention_days=90)
            deleted_cache = await cleanup_old_cache(ttl_hours=48)
            if deleted_audits or deleted_cache:
                logger.info(
                    "DB cleanup: removed %d old audit entries, %d stale cache entries",
                    deleted_audits, deleted_cache,
                )
        except Exception:
            logger.exception("DB cleanup task failed")
        # Database backup (#27) – keep last 5 copies
        try:
            await backup_database(max_backups=5)
        except Exception:
            logger.exception("Database backup task failed")


@app.on_event("startup")
async def on_startup():
    await init_db()
    start_cleanup_task()
    # Run initial cleanup, then schedule periodic
    try:
        await cleanup_old_audit_logs(retention_days=90)
        await cleanup_old_cache(ttl_hours=48)
    except Exception:
        logger.exception("Initial DB cleanup failed")
    asyncio.create_task(_periodic_db_cleanup())


# Serve extracted PDF images
app.mount("/api/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

# API routes
app.include_router(auth_router.router, prefix="/api")
app.include_router(extraction.router, prefix="/api")
app.include_router(examples.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")


@app.get("/api/version")
async def version():
    """Return API version information (#28)."""
    return {"version": API_VERSION, "api_prefix": "/api"}


@app.get("/api/metrics")
async def metrics():
    """Simple metrics endpoint (#26) – returns basic request/extraction stats."""
    from backend.routers.extraction import get_extraction_count

    with _request_count_lock:
        total_requests = _request_count
    with _response_time_lock:
        total_time = _total_response_time

    avg_response_time = round(total_time / total_requests, 4) if total_requests else 0.0
    uptime_seconds = round(time.time() - _app_start_time, 1)

    return {
        "total_requests": total_requests,
        "extraction_count": get_extraction_count(),
        "avg_response_time_seconds": avg_response_time,
        "uptime_seconds": uptime_seconds,
    }


@app.get("/api/health")
async def health():
    """Comprehensive health check: DB, disk, config."""
    checks = {}

    # Database connectivity
    try:
        import aiosqlite
        from backend.db import _get_db_path
        async with aiosqlite.connect(str(_get_db_path())) as db:
            await db.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Disk space for images
    try:
        import shutil
        usage = shutil.disk_usage(str(IMAGES_DIR))
        free_gb = usage.free / (1024 ** 3)
        checks["disk_free_gb"] = round(free_gb, 2)
        checks["disk"] = "ok" if free_gb > 1 else "warning: low disk space"
    except Exception as e:
        checks["disk"] = f"error: {e}"

    # Service account / API key configured
    from backend.config import SERVICE_ACCOUNT_JSON, GEMINI_API_KEY
    if SERVICE_ACCOUNT_JSON and Path(SERVICE_ACCOUNT_JSON).exists():
        checks["gemini_auth"] = "service_account"
    elif GEMINI_API_KEY:
        checks["gemini_auth"] = "api_key"
    else:
        checks["gemini_auth"] = "not_configured"

    all_ok = all(
        v == "ok" or v in ("service_account", "api_key") or isinstance(v, (int, float))
        for v in checks.values()
    )

    return {"status": "ok" if all_ok else "degraded", **checks}
