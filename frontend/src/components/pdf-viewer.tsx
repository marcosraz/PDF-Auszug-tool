"use client";

import { useState, useCallback, useRef } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerProps {
  imageUrl: string;
  filename: string;
}

export function PdfViewer({ imageUrl, filename }: PdfViewerProps) {
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom((z) => Math.min(300, Math.max(25, z + delta)));
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium truncate">{filename}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            aria-label="Herauszoomen"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center" aria-live="polite">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.min(300, z + 25))}
            aria-label="Hineinzoomen"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(100)}
            aria-label="Zoom zuruecksetzen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 bg-muted/10"
        onWheel={handleWheel}
      >
        <img
          src={imageUrl}
          alt={filename}
          style={{ width: `${zoom}%`, maxWidth: "none" }}
          className="mx-auto"
          draggable={false}
        />
        <p className="text-center text-xs text-muted-foreground mt-2">
          Ctrl + Mausrad zum Zoomen
        </p>
      </div>
    </div>
  );
}
