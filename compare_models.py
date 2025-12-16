#!/usr/bin/env python3
"""
Vergleich: Claude Vision vs. Gemini Vision für PDF-Extraktion
"""

import os
import json
import base64
import subprocess
import tempfile
import re
import time
from pathlib import Path
import requests

# API Keys
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

EXTRACTION_PROMPT = """Analysiere dieses Piping Isometric Zeichnungs-PDF. Der TITELBLOCK (Title Block) befindet sich UNTEN RECHTS.

Extrahiere diese Felder:

1. **line_no** - Zeichnungsnummer (z.B. "740-AB-VU200-201-LH032-25-0")
2. **rev** - Revisionsnummer (Zahl)
3. **length** - Rohrlänge in Metern aus Materialliste
4. **pid** - P&ID Nummer (z.B. "LV1-105639.VU200")
5. **pipe_class** - Rohrklasse/Spezifikation
6. **building** - Gebäudecode (z.B. "MC1", "Datahall") - NICHT Kundenname
7. **floor** - Etage (z.B. "Level 6", "LVL 6", "F02")
8. **dn** - Nennweite in mm
9. **insulation** - Isolierung
10. **project** - Projektname
11. **ped_cat** - PED Kategorie

Antworte NUR mit JSON:
{"line_no": "...", "rev": 0, "length": 0.0, "pid": "...", "pipe_class": "...", "building": "...", "floor": "...", "dn": 0, "insulation": null, "project": "...", "ped_cat": null}
"""


def pdf_to_image(pdf_path: Path, dpi: int = 150) -> str:
    """Convert PDF to base64 PNG"""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_prefix = Path(tmpdir) / "page"
        cmd = ["pdftoppm", "-png", "-r", str(dpi), "-singlefile", str(pdf_path), str(output_prefix)]
        subprocess.run(cmd, capture_output=True)

        image_path = Path(tmpdir) / "page.png"
        if image_path.exists():
            with open(image_path, "rb") as f:
                return base64.standard_b64encode(f.read()).decode('utf-8')
    return ""


def extract_with_claude(image_base64: str) -> dict:
    """Extract using Claude Vision API"""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
    }
    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_base64}},
                {"type": "text", "text": EXTRACTION_PROMPT}
            ]
        }]
    }

    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=60)
    duration = time.time() - start

    if response.status_code != 200:
        return {"_error": f"API Error: {response.status_code}", "_duration": duration}

    result = response.json()
    text = result["content"][0]["text"]

    # Parse JSON
    json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group())
            data["_duration"] = duration
            return data
        except:
            pass
    return {"_error": "JSON parse failed", "_raw": text[:200], "_duration": duration}


def extract_with_gemini(image_base64: str) -> dict:
    """Extract using Gemini Vision API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/png", "data": image_base64}},
                {"text": EXTRACTION_PROMPT}
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1024
        }
    }

    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=60)
    duration = time.time() - start

    if response.status_code != 200:
        return {"_error": f"API Error: {response.status_code} - {response.text[:200]}", "_duration": duration}

    result = response.json()

    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        return {"_error": f"Response parse error: {e}", "_duration": duration}

    # Parse JSON
    json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group())
            data["_duration"] = duration
            return data
        except:
            pass
    return {"_error": "JSON parse failed", "_raw": text[:200], "_duration": duration}


def compare_pdfs(pdf_files: list):
    """Compare extraction results from both models"""
    results = []

    for pdf_path in pdf_files:
        print(f"\n{'='*60}")
        print(f"PDF: {pdf_path.name}")
        print(f"{'='*60}")

        # Convert to image
        print("Converting PDF to image...")
        image_b64 = pdf_to_image(pdf_path)
        if not image_b64:
            print("  ERROR: Could not convert PDF")
            continue

        # Claude extraction
        print("Extracting with Claude...")
        claude_result = extract_with_claude(image_b64)
        print(f"  Duration: {claude_result.get('_duration', 0):.2f}s")

        # Gemini extraction
        print("Extracting with Gemini...")
        gemini_result = extract_with_gemini(image_b64)
        print(f"  Duration: {gemini_result.get('_duration', 0):.2f}s")

        results.append({
            "pdf": pdf_path.name,
            "claude": claude_result,
            "gemini": gemini_result
        })

        # Print comparison
        print(f"\n{'Feld':<15} {'Claude':<35} {'Gemini':<35}")
        print("-" * 85)

        fields = ["line_no", "rev", "length", "pid", "pipe_class", "building", "floor", "dn", "project"]
        for field in fields:
            c_val = str(claude_result.get(field, "—"))[:33]
            g_val = str(gemini_result.get(field, "—"))[:33]
            match = "✓" if c_val == g_val else "≠"
            print(f"{field:<15} {c_val:<35} {g_val:<35} {match}")

    return results


def main():
    # Load API keys from .env if not in environment
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    key, val = line.strip().split("=", 1)
                    os.environ[key] = val

    global ANTHROPIC_API_KEY, GEMINI_API_KEY
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

    if not ANTHROPIC_API_KEY or not GEMINI_API_KEY:
        print("ERROR: API keys not found!")
        return

    # Test PDFs
    pdf_files = [
        Path("Kujira/740-AB-VU200-201-LH032-25-0_2.pdf"),
        Path("LPP6/66110_DH_F02-PCWR-013-DN150-I16C00_R0.pdf"),
        Path("5K/42562_CSL-7-201-017-25-SP1.pdf"),
    ]

    pdf_files = [p for p in pdf_files if p.exists()]

    print("\n" + "=" * 60)
    print("MODELL-VERGLEICH: Claude Vision vs. Gemini Vision")
    print("=" * 60)

    results = compare_pdfs(pdf_files)

    # Save results
    with open("model_comparison_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n\nResults saved to: model_comparison_results.json")

    return results


if __name__ == "__main__":
    main()
