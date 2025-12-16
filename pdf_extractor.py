#!/usr/bin/env python3
"""
PDF Data Extractor - Extracts piping isometric data from PDFs to Excel
Uses Claude Vision API for robust extraction from various PDF formats
"""

import os
import sys
import json
import base64
import subprocess
import tempfile
import re
from pathlib import Path
from typing import Optional
from datetime import datetime

import click
import requests
from openpyxl import Workbook, load_workbook
from PIL import Image


# Default columns for export - can be customized per project
DEFAULT_COLUMNS = [
    "Id", "Line No.", "Rev.", "Latest Rev.", "Length", "Name", "PId",
    "Pipe class", "Building", "Floor", "Insulation", "Transmittal No.",
    "Date Rec.", "Ped Cat"
]

EXTRACTION_PROMPT = """Analysiere dieses Piping Isometric Zeichnungs-PDF. Der TITELBLOCK (Title Block) befindet sich UNTEN RECHTS und enthält alle wichtigen Informationen.

WICHTIG: Schau genau auf den Titelblock! Dort findest du:
- Projekt/Kunde (z.B. "Lonza AG", "Kujira")
- P&ID Nummer (z.B. "LV1-105639.VU200")
- Zeichnungsnummer/Line No.
- Level/Floor (z.B. "Level 6")
- Revision

Auch die MATERIALLISTE (oben rechts, "VORFERTIGUNGSMATERIAL") enthält wichtige Daten wie Rohrlängen.

Extrahiere diese Felder:

1. **line_no** - Zeichnungsnummer/Iso-Name aus dem Titelblock
   Format: "740-AB-VU200-201-LH032-25-0" oder "DH_F02-PCWR-013-DN150-I16C00"

2. **rev** - Revisionsnummer (Zahl aus Revisionsblock, z.B. 1, 2)

3. **length** - Rohrlänge in Metern aus Materialliste (z.B. bei "Rohr...16.5M" → 16.5)

4. **pid** - P&ID/TAG Nummer, beginnt oft mit "LV1-", "LV0-" oder "CH0..."
   Beispiel: "LV1-105639.VU200"

5. **pipe_class** - Rohrklasse/Spezifikation (3-stellig oder Code wie "I16C00")

6. **building** - Gebäudecode (NICHT der Kundenname!)
   Beispiele: "MC1", "MC2", "Datahall", "5K", "DC building"
   WICHTIG: Suche nach Codes wie "MC1", "MC2" - NICHT "Lonza AG"

7. **floor** - Etage/Level (z.B. "Level 6", "LVL 6", "F02", "Riser")

8. **dn** - Nennweite in mm (aus Line No. oder Material: DN25 → 25)

9. **insulation** - Isolierung (z.B. "W60", "H2", "FoamInside") falls vorhanden

10. **project** - Projektname (z.B. "Kujira", "LPP 6A")

11. **ped_cat** - PED Kategorie (meist "SEP")

Antworte NUR mit JSON (keine Erklärungen):
{"line_no": "...", "rev": 0, "length": 0.0, "pid": "...", "pipe_class": "...", "building": "...", "floor": "...", "dn": 0, "insulation": null, "project": "...", "ped_cat": null}
"""


def pdf_to_image(pdf_path: Path, output_dir: Path, dpi: int = 150) -> list[Path]:
    """Convert PDF pages to PNG images using pdftoppm"""
    output_prefix = output_dir / pdf_path.stem

    cmd = [
        "pdftoppm",
        "-png",
        "-r", str(dpi),
        str(pdf_path),
        str(output_prefix)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pdftoppm failed: {result.stderr}")

    # Find generated images
    images = sorted(output_dir.glob(f"{pdf_path.stem}*.png"))
    return images


def image_to_base64(image_path: Path, max_size: int = 1568) -> str:
    """Convert image to base64, resizing if necessary for API limits"""
    with Image.open(image_path) as img:
        # Resize if too large (Claude has limits)
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Save to bytes
        import io
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return base64.standard_b64encode(buffer.getvalue()).decode('utf-8')


def extract_with_claude(image_base64: str, api_key: str) -> dict:
    """Use Claude Vision API to extract data from image"""
    url = "https://api.anthropic.com/v1/messages"

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT
                    }
                ]
            }
        ]
    }

    response = requests.post(url, headers=headers, json=payload, timeout=60)

    if response.status_code != 200:
        raise RuntimeError(f"Claude API error: {response.status_code} - {response.text}")

    result = response.json()
    text_content = result["content"][0]["text"]

    # Parse JSON from response
    # Try to find JSON in the response
    json_match = re.search(r'\{[^{}]*\}', text_content, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Try parsing the whole response
    try:
        return json.loads(text_content)
    except json.JSONDecodeError:
        click.echo(f"Warning: Could not parse JSON response: {text_content[:200]}", err=True)
        return {}


def try_text_extraction(pdf_path: Path) -> Optional[dict]:
    """Try to extract data from PDF text first (faster, cheaper)"""
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True
    )

    if result.returncode != 0 or len(result.stdout.strip()) < 100:
        return None

    text = result.stdout

    # Try to extract common patterns
    data = {}

    # Line No patterns (various formats)
    line_patterns = [
        r'(\d{3}-[A-Z]+-[A-Z]+-[A-Z\d]+-\d+-[A-Z\d]+-\d+-\d+)',  # Kujira format
        r'([A-Z]+_F\d+-[A-Z]+-\d+-DN\d+-[A-Z\d]+)',  # LPP format
        r'(\d+-[A-Z]+-\d+-\d+-[A-Z\d]+)',  # Other formats
    ]
    for pattern in line_patterns:
        match = re.search(pattern, text)
        if match:
            data['line_no'] = match.group(1)
            break

    # PId pattern
    pid_match = re.search(r'(LV[01]-\d+\.[A-Z\d]+)', text)
    if pid_match:
        data['pid'] = pid_match.group(1)

    # If we found key data, return it
    if 'line_no' in data:
        return data

    return None


def process_pdf(pdf_path: Path, api_key: str, use_vision: bool = True) -> dict:
    """Process a single PDF and extract data"""
    click.echo(f"Processing: {pdf_path.name}")

    # Try text extraction first
    if not use_vision:
        text_data = try_text_extraction(pdf_path)
        if text_data:
            click.echo(f"  -> Extracted via text parsing")
            return text_data

    # Use Claude Vision
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        images = pdf_to_image(pdf_path, tmpdir)

        if not images:
            click.echo(f"  -> No images generated", err=True)
            return {}

        # Use first page (title block is usually there)
        image_b64 = image_to_base64(images[0])

        try:
            data = extract_with_claude(image_b64, api_key)
            click.echo(f"  -> Extracted via Claude Vision")
            return data
        except Exception as e:
            click.echo(f"  -> Error: {e}", err=True)
            return {}


def create_excel(data_list: list[dict], output_path: Path, template_path: Optional[Path] = None):
    """Create Excel file from extracted data - matching the format of existing exports"""
    if template_path and template_path.exists():
        wb = load_workbook(template_path)
        ws = wb.active
        start_row = ws.max_row + 1
    else:
        wb = Workbook()
        ws = wb.active
        ws.title = "Extracted Data"

        # Header row - matching the format from existing Excel files
        headers = [
            "Id", "Line No.", "Rev.", "Latest Rev.", "Length", "Name", "PId",
            "Pipe class", "DN", "Building", "Floor", "Insulation", "Project",
            "Ped Cat", "Source File"
        ]
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)

        # Make header bold
        from openpyxl.styles import Font
        for cell in ws[1]:
            cell.font = Font(bold=True)

        start_row = 2

    # Data rows
    for row_idx, data in enumerate(data_list, start_row):
        line_no = data.get('line_no')

        ws.cell(row=row_idx, column=1, value=row_idx - 1)  # Id (auto-increment)
        ws.cell(row=row_idx, column=2, value=line_no)  # Line No.
        ws.cell(row=row_idx, column=3, value=data.get('rev'))  # Rev.
        ws.cell(row=row_idx, column=4, value=True)  # Latest Rev. (assuming latest)
        ws.cell(row=row_idx, column=5, value=data.get('length'))  # Length
        ws.cell(row=row_idx, column=6, value=line_no)  # Name (same as Line No.)
        ws.cell(row=row_idx, column=7, value=data.get('pid'))  # PId
        ws.cell(row=row_idx, column=8, value=data.get('pipe_class'))  # Pipe class
        ws.cell(row=row_idx, column=9, value=data.get('dn'))  # DN
        ws.cell(row=row_idx, column=10, value=data.get('building'))  # Building
        ws.cell(row=row_idx, column=11, value=data.get('floor'))  # Floor
        ws.cell(row=row_idx, column=12, value=data.get('insulation'))  # Insulation
        ws.cell(row=row_idx, column=13, value=data.get('project'))  # Project
        ws.cell(row=row_idx, column=14, value=data.get('ped_cat'))  # Ped Cat
        ws.cell(row=row_idx, column=15, value=data.get('_source_file'))  # Source File

    # Auto-adjust column widths
    for column in ws.columns:
        max_length = 0
        column_letter = column[0].column_letter
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column_letter].width = adjusted_width

    wb.save(output_path)
    click.echo(f"\nExcel saved to: {output_path}")


@click.group()
@click.version_option(version="1.0.0")
def cli():
    """PDF Data Extractor - Extract piping isometric data from PDFs to Excel"""
    pass


@cli.command()
@click.argument('input_path', type=click.Path(exists=True))
@click.option('--output', '-o', type=click.Path(), help='Output Excel file path')
@click.option('--api-key', envvar='ANTHROPIC_API_KEY', help='Claude API key (or set ANTHROPIC_API_KEY)')
@click.option('--vision/--no-vision', default=True, help='Use Claude Vision (default: yes)')
@click.option('--recursive', '-r', is_flag=True, help='Process subdirectories recursively')
def extract(input_path: str, output: Optional[str], api_key: str, vision: bool, recursive: bool):
    """Extract data from PDF(s) and create Excel file

    INPUT_PATH can be a single PDF file or a directory containing PDFs.
    """
    if not api_key:
        click.echo("Error: API key required. Set ANTHROPIC_API_KEY or use --api-key", err=True)
        sys.exit(1)

    input_path = Path(input_path)

    # Collect PDFs
    if input_path.is_file():
        if input_path.suffix.lower() != '.pdf':
            click.echo("Error: Input file must be a PDF", err=True)
            sys.exit(1)
        pdf_files = [input_path]
        default_output = input_path.parent / f"{input_path.stem}_extracted.xlsx"
    else:
        pattern = '**/*.pdf' if recursive else '*.pdf'
        pdf_files = sorted(input_path.glob(pattern))
        default_output = input_path / "extracted_data.xlsx"

    if not pdf_files:
        click.echo("No PDF files found", err=True)
        sys.exit(1)

    click.echo(f"Found {len(pdf_files)} PDF file(s)")

    # Process each PDF
    all_data = []
    for pdf in pdf_files:
        data = process_pdf(pdf, api_key, use_vision=vision)
        if data:
            data['_source_file'] = pdf.name
            all_data.append(data)

    # Create Excel
    output_path = Path(output) if output else default_output
    create_excel(all_data, output_path)

    click.echo(f"\nProcessed {len(all_data)}/{len(pdf_files)} PDFs successfully")


@cli.command()
@click.argument('pdf_path', type=click.Path(exists=True))
@click.option('--api-key', envvar='ANTHROPIC_API_KEY', help='Claude API key')
def test(pdf_path: str, api_key: str):
    """Test extraction on a single PDF and show results"""
    if not api_key:
        click.echo("Error: API key required", err=True)
        sys.exit(1)

    pdf_path = Path(pdf_path)
    data = process_pdf(pdf_path, api_key, use_vision=True)

    click.echo("\n--- Extracted Data ---")
    for key, value in data.items():
        if not key.startswith('_'):
            click.echo(f"  {key}: {value}")


@cli.command()
@click.argument('input_dir', type=click.Path(exists=True))
def analyze(input_dir: str):
    """Analyze a directory and show PDF summary (no API needed)"""
    input_dir = Path(input_dir)
    pdf_files = list(input_dir.glob('**/*.pdf'))

    click.echo(f"\nDirectory: {input_dir}")
    click.echo(f"PDF files found: {len(pdf_files)}")

    # Check for existing Excel files
    excel_files = list(input_dir.glob('**/*.xlsx'))
    click.echo(f"Excel files found: {len(excel_files)}")

    if pdf_files:
        click.echo("\nPDF files:")
        for pdf in pdf_files[:10]:
            # Quick text check
            result = subprocess.run(
                ["pdftotext", str(pdf), "-"],
                capture_output=True, text=True
            )
            text_len = len(result.stdout.strip())
            text_status = "✓ text" if text_len > 100 else "⚠ image-based"
            click.echo(f"  {pdf.name} ({text_status})")

        if len(pdf_files) > 10:
            click.echo(f"  ... and {len(pdf_files) - 10} more")


if __name__ == "__main__":
    cli()
