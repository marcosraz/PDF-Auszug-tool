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
import { Loader2, FolderOpen, Plus } from "lucide-react";
import { extractSingle, saveExample, downloadExcel, getProjects, createProject } from "@/lib/api";
import { ExtractionResponse, ExtractionResult, EXTRACTION_FIELDS } from "@/lib/types";
import type { ProjectEntry, CustomFieldInfo } from "@/lib/types";

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
  const [saveProjectName, setSaveProjectName] = useState<string>("__auto__");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Projects for custom fields and save dialog
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      toast.error("Projekte konnten nicht geladen werden");
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const created = await createProject(name);
      toast.success(`Projekt "${name}" erstellt`);
      await loadProjects();
      setSelectedProjectId(String(created.id));
      setNewProjectName("");
      setShowNewProject(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setCreatingProject(false);
    }
  };

  // Resolve selected project
  const selectedProject = projects.find((p) => String(p.id) === selectedProjectId);

  // Update custom field definitions when project changes (pre-selected or from extraction)
  useEffect(() => {
    // Pre-selected project takes priority
    if (selectedProject) {
      setCustomFieldDefs(selectedProject.custom_fields || []);
      return;
    }
    // Fall back to project detected in extraction
    if (!editedData?.project || projects.length === 0) {
      setCustomFieldDefs([]);
      return;
    }
    const proj = projects.find(
      (p) => p.name.toLowerCase() === editedData.project?.toLowerCase()
    );
    setCustomFieldDefs(proj?.custom_fields || []);
  }, [selectedProject, editedData?.project, projects]);

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
      // If a project was pre-selected, override the extracted project field
      const resultData = { ...res.result };
      if (selectedProject) {
        resultData.project = selectedProject.name;
      }
      setEditedData(resultData);
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

  const handleCustomFieldChange = (key: string, value: string) => {
    if (!editedData || !result) return;
    const newCustom = { ...(editedData.custom_fields || {}), [key]: value || null };
    setEditedData({ ...editedData, custom_fields: newCustom });

    const dirtyKey = `custom:${key}`;
    const newDirty = new Set(dirty);
    const origVal = result.result.custom_fields?.[key] ?? null;
    if ((value || null) !== origVal) {
      newDirty.add(dirtyKey);
    } else {
      newDirty.delete(dirtyKey);
    }
    setDirty(newDirty);
  };

  const handleSaveExample = () => {
    if (!result || !editedData || !exampleName.trim()) return;

    // Determine project name for assignment
    let projectName: string | null = null;
    if (saveProjectName === "__auto__") {
      projectName = editedData.project || null;
    } else if (saveProjectName !== "__none__") {
      projectName = saveProjectName;
    }

    startSaveTransition(async () => {
      clearOptimisticDirty("clear");
      try {
        await saveExample({
          name: exampleName.trim().replace(/\s+/g, "_"),
          extraction_id: result.id,
          data: editedData,
          project_name: projectName,
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

  const openSaveDialog = () => {
    if (!editedData) return;
    const projectNameForSave = selectedProject?.name || editedData.project || "pdf";
    const suggestedName = `example_${projectNameForSave.replace(/\s+/g, "_").toLowerCase()}_${(editedData.line_no || "unknown").replace(/[^a-zA-Z0-9-]/g, "_")}`;
    setExampleName(suggestedName);
    // If a project was pre-selected, use it directly instead of "auto"
    setSaveProjectName(selectedProject ? selectedProject.name : "__auto__");
    setShowSaveDialog(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && result && editedData) {
        e.preventDefault();
        openSaveDialog();
      }
      if (e.ctrlKey && e.key === "s" && editedData) {
        e.preventDefault();
        handleDownload();
      }
      if (e.ctrlKey && e.key === "e" && files.length > 0 && !extracting) {
        e.preventDefault();
        handleExtract();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, editedData, files, extracting]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Einzel-Extraktion</h1>
        <p className="text-muted-foreground text-sm">
          PDF hochladen, Daten extrahieren, korrigieren und als Trainingsbeispiel speichern
        </p>
      </div>

      {!result && (
        <div className="max-w-xl space-y-4">
          {/* Project selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4" />
              Projekt
            </Label>
            {!showNewProject ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="">Kein Projekt (automatisch erkennen)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowNewProject(true)}
                  title="Neues Projekt erstellen"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Neuer Projektname..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  className="h-9"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-9"
                  onClick={handleCreateProject}
                  disabled={creatingProject || !newProjectName.trim()}
                >
                  {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : "Erstellen"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                >
                  Abbrechen
                </Button>
              </div>
            )}
            {selectedProject && (
              <p className="text-xs text-muted-foreground">
                {selectedProject.order_number && <span className="font-mono">{selectedProject.order_number} · </span>}
                {selectedProject.custom_fields?.length
                  ? `${selectedProject.custom_fields.length} zusätzliche Spalte(n)`
                  : "Keine zusätzlichen Spalten"}
              </p>
            )}
          </div>

          <PdfDropzone onFiles={handleFiles} files={files} />
          {files.length > 0 && (
            <Button
              onClick={handleExtract}
              disabled={extracting}
              className="w-full"
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
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
        </div>
      )}

      {result && editedData && (
        <>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
            <div className="border rounded-xl overflow-auto min-h-0">
              <PdfViewer
                imageUrl={result.image_url}
                filename={result.filename}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <ExtractionForm
                data={editedData}
                onChange={handleFieldChange}
                onChangeCustom={handleCustomFieldChange}
                onSaveExample={openSaveDialog}
                onDownload={handleDownload}
                saving={savePending}
                downloading={downloadPending}
                dirty={optimisticDirty}
                confidence={result.confidence as Record<string, number> | undefined}
                customFieldDefs={customFieldDefs}
              />

              {/* Validation warnings */}
              {result.validation && result.validation.length > 0 && (
                <div className="space-y-1.5 mt-4">
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
                <div className="text-xs px-3 py-1.5 rounded-md bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 mt-2">
                  <span className="font-medium">Duplikat erkannt:</span> Diese Line No. + Rev. existiert bereits in{" "}
                  <span className="font-mono">{result.duplicate.existing_filename}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
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
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
                +
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">E</kbd>
                {" "}Extrahieren
              </span>
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

      {/* Save Example Dialog with Project Selection */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Als Trainingsbeispiel speichern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="example-name">Name des Beispiels</Label>
              <Input
                id="example-name"
                value={exampleName}
                onChange={(e) => setExampleName(e.target.value)}
                placeholder="z.B. example_kujira_line42"
              />
            </div>
            <div className="space-y-2">
              <Label>Projekt zuweisen</Label>

              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={saveProjectName}
                onChange={(e) => setSaveProjectName(e.target.value)}
              >
                <option value="__auto__">
                  Automatisch ({editedData?.project || "keins"})
                </option>
                <option value="__none__">Kein Projekt</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
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
