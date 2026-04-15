"""In-memory batch job tracking with automatic cleanup of old jobs."""
import asyncio
import logging
import threading
import time
from datetime import datetime
from uuid import uuid4
from pathlib import Path

from backend.models.schemas import BatchJob, ExtractionResponse, ExtractionResult, ConfidenceScores
from backend.services.extractor import extract_single
from backend.services.validation import normalize_extraction, validate_extraction
from backend.config import JOB_MAX_AGE_SECONDS
from backend.db import log_extraction_full

logger = logging.getLogger(__name__)

# Max number of events buffered per job before back-pressure
_EVENT_QUEUE_MAX_SIZE = 256

# Thread-safe lock for all job dict mutations
_lock = threading.Lock()

# In-memory job storage
_jobs: dict[str, BatchJob] = {}
_events: dict[str, asyncio.Queue] = {}
_job_created_at: dict[str, float] = {}  # job_id -> monotonic timestamp


def create_job(total: int) -> str:
    """Create a new batch job"""
    job_id = str(uuid4())
    with _lock:
        _jobs[job_id] = BatchJob(
            job_id=job_id,
            total=total,
            completed=0,
            results=[],
            status="pending",
        )
        _events[job_id] = asyncio.Queue(maxsize=_EVENT_QUEUE_MAX_SIZE)
        _job_created_at[job_id] = time.monotonic()
    return job_id


def get_job(job_id: str) -> BatchJob | None:
    with _lock:
        return _jobs.get(job_id)


def get_event_queue(job_id: str) -> asyncio.Queue | None:
    with _lock:
        return _events.get(job_id)


def delete_job(job_id: str) -> bool:
    """Remove a job and its event queue. Returns True if the job existed."""
    with _lock:
        existed = job_id in _jobs
        _jobs.pop(job_id, None)
        _events.pop(job_id, None)
        _job_created_at.pop(job_id, None)
    return existed


def _cleanup_old_jobs():
    """Remove completed/failed jobs older than JOB_MAX_AGE_SECONDS."""
    now = time.monotonic()
    with _lock:
        stale_ids = [
            jid
            for jid, created in _job_created_at.items()
            if (now - created) > JOB_MAX_AGE_SECONDS
            and _jobs.get(jid) is not None
            and _jobs[jid].status in ("completed", "failed")
        ]
    for jid in stale_ids:
        logger.info("Cleaning up stale job %s", jid)
        delete_job(jid)


async def _periodic_cleanup(interval: int = 300):
    """Background task that cleans up old jobs every `interval` seconds."""
    while True:
        await asyncio.sleep(interval)
        try:
            _cleanup_old_jobs()
        except Exception:
            logger.exception("Error during job cleanup")


_cleanup_task: asyncio.Task | None = None


def start_cleanup_task():
    """Start the periodic cleanup background task (call once at app startup)."""
    global _cleanup_task
    _cleanup_task = asyncio.create_task(_periodic_cleanup())


async def run_batch(job_id: str, pdf_paths: list[Path]):
    """Process a batch of PDFs and push SSE events"""
    with _lock:
        job = _jobs.get(job_id)
        queue = _events.get(job_id)
    if job is None or queue is None:
        logger.error("Batch job %s not found", job_id)
        return

    with _lock:
        job.status = "running"

    for pdf_path in pdf_paths:
        # Check if job was deleted mid-processing
        with _lock:
            if job_id not in _jobs:
                logger.warning("Job %s was deleted during processing", job_id)
                return

        try:
            image_id, image_path, data, confidence = await extract_single(pdf_path)

            # Normalize and build response
            data = normalize_extraction(data)
            confidence_scores = ConfidenceScores(**confidence) if confidence else None

            result = ExtractionResponse(
                id=image_id,
                filename=pdf_path.name,
                image_url=f"/api/images/{image_id}.png",
                result=ExtractionResult(**data),
                confidence=confidence_scores,
                created_at=datetime.now(),
            )
            with _lock:
                job.results.append(result)
                job.completed += 1
                completed = job.completed
                total = job.total

            # Log to analytics DB so batch results are persisted
            try:
                await log_extraction_full(
                    id=image_id,
                    filename=pdf_path.name,
                    fields_dict=data,
                    confidence_dict=confidence,
                    example_names=[],
                    project=data.get("project"),
                    num_examples=0,
                    duration=0,
                    status="completed",
                    user="batch",
                )
            except Exception:
                logger.exception("Failed to log batch extraction to DB")

            await queue.put({
                "type": "progress",
                "completed": completed,
                "total": total,
                "latest": result.model_dump(mode="json"),
            })

        except Exception as e:
            with _lock:
                job.completed += 1
                completed = job.completed
                total = job.total
            await queue.put({
                "type": "error",
                "filename": pdf_path.name,
                "error": str(e),
                "completed": completed,
                "total": total,
            })

    with _lock:
        job.status = "completed"
    await queue.put({"type": "done", "status": "completed"})
