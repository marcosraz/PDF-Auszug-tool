"""Post-extraction validation: normalization, cross-field checks, duplicates."""
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Standard DN sizes for piping
STANDARD_DN_SIZES = {
    10, 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200,
    250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000,
}


def normalize_extraction(data: dict) -> dict:
    """Auto-normalize extracted field values for consistency."""
    normalized = {}
    for key, value in data.items():
        if value is None:
            normalized[key] = value
            continue

        if isinstance(value, str):
            # Trim whitespace
            value = value.strip()
            # Normalize dash types (en-dash, em-dash → hyphen)
            value = value.replace("\u2013", "-").replace("\u2014", "-")
            # Remove zero-width characters
            value = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", value)
            # Collapse multiple spaces
            value = re.sub(r"\s+", " ", value)

        # Numeric field cleanup: strip units like "mm", "m" from length/dn/rev
        if key in ("length", "dn", "rev") and isinstance(value, str):
            # Remove common unit suffixes and whitespace, e.g. "6275 mm" -> "6275"
            cleaned = re.sub(r"\s*(mm|m|cm|kg|bar|°C)\s*$", "", value, flags=re.IGNORECASE).strip()
            # Also handle comma as decimal separator: "6.275" or "6,275"
            cleaned = cleaned.replace(",", ".")
            if cleaned:
                value = cleaned

        # Field-specific normalization
        if key == "building" and isinstance(value, str):
            value = value.upper()
        elif key == "floor" and isinstance(value, str):
            value = value.upper()
        elif key == "pipe_class" and isinstance(value, str):
            value = value.upper()
        elif key == "insulation" and isinstance(value, str):
            value = value.strip()
        elif key == "ped_cat" and isinstance(value, str):
            value = value.upper().strip()

        normalized[key] = value
    return normalized


def validate_extraction(data: dict) -> list[dict]:
    """Run cross-field consistency checks. Returns list of warnings/errors."""
    issues = []

    # 1. DN must be a standard pipe size
    dn = data.get("dn")
    if dn is not None:
        try:
            dn_val = int(dn)
            if dn_val not in STANDARD_DN_SIZES:
                issues.append({
                    "field": "dn",
                    "type": "warning",
                    "message": f"DN {dn_val} ist keine Standard-Rohrgröße",
                })
        except (ValueError, TypeError):
            issues.append({
                "field": "dn",
                "type": "error",
                "message": f"DN '{dn}' ist keine gültige Zahl",
            })

    # 2. Rev must be non-negative integer
    rev = data.get("rev")
    if rev is not None:
        try:
            rev_val = int(rev)
            if rev_val < 0:
                issues.append({
                    "field": "rev",
                    "type": "error",
                    "message": f"Rev. {rev_val} darf nicht negativ sein",
                })
        except (ValueError, TypeError):
            issues.append({
                "field": "rev",
                "type": "error",
                "message": f"Rev. '{rev}' ist keine gültige Zahl",
            })

    # 3. Length must be positive
    length = data.get("length")
    if length is not None:
        try:
            length_val = float(length)
            if length_val <= 0:
                issues.append({
                    "field": "length",
                    "type": "warning",
                    "message": f"Länge {length_val} sollte positiv sein",
                })
        except (ValueError, TypeError):
            pass

    # 4. DN in line_no should match DN field
    line_no = data.get("line_no")
    if line_no and dn is not None:
        try:
            dn_val = int(dn)
            # Look for DN patterns like -50-, -DN50, -150- in line number
            dn_patterns = re.findall(r"(?:DN|-)(\d{2,4})(?:-|$)", str(line_no))
            if dn_patterns:
                found_dns = [int(d) for d in dn_patterns]
                if dn_val not in found_dns:
                    issues.append({
                        "field": "dn",
                        "type": "info",
                        "message": f"DN {dn_val} stimmt möglicherweise nicht mit Line No. überein (gefunden: {found_dns})",
                    })
        except (ValueError, TypeError):
            pass

    # 5. Line No. format validation (should contain dashes)
    if line_no and isinstance(line_no, str) and "-" not in line_no and len(line_no) > 5:
        issues.append({
            "field": "line_no",
            "type": "warning",
            "message": "Line No. enthält keine Bindestriche - Format prüfen",
        })

    # 6. Building should not be a company/customer name
    building = data.get("building")
    if building and isinstance(building, str):
        customer_keywords = ["AG", "GMBH", "INC", "LTD", "CORP", "GROUP", "LONZA", "THERMOFISHER", "FISHER"]
        building_upper = building.upper()
        for kw in customer_keywords:
            if kw in building_upper and len(building) > 4:
                issues.append({
                    "field": "building",
                    "type": "warning",
                    "message": f"'{building}' sieht nach einem Kundennamen aus, nicht nach einem Gebäude",
                })
                break

    # 7. Length plausibility (piping isometrics usually 0.1-100m)
    if length is not None:
        try:
            length_val = float(length)
            if length_val > 200:
                issues.append({
                    "field": "length",
                    "type": "warning",
                    "message": f"Länge {length_val}m ungewöhnlich hoch - Einheit prüfen (evtl. mm statt m?)",
                })
        except (ValueError, TypeError):
            pass

    # 8. Pipe class in line_no consistency
    pipe_class = data.get("pipe_class")
    if pipe_class and line_no and isinstance(line_no, str) and isinstance(pipe_class, str):
        if pipe_class.upper() in line_no.upper():
            pass  # Consistent
        # Only flag if pipe_class looks like it could be in the line_no but doesn't match
        # (not all pipe classes appear in line numbers)

    # 9. Line No. should not be empty when other fields are filled
    filled_count = sum(1 for k in ("pid", "dn", "pipe_class", "building") if data.get(k))
    if not line_no and filled_count >= 2:
        issues.append({
            "field": "line_no",
            "type": "warning",
            "message": "Line No. fehlt, obwohl andere Felder extrahiert wurden",
        })

    return issues


async def check_duplicate(data: dict, db_module) -> Optional[dict]:
    """Check if this Line No. + Rev combination already exists."""
    line_no = data.get("line_no")
    rev = data.get("rev")

    if not line_no:
        return None

    try:
        import aiosqlite
        from backend.db import _get_db_path, _apply_pragmas

        async with aiosqlite.connect(str(_get_db_path())) as db:
            await _apply_pragmas(db)
            db.row_factory = aiosqlite.Row

            query = """
                SELECT e.id, e.filename, e.created_at
                FROM extractions e
                JOIN extraction_fields ef_line ON e.id = ef_line.extraction_id
                    AND ef_line.field_name = 'line_no'
                    AND ef_line.extracted_value = ?
            """
            params = [str(line_no)]

            if rev is not None:
                query += """
                JOIN extraction_fields ef_rev ON e.id = ef_rev.extraction_id
                    AND ef_rev.field_name = 'rev'
                    AND ef_rev.extracted_value = ?
                """
                params.append(str(rev))

            query += " ORDER BY e.created_at DESC LIMIT 1"
            rows = await db.execute_fetchall(query, tuple(params))

            if rows:
                r = dict(rows[0])
                return {
                    "existing_id": r["id"],
                    "existing_filename": r["filename"],
                    "existing_date": r["created_at"],
                }
    except Exception:
        logger.exception("Duplicate check failed")

    return None
