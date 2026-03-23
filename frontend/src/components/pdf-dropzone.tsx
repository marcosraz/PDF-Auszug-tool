"use client";

import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PdfPreview } from "@/components/pdf-preview";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface PdfDropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  files?: File[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfDropzone({ onFiles, multiple = false, files = [] }: PdfDropzoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      setError(null);

      if (rejections.length > 0) {
        const messages: string[] = [];
        for (const rej of rejections) {
          for (const err of rej.errors) {
            if (err.code === "file-too-large") {
              messages.push(`"${rej.file.name}" ist zu gross (max. ${formatFileSize(MAX_FILE_SIZE)})`);
            } else if (err.code === "file-invalid-type") {
              messages.push(`"${rej.file.name}" ist kein PDF`);
            } else {
              messages.push(`"${rej.file.name}": ${err.message}`);
            }
          }
        }
        const combined = messages.join("; ");
        setError(combined);
        toast.error("Datei abgelehnt", { description: combined });
      }

      if (accepted.length > 0) {
        onFiles(accepted);
      }
    },
    [onFiles]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const updated = files.filter((_, i) => i !== index);
      onFiles(updated);
    },
    [files, onFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_FILE_SIZE,
    multiple,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          ${isDragActive
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/50"
          }`}
      >
        <input {...getInputProps()} aria-label={multiple ? "PDF-Dateien auswaehlen" : "PDF-Datei auswaehlen"} />
        <Upload
          className={`mx-auto h-10 w-10 mb-3 transition-transform ${
            isDragActive
              ? "text-blue-500 scale-110 -translate-y-1"
              : "text-muted-foreground"
          }`}
        />
        {isDragActive ? (
          <p className="text-blue-500 font-medium">PDF(s) hier ablegen...</p>
        ) : (
          <div>
            <p className="font-medium">
              {multiple ? "PDFs hier ablegen" : "PDF hier ablegen"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              oder klicken zum Auswaehlen (max. {formatFileSize(MAX_FILE_SIZE)})
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/50"
            >
              <FileText className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {formatFileSize(f.size)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(i);
                }}
                aria-label={`${f.name} entfernen`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {files.map((f, i) => (
            <PdfPreview
              key={`${f.name}-${f.lastModified}-${i}`}
              file={f}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
