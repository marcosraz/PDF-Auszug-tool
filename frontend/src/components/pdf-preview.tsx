"use client";

import { useState, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  file: File;
  onRemove?: () => void;
}

export function PdfPreview({ file, onRemove }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileUrl = useMemo(() => URL.createObjectURL(file), [file]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError() {
    setLoading(false);
    setError("PDF konnte nicht geladen werden.");
  }

  const canGoPrev = pageNumber > 1;
  const canGoNext = numPages !== null && pageNumber < numPages;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium truncate max-w-[200px]" title={file.name}>
          {file.name}
        </span>
        <div className="flex items-center gap-1">
          {numPages !== null && numPages > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={!canGoPrev}
                aria-label="Vorherige Seite"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center">
                {pageNumber} / {numPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                disabled={!canGoNext}
                aria-label="Naechste Seite"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-1"
              onClick={onRemove}
              aria-label={`${file.name} entfernen`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* PDF content */}
      <div className="flex items-center justify-center p-4 bg-muted/10 min-h-[200px]">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            {loading && (
              <div className="absolute flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Vorschau wird geladen...
              </div>
            )}
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page
                pageNumber={pageNumber}
                width={320}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading={null}
              />
            </Document>
          </>
        )}
      </div>
    </div>
  );
}
