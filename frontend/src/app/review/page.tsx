"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { getReviewQueue, approveExtraction } from "@/lib/api";
import type { RecentExtraction } from "@/lib/types";

export default function ReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecentExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReviewQueue();
      setItems(data);
    } catch {
      toast.error("Review-Queue konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await approveExtraction(id);
      toast.success("Extraktion genehmigt");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      toast.error("Genehmigung fehlgeschlagen");
    } finally {
      setApprovingId(null);
    }
  };

  const handleCorrect = (id: string) => {
    // Navigate to extract page with the extraction ID for correction
    router.push(`/extract?review=${id}`);
  };

  const getLowConfidenceFields = (item: RecentExtraction) => {
    return item.fields.filter(
      (f) => f.confidence !== null && f.confidence < 0.7
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review-Queue</h1>
          <p className="text-muted-foreground text-sm">
            Extraktionen mit niedriger Konfidenz pruefen und korrigieren
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadQueue} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Ausstehende Reviews
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
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">Keine ausstehenden Reviews</p>
              <p className="text-sm mt-1">Alle Extraktionen haben eine ausreichende Konfidenz.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dateiname</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead>Unsichere Felder</TableHead>
                    <TableHead>Genauigkeit</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const lowConf = getLowConfidenceFields(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm max-w-[200px] truncate">
                          {item.filename}
                        </TableCell>
                        <TableCell>
                          {item.project ? (
                            <Badge variant="secondary">{item.project}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {lowConf.length > 0 ? (
                              lowConf.map((f) => (
                                <Badge
                                  key={f.field_name}
                                  variant="outline"
                                  className="text-amber-600 border-amber-300 text-xs"
                                >
                                  {f.field_name}
                                  {f.confidence !== null && (
                                    <span className="ml-1 opacity-60">
                                      {Math.round(f.confidence * 100)}%
                                    </span>
                                  )}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                Status: pending_review
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-medium ${
                              item.accuracy >= 0.8
                                ? "text-green-600"
                                : item.accuracy >= 0.5
                                ? "text-amber-600"
                                : "text-red-600"
                            }`}
                          >
                            {Math.round(item.accuracy * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCorrect(item.id)}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Korrigieren
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(item.id)}
                              disabled={approvingId === item.id}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              {approvingId === item.id ? "..." : "Genehmigen"}
                            </Button>
                          </div>
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
    </div>
  );
}
