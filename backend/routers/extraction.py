"""Extraction API endpoints"""
import asyncio
import hashlib
import json
import logging
import tempfile
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models.schemas import (
    ExtractionResponse, ExtractionResult, ConfidenceScores, BatchStartResponse,
    ValidationIssue, DuplicateInfo,
)
from backend.services.extractor import extract_single
from backend.services.job_manager import create_job, get_job, get_event_queue, run_batch, delete_job
from backend.services.example_store import list_examples
from backend.services.validation import normalize_extraction, validate_extraction, check_duplicate
from backend.auth import validate_sse_token
from backend.db import log_extraction_full, log_audit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["extraction"])
limiter = Limiter(key_func=get_remote_address)

# Thread-safe extraction counter
_extraction_count = 0
_extraction_lock = threading.Lock()


def get_extraction_count() -> int:
    with _extraction_lock:
        return _extraction_count


def _increment_extraction_count(n: int = 1):
    global _extraction_count
    with _extraction_lock:
        _extraction_count += n


@router.post("/extract", response_model=ExtractionResponse)
@limiter.limit("15/minute")
async def extract_pdf(request: Request, file: UploadFile = File(...)):
    """Extract data from a single PDF"""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "File must be a PDF")

    # Save uploaded file to temp dir
    tmp_dir = Path(tempfile.mkdtemp())
    try:
        pdf_path = tmp_dir / file.filename
        content = await file.read()

        # Validate PDF magic bytes (%PDF- header)
        if not content[:5].startswith(b"%PDF-"):
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise HTTPException(400, "File is not a valid PDF (invalid header)")

        with open(pdf_path, "wb") as f:
            f.write(content)

        t0 = time.time()
        image_id, image_path, data, confidence = await extract_single(pdf_path)
        duration = time.time() - t0
        _increment_extraction_count()

        # Auto-normalize extracted values
        data = normalize_extraction(data)

        # Run validation checks
        validation_issues = validate_extraction(data)
        if validation_issues:
            logger.info("Validation issues for %s: %s", file.filename, validation_issues)

        # Check for duplicates
        duplicate = await check_duplicate(data, None)

        # Determine project from extracted data
        project = data.get("project")

        # Build confidence scores model if available
        confidence_scores = ConfidenceScores(**confidence) if confidence else None

        # Count examples currently loaded
        examples = list_examples()
        num_examples = len(examples)

        # Compute prompt hash for versioning
        from pdf_extractor import EXTRACTION_PROMPT
        prompt_hash = hashlib.sha256(EXTRACTION_PROMPT.encode()).hexdigest()[:12]

        # Auto-approve if all filled fields have high confidence (>= 0.9)
        status = "completed"
        if confidence:
            filled_confs = [
                v for k, v in confidence.items()
                if v is not None and data.get(k) is not None
            ]
            if filled_confs and all(c >= 0.9 for c in filled_confs):
                status = "reviewed"

        # Log to analytics DB (single atomic transaction)
        username = getattr(request.state, "username", "anonymous")
        try:
            await log_extraction_full(
                id=image_id,
                filename=file.filename,
                fields_dict=data,
                confidence_dict=confidence,
                example_names=[ex["name"] for ex in examples],
                project=project,
                num_examples=num_examples,
                duration=duration,
                prompt_hash=prompt_hash,
                status=status,
                user=username,
            )
            await log_audit("extract", user=username, details={"filename": file.filename, "project": project})
        except Exception:
            logger.exception("Failed to log extraction analytics")

        return ExtractionResponse(
            id=image_id,
            filename=file.filename,
            image_url=f"/api/images/{image_id}.png",
            result=ExtractionResult(**data),
            confidence=confidence_scores,
            validation=[ValidationIssue(**v) for v in validation_issues],
            duplicate=DuplicateInfo(**duplicate) if duplicate else None,
            created_at=datetime.now(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Extraction failed for %s", file.filename)
        raise HTTPException(500, "Extraction failed. Please try again.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.post("/extract/batch", response_model=BatchStartResponse)
@limiter.limit("5/minute")
async def extract_batch(request: Request, files: list[UploadFile] = File(...)):
    """Start batch extraction of multiple PDFs"""
    pdf_files = [f for f in files if f.filename.lower().endswith(".pdf")]
    if not pdf_files:
        raise HTTPException(400, "No PDF files provided")

    # Save all to temp dir (with magic bytes validation)
    tmp_dir = Path(tempfile.mkdtemp())
    pdf_paths = []
    try:
        for file in pdf_files:
            content = await file.read()
            if not content[:5].startswith(b"%PDF-"):
                shutil.rmtree(tmp_dir, ignore_errors=True)
                raise HTTPException(400, f"File '{file.filename}' is not a valid PDF (invalid header)")
            pdf_path = tmp_dir / file.filename
            with open(pdf_path, "wb") as f:
                f.write(content)
            pdf_paths.append(pdf_path)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    job_id = create_job(len(pdf_paths))

    # Start background processing
    async def process_and_cleanup():
        try:
            await run_batch(job_id, pdf_paths)
            _increment_extraction_count(len(pdf_paths))
        except Exception:
            pass  # run_batch already handles per-file errors
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    asyncio.create_task(process_and_cleanup())

    return BatchStartResponse(job_id=job_id, total=len(pdf_paths))


@router.get("/extract/stream/{job_id}")
async def stream_batch_progress(request: Request, job_id: str, sse_token: str = ""):
    """SSE endpoint for batch extraction progress (uses short-lived SSE token)

    Supports reconnection via Last-Event-ID header: on reconnect the client
    will skip already-received events automatically.
    """
    # Validate SSE token (single-use, 60s TTL)
    if not sse_token or validate_sse_token(sse_token) is None:
        raise HTTPException(401, "Invalid or expired SSE token")

    queue = get_event_queue(job_id)
    if not queue:
        raise HTTPException(404, "Job not found")

    # Support reconnection: skip events the client already received
    last_event_id = 0
    raw_last = request.headers.get("Last-Event-ID")
    if raw_last is not None:
        try:
            last_event_id = int(raw_last)
        except ValueError:
            pass

    async def event_generator():
        event_id = 0
        heartbeat_interval = 15  # seconds

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                event_id += 1

                # Skip events already received by the client on reconnect
                if event_id <= last_event_id:
                    if event.get("type") == "done":
                        break
                    continue

                yield f"id: {event_id}\ndata: {json.dumps(event, default=str)}\n\n"
                if event.get("type") == "done":
                    break
            except asyncio.TimeoutError:
                # Heartbeat keepalive - no id so it doesn't advance the
                # client's Last-Event-ID on reconnection
                yield f": keepalive\ndata: {json.dumps({'type': 'ping'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/extract/job/{job_id}")
async def get_job_status(job_id: str):
    """Poll endpoint for batch job status"""
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.delete("/extract/job/{job_id}")
async def cancel_job(job_id: str):
    """Cancel or clean up a batch job"""
    removed = delete_job(job_id)
    if not removed:
        raise HTTPException(404, "Job not found")
    return {"deleted": job_id}
