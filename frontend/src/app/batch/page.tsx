"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { PdfDropzone } from "@/components/pdf-dropzone";
import { BatchProgress, type BatchFile } from "@/components/batch-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Play, FolderOpen, Plus, Loader2 } from "lucide-react";
import { startBatch, streamBatchProgress, downloadExcel, getProjects, createProject } from "@/lib/api";
import { ExtractionResponse, FIELD_LABELS } from "@/lib/types";
import type { ProjectEntry } from "@/lib/types";

export default function BatchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<ExtractionResponse[]>([]);
  const [done, setDone] = useState(false);
  const currentIndexRef = useRef(0);

  // Project selector state
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const selectedProject = projects.find((p) => String(p.id) === selectedProjectId);

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

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleStart = async () => {
    if (files.length === 0) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    setCompleted(0);
    setTotal(files.length);

    const initial: BatchFile[] = files.map((f) => ({
      name: f.name,
      status: "pending",
    }));
    setBatchFiles(initial);

    try {
      const batchResult = await startBatch(files);
      toast.success(`Batch gestartet (${batchResult.total} PDFs)`);
      const { job_id } = batchResult;

      currentIndexRef.current = 0;
      streamBatchProgress(
        job_id,
        (event) => {
          if (event.type === "progress") {
            const latest = event.latest as ExtractionResponse;
            // Override project if one was pre-selected
            if (selectedProject) {
              latest.result.project = selectedProject.name;
            }
            setCompleted(event.completed as number);
            setResults((prev) => [...prev, latest]);

            const idx = currentIndexRef.current;
            setBatchFiles((prev) => {
              const updated = [...prev];
              if (updated[idx]) {
                updated[idx] = {
                  ...updated[idx],
                  status: "done",
                  result: latest,
                };
              }
              if (updated[idx + 1]) {
                updated[idx + 1] = {
                  ...updated[idx + 1],
                  status: "processing",
                };
              }
              return updated;
            });
            currentIndexRef.current++;
          } else if (event.type === "error") {
            setCompleted(event.completed as number);

            const idx = currentIndexRef.current;
            setBatchFiles((prev) => {
              const updated = [...prev];
              if (updated[idx]) {
                updated[idx] = {
                  ...updated[idx],
                  status: "error",
                  error: event.error as string,
                };
              }
              if (updated[idx + 1]) {
                updated[idx + 1] = {
                  ...updated[idx + 1],
                  status: "processing",
                };
              }
              return updated;
            });
            currentIndexRef.current++;
          }
        },
        () => {
          setRunning(false);
          setDone(true);
          setBatchFiles((prev) => {
            const successCount = prev.filter((f) => f.status === "done").length;
            const errorCount = prev.filter((f) => f.status === "error").length;
            toast.success("Batch-Verarbeitung abgeschlossen", {
              description: `${successCount} erfolgreich, ${errorCount} fehlgeschlagen von ${prev.length} PDFs`,
            });
            return prev;
          });
        }
      );

      // Mark first as processing
      setBatchFiles((prev) => {
        const updated = [...prev];
        if (updated[0]) updated[0] = { ...updated[0], status: "processing" };
        return updated;
      });
    } catch {
      // error already shown by toast.promise
      setRunning(false);
    }
  };

  const handleDownloadAll = async () => {
    if (results.length === 0) return;
    try {
      const data = results.map((r) => r.result);
      const blob = await downloadExcel(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "batch_extracted_data.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel heruntergeladen");
    } catch {
      toast.error("Excel-Export fehlgeschlagen");
    }
  };

  const displayFields = ["line_no", "rev", "dn", "pipe_class", "project", "customer"] as const;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Batch-Verarbeitung</h1>
        <p className="text-muted-foreground text-sm">
          Mehrere PDFs gleichzeitig hochladen und verarbeiten
        </p>
      </div>

      {!running && !done && (
        <div className="space-y-4">
          {/* Project selector */}
          <div className="space-y-2 max-w-xl">
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

          <PdfDropzone onFiles={handleFiles} multiple files={files} />
          {files.length > 0 && (
            <div className="flex items-center gap-3">
              <Button onClick={handleStart}>
                <Play className="h-4 w-4 mr-2" />
                {files.length} PDFs extrahieren
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiles([])}
              >
                Alle entfernen
              </Button>
            </div>
          )}
        </div>
      )}

      {(running || done) && batchFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fortschritt</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchProgress
              files={batchFiles}
              completed={completed}
              total={total}
            />
          </CardContent>
        </Card>
      )}

      {done && results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ergebnisse</CardTitle>
              <p className="text-sm text-muted-foreground">
                {results.length} PDFs erfolgreich extrahiert
              </p>
            </div>
            <Button onClick={handleDownloadAll} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Excel herunterladen
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Datei</TableHead>
                    {displayFields.map((f) => (
                      <TableHead key={f} scope="col">{FIELD_LABELS[f]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-xs max-w-[200px] truncate">
                        {r.filename}
                      </TableCell>
                      {displayFields.map((f) => {
                        const conf = r.confidence?.[f as string] as number | undefined;
                        return (
                          <TableCell key={f} className="text-sm">
                            <div className="flex items-center gap-1.5">
                              {conf !== undefined && (
                                <div
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    conf >= 0.9 ? "bg-emerald-500" : conf >= 0.7 ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  title={`Konfidenz: ${(conf * 100).toFixed(0)}%`}
                                />
                              )}
                              {r.result[f] ?? (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {done && (
        <Button
          variant="outline"
          onClick={() => {
            setFiles([]);
            setResults([]);
            setBatchFiles([]);
            setDone(false);
            setCompleted(0);
          }}
        >
          Neue Batch-Verarbeitung
        </Button>
      )}
    </div>
  );
}
