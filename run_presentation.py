#!/usr/bin/env python3
"""
Batch-Test und Präsentation der PDF-Extraktion
Testet mehrere PDFs und erstellt einen übersichtlichen Report
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime

# Load .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, val = line.strip().split("=", 1)
                os.environ[key] = val

from pdf_extractor import process_pdf, load_examples

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# Test PDFs from ALL projects (NOT the example PDFs!)
TEST_PDFS = [
    # Kujira - different from example
    Path("Kujira/740-ABkont-VP131-102-LH099-20-0_1_CKD.pdf"),
    # LPP6 - different from example
    Path("LPP6/66111_DH_F02-PCWR-014-DN150-I16C00_R0.pdf"),
    # 5K - different from example
    Path("5K/42563_CSL-7-201-018-15-SP1.pdf"),
    # Boxmeer - NEW PROJECT (no example!)
    Path("Boxmeer/PR05000201-46021301-01_00.pdf"),
    # ORCA - NEW PROJECT (no example!)
    Path("ORCA/1381_MC2L00R038-U230-MKWPS-115_01.pdf"),
]

FIELDS = ["line_no", "rev", "length", "pid", "pipe_class", "building", "floor", "dn", "insulation", "project"]


def run_batch_test():
    """Run extraction on multiple PDFs and collect results"""
    results = []

    pdf_files = [p for p in TEST_PDFS if p.exists()]

    print(f"\n{'='*80}")
    print(f" PDF EXTRACTION - BATCH TEST")
    print(f" Model: gemini-3-flash-preview + Few-Shot Learning")
    print(f" Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*80}")

    examples = load_examples()
    print(f"\nFew-Shot Examples loaded: {len(examples)}")
    print(f"PDFs to process: {len(pdf_files)}")
    print()

    for i, pdf_path in enumerate(pdf_files, 1):
        print(f"[{i}/{len(pdf_files)}] {pdf_path.name}")

        start = time.time()
        data = process_pdf(
            pdf_path,
            GEMINI_API_KEY,
            provider="gemini",
            model="gemini-3-flash-preview",
            use_fewshot=True
        )
        duration = time.time() - start

        data["_source"] = pdf_path.name
        data["_project"] = pdf_path.parent.name
        data["_duration"] = round(duration, 2)

        results.append(data)
        print(f"    Duration: {duration:.1f}s")
        print()

    return results


def create_presentation(results: list[dict]):
    """Create a nice presentation of the results"""

    print("\n")
    print("=" * 100)
    print(" ERGEBNISSE - PDF DATEN EXTRAKTION")
    print("=" * 100)

    # Summary statistics
    total = len(results)
    fields_found = {f: 0 for f in FIELDS}

    for r in results:
        for f in FIELDS:
            if r.get(f) is not None and r.get(f) != "":
                fields_found[f] += 1

    print("\n ERKENNUNGSRATE PRO FELD")
    print("-" * 50)

    for field in FIELDS:
        count = fields_found[field]
        pct = (count / total) * 100
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        status = "✓" if pct >= 80 else "◐" if pct >= 50 else "○"
        print(f"  {field:<12} {bar} {pct:5.1f}% ({count}/{total}) {status}")

    # Detailed results per project
    print("\n")
    print("=" * 100)
    print(" DETAILLIERTE ERGEBNISSE")
    print("=" * 100)

    projects = {}
    for r in results:
        proj = r.get("_project", "unknown")
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(r)

    for project, items in projects.items():
        print(f"\n {project.upper()}")
        print("-" * 80)

        for item in items:
            source = item.get("_source", "?")
            duration = item.get("_duration", 0)

            print(f"\n  📄 {source} ({duration}s)")

            # Show extracted fields
            for field in FIELDS:
                val = item.get(field)
                if val is not None:
                    icon = "✓"
                    print(f"     {icon} {field}: {val}")
                else:
                    print(f"     ○ {field}: -")

    # Performance summary
    print("\n")
    print("=" * 100)
    print(" PERFORMANCE ZUSAMMENFASSUNG")
    print("=" * 100)

    durations = [r.get("_duration", 0) for r in results]
    avg_duration = sum(durations) / len(durations) if durations else 0

    print(f"""
  ⏱️  Durchschnittliche Verarbeitungszeit: {avg_duration:.1f}s pro PDF
  📊  Gesamt verarbeitet: {total} PDFs
  🎯  Beste Erkennungsrate: {max(fields_found.values())}/{total} ({max(fields_found.values())/total*100:.0f}%)

  TOP 3 erkannte Felder:
""")

    sorted_fields = sorted(fields_found.items(), key=lambda x: x[1], reverse=True)
    for i, (field, count) in enumerate(sorted_fields[:3], 1):
        print(f"     {i}. {field}: {count}/{total} ({count/total*100:.0f}%)")

    print(f"""
  BOTTOM 3 erkannte Felder:
""")
    for i, (field, count) in enumerate(sorted_fields[-3:], 1):
        print(f"     {i}. {field}: {count}/{total} ({count/total*100:.0f}%)")

    # How to improve
    print("\n")
    print("=" * 100)
    print(" SO VERBESSERST DU DIE ERKENNUNG")
    print("=" * 100)
    print("""
  1. MEHR FEW-SHOT BEISPIELE HINZUFÜGEN:

     # PDF zu Bild konvertieren
     pdftoppm -png -r 150 -singlefile "pfad/datei.pdf" "examples/neues_beispiel"

     # JSON mit korrekten Werten erstellen
     # examples/neues_beispiel.json

  2. BEISPIELE AUS VERSCHIEDENEN PROJEKTEN:
     - Mindestens 1 Beispiel pro Projekt-Typ (Kujira, LPP6, 5K, etc.)
     - Verschiedene Layouts abdecken

  3. KORREKTE WERTE SIND WICHTIG:
     - Die JSON-Dateien müssen 100% korrekt sein
     - Das Modell lernt von diesen Beispielen
""")

    return results


def main():
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return

    results = run_batch_test()
    create_presentation(results)

    # Save results
    output_file = Path("batch_test_results.json")
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2, default=str, ensure_ascii=False)

    print(f"\n📁 Ergebnisse gespeichert: {output_file}")


if __name__ == "__main__":
    main()
