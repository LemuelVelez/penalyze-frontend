export const ALL_SCHOOL_YEARS_VALUE = "__all_school_years__";

export type SchoolYearRecord = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SchoolYearInput = {
  name: string;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
};

export type TransferSchoolYearRecordsPayload = {
  targetSchoolYearId: string;
  eventIds?: string[];
  importIds?: string[];
  attendanceRecordIds?: string[];
  finalResultIds?: string[];
  manualRecordIds?: string[];
  fineIds?: string[];
  penaltyResultIds?: string[];
};

export type TransferSchoolYearRecordsResult = {
  targetSchoolYear: SchoolYearRecord;
  eventsUpdated: number;
  importsUpdated: number;
  attendanceRecordsUpdated: number;
  finesUpdated: number;
  finalResultsUpdated?: number;
  manualRecordsUpdated?: number;
  penaltyResultsUpdated?: number;
};

export type SchoolYearRecordActionResult = {
  schoolYear: SchoolYearRecord;
  eventsUpdated?: number;
  importsUpdated?: number;
  attendanceRecordsUpdated?: number;
  finesUpdated?: number;
  finalResultsUpdated?: number;
  manualRecordsUpdated?: number;
  penaltyResultsUpdated?: number;
  eventsDeleted?: number;
  importsDeleted?: number;
  attendanceRecordsDeleted?: number;
  finesDeleted?: number;
  finalResultsDeleted?: number;
  manualRecordsDeleted?: number;
  penaltyResultsDeleted?: number;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

const LOCAL_API_BASE_URL = "http://localhost:3000";

function normalizeBaseUrl(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function getEnvUrl(...keys: string[]) {
  const env = (import.meta as any).env ?? {};

  for (const key of keys) {
    const value = normalizeBaseUrl(env[key]);
    if (value) return value;
  }

  return "";
}

function getRuntimeOrigin() {
  if (typeof window === "undefined") return "";
  return normalizeBaseUrl(window.location.origin);
}

function isLocalUrl(value: string) {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return value.includes("localhost") || value.includes("127.0.0.1");
  }
}

function getFrontendBaseUrl() {
  return (
    getEnvUrl("VITE_Frontend_URL", "VITE_FRONTEND_URL", "VITE_APP_URL") ||
    getRuntimeOrigin()
  );
}

function getApiBaseUrl() {
  const backendUrl = getEnvUrl(
    "VITE_Backend_URL",
    "VITE_BACKEND_URL",
    "VITE_API_URL",
    "Backend_URL",
    "BACKEND_URL",
  );

  if (backendUrl) return backendUrl;

  const frontendUrl = getFrontendBaseUrl();

  if (frontendUrl && !isLocalUrl(frontendUrl)) {
    return frontendUrl;
  }

  return LOCAL_API_BASE_URL;
}

function getAuthToken() {
  return (
    localStorage.getItem("penalyze.auth.token") ||
    sessionStorage.getItem("penalyze.auth.token") ||
    ""
  );
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return payload as ApiEnvelope<T>;
}

export function getSchoolYearLabel(
  schoolYears: SchoolYearRecord[],
  schoolYearId?: string | null,
) {
  if (!schoolYearId || schoolYearId === ALL_SCHOOL_YEARS_VALUE) return "All school years";
  return schoolYears.find((item) => item.id === schoolYearId)?.name ?? schoolYearId;
}

export function getActiveSchoolYearId(schoolYears: SchoolYearRecord[]) {
  return schoolYears.find((item) => item.is_active)?.id ?? schoolYears[0]?.id ?? "";
}

export async function listSchoolYears() {
  const response = await apiRequest<SchoolYearRecord[]>("/api/school-years");
  return response.data ?? [];
}

export async function saveSchoolYear(input: SchoolYearInput) {
  const response = await apiRequest<SchoolYearRecord>("/api/school-years", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateSchoolYear(id: string, input: SchoolYearInput) {
  const response = await apiRequest<SchoolYearRecord>(`/api/school-years/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function deleteSchoolYear(id: string) {
  const response = await apiRequest<SchoolYearRecordActionResult>(`/api/school-years/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  return response.data;
}

export async function activateSchoolYear(id: string) {
  const response = await apiRequest<SchoolYearRecord>(`/api/school-years/${encodeURIComponent(id)}/activate`, {
    method: "PATCH",
  });

  return response.data;
}

export async function transferSchoolYearRecords(payload: TransferSchoolYearRecordsPayload) {
  const response = await apiRequest<TransferSchoolYearRecordsResult>("/api/school-years/transfer", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return response.data;
}

export async function assignCurrentRecordsToSchoolYear(id: string) {
  const response = await apiRequest<SchoolYearRecordActionResult>(
    `/api/school-years/${encodeURIComponent(id)}/assign-current`,
    {
      method: "PATCH",
    },
  );

  return response.data;
}

export async function deleteSchoolYearRecords(id: string) {
  const response = await apiRequest<SchoolYearRecordActionResult>(
    `/api/school-years/${encodeURIComponent(id)}/records`,
    {
      method: "DELETE",
    },
  );

  return response.data;
}