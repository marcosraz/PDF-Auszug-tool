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
import { Trash2, GraduationCap } from "lucide-react";
import { getExamples, deleteExample } from "@/lib/api";
import { ExampleInfo, FIELD_LABELS, EXTRACTION_FIELDS } from "@/lib/types";

export default function ExamplesPage() {
  const [examples, setExamples] = useState<ExampleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [previewExample, setPreviewExample] = useState<ExampleInfo | null>(null);

  const loadExamples = () => {
    setLoading(true);
    getExamples()
      .then(setExamples)
      .catch(() => toast.error("Beispiele konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExamples();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExample(deleteTarget);
      toast.success(`"${deleteTarget}" gelöscht`);
      setDeleteTarget(null);
      loadExamples();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trainingsbeispiele</h1>
        <p className="text-muted-foreground text-sm">
          Few-Shot-Beispiele die bei jeder Extraktion mitgesendet werden.
          Mehr Beispiele = bessere Erkennung.
        </p>
      </div>

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
      ) : examples.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-10 text-center">
            <GraduationCap className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="font-medium">Keine Beispiele vorhanden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Extrahiere ein PDF und speichere die Korrektur als Trainingsbeispiel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {examples.map((ex) => (
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
                  {ex.data.dn && (
                    <Badge variant="outline" className="text-xs">DN{ex.data.dn}</Badge>
                  )}
                  {ex.data.pipe_class && (
                    <Badge variant="outline" className="text-xs">{ex.data.pipe_class}</Badge>
                  )}
                  {ex.data.customer && (
                    <Badge variant="outline" className="text-xs">{ex.data.customer}</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(ex.name);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Löschen
                </Button>
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

      {/* Preview dialog */}
      <Dialog open={!!previewExample} onOpenChange={() => setPreviewExample(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewExample?.name}</DialogTitle>
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
                {EXTRACTION_FIELDS.map((field) => (
                  <div key={field} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{FIELD_LABELS[field]}</span>
                    <span className="font-medium">
                      {previewExample.data[field] ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
