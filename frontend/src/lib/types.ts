export interface ExtractionResult {
  line_no: string | null;
  rev: number | null;
  length: number | null;
  pid: string | null;
  pipe_class: string | null;
  building: string | null;
  floor: string | null;
  dn: number | null;
  insulation: string | null;
  project: string | null;
  ped_cat: string | null;
  customer: string | null;
}

export interface ValidationIssue {
  field: string;
  type: "error" | "warning" | "info";
  message: string;
}

export interface DuplicateInfo {
  existing_id: string;
  existing_filename: string;
  existing_date: string | null;
}

export interface ExtractionResponse {
  id: string;
  filename: string;
  image_url: string;
  result: ExtractionResult;
  confidence?: Record<string, number>;
  validation?: ValidationIssue[];
  duplicate?: DuplicateInfo | null;
  created_at: string;
}

export interface BatchStartResponse {
  job_id: string;
  total: number;
}

export interface BatchJob {
  job_id: string;
  total: number;
  completed: number;
  results: ExtractionResponse[];
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
}

export interface ExampleInfo {
  name: string;
  image_url: string;
  data: ExtractionResult;
}

export interface SaveExampleRequest {
  name: string;
  extraction_id: string;
  data: ExtractionResult;
}

export interface ProjectInfo {
  name: string;
  order_number: string | null;
  display_name: string;
}

export interface StatsResponse {
  example_count: number;
  total_extractions: number;
  available_projects: string[];
  projects: ProjectInfo[];
}

export interface ProjectEntry {
  id: number;
  name: string;
  order_number: string | null;
  display_name: string;
  has_folder: boolean;
  created_at: string | null;
}

export const FIELD_LABELS: Record<keyof ExtractionResult, string> = {
  line_no: "Line No.",
  rev: "Rev.",
  length: "Länge (m)",
  pid: "P&ID Nr.",
  pipe_class: "Pipe Class",
  building: "Gebäude",
  floor: "Etage",
  dn: "DN (mm)",
  insulation: "Isolierung",
  project: "Projekt",
  ped_cat: "PED Kat.",
  customer: "Kunde",
};

export const EXTRACTION_FIELDS = Object.keys(FIELD_LABELS) as (keyof ExtractionResult)[];

// Analytics types

export interface OverviewStats {
  total_extractions: number;
  extractions_today: number;
  total_fields: number;
  corrected_fields: number;
  correction_rate: number;
  accuracy: number;
  avg_confidence: number | null;
}

export interface FieldAccuracy {
  field_name: string;
  total: number;
  corrected: number;
  accuracy: number;
  avg_confidence: number | null;
}

export interface DailyTrend {
  day: string;
  extractions: number;
  total_fields: number;
  corrected_fields: number;
  accuracy: number;
}

export interface ProjectStats {
  project: string | null;
  extraction_count: number;
  avg_duration: number | null;
  total_fields: number;
  corrected_fields: number;
  accuracy: number;
}

export interface RecentExtraction {
  id: string;
  filename: string;
  project: string | null;
  accuracy: number;
  created_at: string;
  status: string;
  fields: FieldDetail[];
}

export interface FieldDetail {
  field_name: string;
  value: string | null;
  confidence: number;
  was_corrected: boolean;
}

// Feedback types

export interface FeedbackEntry {
  id: number;
  pdf_filename: string;
  project: string | null;
  reported_by: string;
  field_name: string | null;
  expected_value: string | null;
  actual_value: string | null;
  category: string;
  description: string | null;
  status: string;
  created_at: string | null;
}

export interface UserEntry {
  username: string;
  role: string;
}

export interface FeedbackCreate {
  pdf_filename: string;
  project?: string | null;
  reported_by: string;
  field_name?: string | null;
  expected_value?: string | null;
  actual_value?: string | null;
  category: string;
  description?: string | null;
}
