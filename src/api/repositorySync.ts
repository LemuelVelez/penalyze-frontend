import { checkUnauthorized, getApiBaseUrl, getAuthToken } from "./auth";

export const REPOSITORY_SYNC_UPDATED_EVENT = "penalyze:repository-sync-updated";

export type RepositorySyncStatus = "untracked" | "pending" | "uploaded" | "outdated";
export type RepositoryWorkbook = {
  id: string;
  originalName: string;
  college: string;
  representativeName: string;
  uploadedAt: string;
  updatedAt: string;
  rowCount: number;
  sheetCount: number;
  penalyzeStatus: RepositorySyncStatus;
  penalyzeMarkedPendingAt: string | null;
  penalyzeUploadedAt: string | null;
  penalyzeUploadedBy: string;
};

type Envelope<T> = { data: T; message: string };

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${getApiBaseUrl()}/api/repository-sync${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  checkUnauthorized(response);
  if (!response.ok) {
    let message = `Repository sync failed (${response.status}).`;
    try {
      const data = await response.json() as { message?: string };
      if (data.message) message = data.message;
    } catch { /* Keep fallback. */ }
    throw new Error(message);
  }
  return response;
}

export async function listRepositoryWorkbooks(status: RepositorySyncStatus | "all" = "all") {
  const response = await request(`/uploads?status=${encodeURIComponent(status)}`);
  return (await response.json() as Envelope<RepositoryWorkbook[]>).data;
}

export async function markRepositorySync(action: "pending" | "uploaded" | "reset", uploadIds: string[], note = "", penalyzeImportId = "") {
  const response = await request(`/${action}`, {
    method: "POST",
    body: JSON.stringify({ uploadIds, ...(action === "uploaded" ? { note, penalyzeImportId: penalyzeImportId || undefined } : {}) }),
  });
  const result = (await response.json() as Envelope<{ uploadIds: string[] }>).data;
  window.dispatchEvent(new Event(REPOSITORY_SYNC_UPDATED_EVENT));
  return result;
}

export async function downloadRepositoryWorkbook(id: string) {
  const response = await request(`/uploads/${encodeURIComponent(id)}/download`);
  return response.blob();
}

// A one-time in-memory handoff to the existing Attendance upload-and-review wizard.
// Never send workbook bytes through URL parameters or browser storage.
export type RepositoryAttendanceReview = {
  college: string;
  workbooks: Array<{ uploadId: string; file: File }>;
};

let pendingAttendanceReview: RepositoryAttendanceReview | null = null;

export function stageRepositoryAttendanceReview(review: RepositoryAttendanceReview) {
  pendingAttendanceReview = review;
}

export function takeRepositoryAttendanceReview(): RepositoryAttendanceReview | null {
  const review = pendingAttendanceReview;
  pendingAttendanceReview = null;
  return review;
}
