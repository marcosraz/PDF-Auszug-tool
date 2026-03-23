"use client";

import { useState, useCallback, useEffect, useRef, useTransition, useOptimistic } from "react";
import { toast } from "sonner";
import { PdfDropzone } from "@/components/pdf-dropzone";
import { PdfViewer } from "@/components/pdf-viewer";
import { ExtractionForm } from "@/components/extraction-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { extractSingle, saveExample, downloadExcel } from "@/lib/api";
import { ExtractionResponse, ExtractionResult, EXTRACTION_FIELDS } from "@/lib/types";

export default function ExtractPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [editedData, setEditedData] = useState<ExtractionResult | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [optimisticDirty, clearOptimisticDirty] = useOptimistic(
    dirty,
    (_current: Set<string>, _action: "clear") => new Set<string>()
  );
  const [savePending, startSaveTransition] = useTransition();
  const [downloadPending, startDownloadTransition] = useTransition();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [exampleName, setExampleName] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (extracting) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [extracting]);

  // Autosave draft to localStorage
  useEffect(() => {
    if (!editedData || !result) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          "extract_draft",
          JSON.stringify({ id: result.id, data: editedData, dirty: [...dirty] })
        );
      } catch { /* ignore quota errors */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [editedData, result, dirty]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("extract_draft");
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.data && result && draft.id === result.id) {
          setEditedData(draft.data);
          setDirty(new Set(draft.dirty || []));
        }
      }
    } catch { /* ignore */ }
  }, [result]);

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setResult(null);
    setEditedData(null);
    setDirty(new Set());
    try { localStorage.removeItem("extract_draft"); } catch { /* ignore */ }
  }, []);

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    try {
      const res = await extractSingle(files[0]);
      const filledFields = EXTRACTION_FIELDS.filter(
        (f) => res.result[f] !== null && res.result[f] !== ""
      ).length;
      toast.success(`${res.filename}: ${filledFields}/${EXTRACTION_FIELDS.length} Felder extrahiert`);
      setResult(res);
      setEditedData({ ...res.result });
    } catch (err) {
      toast.error(`Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleFieldChange = (field: keyof ExtractionResult, value: string) => {
    if (!editedData || !result) return;

    const numericFields = new Set(["rev", "dn"]);
    const floatFields = new Set(["length"]);

    let parsed: string | number | null;
    if (value === "") {
      parsed = null;
    } else if (numericFields.has(field)) {
      const n = parseInt(value, 10);
      parsed = Number.isNaN(n) ? null : n;
    } else if (floatFields.has(field)) {
      const n = parseFloat(value);
      parsed = Number.isNaN(n) ? null : n;
    } else {
      parsed = value;
    }

    const newData = { ...editedData, [field]: parsed };
    setEditedData(newData as ExtractionResult);

    const newDirty = new Set(dirty);
    const originalValue = result.result[field];
    if (parsed !== originalValue) {
      newDirty.add(field);
    } else {
      newDirty.delete(field);
    }
    setDirty(newDirty);
  };

  const handleSaveExample = () => {
    if (!result || !editedData || !exampleName.trim()) return;
    startSaveTransition(async () => {
      clearOptimisticDirty("clear");
      try {
        await saveExample({
          name: exampleName.trim().replace(/\s+/g, "_"),
          extraction_id: result.id,
          data: editedData,
        });
        toast.success(`Beispiel "${exampleName}" gespeichert!`);
        setShowSaveDialog(false);
        setDirty(new Set());
      } catch (err) {
        toast.error(`Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
      }
    });
  };

  const handleDownload = () => {
    if (!editedData) return;
    startDownloadTransition(async () => {
      try {
        const blob = await downloadExcel([editedData]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "extracted_data.xlsx";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Excel heruntergeladen");
      } catch (err) {
        toast.error("Excel-Export fehlgeschlagen");
      }
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Enter = Save as example
      if (e.ctrlKey && e.key === "Enter" && result && editedData) {
        e.preventDefault();
        const suggestedName = `example_${(editedData.project || "pdf").replace(/\s+/g, "_").toLowerCase()}_${(editedData.line_no || "unknown").replace(/[^a-zA-Z0-9-]/g, "_")}`;
        setExampleName(suggestedName);
        setShowSaveDialog(true);
      }
      // Ctrl+S = Download Excel
      if (e.ctrlKey && e.key === "s" && editedData) {
        e.preventDefault();
        handleDownload();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [result, editedData]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Einzel-Extraktion</h1>
        <p className="text-muted-foreground text-sm">
          PDF hochladen, Daten extrahieren, korrigieren und als Trainingsbeispiel speichern
        </p>
      </div>

      {!result && (
        <div className="max-w-xl">
          <PdfDropzone onFiles={handleFiles} files={files} />
          {files.length > 0 && (
            <Button
              onClick={handleExtract}
              disabled={extracting}
              className="mt-4 w-full"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird extrahiert... ({elapsedSeconds}s)
                </>
              ) : (
                "Extraktion starten"
              )}
            </Button>
          )}
          {extracting && (
            <div className="mt-6 space-y-3" aria-live="polite" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
        </div>
      )}

      {result && editedData && (
        <>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
            <div className="border rounded-xl overflow-hidden min-h-[500px]">
              <PdfViewer
                imageUrl={result.image_url}
                filename={result.filename}
              />
            </div>
            <div className="min-h-[500px]">
              <ExtractionForm
                data={editedData}
                onChange={handleFieldChange}
                onSaveExample={() => {
                  const suggestedName = `example_${(editedData.project || "pdf").replace(/\s+/g, "_").toLowerCase()}_${(editedData.line_no || "unknown").replace(/[^a-zA-Z0-9-]/g, "_")}`;
                  setExampleName(suggestedName);
                  setShowSaveDialog(true);
                }}
                onDownload={handleDownload}
                saving={savePending}
                downloading={downloadPending}
                dirty={optimisticDirty}
              />
            </div>
          </div>

          {/* Validation warnings */}
          {result.validation && result.validation.length > 0 && (
            <div className="space-y-1.5">
              {result.validation.map((v, i) => (
                <div
                  key={i}
                  className={`text-xs px-3 py-1.5 rounded-md ${
                    v.type === "error"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : v.type === "warning"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
                  <span className="font-medium">{v.field}:</span> {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Duplicate warning */}
          {result.duplicate && (
            <div className="text-xs px-3 py-1.5 rounded-md bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              <span className="font-medium">Duplikat erkannt:</span> Diese Line No. + Rev. existiert bereits in{" "}
              <span className="font-mono">{result.duplicate.existing_filename}</span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setEditedData(null);
                setFiles([]);
                setDirty(new Set());
              }}
              className="w-fit"
            >
              Neues PDF extrahieren
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
                +
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                {" "}Speichern
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
                +
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">S</kbd>
                {" "}Excel
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd>
                {" "}Naechstes Feld
              </span>
            </div>
          </div>
        </>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Als Trainingsbeispiel speichern</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="example-name">Name des Beispiels</Label>
            <Input
              id="example-name"
              value={exampleName}
              onChange={(e) => setExampleName(e.target.value)}
              placeholder="z.B. example_kujira_line42"
            />
            <p className="text-xs text-muted-foreground">
              Das Bild und die korrigierten Daten werden als neues Few-Shot-Beispiel gespeichert.
              Zukünftige Extraktionen nutzen dieses Beispiel automatisch.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveExample} disabled={savePending || !exampleName.trim()}>
              {savePending ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
