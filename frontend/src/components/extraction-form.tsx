"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Save, Download } from "lucide-react";
import { ExtractionResult, FIELD_LABELS, EXTRACTION_FIELDS } from "@/lib/types";
import type { CustomFieldInfo } from "@/lib/types";

interface ExtractionFormProps {
  data: ExtractionResult;
  onChange: (field: keyof ExtractionResult, value: string) => void;
  onChangeCustom?: (key: string, value: string) => void;
  onSaveExample: () => void;
  onDownload: () => void;
  saving?: boolean;
  downloading?: boolean;
  dirty?: Set<string>;
  confidence?: Record<string, number>;
  customFieldDefs?: CustomFieldInfo[];
}

function ConfidenceDot({ value }: { value: number }) {
  const color =
    value >= 0.9
      ? "bg-emerald-500"
      : value >= 0.7
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className={`inline-block h-2 w-2 rounded-full shrink-0 ${color}`}
      />
      <TooltipContent side="top">
        Konfidenz: {(value * 100).toFixed(0)}%
      </TooltipContent>
    </Tooltip>
  );
}

export function ExtractionForm({
  data,
  onChange,
  onChangeCustom,
  onSaveExample,
  onDownload,
  saving = false,
  downloading = false,
  dirty = new Set(),
  confidence,
  customFieldDefs = [],
}: ExtractionFormProps) {
  const numericFields = new Set(["rev", "dn"]);
  const floatFields = new Set(["length"]);

  const customFields = data.custom_fields || {};
  const customConfidence = confidence?.custom_fields as unknown as Record<string, number> | undefined;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Extrahierte Daten</CardTitle>
        <p className="text-xs text-muted-foreground">
          Felder bearbeiten und als Trainingsbeispiel speichern
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto space-y-3">
        {EXTRACTION_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label
              htmlFor={field}
              className={`text-xs flex items-center gap-1.5 ${dirty.has(field) ? "text-orange-500 font-semibold" : ""}`}
            >
              {confidence && confidence[field] !== undefined && (
                <ConfidenceDot value={confidence[field]} />
              )}
              {FIELD_LABELS[field]}
              {dirty.has(field) && " (geaendert)"}
            </Label>
            <Input
              id={field}
              type={numericFields.has(field) || floatFields.has(field) ? "number" : "text"}
              step={floatFields.has(field) ? "0.001" : undefined}
              value={(data[field] as string | number | null) ?? ""}
              onChange={(e) => onChange(field, e.target.value)}
              placeholder={`${FIELD_LABELS[field]}...`}
              className={`h-8 text-sm ${dirty.has(field) ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""}`}
            />
          </div>
        ))}

        {/* Custom fields section */}
        {customFieldDefs.length > 0 && (
          <>
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Projekt-spezifische Felder
              </p>
            </div>
            {customFieldDefs.map((cf) => {
              const cfDirtyKey = `custom:${cf.field_key}`;
              const inputType =
                cf.field_type === "number"
                  ? "number"
                  : cf.field_type === "float"
                    ? "number"
                    : "text";
              return (
                <div key={cf.field_key} className="space-y-1">
                  <Label
                    htmlFor={`custom-${cf.field_key}`}
                    className={`text-xs flex items-center gap-1.5 ${dirty.has(cfDirtyKey) ? "text-orange-500 font-semibold" : ""}`}
                  >
                    {customConfidence &&
                      customConfidence[cf.field_key] !== undefined && (
                        <ConfidenceDot value={customConfidence[cf.field_key]} />
                      )}
                    {cf.field_label}
                    {dirty.has(cfDirtyKey) && " (geaendert)"}
                  </Label>
                  <Input
                    id={`custom-${cf.field_key}`}
                    type={inputType}
                    step={cf.field_type === "float" ? "0.001" : undefined}
                    value={customFields[cf.field_key] ?? ""}
                    onChange={(e) =>
                      onChangeCustom?.(cf.field_key, e.target.value)
                    }
                    placeholder={`${cf.field_label}...`}
                    className={`h-8 text-sm ${dirty.has(cfDirtyKey) ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""}`}
                  />
                </div>
              );
            })}
          </>
        )}

        <div className="pt-4 space-y-2 border-t">
          <Button
            onClick={onSaveExample}
            disabled={saving}
            className="w-full"
            variant="default"
          >
            {saving ? (
              <>Wird gespeichert...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Als Trainingsbeispiel speichern
              </>
            )}
          </Button>
          <Button
            onClick={onDownload}
            disabled={downloading}
            variant="outline"
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "Wird heruntergeladen..." : "Excel herunterladen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
