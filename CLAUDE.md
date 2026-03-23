# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

PDF data extraction tool for engineering/piping isometric drawings. Extracts metadata from PDF title blocks and exports to Excel spreadsheets.

## Commands

```bash
# === Web App (recommended) ===
# Start both servers (Production)
start.bat

# Start both servers (Development with hot-reload)
start-dev.bat

# Or manually:
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000  # Backend
cd frontend && npm run dev                                       # Frontend
# Open http://localhost:3000

# === CLI Tool ===
# Analyze a folder (no API key needed)
python pdf_extractor.py analyze <folder>

# Extract data from PDFs
python pdf_extractor.py extract <folder_or_pdf> -o output.xlsx

# Test single PDF extraction
python pdf_extractor.py test <pdf_file>
```

## Data Structure

- **Project folders**: 5K, Boxmeer, Kujira, LPP5, LPP6, ORCA
- **PDF files**: Piping isometric drawings with title blocks
- **IDF files**: AVEVA E3D Isodraft format
- **Excel folders**: Output spreadsheets (e.g., `5K/excel/`, `Kujira/Excel_enträge/`)

## Key Fields to Extract

| Field | Examples |
|-------|----------|
| Line No. | `740-MHW-R-VH001-103-LH130-50-0`, `DH_F02-PCWR-013-DN150-I16C00` |
| Rev. | 0, 1, 2 |
| PId | `LV1-105623.VH001`, `CH06822004-BD-PI-1179` |
| Pipe class | 362, 1129, SP1, I16C00 |
| DN | 25, 80, 150, 450 |
| Building | MC1, Datahall, 5K |
| Floor | LVL 6, F02, Riser |
| Insulation | W60, H2, FoamInside |
| Ped Cat | SEP |

## Architecture

### CLI Tool
- `pdf_extractor.py` - Main CLI tool
  - Uses `PyMuPDF` for PDF→image conversion
  - Gemini 3.1 Pro Preview via Vertex AI for data extraction
  - `openpyxl` for Excel export
  - Few-shot learning from `examples/` directory

### Web App (FastAPI + Next.js)
- `backend/` - FastAPI REST API
  - `main.py` - Entry point, CORS, middleware
  - `routers/` - API endpoints (extraction, examples, export, stats)
  - `services/` - Business logic (extractor wrapper, example store, job manager)
  - `models/schemas.py` - Pydantic request/response models
- `frontend/` - Next.js + shadcn/ui + Tailwind CSS
  - `/` - Dashboard with stats
  - `/extract` - Single PDF extraction with split view
  - `/batch` - Batch processing with SSE progress
  - `/examples` - Few-shot example management
- `examples/` - Few-shot training data (PNG + JSON pairs, shared between CLI and web)

## Git Configuration

When pushing to GitHub, use email: marek.heidinger@gmail.com
