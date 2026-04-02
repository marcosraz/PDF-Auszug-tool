"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, GraduationCap, FolderInput } from "lucide-react";
import {
  getExamples,
  deleteExample,
  getProjects,
  assignExampleProject,
} from "@/lib/api";
import {
  ExampleInfo,
  FIELD_LABELS,
  EXTRACTION_FIELDS,
  ProjectEntry,
} from "@/lib/types";

export default function ExamplesPage() {
  const [examples, setExamples] = useState<ExampleInfo[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [previewExample, setPreviewExample] = useState<ExampleInfo | null>(
    null
  );
  const [filterProject, setFilterProject] = useState<string>("__all__");

  // Assign project dialog
  const [assignTarget, setAssignTarget] = useState<ExampleInfo | null>(null);
  const [assignProjectName, setAssignProjectName] = useState<string>(
    "__none__"
  );

  const loadData = () => {
    setLoading(true);
    Promise.all([getExamples(), getProjects()])
      .then(([exs, projs]) => {
        setExamples(exs);
        setProjects(projs);
      })
      .catch(() => toast.error("Daten konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExample(deleteTarget);
      toast.success(`"${deleteTarget}" gelöscht`);
      setDeleteTarget(null);
      loadData();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  const handleAssignProject = async () => {
    if (!assignTarget) return;
    const projectName =
      assignProjectName === "__none__" ? null : assignProjectName;
    try {
      await assignExampleProject(assignTarget.name, projectName);
      toast.success(
        projectName
          ? `"${assignTarget.name}" → ${projectName}`
          : `Projektzuordnung entfernt`
      );
      setAssignTarget(null);
      loadData();
    } catch {
      toast.error("Zuordnung fehlgeschlagen");
    }
  };

  const filteredExamples =
    filterProject === "__all__"
      ? examples
      : filterProject === "__none__"
        ? examples.filter((ex) => !ex.project_name)
        : examples.filter((ex) => ex.project_name === filterProject);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trainingsbeispiele</h1>
        <p className="text-muted-foreground text-sm">
          Few-Shot-Beispiele die bei jeder Extraktion mitgesendet werden. Mehr
          Beispiele = bessere Erkennung.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-blue-500" />
          <span className="font-medium">{examples.length} Beispiele</span>
          <Badge variant="secondary" className="text-xs">
            {examples.length < 5
              ? "Mehr Beispiele empfohlen"
              : examples.length < 15
                ? "Gute Anzahl"
                : "Viele Beispiele"}
          </Badge>
        </div>

        {/* Project filter */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Projekt:</span>

          <select
            className="h-8 w-44 text-sm rounded-md border border-input bg-transparent px-2"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="__all__">Alle</option>
            <option value="__none__">Ohne Projekt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-3">
                <div className="h-32 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredExamples.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-10 text-center">
            <GraduationCap className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="font-medium">Keine Beispiele vorhanden</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filterProject !== "__all__"
                ? "Keine Beispiele für dieses Projekt. Filter zurücksetzen oder Beispiele zuweisen."
                : "Extrahiere ein PDF und speichere die Korrektur als Trainingsbeispiel."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExamples.map((ex) => (
            <Card
              key={ex.name}
              className="hover:border-blue-300 transition-colors cursor-pointer"
              onClick={() => setPreviewExample(ex)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="h-32 bg-muted rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={ex.image_url}
                    alt={ex.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <p className="font-medium text-sm truncate">{ex.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ex.data.line_no || "Keine Line No."}
                    {ex.data.project ? ` | ${ex.data.project}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ex.project_name ? (
                    <Badge variant="default" className="text-xs">
                      {ex.project_name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Kein Projekt
                    </Badge>
                  )}
                  {ex.data.dn && (
                    <Badge variant="outline" className="text-xs">
                      DN{ex.data.dn}
                    </Badge>
                  )}
                  {ex.data.pipe_class && (
                    <Badge variant="outline" className="text-xs">
                      {ex.data.pipe_class}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignTarget(ex);
                      setAssignProjectName(ex.project_name || "__none__");
                    }}
                  >
                    <FolderInput className="h-3.5 w-3.5 mr-1" />
                    Projekt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(ex.name);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Löschen
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Beispiel löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Das Beispiel &quot;{deleteTarget}&quot; wird dauerhaft gelöscht und
            steht nicht mehr für zukünftige Extraktionen zur Verfügung.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign project dialog */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={() => setAssignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projekt zuweisen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Beispiel &quot;{assignTarget?.name}&quot; einem Projekt zuweisen:
            </p>

            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={assignProjectName}
              onChange={(e) => setAssignProjectName(e.target.value)}
            >
              <option value="__none__">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleAssignProject}>Zuweisen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog
        open={!!previewExample}
        onOpenChange={() => setPreviewExample(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewExample?.name}
              {previewExample?.project_name && (
                <Badge variant="secondary">{previewExample.project_name}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewExample && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded overflow-hidden">
                <img
                  src={previewExample.image_url}
                  alt={previewExample.name}
                  className="w-full object-contain"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium mb-3">Gespeicherte Daten:</p>
                {EXTRACTION_FIELDS.map((field) => {
                  const val = previewExample.data[field];
                  if (typeof val === "object" && val !== null) return null;
                  return (
                    <div key={field} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {FIELD_LABELS[field]}
                      </span>
                      <span className="font-medium">
                        {val ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {/* Show custom fields if any */}
                {previewExample.data.custom_fields &&
                  Object.entries(previewExample.data.custom_fields).map(
                    ([key, val]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="font-medium">
                          {val ?? (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </span>
                      </div>
                    )
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
