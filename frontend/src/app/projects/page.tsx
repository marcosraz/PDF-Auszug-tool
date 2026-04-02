"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  FolderPlus,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Columns3,
} from "lucide-react";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  addProjectCustomField,
  deleteProjectCustomField,
} from "@/lib/api";
import type { ProjectEntry, CustomFieldInfo } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // New project dialog
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newCreateFolder, setNewCreateFolder] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit state (inline)
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrderNumber, setEditOrderNumber] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Custom fields
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      toast.error("Projekte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Projektname darf nicht leer sein");
      return;
    }
    setCreating(true);
    try {
      await createProject(name, newOrderNumber.trim() || null, newCreateFolder);
      toast.success(`Projekt "${name}" erstellt`);
      setShowNew(false);
      setNewName("");
      setNewOrderNumber("");
      setNewCreateFolder(true);
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (p: ProjectEntry) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditOrderNumber(p.order_number || "");
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const handleSave = async () => {
    if (editId === null) return;
    setSaving(true);
    try {
      await updateProject(editId, {
        name: editName.trim(),
        order_number: editOrderNumber.trim() || null,
      });
      toast.success("Projekt aktualisiert");
      setEditId(null);
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await deleteProject(deleteId);
      toast.success("Projekt gelöscht");
      setDeleteId(null);
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddField = async (projectId: number) => {
    const key = newFieldKey.trim().toLowerCase().replace(/\s+/g, "_");
    const label = newFieldLabel.trim();
    if (!key || !label) {
      toast.error("Schlüssel und Label sind Pflichtfelder");
      return;
    }
    setAddingField(true);
    try {
      await addProjectCustomField(projectId, {
        field_key: key,
        field_label: label,
        field_type: newFieldType,
      });
      toast.success(`Spalte "${label}" hinzugefügt`);
      setNewFieldKey("");
      setNewFieldLabel("");
      setNewFieldType("text");
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Hinzufügen");
    } finally {
      setAddingField(false);
    }
  };

  const handleDeleteField = async (projectId: number, field: CustomFieldInfo) => {
    try {
      await deleteProjectCustomField(projectId, field.id);
      toast.success(`Spalte "${field.field_label}" gelöscht`);
      await loadProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Löschen");
    }
  };

  const projectToDelete = projects.find((p) => p.id === deleteId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projektverwaltung</h1>
          <p className="text-muted-foreground">
            Projekte anlegen, bearbeiten und Bestellnummern pflegen
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Projekt
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Projekte ({projects.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Laden...</p>
          ) : projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Keine Projekte vorhanden. Erstelle ein neues Projekt.
            </p>
          ) : (
            <div className="space-y-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Projektname</TableHead>
                    <TableHead>Bestellnummer</TableHead>
                    <TableHead>Anzeigename</TableHead>
                    <TableHead>Ordner</TableHead>
                    <TableHead>Spalten</TableHead>
                    <TableHead className="w-[120px]">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <>
                      <TableRow key={p.id}>
                        <TableCell className="p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setExpandedProject(
                                expandedProject === p.id ? null : p.id
                              )
                            }
                          >
                            {expandedProject === p.id ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TableCell>
                        {editId === p.id ? (
                          <>
                            <TableCell>
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editOrderNumber}
                                onChange={(e) =>
                                  setEditOrderNumber(e.target.value)
                                }
                                placeholder="z.B. S254032"
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {editOrderNumber.trim()
                                ? `${editOrderNumber.trim()} ${editName.trim()}`
                                : editName.trim()}
                            </TableCell>
                            <TableCell>
                              {p.has_folder ? (
                                <Badge variant="secondary" className="gap-1">
                                  <FolderOpen className="h-3 w-3" />
                                  Ja
                                </Badge>
                              ) : (
                                <Badge variant="outline">Nein</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {p.custom_fields?.length || 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={handleSave}
                                  disabled={saving}
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={cancelEdit}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>
                              {p.order_number ? (
                                <Badge variant="secondary">{p.order_number}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">
                                  --
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{p.display_name}</TableCell>
                            <TableCell>
                              {p.has_folder ? (
                                <Badge variant="secondary" className="gap-1">
                                  <FolderOpen className="h-3 w-3" />
                                  Ja
                                </Badge>
                              ) : (
                                <Badge variant="outline">Nein</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {p.custom_fields?.length || 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => startEdit(p)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>

                      {/* Custom Fields Section (expanded) */}
                      {expandedProject === p.id && (
                        <TableRow key={`${p.id}-fields`}>
                          <TableCell colSpan={7} className="bg-muted/30 px-6 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Columns3 className="h-4 w-4" />
                                Zusätzliche Spalten für {p.name}
                              </div>

                              {/* Existing custom fields */}
                              {p.custom_fields && p.custom_fields.length > 0 ? (
                                <div className="space-y-1">
                                  {p.custom_fields.map((cf) => (
                                    <div
                                      key={cf.id}
                                      className="flex items-center justify-between bg-background rounded px-3 py-1.5 text-sm"
                                    >
                                      <div className="flex items-center gap-3">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                          {cf.field_key}
                                        </code>
                                        <span>{cf.field_label}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {cf.field_type}
                                        </Badge>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                        onClick={() => handleDeleteField(p.id, cf)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Keine zusätzlichen Spalten definiert.
                                </p>
                              )}

                              {/* Add new field */}
                              <div className="flex items-end gap-2 pt-2 border-t">
                                <div className="space-y-1">
                                  <Label className="text-xs">Schlüssel</Label>
                                  <Input
                                    placeholder="z.B. design_area"
                                    value={newFieldKey}
                                    onChange={(e) => setNewFieldKey(e.target.value)}
                                    className="h-8 w-36 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Label</Label>
                                  <Input
                                    placeholder="z.B. Design Area"
                                    value={newFieldLabel}
                                    onChange={(e) => setNewFieldLabel(e.target.value)}
                                    className="h-8 w-40 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Typ</Label>

                                  <select
                                    className="h-8 w-24 text-sm rounded-md border border-input bg-transparent px-2"
                                    value={newFieldType}
                                    onChange={(e) => setNewFieldType(e.target.value)}
                                  >
                                    <option value="text">Text</option>
                                    <option value="number">Zahl</option>
                                    <option value="float">Dezimal</option>
                                  </select>
                                </div>
                                <Button
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleAddField(p.id)}
                                  disabled={addingField}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Hinzufügen
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Project Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="project-name">Projektname *</Label>
              <Input
                id="project-name"
                placeholder="z.B. BI-CIP"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-number">Bestellnummer</Label>
              <Input
                id="order-number"
                placeholder="z.B. S254058"
                value={newOrderNumber}
                onChange={(e) => setNewOrderNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-xs text-muted-foreground">
                Kann auch nachträglich hinzugefügt werden
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-folder"
                checked={newCreateFolder}
                onCheckedChange={(v) => setNewCreateFolder(v === true)}
              />
              <Label htmlFor="create-folder" className="text-sm font-normal">
                <span className="flex items-center gap-1.5">
                  <FolderPlus className="h-3.5 w-3.5" />
                  Projektordner auf dem Server erstellen
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Erstelle..." : "Projekt erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projekt löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Möchtest du das Projekt{" "}
            <strong>{projectToDelete?.display_name}</strong> wirklich löschen?
            Der Ordner auf dem Server wird dabei nicht gelöscht.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Lösche..." : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
