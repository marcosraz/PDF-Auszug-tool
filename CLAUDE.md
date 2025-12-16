# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

PDF data extraction tool for engineering/piping isometric drawings. Extracts metadata from PDF title blocks and exports to Excel spreadsheets.

## Commands

```bash
# Analyze a folder (no API key needed)
python3 pdf_extractor.py analyze <folder>

# Extract data from PDFs (requires ANTHROPIC_API_KEY)
python3 pdf_extractor.py extract <folder_or_pdf> -o output.xlsx

# Test single PDF extraction
python3 pdf_extractor.py test <pdf_file> --api-key "sk-ant-..."

# Set API key as environment variable
export ANTHROPIC_API_KEY="sk-ant-..."
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

- `pdf_extractor.py` - Main CLI tool
  - Uses `pdftoppm` for PDF→image conversion
  - Claude Vision API for data extraction
  - `openpyxl` for Excel export

## Git Configuration

When pushing to GitHub, use email: marek.heidinger@gmail.com
