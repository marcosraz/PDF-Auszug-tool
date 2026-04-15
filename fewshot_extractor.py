#!/usr/bin/env python3
"""
Few-Shot Learning PDF Extractor
Verwendet Beispielbilder + korrekte Outputs um das Modell zu trainieren
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

# API Key
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

EXAMPLES_DIR = Path(__file__).parent / "examples"

# Base prompt explaining what to extract
BASE_PROMPT = """Du bist ein Experte für Piping Isometric Zeichnungen. Extrahiere Daten aus dem Titelblock (unten rechts).

WICHTIGE REGELN:
- line_no: Die vollständige Zeichnungsnummer (z.B. "740-AB-VU200-201-LH032-25-0")
- pipe_class: Der Code aus der Line No. (z.B. "LH032", "I16C00", "SP1") - NICHT die DN-Größe!
- floor: Die Etage/Level (z.B. "Level 6", "F02") - oft im Line No. oder Titelblock
- building: Gebäudecode (z.B. "DC building", "MC1") - NICHT der Kundenname!
- length: Rohrlänge in Metern aus der Materialliste (oberer Bereich)
- dn: Nennweite in mm (z.B. 25, 150) - oft in der Line No. als DN25 oder -25-

Antworte NUR mit JSON, keine Erklärungen."""


def load_examples() -> list[dict]:
    """Load example images and their correct outputs"""
    examples = []

    for json_file in sorted(EXAMPLES_DIR.glob("*.json")):
        image_file = json_file.with_suffix(".png")
        if not image_file.exists():
            continue

        # Load image as base64
        with open(image_file, "rb") as f:
            image_b64 = base64.standard_b64encode(f.read()).decode('utf-8')

        # Load correct output
        with open(json_file) as f:
            correct_output = json.load(f)

        examples.append({
            "name": json_file.stem,
            "image_b64": image_b64,
            "output": correct_output
        })

    return examples


def pdf_to_base64(pdf_path: Path, dpi: int = 150) -> str:
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


def extract_with_fewshot(image_base64: str, examples: list[dict], model: str = "gemini-3-flash-preview") -> dict:
    """Extract using few-shot learning with Gemini"""

    # Build the multi-turn conversation with examples
    contents = []

    # First: System-like instruction with first example
    if examples:
        # Add examples as user->model turns
        for i, ex in enumerate(examples):
            # User shows example image
            contents.append({
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/png", "data": ex["image_b64"]}},
                    {"text": f"Beispiel {i+1}: Extrahiere die Daten aus diesem Piping Isometric."}
                ]
            })
            # Model gives correct answer
            contents.append({
                "role": "model",
                "parts": [
                    {"text": json.dumps(ex["output"], indent=2)}
                ]
            })

    # Now add the actual image to extract
    contents.append({
        "role": "user",
        "parts": [
            {"inline_data": {"mime_type": "image/png", "data": image_base64}},
            {"text": BASE_PROMPT + "\n\nExtrahiere jetzt die Daten aus diesem neuen Bild:"}
        ]
    })

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"

    # Gemini 3 models need more tokens
    max_tokens = 8192 if "3-" in model else 1024
    timeout = 120 if "3-" in model else 60

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_tokens
        }
    }

    start = time.time()
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=timeout)
    except requests.exceptions.Timeout:
        return {"_error": f"Timeout after {timeout}s", "_duration": time.time() - start}
    duration = time.time() - start

    if response.status_code != 200:
        return {"_error": f"API Error: {response.status_code} - {response.text[:200]}", "_duration": duration}

    result = response.json()

    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        return {"_error": f"Response parse error: {e}", "_duration": duration}

    # Parse JSON from response
    if "```json" in text:
        match = re.search(r'```json\s*([\s\S]*?)```', text)
        if match:
            text = match.group(1).strip()
    elif "```" in text:
        match = re.search(r'```\s*([\s\S]*?)```', text)
        if match:
            text = match.group(1).strip()

    try:
        data = json.loads(text)
        data["_duration"] = duration
        return data
    except (json.JSONDecodeError, ValueError):
        # Fallback: find JSON object
        match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
                data["_duration"] = duration
                return data
            except (json.JSONDecodeError, ValueError):
                pass

    return {"_error": "JSON parse failed", "_raw": text[:300], "_duration": duration}


def extract_without_fewshot(image_base64: str, model: str = "gemini-3-flash-preview") -> dict:
    """Extract WITHOUT few-shot (for comparison)"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"

    max_tokens = 8192 if "3-" in model else 1024
    timeout = 120 if "3-" in model else 60

    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/png", "data": image_base64}},
                {"text": BASE_PROMPT + "\n\nExtrahiere die Daten:"}
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_tokens
        }
    }

    start = time.time()
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=timeout)
    except requests.exceptions.Timeout:
        return {"_error": f"Timeout after {timeout}s", "_duration": time.time() - start}
    duration = time.time() - start

    if response.status_code != 200:
        return {"_error": f"API Error: {response.status_code}", "_duration": duration}

    result = response.json()

    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        return {"_error": f"Parse error: {e}", "_duration": duration}

    # Parse JSON
    if "```json" in text:
        match = re.search(r'```json\s*([\s\S]*?)```', text)
        if match:
            text = match.group(1).strip()

    try:
        data = json.loads(text)
        data["_duration"] = duration
        return data
    except (json.JSONDecodeError, ValueError):
        match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
                data["_duration"] = duration
                return data
            except (json.JSONDecodeError, ValueError):
                pass

    return {"_error": "JSON parse failed", "_raw": text[:200], "_duration": duration}


def main():
    # Load .env
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    key, val = line.strip().split("=", 1)
                    os.environ[key] = val

    global GEMINI_API_KEY
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return

    # Load examples
    print("Loading examples...")
    examples = load_examples()
    print(f"  Found {len(examples)} examples: {[e['name'] for e in examples]}")

    # Test PDF (use one that's NOT in the examples)
    test_pdf = Path("5K/42562_CSL-7-201-017-25-SP1.pdf")

    if not test_pdf.exists():
        print(f"ERROR: Test PDF not found: {test_pdf}")
        return

    print(f"\nTest PDF: {test_pdf.name}")
    print("Converting to image...")
    image_b64 = pdf_to_base64(test_pdf)

    if not image_b64:
        print("ERROR: Could not convert PDF")
        return

    model = "gemini-3-flash-preview"

    # Test WITHOUT few-shot
    print(f"\n{'='*60}")
    print(f"OHNE Few-Shot Learning ({model})")
    print(f"{'='*60}")
    result_without = extract_without_fewshot(image_b64, model=model)
    print(f"Duration: {result_without.get('_duration', 0):.2f}s")

    if "_error" in result_without:
        print(f"ERROR: {result_without['_error']}")
    else:
        for k, v in result_without.items():
            if not k.startswith("_"):
                print(f"  {k}: {v}")

    # Test WITH few-shot
    print(f"\n{'='*60}")
    print(f"MIT Few-Shot Learning ({len(examples)} Beispiele)")
    print(f"{'='*60}")
    result_with = extract_with_fewshot(image_b64, examples, model=model)
    print(f"Duration: {result_with.get('_duration', 0):.2f}s")

    if "_error" in result_with:
        print(f"ERROR: {result_with['_error']}")
    else:
        for k, v in result_with.items():
            if not k.startswith("_"):
                print(f"  {k}: {v}")

    # Comparison
    print(f"\n{'='*60}")
    print("VERGLEICH")
    print(f"{'='*60}")
    print(f"{'Feld':<15} {'Ohne Few-Shot':<30} {'Mit Few-Shot':<30}")
    print("-" * 75)

    fields = ["line_no", "rev", "length", "pid", "pipe_class", "building", "floor", "dn", "project"]
    for field in fields:
        v1 = str(result_without.get(field, "—"))[:28]
        v2 = str(result_with.get(field, "—"))[:28]
        match = "✓" if v1 == v2 else "≠"
        print(f"{field:<15} {v1:<30} {v2:<30} {match}")

    # Save results
    results = {
        "test_pdf": test_pdf.name,
        "model": model,
        "examples_used": [e["name"] for e in examples],
        "without_fewshot": result_without,
        "with_fewshot": result_with
    }

    with open("fewshot_comparison.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nResults saved to: fewshot_comparison.json")


if __name__ == "__main__":
    main()
