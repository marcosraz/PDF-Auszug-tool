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
        except (json.JSONDecodeError, ValueError):
            pass
    return {"_error": "JSON parse failed", "_raw": text[:200], "_duration": duration}


def extract_with_gemini(image_base64: str, model: str = "gemini-2.0-flash") -> dict:
    """Extract using Gemini Vision API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"

    headers = {"Content-Type": "application/json"}

    # Gemini 3 models need MANY more tokens (heavy chain-of-thought)
    if "3-pro" in model:
        max_tokens = 16384  # Pro needs even more
    elif "3-" in model:
        max_tokens = 8192   # Flash thinking model
    else:
        max_tokens = 1024

    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/png", "data": image_base64}},
                {"text": EXTRACTION_PROMPT}
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_tokens
        }
    }

    # Longer timeout for thinking models (Gemini 3 Pro can take 2+ minutes)
    timeout = 180 if "3-pro" in model else 120 if "3-" in model else 60

    start = time.time()
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.exceptions.Timeout:
        duration = time.time() - start
        return {"_error": f"Timeout after {timeout}s", "_duration": duration}
    duration = time.time() - start

    if response.status_code != 200:
        return {"_error": f"API Error: {response.status_code} - {response.text[:200]}", "_duration": duration}

    result = response.json()

    try:
        # Standard response format
        text = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        # Try alternative response formats
        try:
            # Some models return text directly
            text = result["candidates"][0]["text"]
        except (KeyError, IndexError):
            try:
                # Or in output field
                text = result["candidates"][0]["output"]
            except (KeyError, IndexError):
                return {"_error": f"Response parse error: {e}", "_raw": json.dumps(result)[:300], "_duration": duration}

    # Parse JSON - handle various formats

    # Remove markdown code blocks if present
    if "```json" in text:
        json_block = re.search(r'```json\s*([\s\S]*?)```', text)
        if json_block:
            text = json_block.group(1).strip()
    elif "```" in text:
        json_block = re.search(r'```\s*([\s\S]*?)```', text)
        if json_block:
            text = json_block.group(1).strip()

    # Try parsing the cleaned text as JSON
    try:
        data = json.loads(text)
        data["_duration"] = duration
        return data
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: find any JSON object in text
    json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group())
            data["_duration"] = duration
            return data
        except (json.JSONDecodeError, ValueError):
            pass

    return {"_error": "JSON parse failed", "_raw": text[:300], "_duration": duration}


GEMINI_MODELS = [
    "gemini-2.0-flash",      # Aktuell verwendet (baseline)
    "gemini-3-flash-preview", # Gemini 3 Flash (neu)
    "gemini-3-pro-preview",   # Gemini 3 Pro (neu, beste Qualität)
]


def compare_pdfs(pdf_files: list, gemini_models: list = None):
    """Compare extraction results from multiple models"""
    if gemini_models is None:
        gemini_models = GEMINI_MODELS

    results = []

    for pdf_path in pdf_files:
        print(f"\n{'='*80}")
        print(f"PDF: {pdf_path.name}")
        print(f"{'='*80}")

        # Convert to image
        print("Converting PDF to image...")
        image_b64 = pdf_to_image(pdf_path)
        if not image_b64:
            print("  ERROR: Could not convert PDF")
            continue

        pdf_result = {"pdf": pdf_path.name}

        # Claude extraction
        if ANTHROPIC_API_KEY:
            print("Extracting with Claude Sonnet...")
            claude_result = extract_with_claude(image_b64)
            print(f"  Duration: {claude_result.get('_duration', 0):.2f}s")
            pdf_result["claude"] = claude_result

        # Gemini models extraction
        for model in gemini_models:
            print(f"Extracting with {model}...")
            gemini_result = extract_with_gemini(image_b64, model=model)
            duration = gemini_result.get('_duration', 0)
            error = gemini_result.get('_error')
            if error:
                print(f"  ERROR: {error}")
            else:
                print(f"  Duration: {duration:.2f}s")
            pdf_result[model] = gemini_result

        results.append(pdf_result)

        # Print comparison table
        model_names = ["claude"] + gemini_models if ANTHROPIC_API_KEY else gemini_models
        col_width = 25

        header = f"{'Feld':<12}"
        for m in model_names:
            short_name = m.replace("gemini-", "").replace("-preview", "")[:col_width-2]
            header += f" {short_name:<{col_width}}"
        print(f"\n{header}")
        print("-" * (12 + (col_width + 1) * len(model_names)))

        fields = ["line_no", "rev", "length", "pid", "pipe_class", "building", "floor", "dn", "project"]
        for field in fields:
            row = f"{field:<12}"
            for m in model_names:
                val = str(pdf_result.get(m, {}).get(field, "—"))[:col_width-2]
                row += f" {val:<{col_width}}"
            print(row)

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

    print("\n" + "=" * 80)
    print("MODELL-VERGLEICH: Claude vs. Gemini 2.0 Flash vs. Gemini 3 Flash vs. Gemini 3 Pro")
    print("=" * 80)

    results = compare_pdfs(pdf_files, gemini_models=GEMINI_MODELS)

    # Save results
    with open("model_comparison_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n\nResults saved to: model_comparison_results.json")

    return results


if __name__ == "__main__":
    main()
