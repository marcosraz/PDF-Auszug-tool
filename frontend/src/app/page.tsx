"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, FileSearch, Layers, FolderOpen } from "lucide-react";
import { getStats } from "@/lib/api";
import { StatsResponse } from "@/lib/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          PDF Isometric Daten-Extraktion mit KI
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trainingsbeispiele
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">
                {loading ? "..." : stats?.example_count ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Extraktionen (Sitzung)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {loading ? "..." : stats?.total_extractions ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projekte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">
                {loading ? "..." : stats?.available_projects.length ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats?.available_projects && stats.available_projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verfügbare Projekte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.available_projects.map((p) => (
                <Badge key={p} variant="secondary">
                  {p}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/extract">
          <Card className="hover:border-blue-400 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <FileSearch className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold">Einzel-Extraktion</p>
                <p className="text-sm text-muted-foreground">
                  Ein PDF hochladen, prüfen und korrigieren
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/batch">
          <Card className="hover:border-green-400 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                <Layers className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Batch-Verarbeitung</p>
                <p className="text-sm text-muted-foreground">
                  Mehrere PDFs auf einmal verarbeiten
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
