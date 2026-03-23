"use client";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, FileText } from "lucide-react";
import { ExtractionResponse } from "@/lib/types";

interface BatchFile {
  name: string;
  status: "pending" | "processing" | "done" | "error";
  result?: ExtractionResponse;
  error?: string;
}

interface BatchProgressProps {
  files: BatchFile[];
  completed: number;
  total: number;
}

export function BatchProgress({ files, completed, total }: BatchProgressProps) {
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm" aria-live="polite">
          <span className="font-medium">
            {completed} / {total} verarbeitet
          </span>
          <span className="text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        <Progress value={pct} className="h-2" aria-label={`Fortschritt: ${Math.round(pct)}%`} />
      </div>

      <div className="space-y-1 max-h-[400px] overflow-auto">
        {files.map((f, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-sm p-2 rounded-lg transition-colors
              ${f.status === "processing" ? "bg-blue-50 dark:bg-blue-950/20" : ""}
              ${f.status === "done" ? "bg-green-50 dark:bg-green-950/20" : ""}
              ${f.status === "error" ? "bg-red-50 dark:bg-red-950/20" : ""}
            `}
          >
            {f.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground" />}
            {f.status === "processing" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
            {f.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {f.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}

            <span className="truncate flex-1">{f.name}</span>

            {f.status === "done" && f.result && (
              <Badge variant="secondary" className="text-xs">
                {f.result.result.line_no || "OK"}
              </Badge>
            )}
            {f.status === "error" && (
              <span className="text-xs text-red-500 truncate max-w-[200px]">
                {f.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { BatchFile };
