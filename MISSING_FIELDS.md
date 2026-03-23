# Fehlende Felder - Nachfragen beim Kunden

Diese Felder sind auf den PDFs **NICHT sichtbar** und müssen aus anderen Quellen kommen.

---

## 1. Pipe class (Zahlen wie 362, 363, 386)

**Problem:** Die Reference-Excel hat numerische Pipe class IDs (z.B. 362, 386), aber auf den Kujira-PDFs ist nur der Code in der Line No. sichtbar (z.B. LH099, LH130).

**Fragen:**
- Woher kommen die numerischen Pipe class IDs (362, 386)?
- Gibt es eine Mapping-Tabelle: LH099 → 386, LH130 → 362?
- Ist das eine interne Datenbank-ID aus eurem System?

**Bei 5K/LPP6:** Hier ist der Pipe class Code (SP1, I16C00) auf dem PDF sichtbar.

---

## 2. Building (z.B. "MC1")

**Problem:** Auf den Kujira-PDFs steht nur der Kundenname "Lonza AG", nicht das Building "MC1".

**Fragen:**
- Woher kommt die Building-Information (MC1, etc.)?
- Gibt es eine Mapping-Tabelle: Projekt + Floor → Building?
- Steht das in einem anderen Dokument oder System?

**Bei LPP6:** "DC building" ist direkt auf dem PDF sichtbar.

---

## 3. Area (z.B. 796, 803, 1042)

**Problem:** Die numerische Area-ID ist auf keinem PDF sichtbar.

**Fragen:**
- Was bedeutet die Area-Nummer?
- Woher kommt diese Information?
- Gibt es eine Zuordnung: Building + Floor → Area?

---

## 4. Company (z.B. 149, 150)

**Problem:** Die Company-Nummer ist auf keinem PDF sichtbar.

**Fragen:**
- Was bedeutet die Company-Nummer (149, 150)?
- Ist das eine interne ID für Subunternehmer/Prefab-Firmen?

---

## 5. Ped Cat (SEP)

**Problem:** PED-Kategorie ist auf manchen PDFs nicht sichtbar.

**Fragen:**
- Soll immer "SEP" eingetragen werden wenn nicht sichtbar?
- Oder gibt es Regeln basierend auf DN/Pipe class?

---

## 6. Transmittal No. / Date Rec.

**Problem:** Diese Workflow-Felder stehen nicht auf den Isometric-Zeichnungen.

**Fragen:**
- Woher kommen Transmittal-Nummern (TR001, TR014_4)?
- Werden diese manuell eingetragen nach Erhalt?

---

## 7. Latest Rev. (true/false)

**Problem:** Ob eine Revision die "Latest" ist, kann nur durch Vergleich mit anderen Revisionen festgestellt werden.

**Fragen:**
- Soll das Tool automatisch prüfen ob es neuere Revisionen gibt?
- Oder wird das manuell nachgetragen?

---

## Zusammenfassung der Datenquellen

| Feld | Quelle | Status |
|------|--------|--------|
| Line No. | PDF | ✓ Extrahierbar |
| Rev. | PDF | ✓ Extrahierbar |
| Length | PDF (Materialliste) | ✓ Extrahierbar |
| PId | PDF | ✓ Extrahierbar |
| Pipe class | PDF (nur 5K/LPP6) | ⚠️ Kujira: Mapping nötig |
| Building | PDF (nur LPP6) | ⚠️ Kujira: Mapping nötig |
| Floor | PDF | ✓ Extrahierbar |
| DN | PDF | ✓ Extrahierbar |
| Insulation | PDF | ✓ Extrahierbar |
| Project | PDF | ✓ Extrahierbar |
| Ped Cat | PDF (manchmal) | ⚠️ Regel nötig |
| Area | ??? | ❌ Quelle unbekannt |
| Company | ??? | ❌ Quelle unbekannt |
| Transmittal | Workflow | ❌ Manuell |
| Date Rec. | Workflow | ❌ Manuell |
| Alle Prefab/Install Felder | Workflow | ❌ Manuell |

---

## Mögliche Lösungen

### Option A: Mapping-Tabellen
Falls es Zuordnungstabellen gibt, können wir diese importieren:
- `pipe_class_mapping.csv`: LH099 → 386, LH130 → 362, etc.
- `building_mapping.csv`: Project + Floor → Building

### Option B: IDF-Dateien
Die IDF-Dateien im Projekt könnten zusätzliche Metadaten enthalten.

### Option C: Datenbank-Export
Falls die Daten in einer Datenbank (SQL, SAP, etc.) gespeichert sind, könnten wir einen Export integrieren.

---

**Bitte klären und mir mitteilen:**
1. Woher kommen Pipe class, Building, Area, Company?
2. Gibt es Mapping-Tabellen die ich verwenden kann?
3. Welche Felder sollen leer bleiben vs. welche brauchen einen Default-Wert?
