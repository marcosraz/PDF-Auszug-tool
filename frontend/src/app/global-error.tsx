"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background text-foreground">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Kritischer Fehler</h2>
        <p className="text-gray-500 text-sm max-w-md text-center">
          {error.message || "Die Anwendung ist auf einen schwerwiegenden Fehler gestossen."}
        </p>
        <Button onClick={reset} variant="outline">
          Seite neu laden
        </Button>
      </body>
    </html>
  );
}
