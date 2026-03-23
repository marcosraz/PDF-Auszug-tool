"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileSearch,
  Layers,
  GraduationCap,
  BarChart3,
  ClipboardCheck,
  Upload,
  Download,
  Eye,
  Keyboard,
  Shield,
  Zap,
  Database,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Settings,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Accordion-style section component
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <CardHeader className="flex flex-row items-center gap-3 py-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <CardTitle className="text-base flex-1">{title}</CardTitle>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pb-5 px-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
        {n}
      </div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Anleitung &amp; Erklärung
        </h1>
        <p className="text-muted-foreground mt-1">
          Wie PDF-Auszug funktioniert — Schritt für Schritt
        </p>
      </div>

      {/* ── Overview ──────────────────────────────────────────────────── */}
      <Section icon={HelpCircle} title="Was ist PDF-Auszug?" defaultOpen>
        <p>
          <strong className="text-foreground">PDF-Auszug</strong> ist ein
          KI-gestütztes Tool zur automatischen Extraktion von Metadaten aus
          Rohrleitungs-Isometrie-Zeichnungen (Piping Isometrics). Es liest das
          Schriftfeld (Title Block) der PDF-Zeichnungen und extrahiert Felder
          wie Leitungsnummer, Revision, Rohrklasse, Nennweite und mehr.
        </p>
        <p>
          Die KI (<Badge variant="secondary">Google Gemini Vision</Badge>) analysiert das
          Bild der Zeichnung und gibt strukturierte Daten zurück, die dann
          geprüft, korrigiert und als Excel-Tabelle exportiert werden können.
        </p>
        <div className="rounded-lg border bg-muted/30 p-3 mt-2">
          <p className="font-medium text-foreground mb-2">Extrahierte Felder:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Line No.",
              "Rev.",
              "PId",
              "Pipe Class",
              "DN",
              "Building",
              "Floor",
              "Insulation",
              "Ped Cat",
              "Project",
              "Length",
              "Customer",
            ].map((f) => (
              <Badge key={f} variant="outline">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Single Extraction ─────────────────────────────────────────── */}
      <Section icon={FileSearch} title="Einzel-Extraktion">
        <p>Die Kernfunktion — ein PDF hochladen und Daten extrahieren.</p>
        <div className="space-y-4 mt-3">
          <Step n={1} title="PDF hochladen">
            <p>
              Ziehe eine PDF-Datei in die Dropzone oder klicke zum Auswählen.
              Eine <strong className="text-foreground">Vorschau</strong> der
              ersten Seite wird angezeigt, damit du die richtige Datei
              verifizieren kannst.
            </p>
          </Step>
          <Step n={2} title="Extraktion starten">
            <p>
              Klicke <strong className="text-foreground">Extrahieren</strong>{" "}
              oder drücke <Kbd>Ctrl+Enter</Kbd>. Die KI analysiert die Zeichnung
              und extrahiert alle Felder. Ein Fortschritts-Timer zeigt die
              verstrichene Zeit.
            </p>
          </Step>
          <Step n={3} title="Ergebnisse prüfen & korrigieren">
            <p>
              Die extrahierten Werte werden in einem Formular angezeigt.
              Felder mit niedriger Konfidenz sind farblich markiert
              (<span className="text-red-500">rot</span> ={" "}
              {"<"}50%, <span className="text-yellow-500">gelb</span> ={" "}
              50-80%, <span className="text-green-500">grün</span> ={" "}
              {">"}80%). Korrigiere fehlerhafte Werte direkt im Formular.
            </p>
          </Step>
          <Step n={4} title="Als Trainingsbeispiel speichern">
            <p>
              Klicke{" "}
              <strong className="text-foreground">
                Als Beispiel speichern
              </strong>{" "}
              (<Kbd>Ctrl+S</Kbd>), um die korrigierten Daten als
              Few-Shot-Beispiel zu speichern. Die KI nutzt diese Beispiele für
              zukünftige Extraktionen als Referenz.
            </p>
          </Step>
          <Step n={5} title="Excel-Export">
            <p>
              Klicke{" "}
              <strong className="text-foreground">Excel herunterladen</strong>,
              um die Daten als .xlsx-Datei zu exportieren.
            </p>
          </Step>
        </div>
      </Section>

      {/* ── Batch ─────────────────────────────────────────────────────── */}
      <Section icon={Layers} title="Batch-Verarbeitung">
        <p>Verarbeite mehrere PDFs gleichzeitig.</p>
        <div className="space-y-4 mt-3">
          <Step n={1} title="Mehrere PDFs hochladen">
            <p>
              Wähle mehrere PDF-Dateien aus oder ziehe sie in die Dropzone. Alle
              Dateien werden validiert (Dateityp + PDF-Header).
            </p>
          </Step>
          <Step n={2} title="Batch starten">
            <p>
              Die Verarbeitung läuft im Hintergrund. Ein
              <strong className="text-foreground"> Echtzeit-Fortschrittsbalken</strong>{" "}
              (via Server-Sent Events) zeigt den Status jeder einzelnen Datei.
            </p>
          </Step>
          <Step n={3} title="Ergebnisse prüfen">
            <p>
              Nach Abschluss werden alle Ergebnisse in einer Tabelle angezeigt.
              Konfidenz-Punkte zeigen die Qualität jedes Feldes.
              <span className="text-green-500"> Grün</span> = hohe Konfidenz,
              <span className="text-yellow-500"> Gelb</span> = mittel,
              <span className="text-red-500"> Rot</span> = niedrig.
            </p>
          </Step>
          <Step n={4} title="Alle herunterladen">
            <p>
              Klicke{" "}
              <strong className="text-foreground">Alle herunterladen</strong>,
              um alle Ergebnisse als ZIP-Archiv mit Excel-Dateien zu
              exportieren.
            </p>
          </Step>
        </div>
      </Section>

      {/* ── Examples ──────────────────────────────────────────────────── */}
      <Section icon={GraduationCap} title="Trainingsbeispiele (Few-Shot)">
        <p>
          Trainingsbeispiele verbessern die Extraktionsqualität. Je mehr
          korrigierte Beispiele vorliegen, desto besser erkennt die KI die
          Felder deiner spezifischen Zeichnungen.
        </p>
        <div className="rounded-lg border bg-muted/30 p-3 mt-2">
          <p className="font-medium text-foreground mb-1">So funktioniert es:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Nach einer Extraktion korrigierst du fehlerhafte Werte
            </li>
            <li>
              Du speicherst die Korrektur als Trainingsbeispiel
            </li>
            <li>
              Bei der nächsten Extraktion werden alle gespeicherten Beispiele als
              Kontext an die KI übergeben (Few-Shot Learning)
            </li>
            <li>
              Die KI lernt die spezifischen Muster deiner Zeichnungen
            </li>
          </ul>
        </div>
        <p className="mt-2">
          Auf der <strong className="text-foreground">Beispiele</strong>-Seite
          kannst du alle gespeicherten Beispiele einsehen und nicht mehr
          benötigte löschen.
        </p>
      </Section>

      {/* ── Analytics ─────────────────────────────────────────────────── */}
      <Section icon={BarChart3} title="Analytik-Dashboard">
        <p>Das Dashboard zeigt dir alle wichtigen Metriken auf einen Blick:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>
            <strong className="text-foreground">Übersichtskarten:</strong>{" "}
            Gesamt-Extraktionen, Durchschnittliche Genauigkeit, Korrekturen
            heute, Extraktionen heute
          </li>
          <li>
            <strong className="text-foreground">Tages-Trend:</strong>{" "}
            Interaktives Balkendiagramm der letzten 14 Tage
          </li>
          <li>
            <strong className="text-foreground">Feldgenauigkeit:</strong>{" "}
            Welche Felder am häufigsten korrigiert werden
          </li>
          <li>
            <strong className="text-foreground">Projektstatistiken:</strong>{" "}
            Extraktionen und Genauigkeit pro Projekt
          </li>
          <li>
            <strong className="text-foreground">Letzte Extraktionen:</strong>{" "}
            Durchsuchbare Liste mit Feld-Details (klicke eine Zeile zum
            Aufklappen)
          </li>
        </ul>
        <p className="mt-2">
          Die Filter-Leiste ermöglicht Suche nach Dateiname, Projekt und
          Status.
        </p>
      </Section>

      {/* ── Review Queue ──────────────────────────────────────────────── */}
      <Section icon={ClipboardCheck} title="Review-Queue">
        <p>
          Die Review-Queue zeigt automatisch alle Extraktionen, die manuelle
          Prüfung benötigen:
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Felder mit Konfidenz unter 70%</li>
          <li>Extraktionen mit Status „pending_review"</li>
          <li>
            Du kannst Extraktionen nach Prüfung als{" "}
            <strong className="text-foreground">genehmigt</strong> markieren
          </li>
        </ul>
      </Section>

      {/* ── Keyboard Shortcuts ────────────────────────────────────────── */}
      <Section icon={Keyboard} title="Tastenkürzel">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {[
            ["Ctrl+K", "Befehlspalette öffnen"],
            ["Ctrl+Enter", "Extraktion starten"],
            ["Ctrl+S", "Als Beispiel speichern"],
            ["Escape", "Dialog schließen"],
          ].map(([key, desc]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <span className="text-foreground">{desc}</span>
              <Kbd>{key}</Kbd>
            </div>
          ))}
        </div>
        <p className="mt-3">
          Die <strong className="text-foreground">Befehlspalette</strong>{" "}
          (<Kbd>Ctrl+K</Kbd>) ermöglicht schnelle Navigation zu allen Seiten
          und Aktionen. Tippe einfach, um zu filtern.
        </p>
      </Section>

      {/* ── Architecture ──────────────────────────────────────────────── */}
      <Section icon={Settings} title="Technische Architektur">
        <p>PDF-Auszug besteht aus zwei Hauptkomponenten:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="rounded-lg border p-3">
            <p className="font-medium text-foreground mb-1">Frontend</p>
            <ul className="text-xs space-y-0.5">
              <li>Next.js 16 (React 19)</li>
              <li>Tailwind CSS v4 + shadcn/ui</li>
              <li>Recharts (Diagramme)</li>
              <li>TanStack Table (Datentabellen)</li>
              <li>cmdk (Befehlspalette)</li>
              <li>react-pdf (PDF-Vorschau)</li>
            </ul>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-medium text-foreground mb-1">Backend</p>
            <ul className="text-xs space-y-0.5">
              <li>Python FastAPI (async)</li>
              <li>Google Gemini Vision API</li>
              <li>SQLite + WAL-Modus</li>
              <li>JWT-Authentifizierung</li>
              <li>SSE (Server-Sent Events)</li>
              <li>Strukturiertes JSON-Logging</li>
            </ul>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 mt-3">
          <p className="font-medium text-foreground mb-2">Datenfluss:</p>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline">PDF hochladen</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">PDF → Bild</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">Gemini Vision API</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">JSON-Ergebnis</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">Validierung</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">Anzeige & Korrektur</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">Excel-Export</Badge>
          </div>
        </div>
      </Section>

      {/* ── Security ──────────────────────────────────────────────────── */}
      <Section icon={Shield} title="Sicherheit">
        <ul className="list-disc list-inside space-y-1">
          <li>JWT-basierte Authentifizierung mit bcrypt-Passwort-Hashing</li>
          <li>Rate Limiting auf allen Endpoints (Login: 5/min, Extraktion: 15/min)</li>
          <li>PDF-Validierung: Dateityp + Magic-Bytes-Prüfung</li>
          <li>Security Headers: X-Frame-Options, CSP, HSTS</li>
          <li>SSE-Tokens: Kurzlebige Einmal-Tokens für Streaming</li>
          <li>Audit-Log: Alle API-Aktionen werden protokolliert</li>
          <li>Eingabe-Validierung gegen Path Traversal und SQL Injection</li>
        </ul>
      </Section>

      {/* ── Performance ───────────────────────────────────────────────── */}
      <Section icon={Zap} title="Performance & Optimierungen">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-foreground">Ergebnis-Cache:</strong>{" "}
            Gleiche PDFs werden nicht doppelt extrahiert (SHA-256 Hash)
          </li>
          <li>
            <strong className="text-foreground">Model-Fallback:</strong>{" "}
            Automatischer Retry mit alternativem Gemini-Modell bei niedriger
            Qualität
          </li>
          <li>
            <strong className="text-foreground">SQLite WAL-Modus:</strong>{" "}
            Gleichzeitiges Lesen und Schreiben ohne Locks
          </li>
          <li>
            <strong className="text-foreground">React Compiler:</strong>{" "}
            Automatische Memoization ohne manuelles useMemo/useCallback
          </li>
          <li>
            <strong className="text-foreground">Retry mit Backoff:</strong>{" "}
            Automatische Wiederholung bei API-Fehlern
          </li>
          <li>
            <strong className="text-foreground">Auto-Normalisierung:</strong>{" "}
            Extrahierte Werte werden automatisch bereinigt (Whitespace,
            Bindestriche, Groß-/Kleinschreibung)
          </li>
        </ul>
      </Section>

      {/* ── Database ──────────────────────────────────────────────────── */}
      <Section icon={Database} title="Datenbank & Wartung">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-foreground">Automatisches Backup:</strong>{" "}
            Alle 6 Stunden wird ein Backup erstellt (max. 5 behalten)
          </li>
          <li>
            <strong className="text-foreground">Audit-Log Rotation:</strong>{" "}
            Einträge älter als 90 Tage werden automatisch gelöscht
          </li>
          <li>
            <strong className="text-foreground">Cache-Cleanup:</strong>{" "}
            Gecachte Ergebnisse verfallen nach 48 Stunden
          </li>
          <li>
            <strong className="text-foreground">Migrationen:</strong>{" "}
            Versioniertes Schema-Management für zukünftige Updates
          </li>
        </ul>
      </Section>
    </div>
  );
}
