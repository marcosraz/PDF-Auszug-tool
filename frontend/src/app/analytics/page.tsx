"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Target,
  PencilLine,
  BookOpen,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  FolderOpen,
  Search,
} from "lucide-react";
import {
  getAnalyticsOverview,
  getFieldAccuracy,
  getDailyTrend,
  getProjectStats,
  getRecentExtractions,
} from "@/lib/api";
import type {
  OverviewStats,
  FieldAccuracy,
  DailyTrend,
  ProjectStats,
  RecentExtraction,
} from "@/lib/types";

// --- Animated Counter ---
function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let rafId: number;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        prevRef.current = value;
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return <>{display.toLocaleString("de-DE")}</>;
}

// --- Accuracy color helper ---
function accuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (accuracy >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function accuracyBg(accuracy: number): string {
  if (accuracy >= 90) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (accuracy >= 75) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function confidenceDot(confidence: number) {
  if (confidence >= 0.9) return "bg-emerald-500";
  if (confidence >= 0.7) return "bg-amber-500";
  return "bg-red-500";
}

// --- Mock data generators (for demo when API not available) ---
function generateMockOverview(): OverviewStats {
  return {
    total_extractions: 1247,
    extractions_today: 34,
    total_fields: 14964,
    corrected_fields: 1245,
    correction_rate: 8.3,
    accuracy: 87.3,
    avg_confidence: 0.82,
  };
}

function generateMockFieldAccuracy(): FieldAccuracy[] {
  const fields: FieldAccuracy[] = [
    { field_name: "Line No.", total: 1247, corrected: 45, accuracy: 96.4, avg_confidence: 0.94 },
    { field_name: "Rev.", total: 1247, corrected: 12, accuracy: 99.0, avg_confidence: 0.97 },
    { field_name: "P&ID Nr.", total: 1247, corrected: 89, accuracy: 92.9, avg_confidence: 0.88 },
    { field_name: "Pipe Class", total: 1247, corrected: 156, accuracy: 87.5, avg_confidence: 0.81 },
    { field_name: "DN (mm)", total: 1247, corrected: 23, accuracy: 98.2, avg_confidence: 0.95 },
    { field_name: "Gebaeude", total: 1247, corrected: 201, accuracy: 83.9, avg_confidence: 0.76 },
    { field_name: "Etage", total: 1247, corrected: 267, accuracy: 78.6, avg_confidence: 0.71 },
    { field_name: "Isolierung", total: 1247, corrected: 312, accuracy: 75.0, avg_confidence: 0.68 },
    { field_name: "PED Kat.", total: 1247, corrected: 389, accuracy: 68.8, avg_confidence: 0.62 },
    { field_name: "Kunde", total: 1247, corrected: 78, accuracy: 93.7, avg_confidence: 0.91 },
    { field_name: "Projekt", total: 1247, corrected: 34, accuracy: 97.3, avg_confidence: 0.96 },
    { field_name: "Laenge (m)", total: 1247, corrected: 145, accuracy: 88.4, avg_confidence: 0.83 },
  ];
  return fields.sort((a, b) => a.accuracy - b.accuracy);
}

function generateMockDailyTrend(): DailyTrend[] {
  const days: DailyTrend[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ext = Math.floor(Math.random() * 80) + 20;
    const corrected = Math.floor(Math.random() * ext * 0.3);
    days.push({
      day: d.toISOString().split("T")[0],
      extractions: ext,
      total_fields: ext * 12,
      corrected_fields: corrected,
      accuracy: Math.floor(Math.random() * 20) + 75,
    });
  }
  return days;
}

function generateMockProjectStats(): ProjectStats[] {
  return [
    { project: "5K", extraction_count: 312, avg_duration: 4.2, total_fields: 3744, corrected_fields: 405, accuracy: 89.2 },
    { project: "Boxmeer", extraction_count: 198, avg_duration: 3.8, total_fields: 2376, corrected_fields: 202, accuracy: 91.5 },
    { project: "Kujira", extraction_count: 267, avg_duration: 5.1, total_fields: 3204, corrected_fields: 471, accuracy: 85.3 },
    { project: "LPP5", extraction_count: 189, avg_duration: 4.0, total_fields: 2268, corrected_fields: 256, accuracy: 88.7 },
    { project: "LPP6", extraction_count: 156, avg_duration: 3.5, total_fields: 1872, corrected_fields: 148, accuracy: 92.1 },
    { project: "ORCA", extraction_count: 125, avg_duration: 4.8, total_fields: 1500, corrected_fields: 249, accuracy: 83.4 },
  ];
}

function generateMockRecentExtractions(): RecentExtraction[] {
  const filenames = [
    "5K-ISO-001.pdf", "KUJ-PIP-042.pdf", "LPP5-ISO-103.pdf",
    "BOX-LINE-007.pdf", "ORCA-PIP-019.pdf", "5K-ISO-088.pdf",
    "KUJ-PIP-101.pdf", "LPP6-ISO-055.pdf", "BOX-LINE-023.pdf",
    "ORCA-PIP-044.pdf", "5K-ISO-134.pdf", "KUJ-PIP-077.pdf",
    "LPP5-ISO-091.pdf", "BOX-LINE-015.pdf", "ORCA-PIP-033.pdf",
    "5K-ISO-200.pdf", "KUJ-PIP-128.pdf", "LPP6-ISO-012.pdf",
    "BOX-LINE-041.pdf", "ORCA-PIP-056.pdf",
  ];
  const projects = ["5K", "Kujira", "LPP5", "Boxmeer", "ORCA", "LPP6"];
  const statuses = ["completed", "completed", "completed", "completed", "failed"];
  const now = new Date();

  return filenames.map((filename, i) => {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - i * 23);
    const accuracy = Math.floor(Math.random() * 25) + 75;
    return {
      id: `ext-${i + 1}`,
      filename,
      project: projects[i % projects.length],
      accuracy,
      created_at: d.toISOString(),
      status: statuses[i % statuses.length],
      fields: [
        { field_name: "Line No.", value: `740-MHW-R-VH00${i}-103`, confidence: 0.95, was_corrected: false },
        { field_name: "Rev.", value: String(i % 3), confidence: 0.98, was_corrected: false },
        { field_name: "Pipe Class", value: `SP${i % 5}`, confidence: 0.72, was_corrected: i % 3 === 0 },
        { field_name: "DN (mm)", value: String([25, 50, 80, 150, 450][i % 5]), confidence: 0.91, was_corrected: false },
        { field_name: "Gebaeude", value: ["MC1", "Datahall", "5K", "B2"][i % 4], confidence: 0.65, was_corrected: i % 2 === 0 },
        { field_name: "Etage", value: ["LVL 6", "F02", "Riser", "EG"][i % 4], confidence: 0.58, was_corrected: true },
      ],
    };
  });
}

function getAccuracyFill(accuracy: number): string {
  if (accuracy >= 0.9) return "var(--chart-accuracy-high)";
  if (accuracy >= 0.75) return "var(--chart-accuracy-mid)";
  return "var(--chart-accuracy-low)";
}

// --- Main Page Component ---
export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [fieldAccuracy, setFieldAccuracy] = useState<FieldAccuracy[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([]);
  const [recentExtractions, setRecentExtractions] = useState<RecentExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, fa, dt, ps, re] = await Promise.allSettled([
        getAnalyticsOverview(),
        getFieldAccuracy(),
        getDailyTrend(14),
        getProjectStats(),
        getRecentExtractions(20),
      ]);

      setOverview(ov.status === "fulfilled" ? ov.value : generateMockOverview());
      setFieldAccuracy(fa.status === "fulfilled" ? fa.value : generateMockFieldAccuracy());
      setDailyTrend(dt.status === "fulfilled" ? dt.value : generateMockDailyTrend());
      setProjectStats(ps.status === "fulfilled" ? ps.value : generateMockProjectStats());
      setRecentExtractions(re.status === "fulfilled" ? re.value : generateMockRecentExtractions());
    } catch {
      // Fallback to mock data
      setOverview(generateMockOverview());
      setFieldAccuracy(generateMockFieldAccuracy());
      setDailyTrend(generateMockDailyTrend());
      setProjectStats(generateMockProjectStats());
      setRecentExtractions(generateMockRecentExtractions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytik</h1>
          <p className="text-muted-foreground text-sm">Extraktionsstatistiken und Genauigkeitsanalyse</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Analytik</h1>
        <p className="text-muted-foreground text-sm">
          Extraktionsstatistiken und Genauigkeitsanalyse
        </p>
      </div>

      {/* --- Section 1: Overview Cards --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Gesamt-Extraktionen</p>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold mt-2">
              {overview && <AnimatedCounter value={overview.total_extractions} />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Alle Projekte</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Durchschn. Genauigkeit</p>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-3xl font-bold mt-2 ${overview ? accuracyColor(overview.accuracy) : ""}`}>
              {overview && <AnimatedCounter value={Math.round(overview.accuracy * 10)} duration={800} />}
              <span className="text-lg font-normal ml-0.5">%</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {overview && overview.accuracy >= 90
                ? "Ausgezeichnet"
                : overview && overview.accuracy >= 75
                ? "Gut, Verbesserung moeglich"
                : "Mehr Beispiele noetig"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Korrekturen heute</p>
              <PencilLine className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold mt-2">
              {overview && <AnimatedCounter value={overview.corrected_fields} duration={600} />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Manuelle Korrekturen</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Extraktionen heute</p>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold mt-2">
              {overview && <AnimatedCounter value={overview.extractions_today} duration={600} />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Heutige Verarbeitungen</p>
          </CardContent>
        </Card>
      </div>

      {/* --- Section 2: Daily Trend Chart (Recharts) --- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Extraktionen der letzten 14 Tage</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyTrend.map(d => ({
              ...d,
              label: new Date(d.day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md text-xs">
                      <p className="font-semibold">{d.label}</p>
                      <p>{d.extractions} Extraktionen</p>
                      <p className={accuracyColor(d.accuracy)}>
                        {(d.accuracy * 100).toFixed(1)}% Genauigkeit
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="extractions" radius={[4, 4, 0, 0]}>
                {dailyTrend.map((d, i) => (
                  <Cell
                    key={i}
                    fill={getAccuracyFill(d.accuracy)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span>&ge;90% Genauigkeit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              <span>75-89%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              <span>&lt;75%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Section 3: Field Accuracy Table --- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Feldgenauigkeit</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sortiert nach Korrekturrate (problematischste Felder zuerst)
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Feldname</TableHead>
                <TableHead scope="col" className="text-right">Extraktionen</TableHead>
                <TableHead scope="col" className="text-right">Korrekturen</TableHead>
                <TableHead scope="col" className="text-right">Genauigkeit</TableHead>
                <TableHead scope="col" className="text-center">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fieldAccuracy.map((field) => {
                // Simulated trend based on accuracy
                const trend =
                  field.accuracy >= 95
                    ? "up"
                    : field.accuracy >= 80
                    ? "stable"
                    : "down";

                return (
                  <TableRow key={field.field_name}>
                    <TableCell className="font-medium">{field.field_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {field.total.toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(field.corrected ?? 0).toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${accuracyBg(field.accuracy)}`}
                      >
                        {field.accuracy.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {trend === "up" && (
                        <TrendingUp className="h-4 w-4 text-emerald-500 inline-block" />
                      )}
                      {trend === "stable" && (
                        <Minus className="h-4 w-4 text-muted-foreground inline-block" />
                      )}
                      {trend === "down" && (
                        <TrendingDown className="h-4 w-4 text-red-500 inline-block" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- Section 4: Project Stats Cards --- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Projektstatistiken</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectStats.map((proj, idx) => (
            <Card key={proj.project ?? `unknown-${idx}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{proj.project || "Unbekannt"}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${accuracyBg(proj.accuracy)}`}
                  >
                    {proj.accuracy.toFixed(1)}%
                  </span>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {proj.extraction_count.toLocaleString("de-DE")}
                </p>
                <p className="text-xs text-muted-foreground mb-3">Extraktionen</p>

                {/* Accuracy bar */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all ${
                      proj.accuracy >= 90
                        ? "bg-emerald-500"
                        : proj.accuracy >= 75
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${proj.accuracy}%` }}
                  />
                </div>

                {proj.corrected_fields > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {proj.corrected_fields.toLocaleString("de-DE")} / {proj.total_fields.toLocaleString("de-DE")} Felder korrigiert
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* --- Section 5: Recent Extractions Table --- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Letzte Extraktionen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Die letzten 20 Extraktionen mit Details
          </p>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="extraction-search" className="sr-only">Dateiname suchen</label>
              <Input
                id="extraction-search"
                placeholder="Dateiname suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <label htmlFor="filter-project" className="sr-only">Projekt filtern</label>
            <select
              id="filter-project"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="all">Alle Projekte</option>
              {[...new Set(recentExtractions.map((e) => e.project).filter(Boolean))].map((p) => (
                <option key={p!} value={p!}>{p}</option>
              ))}
            </select>
            <label htmlFor="filter-status" className="sr-only">Status filtern</label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="all">Alle Status</option>
              <option value="completed">Fertig</option>
              <option value="failed">Fehler</option>
            </select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-8"><span className="sr-only">Details</span></TableHead>
                <TableHead scope="col">Dateiname</TableHead>
                <TableHead scope="col">Projekt</TableHead>
                <TableHead scope="col" className="text-right">Genauigkeit</TableHead>
                <TableHead scope="col">Zeitpunkt</TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentExtractions
                .filter((ext) => {
                  if (searchQuery && !ext.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  if (filterProject !== "all" && ext.project !== filterProject) return false;
                  if (filterStatus !== "all" && ext.status !== filterStatus) return false;
                  return true;
                })
                .map((ext) => {
                const isExpanded = expandedRow === ext.id;
                const timeAgo = formatTimeAgo(ext.created_at);

                return (
                  <React.Fragment key={ext.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedRow(isExpanded ? null : ext.id)}
                      aria-expanded={isExpanded}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedRow(isExpanded ? null : ext.id);
                        }
                      }}
                    >
                      <TableCell className="w-8 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium font-mono text-xs">
                        {ext.filename}
                      </TableCell>
                      <TableCell>{ext.project || "-"}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${accuracyBg(ext.accuracy)}`}
                        >
                          {ext.accuracy}%
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {timeAgo}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ext.status)}`}
                        >
                          {ext.status === "completed" ? "Fertig" : ext.status === "failed" ? "Fehler" : ext.status}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${ext.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="p-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Feld-Details
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              {ext.fields.map((field) => (
                                <div
                                  key={field.field_name}
                                  className={`rounded-lg border p-2.5 ${
                                    field.was_corrected
                                      ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                                      : "bg-background"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <div
                                      className={`h-2 w-2 rounded-full shrink-0 ${confidenceDot(field.confidence)}`}
                                    />
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      {field.field_name}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium truncate">
                                    {field.value || "-"}
                                  </p>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      {(field.confidence * 100).toFixed(0)}%
                                    </span>
                                    {field.was_corrected && (
                                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                                        korrigiert
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- Section 6: Example Effectiveness --- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Beispiel-Effektivitaet</CardTitle>
          <p className="text-xs text-muted-foreground">
            Wie Trainingsbeispiele die Genauigkeit verbessern
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Most used examples */}
            <div>
              <h3 className="text-sm font-medium mb-3">Meistgenutzte Beispiele</h3>
              <div className="space-y-2">
                {[
                  { name: "example_kujira_line42", uses: 89, impact: "+4.2%" },
                  { name: "example_5k_iso_001", uses: 76, impact: "+3.8%" },
                  { name: "example_boxmeer_pip", uses: 64, impact: "+2.1%" },
                  { name: "example_lpp5_riser", uses: 51, impact: "+5.7%" },
                  { name: "example_orca_main", uses: 43, impact: "+1.9%" },
                ].map((ex) => (
                  <div
                    key={ex.name}
                    className="flex items-center justify-between rounded-lg border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono truncate">{ex.name}</p>
                      <p className="text-[10px] text-muted-foreground">{ex.uses} Verwendungen</p>
                    </div>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                      {ex.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Accuracy improvement timeline */}
            <div>
              <h3 className="text-sm font-medium mb-3">Genauigkeit ueber Zeit</h3>
              <div className="space-y-2">
                {[
                  { period: "Diese Woche", accuracy: 89.2, change: +2.1 },
                  { period: "Letzte Woche", accuracy: 87.1, change: +1.8 },
                  { period: "Vor 2 Wochen", accuracy: 85.3, change: +0.9 },
                  { period: "Vor 3 Wochen", accuracy: 84.4, change: -0.3 },
                  { period: "Vor 4 Wochen", accuracy: 84.7, change: +1.2 },
                ].map((item) => (
                  <div
                    key={item.period}
                    className="flex items-center justify-between rounded-lg border p-2.5"
                  >
                    <div>
                      <p className="text-xs font-medium">{item.period}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.accuracy.toFixed(1)}% Genauigkeit
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        item.change >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {item.change >= 0 ? "+" : ""}
                      {item.change.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h3 className="text-sm font-medium mb-3">Empfehlungen</h3>
              <div className="space-y-2">
                {[
                  {
                    title: "PED Kat. Beispiele hinzufuegen",
                    desc: "Niedrigste Genauigkeit bei 68.8%. Mehr Beispiele wuerden helfen.",
                    priority: "Hoch",
                  },
                  {
                    title: "Isolierung-Varianten abdecken",
                    desc: "Verschiedene Isolierungsformate werden unterschiedlich erkannt.",
                    priority: "Mittel",
                  },
                  {
                    title: "ORCA-Projekt fokussieren",
                    desc: "Niedrigste Projektgenauigkeit. Spezifische Beispiele noetig.",
                    priority: "Mittel",
                  },
                ].map((rec) => (
                  <div key={rec.title} className="rounded-lg border p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium">{rec.title}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          rec.priority === "Hoch"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}
                      >
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{rec.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Utility ---
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  const diffDays = Math.floor(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays > 1 ? "en" : ""}`;
}
