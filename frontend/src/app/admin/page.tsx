"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ComponentPropsWithRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, UserPlus, Trash2, Users, RefreshCw } from "lucide-react";
import { getUsers, createUser, deleteUser } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { UserEntry } from "@/lib/types";

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  // Form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  // Check admin access
  useEffect(() => {
    const user = getCurrentUser();
    if (!user || user.role !== "admin") {
      router.replace("/");
    }
  }, [router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      toast.error("Benutzer konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error("Benutzername und Passwort sind erforderlich");
      return;
    }

    setSubmitting(true);
    try {
      const user = await createUser(newUsername.trim(), newPassword, newRole);
      setUsers((prev) => [...prev, user]);
      toast.success(`Benutzer "${user.username}" erstellt`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Benutzer konnte nicht erstellt werden");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    const currentUser = getCurrentUser();
    if (currentUser?.username === username) {
      toast.error("Du kannst deinen eigenen Account nicht loeschen");
      return;
    }

    setDeletingUser(username);
    try {
      await deleteUser(username);
      setUsers((prev) => prev.filter((u) => u.username !== username));
      toast.success(`Benutzer "${username}" geloescht`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Loeschen fehlgeschlagen");
    } finally {
      setDeletingUser(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Verwaltung
          </h1>
          <p className="text-muted-foreground text-sm">
            Benutzer verwalten und Rollen zuweisen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={(props: ComponentPropsWithRef<"button">) => (
                <Button size="sm" {...props}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Neuer Benutzer
                </Button>
              )}
            />
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Neuen Benutzer anlegen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="username">Benutzername</Label>
                  <Input
                    id="username"
                    placeholder="z.B. max.mustermann"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Passwort eingeben"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="role">Rolle</Label>
                  <select
                    id="role"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="user">Benutzer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button className="w-full" onClick={handleCreateUser} disabled={submitting}>
                  {submitting ? "Wird erstellt..." : "Benutzer anlegen"}
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
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Benutzer gesamt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-600">
              {users.filter((u) => u.role === "admin").length}
            </div>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-600">
              {users.filter((u) => u.role === "user").length}
            </div>
            <p className="text-xs text-muted-foreground">Benutzer</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alle Benutzer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benutzername</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.username}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role === "admin" ? "Admin" : "Benutzer"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {u.username !== getCurrentUser()?.username ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-red-600"
                            onClick={() => handleDeleteUser(u.username)}
                            disabled={deletingUser === u.username}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            {deletingUser === u.username ? "..." : "Loeschen"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Du</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
