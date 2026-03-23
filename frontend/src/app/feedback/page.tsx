"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ComponentPropsWithRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { getFeedback, createFeedback, updateFeedbackStatus, deleteFeedback } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { FeedbackEntry } from "@/lib/types";
import { FIELD_LABELS, EXTRACTION_FIELDS } from "@/lib/types";

const CATEGORIES = [
  { value: "wrong_value", label: "Falscher Wert" },
  { value: "missing_value", label: "Wert fehlt" },
  { value: "wrong_field", label: "Falsches Feld" },
  { value: "format_error", label: "Format-Fehler" },
  { value: "other", label: "Sonstiges" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }> = {
  open: { label: "Offen", variant: "destructive", icon: AlertCircle },
  in_progress: { label: "In Bearbeitung", variant: "default", icon: Clock },
  resolved: { label: "Behoben", variant: "secondary", icon: CheckCircle },
  wont_fix: { label: "Kein Fix", variant: "outline", icon: AlertCircle },
};

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [pdfFilename, setPdfFilename] = useState("");
  const [project, setProject] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [category, setCategory] = useState("wrong_value");
  const [description, setDescription] = useState("");

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFeedback(filter);
      setItems(data);
    } catch {
      toast.error("Feedback konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const resetForm = () => {
    setPdfFilename("");
    setProject("");
    setFieldName("");
    setActualValue("");
    setExpectedValue("");
    setCategory("wrong_value");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!pdfFilename.trim()) {
      toast.error("PDF-Dateiname ist erforderlich");
      return;
    }

    setSubmitting(true);
    try {
      const user = getCurrentUser();
      const entry = await createFeedback({
        pdf_filename: pdfFilename.trim(),
        project: project.trim() || null,
        reported_by: user?.username || "anonymous",
        field_name: fieldName || null,
        expected_value: expectedValue.trim() || null,
        actual_value: actualValue.trim() || null,
        category,
        description: description.trim() || null,
      });
      setItems((prev) => [entry, ...prev]);
      toast.success("Feedback gespeichert");
      resetForm();
      setDialogOpen(false);
    } catch {
      toast.error("Feedback konnte nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const updated = await updateFeedbackStatus(id, newStatus);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      toast.success("Status aktualisiert");
    } catch {
      toast.error("Status-Update fehlgeschlagen");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFeedback(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success("Feedback geloescht");
    } catch {
      toast.error("Loeschen fehlgeschlagen");
    }
  };

  const getCategoryLabel = (cat: string) => {
    return CATEGORIES.find((c) => c.value === cat)?.label || cat;
  };

  const openCount = items.filter((i) => i.status === "open").length;
  const resolvedCount = items.filter((i) => i.status === "resolved").length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="text-muted-foreground text-sm">
            Fehlerhafte Extraktionen melden - wird zur Modell-Verbesserung genutzt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadFeedback} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={(props: ComponentPropsWithRef<"button">) => (
                <Button size="sm" {...props}>
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Feedback
                </Button>
              )}
            />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Feedback eintragen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="pdf_filename">PDF-Dateiname *</Label>
                  <Input
                    id="pdf_filename"
                    placeholder="z.B. 5K-MHW-R-VH001-103.pdf"
                    value={pdfFilename}
                    onChange={(e) => setPdfFilename(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="project">Projekt</Label>
                    <Input
                      id="project"
                      placeholder="z.B. 5K, Kujira, LPP5"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Kategorie</Label>
                    <select
                      id="category"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="field_name">Betroffenes Feld</Label>
                  <select
                    id="field_name"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                  >
                    <option value="">-- Kein bestimmtes Feld --</option>
                    {EXTRACTION_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="actual_value">Extrahierter Wert (falsch)</Label>
                    <Input
                      id="actual_value"
                      placeholder="Was wurde extrahiert?"
                      value={actualValue}
                      onChange={(e) => setActualValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expected_value">Richtiger Wert</Label>
                    <Input
                      id="expected_value"
                      placeholder="Was waere korrekt?"
                      value={expectedValue}
                      onChange={(e) => setExpectedValue(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Beschreibung (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Weitere Details zum Fehler..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Wird gespeichert..." : "Feedback absenden"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">Gesamt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-600">{openCount}</div>
            <p className="text-xs text-muted-foreground">Offen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">{resolvedCount}</div>
            <p className="text-xs text-muted-foreground">Behoben</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <Button
          variant={filter === undefined ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter(undefined)}
        >
          Alle
        </Button>
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {config.label}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-blue-500" />
            Feedback-Eintraege
            {!loading && (
              <Badge variant="secondary" className="ml-2">
                {items.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Kein Feedback vorhanden</p>
              <p className="text-sm mt-1">
                Klicke auf &quot;Neues Feedback&quot; um eine fehlerhafte Extraktion zu melden.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PDF</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead>Feld</TableHead>
                    <TableHead>Extrahiert</TableHead>
                    <TableHead>Korrekt</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Von</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs max-w-[180px] truncate" title={item.pdf_filename}>
                          {item.pdf_filename}
                        </TableCell>
                        <TableCell>
                          {item.project ? (
                            <Badge variant="secondary">{item.project}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.field_name ? (
                            <Badge variant="outline">
                              {FIELD_LABELS[item.field_name as keyof typeof FIELD_LABELS] || item.field_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-red-600 max-w-[120px] truncate" title={item.actual_value || ""}>
                          {item.actual_value || "-"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-green-600 max-w-[120px] truncate" title={item.expected_value || ""}>
                          {item.expected_value || "-"}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{getCategoryLabel(item.category)}</span>
                        </TableCell>
                        <TableCell className="text-sm">{item.reported_by}</TableCell>
                        <TableCell>
                          <select
                            className="text-xs rounded border bg-transparent px-1.5 py-0.5"
                            value={item.status}
                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          >
                            {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                              <option key={key} value={key}>
                                {conf.label}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString("de-DE", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description details for items that have them */}
      {items.some((i) => i.description) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Beschreibungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items
              .filter((i) => i.description)
              .map((item) => (
                <div key={item.id} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs">{item.pdf_filename}</span>
                    <span className="text-xs text-muted-foreground">von {item.reported_by}</span>
                  </div>
                  <p className="text-sm">{item.description}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
