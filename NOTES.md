# PDF-Auszug Tool - Notizen & Fortschritt

## Aktueller Stand (Januar 2026)

- Tool funktioniert mit **Gemini 3 Flash** + Few-Shot Learning
- Authentifizierung über einfachen API-Key-String (`GEMINI_API_KEY`)
- Unterstützt auch Claude als Alternative

## Authentifizierung

### Aktuell verwendet: API-Key-String
```
GEMINI_API_KEY=AIzaSy...
```
- Einfach, funktioniert sofort
- Für persönliche Nutzung ausreichend

### Für später: JSON-Service-Account (Vertex AI)
Falls Firmen-Features benötigt werden (Audit-Logs, zentrale Abrechnung, IP-Beschränkungen):

1. JSON-Datei von Google Cloud Console herunterladen
2. Umgebungsvariable setzen:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/pfad/zur/datei.json
   ```
3. Code anpassen: `google-auth` Bibliothek statt `?key=` Parameter

**Vorteile JSON-Authentifizierung:**
- Granulare Berechtigungen
- Audit-Logs
- Zentrale Firmenabrechnung
- IP-Beschränkungen möglich

**Aufwand:** Kleine Code-Änderung in `pdf_extractor.py` (URL-Aufbau → Bearer Token)

## Offene Punkte / Ideen

- [ ] Optional: Vertex AI Support mit JSON-Authentifizierung
