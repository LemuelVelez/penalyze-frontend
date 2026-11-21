import { checkUnauthorized, getApiBaseUrl } from "./auth";

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
let restoreEndpointUnavailable = false;
const RESTORE_MISSING_MESSAGE = "Penalyze backend is missing the repository restore endpoint. Deploy the updated penalyze-backend before verifying saved imports.";

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Penalyze-Request", "1");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${getApiBaseUrl()}/api/repository-sync${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  checkUnauthorized(response);
  if (!response.ok) {
    let message = `Repository sync failed (${response.status}).`;
    try {
      const data = await response.json() as { message?: string };
      if (data.message) message = data.message;
    } catch { /* Keep fallback. */ }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
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

// Only restores the repository status after the backend finds a matching saved
// Penalyze import. It never creates or duplicates attendance records.
export async function restoreRepositoryUploadedStatus(uploadId: string) {
  if (restoreEndpointUnavailable) throw new Error(RESTORE_MISSING_MESSAGE);
  let response: Response;
  try {
    response = await request("/restore", {
      method: "POST",
      body: JSON.stringify({ uploadId }),
    });
  } catch (error) {
    // Older backend deployments do not have this route. Do not repeat a 404
    // for every selected workbook, and never silently mark imports uploaded.
    if ((error as Error & { status?: number }).status === 404 &&
        /^(route not found|resource not found)\.?$/i.test((error as Error).message)) {
      restoreEndpointUnavailable = true;
      throw new Error(RESTORE_MISSING_MESSAGE);
    }
    throw error;
  }
  const result = (await response.json() as Envelope<{ uploadId: string; penalyzeImportId: string }>).data;
  window.dispatchEvent(new Event(REPOSITORY_SYNC_UPDATED_EVENT));
  return result;
}

export async function downloadRepositoryWorkbook(id: string) {
  const response = await request(`/uploads/${encodeURIComponent(id)}/download`);
  return response.blob();
}

// Repository Sync passes these File objects directly into Attendance's review
// dialog in memory. No workbook bytes or credentials go into browser storage.
export type RepositoryAttendanceReview = {
  college: string;
  workbooks: Array<{ uploadId: string; file: File }>;
};
