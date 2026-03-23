"""Pydantic models for API request/response types"""
from pydantic import BaseModel
from datetime import datetime
from typing import Literal


class ExtractionFieldWithConfidence(BaseModel):
    """A single extraction field with its confidence score."""
    value: str | int | float | None = None
    confidence: float = 0.0


class ExtractionResult(BaseModel):
    line_no: str | None = None
    rev: int | None = None
    length: float | None = None
    pid: str | None = None
    pipe_class: str | None = None
    building: str | None = None
    floor: str | None = None
    dn: int | None = None
    insulation: str | None = None
    project: str | None = None
    ped_cat: str | None = None
    customer: str | None = None


class ConfidenceScores(BaseModel):
    """Confidence scores for each extracted field (0.0-1.0)."""
    line_no: float | None = None
    rev: float | None = None
    length: float | None = None
    pid: float | None = None
    pipe_class: float | None = None
    building: float | None = None
    floor: float | None = None
    dn: float | None = None
    insulation: float | None = None
    project: float | None = None
    ped_cat: float | None = None
    customer: float | None = None


class ValidationIssue(BaseModel):
    field: str
    type: str  # "error", "warning", "info"
    message: str


class DuplicateInfo(BaseModel):
    existing_id: str
    existing_filename: str
    existing_date: str | None = None


class ExtractionResponse(BaseModel):
    id: str
    filename: str
    image_url: str
    result: ExtractionResult
    confidence: ConfidenceScores | None = None
    validation: list[ValidationIssue] = []
    duplicate: DuplicateInfo | None = None
    created_at: datetime


class BatchStartResponse(BaseModel):
    job_id: str
    total: int


class BatchJob(BaseModel):
    job_id: str
    total: int
    completed: int
    results: list[ExtractionResponse]
    status: Literal["pending", "running", "completed", "failed"]
    error: str | None = None


class ExampleInfo(BaseModel):
    name: str
    image_url: str
    data: ExtractionResult


class SaveExampleRequest(BaseModel):
    name: str
    extraction_id: str
    data: ExtractionResult


class StatsResponse(BaseModel):
    example_count: int
    total_extractions: int
    available_projects: list[str]


# ---------------------------------------------------------------------------
# Analytics response models
# ---------------------------------------------------------------------------


class OverviewStats(BaseModel):
    total_extractions: int
    extractions_today: int
    total_fields: int
    corrected_fields: int
    correction_rate: float
    accuracy: float
    avg_confidence: float | None = None


class FieldAccuracy(BaseModel):
    field_name: str
    total: int
    corrected: int
    accuracy: float
    avg_confidence: float | None = None


class DailyTrend(BaseModel):
    day: str
    extractions: int
    total_fields: int
    corrected_fields: int
    accuracy: float


class ProjectStats(BaseModel):
    project: str | None = None
    extraction_count: int
    avg_duration: float | None = None
    total_fields: int
    corrected_fields: int
    accuracy: float


class ExampleEffectiveness(BaseModel):
    example_name: str
    times_used: int
    total_fields: int
    corrected_fields: int
    accuracy: float


class CorrectionHeatmapEntry(BaseModel):
    project: str | None = None
    field_name: str
    total: int
    corrected: int
    correction_rate: float


class ExtractionFieldEntry(BaseModel):
    field_name: str
    extracted_value: str | None = None
    confidence: float | None = None
    was_corrected: bool = False
    corrected_value: str | None = None


class ExtractionHistoryEntry(BaseModel):
    id: str
    filename: str
    project: str | None = None
    model: str | None = None
    num_examples_used: int = 0
    duration_seconds: float | None = None
    token_count: int | None = None
    status: str = "completed"
    user: str = "anonymous"
    created_at: str | None = None
    fields: list[ExtractionFieldEntry] = []
