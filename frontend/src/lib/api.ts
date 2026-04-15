import type {
  ExtractionResponse,
  BatchStartResponse,
  ExampleInfo,
  SaveExampleRequest,
  StatsResponse,
  ExtractionResult,
  OverviewStats,
  FieldAccuracy,
  DailyTrend,
  ProjectStats,
  RecentExtraction,
  FeedbackEntry,
  FeedbackCreate,
  UserEntry,
  ProjectEntry,
  CustomFieldInfo,
} from "./types";
import { getAuthHeaders } from "./auth";

const API_BASE = "/api";

/**
 * Wrapper around fetch that automatically injects auth headers
 * and redirects to /login on 401 responses.
 */
async function authFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const authHeaders = getAuthHeaders();
  for (const [k, v] of Object.entries(authHeaders)) {
    headers.set(k, v);
  }

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // Token expired or invalid - redirect to login
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  return res;
}

export async function extractSingle(file: File): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await authFetch(`${API_BASE}/extract`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Extraction failed");
  }

  return res.json();
}

export async function startBatch(files: File[]): Promise<BatchStartResponse> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));

  const res = await authFetch(`${API_BASE}/extract/batch`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Batch start failed");
  }

  return res.json();
}

async function getSseToken(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await authFetch(`${API_BASE}/auth/sse-token`, {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Failed to get SSE token");
    const data = await res.json();
    return data.sse_token;
  } finally {
    clearTimeout(timeout);
  }
}

const MAX_SSE_RECONNECTS = 3;

export async function streamBatchProgress(
  jobId: string,
  onEvent: (data: Record<string, unknown>) => void,
  onDone: () => void
) {
  let reconnectAttempts = 0;
  let finished = false;

  async function connect() {
    // Use short-lived SSE token instead of passing JWT in query params
    let sseToken: string;
    try {
      sseToken = await getSseToken();
    } catch {
      console.error("Failed to obtain SSE token for batch streaming");
      onDone();
      return null;
    }

    const url = `${API_BASE}/extract/stream/${jobId}?sse_token=${encodeURIComponent(sseToken)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      reconnectAttempts = 0;
      const data = JSON.parse(event.data);
      onEvent(data);
      if (data.type === "done") {
        finished = true;
        es.close();
        onDone();
      }
    };

    es.onerror = () => {
      es.close();
      if (finished) return;
      if (reconnectAttempts < MAX_SSE_RECONNECTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 8000);
        console.warn(`SSE connection lost, reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_SSE_RECONNECTS})`);
        setTimeout(() => { if (!finished) connect(); }, delay);
      } else {
        console.error("SSE reconnect limit reached, giving up");
        onDone();
      }
    };

    return es;
  }

  return connect();
}

export async function getExamples(project?: string): Promise<ExampleInfo[]> {
  const params = project ? `?project=${encodeURIComponent(project)}` : "";
  const res = await authFetch(`${API_BASE}/examples${params}`);
  if (!res.ok) throw new Error("Failed to load examples");
  return res.json();
}

export async function assignExampleProject(name: string, projectName: string | null): Promise<void> {
  const res = await authFetch(`${API_BASE}/examples/${encodeURIComponent(name)}/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name: projectName }),
  });
  if (!res.ok) throw new Error("Failed to assign project");
}

export async function saveExample(req: SaveExampleRequest): Promise<ExampleInfo> {
  const res = await authFetch(`${API_BASE}/examples`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Save failed");
  }

  return res.json();
}

export async function deleteExample(name: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/examples/${name}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

export async function downloadExcel(results: ExtractionResult[]): Promise<Blob> {
  const res = await authFetch(`${API_BASE}/export/excel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results),
  });

  if (!res.ok) throw new Error("Excel export failed");
  return res.blob();
}

export async function getStats(): Promise<StatsResponse> {
  const res = await authFetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

// Analytics API functions

export async function getAnalyticsOverview(): Promise<OverviewStats> {
  const res = await authFetch(`${API_BASE}/analytics/overview`);
  if (!res.ok) throw new Error("Failed to load analytics overview");
  return res.json();
}

export async function getFieldAccuracy(): Promise<FieldAccuracy[]> {
  const res = await authFetch(`${API_BASE}/analytics/field-accuracy`);
  if (!res.ok) throw new Error("Failed to load field accuracy");
  return res.json();
}

export async function getDailyTrend(days: number = 14): Promise<DailyTrend[]> {
  const res = await authFetch(`${API_BASE}/analytics/daily-trend?days=${days}`);
  if (!res.ok) throw new Error("Failed to load daily trend");
  return res.json();
}

export async function getProjectStats(): Promise<ProjectStats[]> {
  const res = await authFetch(`${API_BASE}/analytics/project-stats`);
  if (!res.ok) throw new Error("Failed to load project stats");
  return res.json();
}

export async function getRecentExtractions(limit: number = 20): Promise<RecentExtraction[]> {
  const res = await authFetch(`${API_BASE}/analytics/recent?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load recent extractions");
  return res.json();
}

// Review queue API functions

export async function getReviewQueue(): Promise<RecentExtraction[]> {
  const res = await authFetch(`${API_BASE}/analytics/review-queue`);
  if (!res.ok) throw new Error("Failed to load review queue");
  return res.json();
}

export async function approveExtraction(extractionId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/analytics/review/${extractionId}/approve`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to approve extraction");
}

// Feedback API functions

export async function getFeedback(status?: string): Promise<FeedbackEntry[]> {
  const params = status ? `?status=${status}` : "";
  const res = await authFetch(`${API_BASE}/feedback${params}`);
  if (!res.ok) throw new Error("Failed to load feedback");
  return res.json();
}

export async function createFeedback(data: FeedbackCreate): Promise<FeedbackEntry> {
  const res = await authFetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create feedback");
  }
  return res.json();
}

export async function updateFeedbackStatus(id: number, status: string): Promise<FeedbackEntry> {
  const res = await authFetch(`${API_BASE}/feedback/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update feedback");
  return res.json();
}

export async function deleteFeedback(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/feedback/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete feedback");
}

// User management API functions (admin only)

export async function getUsers(): Promise<UserEntry[]> {
  const res = await authFetch(`${API_BASE}/auth/users`);
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

export async function createUser(username: string, password: string, role: string): Promise<UserEntry> {
  const res = await authFetch(`${API_BASE}/auth/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create user");
  }
  return res.json();
}

export async function deleteUser(username: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/auth/users/${username}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete user");
  }
}

// Project management API functions

export async function getProjects(): Promise<ProjectEntry[]> {
  const res = await authFetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to load projects");
  return res.json();
}

export async function createProject(
  name: string,
  orderNumber: string | null = null,
  createFolder: boolean = false
): Promise<ProjectEntry> {
  const res = await authFetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      order_number: orderNumber || null,
      create_folder: createFolder,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create project");
  }
  return res.json();
}

export async function updateProject(
  projectId: number,
  data: { name?: string; order_number?: string | null }
): Promise<ProjectEntry> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update project");
  }
  return res.json();
}

export async function deleteProject(projectId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete project");
  }
}

export async function downloadProjectExcel(projectName: string): Promise<Blob> {
  const res = await authFetch(`${API_BASE}/export/project/${encodeURIComponent(projectName)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Export failed");
  }
  return res.blob();
}

// Custom field management

export async function addProjectCustomField(
  projectId: number,
  data: { field_key: string; field_label: string; field_type?: string; sort_order?: number }
): Promise<CustomFieldInfo> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to add custom field");
  }
  return res.json();
}

export async function updateProjectCustomField(
  projectId: number,
  fieldId: number,
  data: { field_label?: string; field_type?: string; sort_order?: number }
): Promise<CustomFieldInfo> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/fields/${fieldId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update custom field");
  }
  return res.json();
}

export async function deleteProjectCustomField(
  projectId: number,
  fieldId: number
): Promise<void> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/fields/${fieldId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete custom field");
  }
}
