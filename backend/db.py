"""SQLite analytics database with async access via aiosqlite."""
import json
import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "data" / "analytics.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    project TEXT,
    model TEXT DEFAULT 'gemini-3.1-pro-preview',
    num_examples_used INTEGER DEFAULT 0,
    duration_seconds FLOAT,
    token_count INTEGER,
    status TEXT DEFAULT 'completed',
    user TEXT DEFAULT 'anonymous',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extraction_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extraction_id TEXT REFERENCES extractions(id),
    field_name TEXT NOT NULL,
    extracted_value TEXT,
    confidence FLOAT,
    was_corrected BOOLEAN DEFAULT FALSE,
    corrected_value TEXT,
    corrected_by TEXT,
    corrected_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    user TEXT DEFAULT 'anonymous',
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extraction_id TEXT REFERENCES extractions(id),
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    image_count INTEGER DEFAULT 1,
    latency_ms INTEGER,
    cached BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extraction_cache (
    pdf_hash TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    confidence_json TEXT,
    model_used TEXT,
    num_examples INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS example_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    example_name TEXT NOT NULL,
    used_in_extraction_id TEXT REFERENCES extractions(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_ef_extraction_id ON extraction_fields(extraction_id);
CREATE INDEX IF NOT EXISTS idx_ef_field_name ON extraction_fields(field_name);
CREATE INDEX IF NOT EXISTS idx_ef_confidence ON extraction_fields(confidence);
CREATE INDEX IF NOT EXISTS idx_extractions_created_at ON extractions(created_at);
CREATE INDEX IF NOT EXISTS idx_extractions_project ON extractions(project);
CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_example_usage_extraction ON example_usage(used_in_extraction_id);
CREATE INDEX IF NOT EXISTS idx_example_usage_name ON example_usage(example_name);
CREATE INDEX IF NOT EXISTS idx_api_usage_extraction ON api_usage(extraction_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
"""


def _get_db_path() -> Path:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


# Pragmas that persist at the DB-file level (WAL, mmap_size) only need to be
# set once.  Per-connection pragmas must be applied on every new connection.
_PERSISTENT_PRAGMAS = [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA mmap_size = 268435456;",
]

_PER_CONNECTION_PRAGMAS = [
    "PRAGMA synchronous = NORMAL;",
    "PRAGMA cache_size = -64000;",
    "PRAGMA temp_store = MEMORY;",
    "PRAGMA foreign_keys = ON;",
    "PRAGMA busy_timeout = 5000;",
]

# Tracks whether file-level pragmas have already been applied this process.
_persistent_pragmas_applied: bool = False


async def _apply_pragmas(db: aiosqlite.Connection):
    """Apply performance pragmas to a connection.

    File-level pragmas (WAL, mmap_size) are only executed once per process
    since they persist across connections for the same database file.
    """
    global _persistent_pragmas_applied

    if not _persistent_pragmas_applied:
        for pragma in _PERSISTENT_PRAGMAS:
            await db.execute(pragma)
        _persistent_pragmas_applied = True

    for pragma in _PER_CONNECTION_PRAGMAS:
        await db.execute(pragma)


async def _connect() -> aiosqlite.Connection:
    """Open a database connection with pragmas applied."""
    db = await aiosqlite.connect(str(_get_db_path()))
    await _apply_pragmas(db)
    return db


# ---------------------------------------------------------------------------
# Simple migration system
# ---------------------------------------------------------------------------

_MIGRATIONS: dict[int, str] = {
    # Version 1: initial schema (the existing CREATE TABLE statements)
    1: _SCHEMA,
    # Version 2: feedback table for user-reported extraction issues
    2: """
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pdf_filename TEXT NOT NULL,
    project TEXT,
    reported_by TEXT NOT NULL,
    field_name TEXT,
    expected_value TEXT,
    actual_value TEXT,
    category TEXT DEFAULT 'wrong_value',
    description TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project);
""",
    # Version 3: projects table for project management with order numbers
    3: """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    order_number TEXT,
    has_folder BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
""",
    # Version 4: custom fields per project + example-to-project mapping
    4: """
CREATE TABLE IF NOT EXISTS project_custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT DEFAULT 'text',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_pcf_project ON project_custom_fields(project_id);

CREATE TABLE IF NOT EXISTS example_metadata (
    name TEXT PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_em_project ON example_metadata(project_id);
""",
}

LATEST_SCHEMA_VERSION = max(_MIGRATIONS)


async def _ensure_version_table(db: aiosqlite.Connection):
    """Create the schema_version tracking table if it doesn't exist."""
    await db.execute(
        """CREATE TABLE IF NOT EXISTS schema_version (
               version INTEGER NOT NULL,
               applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    await db.commit()


async def _get_schema_version(db: aiosqlite.Connection) -> int:
    """Return the current schema version (0 if no migrations have run)."""
    row = await db.execute_fetchall(
        "SELECT MAX(version) AS v FROM schema_version"
    )
    if row and row[0][0] is not None:
        return row[0][0]
    return 0


async def _run_migrations(db: aiosqlite.Connection):
    """Run any pending migrations in order."""
    current = await _get_schema_version(db)
    if current >= LATEST_SCHEMA_VERSION:
        return

    for version in sorted(_MIGRATIONS):
        if version <= current:
            continue
        logger.info("Applying migration v%d ...", version)
        await db.executescript(_MIGRATIONS[version])
        await db.execute(
            "INSERT INTO schema_version (version) VALUES (?)", (version,)
        )
        await db.commit()
        logger.info("Migration v%d applied.", version)


async def init_db():
    """Create tables if they don't exist, running any pending migrations."""
    db_path = _get_db_path()
    async with aiosqlite.connect(str(db_path)) as db:
        await _apply_pragmas(db)
        await _ensure_version_table(db)
        await _run_migrations(db)
    logger.info("Analytics database initialised at %s (schema v%d)", db_path, LATEST_SCHEMA_VERSION)

    # Seed projects from existing folders on first run
    await seed_projects_from_folders()
    await _seed_known_order_numbers()


async def log_extraction_full(
    id: str,
    filename: str,
    fields_dict: dict,
    confidence_dict: dict | None = None,
    example_names: list[str] | None = None,
    project: str | None = None,
    model: str = "gemini-3.1-pro-preview",
    num_examples: int = 0,
    duration: float | None = None,
    token_count: int | None = None,
    status: str = "completed",
    user: str = "anonymous",
):
    """Record extraction + fields + example_usage in a single atomic transaction."""
    if confidence_dict is None:
        confidence_dict = {}
    if example_names is None:
        example_names = []
    db = await _connect()
    try:
        await db.execute("BEGIN IMMEDIATE")
        await db.execute(
            """INSERT INTO extractions
               (id, filename, project, model, num_examples_used, duration_seconds, token_count, status, user)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (id, filename, project, model, num_examples, duration, token_count, status, user),
        )
        for field_name, value in fields_dict.items():
            confidence = confidence_dict.get(field_name)
            await db.execute(
                """INSERT INTO extraction_fields
                   (extraction_id, field_name, extracted_value, confidence)
                   VALUES (?, ?, ?, ?)""",
                (id, field_name, str(value) if value is not None else None, confidence),
            )
        for ex_name in example_names:
            await db.execute(
                """INSERT INTO example_usage (example_name, used_in_extraction_id)
                   VALUES (?, ?)""",
                (ex_name, id),
            )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    finally:
        await db.close()


async def log_extraction(
    id: str,
    filename: str,
    project: str | None = None,
    model: str = "gemini-3.1-pro-preview",
    num_examples: int = 0,
    duration: float | None = None,
    token_count: int | None = None,
    status: str = "completed",
    user: str = "anonymous",
):
    """Record an extraction attempt."""
    db = await _connect()
    try:
        await db.execute(
            """INSERT INTO extractions
               (id, filename, project, model, num_examples_used, duration_seconds, token_count, status, user)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (id, filename, project, model, num_examples, duration, token_count, status, user),
        )
        await db.commit()
    finally:
        await db.close()


async def log_extraction_fields(
    extraction_id: str,
    fields_dict: dict,
    confidence_dict: dict | None = None,
):
    """Record per-field extraction results."""
    if confidence_dict is None:
        confidence_dict = {}
    db = await _connect()
    try:
        for field_name, value in fields_dict.items():
            confidence = confidence_dict.get(field_name)
            await db.execute(
                """INSERT INTO extraction_fields
                   (extraction_id, field_name, extracted_value, confidence)
                   VALUES (?, ?, ?, ?)""",
                (extraction_id, field_name, str(value) if value is not None else None, confidence),
            )
        await db.commit()
    finally:
        await db.close()


async def log_correction(
    extraction_id: str,
    field_name: str,
    old_value: str | None,
    new_value: str | None,
    user: str = "anonymous",
):
    """Mark a field as corrected."""
    db = await _connect()
    try:
        await db.execute(
            """UPDATE extraction_fields
               SET was_corrected = TRUE,
                   corrected_value = ?,
                   corrected_by = ?,
                   corrected_at = CURRENT_TIMESTAMP
               WHERE extraction_id = ? AND field_name = ?""",
            (new_value, user, extraction_id, field_name),
        )
        await db.commit()
    finally:
        await db.close()


async def log_audit(
    action: str,
    user: str = "anonymous",
    details: dict | None = None,
    ip: str | None = None,
):
    """Write an entry to the audit log."""
    db = await _connect()
    try:
        await db.execute(
            """INSERT INTO audit_log (action, user, details, ip_address)
               VALUES (?, ?, ?, ?)""",
            (action, user, json.dumps(details) if details else None, ip),
        )
        await db.commit()
    finally:
        await db.close()


async def log_example_usage(example_name: str, extraction_id: str):
    """Track which example was used for an extraction."""
    db = await _connect()
    try:
        await db.execute(
            """INSERT INTO example_usage (example_name, used_in_extraction_id)
               VALUES (?, ?)""",
            (example_name, extraction_id),
        )
        await db.commit()
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# API usage tracking
# ---------------------------------------------------------------------------


async def log_api_usage(
    extraction_id: str,
    model: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    image_count: int = 1,
    latency_ms: int = 0,
    cached: bool = False,
):
    """Track API token usage and costs."""
    db = await _connect()
    try:
        await db.execute(
            """INSERT INTO api_usage
               (extraction_id, model, input_tokens, output_tokens, image_count, latency_ms, cached)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (extraction_id, model, input_tokens, output_tokens, image_count, latency_ms, cached),
        )
        await db.commit()
    finally:
        await db.close()


async def get_api_usage_stats(days: int = 30) -> dict:
    """Get API usage stats for the last N days."""
    days = max(1, min(days, 365))
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   COUNT(*) AS total_calls,
                   SUM(CASE WHEN cached THEN 1 ELSE 0 END) AS cache_hits,
                   SUM(input_tokens) AS total_input_tokens,
                   SUM(output_tokens) AS total_output_tokens,
                   AVG(latency_ms) AS avg_latency_ms,
                   SUM(input_tokens + output_tokens) AS total_tokens
               FROM api_usage
               WHERE created_at >= DATE('now', ?)""",
            (f"-{days} days",),
        )
        if not rows:
            return {}
        return dict(rows[0])
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Extraction result cache
# ---------------------------------------------------------------------------


async def get_cached_result(pdf_hash: str) -> tuple[dict, dict] | None:
    """Look up a cached extraction result by PDF hash. Returns (data, confidence) or None."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT result_json, confidence_json FROM extraction_cache
               WHERE pdf_hash = ? AND created_at >= DATE('now', '-48 hours')""",
            (pdf_hash,),
        )
        if not rows:
            return None
        row = dict(rows[0])
        data = json.loads(row["result_json"])
        confidence = json.loads(row["confidence_json"]) if row["confidence_json"] else {}
        return data, confidence
    finally:
        await db.close()


async def cache_result(
    pdf_hash: str,
    data: dict,
    confidence: dict,
    model: str = "",
    num_examples: int = 0,
):
    """Store an extraction result in the cache."""
    db = await _connect()
    try:
        await db.execute(
            """INSERT OR REPLACE INTO extraction_cache
               (pdf_hash, result_json, confidence_json, model_used, num_examples)
               VALUES (?, ?, ?, ?, ?)""",
            (pdf_hash, json.dumps(data), json.dumps(confidence), model, num_examples),
        )
        await db.commit()
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Analytics queries
# ---------------------------------------------------------------------------


async def get_field_accuracy_stats() -> list[dict]:
    """Per-field correction rate (top 100 fields by lowest accuracy)."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   field_name,
                   COUNT(*) AS total,
                   SUM(CASE WHEN was_corrected THEN 1 ELSE 0 END) AS corrected,
                   ROUND(1.0 - (CAST(SUM(CASE WHEN was_corrected THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)), 4) AS accuracy,
                   AVG(confidence) AS avg_confidence
               FROM extraction_fields
               GROUP BY field_name
               ORDER BY accuracy ASC
               LIMIT 100"""
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_extraction_history(limit: int = 50, offset: int = 0, user: str | None = None) -> list[dict]:
    """Paginated extraction history with field details (single JOIN query).

    If *user* is provided, only that user's extractions are returned.
    """
    limit = min(limit, 200)
    offset = max(offset, 0)
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        if user:
            subquery = "SELECT id FROM extractions WHERE user = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            sub_params: tuple = (user, limit, offset)
        else:
            subquery = "SELECT id FROM extractions ORDER BY created_at DESC LIMIT ? OFFSET ?"
            sub_params = (limit, offset)
        # Single query with JOIN instead of N+1
        rows = await db.execute_fetchall(
            f"""SELECT
                   e.id, e.filename, e.project, e.model, e.num_examples_used,
                   e.duration_seconds, e.token_count, e.status, e.user, e.created_at,
                   ef.field_name, ef.extracted_value, ef.confidence,
                   ef.was_corrected, ef.corrected_value
               FROM extractions e
               LEFT JOIN extraction_fields ef ON e.id = ef.extraction_id
               WHERE e.id IN ({subquery})
               ORDER BY e.created_at DESC, ef.field_name""",
            sub_params,
        )
        # Group rows by extraction id
        extractions_map: dict[str, dict] = {}
        for row in rows:
            r = dict(row)
            ext_id = r["id"]
            if ext_id not in extractions_map:
                extractions_map[ext_id] = {
                    "id": r["id"],
                    "filename": r["filename"],
                    "project": r["project"],
                    "model": r["model"],
                    "num_examples_used": r["num_examples_used"],
                    "duration_seconds": r["duration_seconds"],
                    "token_count": r["token_count"],
                    "status": r["status"],
                    "user": r["user"],
                    "created_at": r["created_at"],
                    "fields": [],
                }
            if r["field_name"] is not None:
                extractions_map[ext_id]["fields"].append({
                    "field_name": r["field_name"],
                    "extracted_value": r["extracted_value"],
                    "confidence": r["confidence"],
                    "was_corrected": r["was_corrected"],
                    "corrected_value": r["corrected_value"],
                })
        return list(extractions_map.values())
    finally:
        await db.close()


async def get_project_stats() -> list[dict]:
    """Stats grouped by project (top 50)."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   e.project,
                   COUNT(DISTINCT e.id) AS extraction_count,
                   AVG(e.duration_seconds) AS avg_duration,
                   COUNT(ef.id) AS total_fields,
                   SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS corrected_fields,
                   ROUND(1.0 - (CAST(SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS FLOAT) / MAX(COUNT(ef.id), 1)), 4) AS accuracy
               FROM extractions e
               LEFT JOIN extraction_fields ef ON e.id = ef.extraction_id
               GROUP BY e.project
               ORDER BY extraction_count DESC
               LIMIT 50"""
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_example_effectiveness() -> list[dict]:
    """Which examples are most used and how accuracy relates (top 50)."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   eu.example_name,
                   COUNT(DISTINCT eu.used_in_extraction_id) AS times_used,
                   COUNT(ef.id) AS total_fields,
                   SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS corrected_fields,
                   ROUND(1.0 - (CAST(SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS FLOAT) / MAX(COUNT(ef.id), 1)), 4) AS accuracy
               FROM example_usage eu
               LEFT JOIN extraction_fields ef ON eu.used_in_extraction_id = ef.extraction_id
               GROUP BY eu.example_name
               ORDER BY times_used DESC
               LIMIT 50"""
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_daily_stats(days: int = 30) -> list[dict]:
    """Daily extraction count and accuracy trends."""
    days = max(1, min(days, 365))
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   DATE(e.created_at) AS day,
                   COUNT(DISTINCT e.id) AS extractions,
                   COUNT(ef.id) AS total_fields,
                   SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS corrected_fields,
                   ROUND(1.0 - (CAST(SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS FLOAT) / MAX(COUNT(ef.id), 1)), 4) AS accuracy
               FROM extractions e
               LEFT JOIN extraction_fields ef ON e.id = ef.extraction_id
               WHERE e.created_at >= DATE('now', ?)
               GROUP BY DATE(e.created_at)
               ORDER BY day DESC""",
            (f"-{days} days",),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_correction_heatmap(days: int = 90) -> list[dict]:
    """Which fields get corrected most, broken down by project (last N days, top 100)."""
    days = max(1, min(days, 365))
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   e.project,
                   ef.field_name,
                   COUNT(*) AS total,
                   SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS corrected,
                   ROUND(CAST(SUM(CASE WHEN ef.was_corrected THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*), 4) AS correction_rate
               FROM extraction_fields ef
               JOIN extractions e ON e.id = ef.extraction_id
               WHERE e.created_at >= DATE('now', ?)
               GROUP BY e.project, ef.field_name
               ORDER BY correction_rate DESC
               LIMIT 100""",
            (f"-{days} days",),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_overview_stats() -> dict:
    """Aggregate overview: total extractions, avg accuracy, correction rate, extractions today."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row

        row = await db.execute_fetchall(
            """SELECT
                   COUNT(*) AS total,
                   SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) AS today
               FROM extractions"""
        )
        total_extractions = row[0]["total"] if row else 0
        extractions_today = row[0]["today"] if row else 0

        row = await db.execute_fetchall(
            """SELECT
                   COUNT(*) AS total_fields,
                   SUM(CASE WHEN was_corrected THEN 1 ELSE 0 END) AS corrected_fields,
                   AVG(confidence) AS avg_confidence
               FROM extraction_fields"""
        )
        r = row[0] if row else {}
        total_fields = r["total_fields"] or 0
        corrected_fields = r["corrected_fields"] or 0
        avg_confidence = r["avg_confidence"]

        correction_rate = round(corrected_fields / total_fields, 4) if total_fields > 0 else 0.0
        accuracy = round(1.0 - correction_rate, 4)

        return {
            "total_extractions": total_extractions,
            "extractions_today": extractions_today,
            "total_fields": total_fields,
            "corrected_fields": corrected_fields,
            "correction_rate": correction_rate,
            "accuracy": accuracy,
            "avg_confidence": round(avg_confidence, 4) if avg_confidence is not None else None,
        }
    finally:
        await db.close()


async def get_review_queue() -> list[dict]:
    """Return extractions that have at least one low-confidence field (< 0.7)
    or status = 'pending_review', ordered by oldest first (single JOIN query)."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT
                   e.id, e.filename, e.project, e.model, e.num_examples_used,
                   e.duration_seconds, e.token_count, e.status, e.user, e.created_at,
                   ef.field_name, ef.extracted_value, ef.confidence,
                   ef.was_corrected, ef.corrected_value
               FROM extractions e
               LEFT JOIN extraction_fields ef ON e.id = ef.extraction_id
               WHERE e.id IN (
                   SELECT DISTINCT e2.id
                   FROM extractions e2
                   JOIN extraction_fields ef2 ON e2.id = ef2.extraction_id
                   WHERE (ef2.confidence IS NOT NULL AND ef2.confidence < 0.7)
                      OR e2.status = 'pending_review'
                   ORDER BY e2.created_at ASC
                   LIMIT 100
               )
               ORDER BY e.created_at ASC, ef.field_name"""
        )
        extractions_map: dict[str, dict] = {}
        for row in rows:
            r = dict(row)
            ext_id = r["id"]
            if ext_id not in extractions_map:
                extractions_map[ext_id] = {
                    "id": r["id"],
                    "filename": r["filename"],
                    "project": r["project"],
                    "model": r["model"],
                    "num_examples_used": r["num_examples_used"],
                    "duration_seconds": r["duration_seconds"],
                    "token_count": r["token_count"],
                    "status": r["status"],
                    "user": r["user"],
                    "created_at": r["created_at"],
                    "fields": [],
                }
            if r["field_name"] is not None:
                extractions_map[ext_id]["fields"].append({
                    "field_name": r["field_name"],
                    "extracted_value": r["extracted_value"],
                    "confidence": r["confidence"],
                    "was_corrected": r["was_corrected"],
                    "corrected_value": r["corrected_value"],
                })
        return list(extractions_map.values())
    finally:
        await db.close()


async def approve_extraction(extraction_id: str) -> bool:
    """Mark an extraction as reviewed/approved by setting its status to 'reviewed'."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "UPDATE extractions SET status = 'reviewed' WHERE id = ?",
            (extraction_id,),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Maintenance / cleanup tasks
# ---------------------------------------------------------------------------


async def cleanup_old_audit_logs(retention_days: int = 90) -> int:
    """Delete audit log entries older than retention_days. Returns deleted count."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "DELETE FROM audit_log WHERE created_at < DATE('now', ?)",
            (f"-{retention_days} days",),
        )
        await db.commit()
        return cursor.rowcount
    finally:
        await db.close()


async def cleanup_old_cache(ttl_hours: int = 48) -> int:
    """Delete cache entries older than ttl_hours. Returns deleted count."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "DELETE FROM extraction_cache WHERE created_at < DATETIME('now', ?)",
            (f"-{ttl_hours} hours",),
        )
        await db.commit()
        return cursor.rowcount
    finally:
        await db.close()


async def backup_database(max_backups: int = 5) -> Path | None:
    """Create a backup using VACUUM INTO and keep only the last *max_backups* copies.

    Returns the path of the new backup file, or None on failure.
    """
    from datetime import datetime as _dt

    backup_dir = Path(__file__).parent / "data" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = _dt.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"analytics_{timestamp}.db"

    db = await _connect()
    try:
        await db.execute(f"VACUUM INTO '{backup_path}'")
        logger.info("Database backup created: %s", backup_path)
    except Exception:
        logger.exception("Database backup failed")
        return None
    finally:
        await db.close()

    # Prune old backups – keep only the most recent *max_backups*
    existing = sorted(backup_dir.glob("analytics_*.db"), key=lambda p: p.name)
    while len(existing) > max_backups:
        oldest = existing.pop(0)
        try:
            oldest.unlink()
            logger.info("Deleted old backup: %s", oldest)
        except OSError:
            logger.warning("Could not delete old backup: %s", oldest)

    return backup_path


# ---------------------------------------------------------------------------
# Feedback CRUD
# ---------------------------------------------------------------------------


async def create_feedback(
    pdf_filename: str,
    reported_by: str,
    project: str | None = None,
    field_name: str | None = None,
    expected_value: str | None = None,
    actual_value: str | None = None,
    category: str = "wrong_value",
    description: str | None = None,
) -> int:
    """Create a new feedback entry. Returns the new row ID."""
    db = await _connect()
    try:
        cursor = await db.execute(
            """INSERT INTO feedback
               (pdf_filename, project, reported_by, field_name, expected_value, actual_value, category, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (pdf_filename, project, reported_by, field_name, expected_value, actual_value, category, description),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_feedback_list(
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
    user: str | None = None,
) -> list[dict]:
    """Return feedback entries, optionally filtered by status and user.

    If *user* is None all entries are returned (admin view).
    """
    limit = min(limit, 500)
    offset = max(offset, 0)
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        conditions = []
        params: list = []
        if status:
            conditions.append("status = ?")
            params.append(status)
        if user:
            conditions.append("reported_by = ?")
            params.append(user)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        rows = await db.execute_fetchall(
            f"SELECT * FROM feedback {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def update_feedback_status(feedback_id: int, status: str) -> bool:
    """Update the status of a feedback entry."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "UPDATE feedback SET status = ? WHERE id = ?",
            (status, feedback_id),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def delete_feedback(feedback_id: int) -> bool:
    """Delete a feedback entry."""
    db = await _connect()
    try:
        cursor = await db.execute("DELETE FROM feedback WHERE id = ?", (feedback_id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------


async def seed_projects_from_folders():
    """Scan PROJECT_ROOT for folders containing PDFs and seed them into the projects table.

    Only inserts projects that don't already exist.
    """
    from backend.config import PROJECT_ROOT

    # Directories to skip (not actual project folders)
    skip = {
        "__pycache__", "backend", "frontend", "examples", "comparison",
        "logs", "scripts", "Reports", "node_modules", ".git",
        "Kujira_Praesentation",
    }

    db = await _connect()
    try:
        for d in PROJECT_ROOT.iterdir():
            if not d.is_dir() or d.name in skip:
                continue
            if not any(d.glob("*.pdf")):
                continue
            # Insert only if not already present
            await db.execute(
                """INSERT OR IGNORE INTO projects (name, has_folder)
                   VALUES (?, TRUE)""",
                (d.name,),
            )
        await db.commit()
    finally:
        await db.close()


async def _seed_known_order_numbers():
    """Set order numbers for known projects if not already set.

    Also ensures BI-CIP project exists with its order number.
    """
    known = {
        "BI-CIP": "S254058",
        "LPP6": "S254032",
    }
    db = await _connect()
    try:
        for name, order_num in known.items():
            # Insert project if it doesn't exist
            await db.execute(
                "INSERT OR IGNORE INTO projects (name, order_number, has_folder) VALUES (?, ?, FALSE)",
                (name, order_num),
            )
            # Update order number only if currently NULL
            await db.execute(
                "UPDATE projects SET order_number = ? WHERE name = ? AND order_number IS NULL",
                (order_num, name),
            )
        await db.commit()
    finally:
        await db.close()


async def get_projects() -> list[dict]:
    """Return all projects ordered by name."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, name, order_number, has_folder, created_at FROM projects ORDER BY name"
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_project_by_name(name: str) -> dict | None:
    """Return a single project by name."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, name, order_number, has_folder, created_at FROM projects WHERE name = ?",
            (name,),
        )
        return dict(rows[0]) if rows else None
    finally:
        await db.close()


async def create_project(name: str, order_number: str | None = None) -> dict:
    """Create a new project. Returns the created project dict."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "INSERT INTO projects (name, order_number, has_folder) VALUES (?, ?, FALSE)",
            (name, order_number),
        )
        await db.commit()
        project_id = cursor.lastrowid
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, name, order_number, has_folder, created_at FROM projects WHERE id = ?",
            (project_id,),
        )
        return dict(rows[0])
    finally:
        await db.close()


_UNSET = object()


async def update_project(project_id: int, name: str | None = None, order_number: str | None = _UNSET) -> bool:  # type: ignore[assignment]
    """Update a project's name and/or order_number. Returns True if a row was updated."""
    updates = []
    params: list = []
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if order_number is not _UNSET:
        updates.append("order_number = ?")
        params.append(order_number)
    if not updates:
        return False
    params.append(project_id)
    db = await _connect()
    try:
        cursor = await db.execute(
            f"UPDATE projects SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def delete_project(project_id: int) -> bool:
    """Delete a project by ID."""
    db = await _connect()
    try:
        cursor = await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def get_project_names() -> list[str]:
    """Return just the project names (for use in extractor fallback)."""
    db = await _connect()
    try:
        rows = await db.execute_fetchall("SELECT name FROM projects ORDER BY name")
        return [r[0] for r in rows]
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Project Custom Fields CRUD
# ---------------------------------------------------------------------------


async def get_custom_fields(project_id: int) -> list[dict]:
    """Return all custom fields for a project, ordered by sort_order."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, field_key, field_label, field_type, sort_order FROM project_custom_fields WHERE project_id = ? ORDER BY sort_order, id",
            (project_id,),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_custom_fields_by_project_name(project_name: str) -> list[dict]:
    """Return custom fields for a project looked up by name."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT pcf.id, pcf.field_key, pcf.field_label, pcf.field_type, pcf.sort_order
               FROM project_custom_fields pcf
               JOIN projects p ON p.id = pcf.project_id
               WHERE p.name = ?
               ORDER BY pcf.sort_order, pcf.id""",
            (project_name,),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def add_custom_field(
    project_id: int, field_key: str, field_label: str,
    field_type: str = "text", sort_order: int = 0,
) -> dict:
    """Add a custom field to a project. Returns the created field."""
    db = await _connect()
    try:
        cursor = await db.execute(
            """INSERT INTO project_custom_fields (project_id, field_key, field_label, field_type, sort_order)
               VALUES (?, ?, ?, ?, ?)""",
            (project_id, field_key, field_label, field_type, sort_order),
        )
        await db.commit()
        field_id = cursor.lastrowid
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT id, field_key, field_label, field_type, sort_order FROM project_custom_fields WHERE id = ?",
            (field_id,),
        )
        return dict(rows[0])
    finally:
        await db.close()


async def update_custom_field(field_id: int, **kwargs) -> bool:
    """Update a custom field. Valid kwargs: field_label, field_type, sort_order."""
    allowed = {"field_label", "field_type", "sort_order"}
    updates = []
    params: list = []
    for key, val in kwargs.items():
        if key in allowed and val is not None:
            updates.append(f"{key} = ?")
            params.append(val)
    if not updates:
        return False
    params.append(field_id)
    db = await _connect()
    try:
        cursor = await db.execute(
            f"UPDATE project_custom_fields SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def delete_custom_field(field_id: int) -> bool:
    """Delete a custom field."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "DELETE FROM project_custom_fields WHERE id = ?", (field_id,)
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Example Metadata CRUD
# ---------------------------------------------------------------------------


async def set_example_project(name: str, project_name: str | None) -> bool:
    """Assign an example to a project (or clear assignment with None)."""
    db = await _connect()
    try:
        if project_name is None:
            # Clear assignment
            await db.execute(
                "INSERT OR REPLACE INTO example_metadata (name, project_id) VALUES (?, NULL)",
                (name,),
            )
        else:
            # Look up project_id
            rows = await db.execute_fetchall(
                "SELECT id FROM projects WHERE name = ?", (project_name,)
            )
            if not rows:
                return False
            project_id = rows[0][0]
            await db.execute(
                "INSERT OR REPLACE INTO example_metadata (name, project_id) VALUES (?, ?)",
                (name, project_id),
            )
        await db.commit()
        return True
    finally:
        await db.close()


async def get_example_metadata_all() -> dict[str, str | None]:
    """Return a dict mapping example name -> project name (or None)."""
    db = await _connect()
    try:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT em.name, p.name AS project_name
               FROM example_metadata em
               LEFT JOIN projects p ON p.id = em.project_id"""
        )
        return {r["name"]: r["project_name"] for r in rows}
    finally:
        await db.close()


async def get_examples_by_project_name(project_name: str) -> list[str]:
    """Return example names assigned to a specific project."""
    db = await _connect()
    try:
        rows = await db.execute_fetchall(
            """SELECT em.name
               FROM example_metadata em
               JOIN projects p ON p.id = em.project_id
               WHERE p.name = ?""",
            (project_name,),
        )
        return [r[0] for r in rows]
    finally:
        await db.close()
