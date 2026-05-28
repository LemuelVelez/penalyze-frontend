import type { AttendanceRecord } from "./attendance";

export type FineStatus = "unpaid" | "paid" | "waived";

export type FineRecord = {
  id: string;
  school_year_id: string | null;
  attendance_record_id: string | null;
  penalty_id: string | null;
  student_id: string;
  name: string;
  no_of_absences?: number | null;
  prescribed_penalty: string;
  status: FineStatus;
  attendance_event_id?: string | null;
  attendance_remarks?: string | null;
  source_table?: string | null;
  source_record_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type FineSummary = Record<FineStatus, number>;

export type PenaltyRecord = {
  id: string;
  no_of_absences: number;
  prescribed_penalty: string;
  created_at: string;
  updated_at: string;
};

export type PenaltyResultRecord = {
  id: string;
  school_year_id: string | null;
  student_id: string;
  name: string;
  no_of_absences: number;
  penalty_id: string | null;
  prescribed_penalty: string;
  status: FineStatus;
  source_table: string | null;
  source_record_id: string | null;
  college?: string | null;
  program?: string | null;
  created_at: string;
  updated_at: string;
};

export type DeletedPenaltyResultsResult = {
  deletedCount: number;
  deletedRecords: PenaltyResultRecord[];
};


export type PenaltyResultUpdateInput = {
  studentId?: string;
  name?: string;
  noOfAbsences: number;
  prescribedPenalty: string;
  status: FineStatus;
};

export type ZeroAttendanceFinePayload = {
  schoolYearId?: string;
  studentId: string;
  name: string;
  yearLevel?: string;
  college?: string;
  program?: string;
  institution?: string;
};

export type ZeroAttendanceFineResult = {
  attendanceRecord: AttendanceRecord;
  fine: FineRecord | null;
  totalEvents: number;
  penalty: PenaltyRecord | null;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

type ListFineOptions = {
  schoolYearId?: string;
  status?: FineStatus | "";
  studentId?: string;
  limit?: number;
  offset?: number;
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
  return localStorage.getItem("penalyze.auth.token") || sessionStorage.getItem("penalyze.auth.token") || "";
}

function buildSearchParams(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });

  const text = search.toString();
  return text ? `?${text}` : "";
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
    credentials: "include"
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return payload as ApiEnvelope<T>;
}

export async function listFines(options: ListFineOptions = {}) {
  const query = buildSearchParams({
    schoolYearId: options.schoolYearId,
    status: options.status || undefined,
    studentId: options.studentId,
    limit: options.limit ?? 100,
    offset: options.offset ?? 0
  });

  const response = await apiRequest<FineRecord[]>(`/api/fines${query}`);
  return response.data ?? [];
}

function penaltyResultToFineRecord(result: PenaltyResultRecord): FineRecord {
  return {
    id: result.id,
    school_year_id: result.school_year_id,
    attendance_record_id: result.source_table === "attendance_records" ? result.source_record_id : null,
    penalty_id: result.penalty_id,
    student_id: result.student_id,
    name: result.name,
    no_of_absences: result.no_of_absences,
    prescribed_penalty: result.prescribed_penalty,
    status: result.status,
    attendance_event_id: null,
    attendance_remarks: result.source_table === "manual_attendance_records" ? "Manual attendance result" : "Final attendance result",
    source_table: result.source_table,
    source_record_id: result.source_record_id,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
}

export async function getStudentFines(studentId: string) {
  const [fines, penaltyResults] = await Promise.all([
    listFines({
      studentId,
      limit: 1000,
      offset: 0
    }),
    listPenaltyResults({
      studentId,
      limit: 1000,
      offset: 0
    }).catch(() => [] as PenaltyResultRecord[])
  ]);

  return [
    ...fines,
    ...penaltyResults.map(penaltyResultToFineRecord)
  ];
}

export async function listPenaltyResults(options: ListFineOptions = {}) {
  const query = buildSearchParams({
    schoolYearId: options.schoolYearId,
    status: options.status || undefined,
    studentId: options.studentId,
    limit: options.limit ?? 100,
    offset: options.offset ?? 0
  });

  const response = await apiRequest<PenaltyResultRecord[]>(`/api/fines/penalty-results${query}`);
  return response.data ?? [];
}

export async function refreshPenaltyResults(options: { schoolYearId?: string; importIds?: string[] } = {}) {
  const response = await apiRequest<PenaltyResultRecord[]>("/api/fines/penalty-results/refresh", {
    method: "POST",
    body: JSON.stringify(options)
  });

  return response.data ?? [];
}

export async function updatePenaltyResultStatus(id: string, status: FineStatus) {
  const response = await apiRequest<PenaltyResultRecord>(`/api/fines/penalty-results/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  return response.data;
}

export async function updatePenaltyResult(id: string, input: PenaltyResultUpdateInput) {
  const response = await apiRequest<PenaltyResultRecord>(`/api/fines/penalty-results/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function deletePenaltyResultsByIds(penaltyResultIds: string[]) {
  const response = await apiRequest<DeletedPenaltyResultsResult>(
    "/api/fines/penalty-results",
    {
      method: "DELETE",
      body: JSON.stringify({ ids: penaltyResultIds }),
    },
  );

  return response.data ?? { deletedCount: 0, deletedRecords: [] };
}

export async function deletePenaltyResultsBySchoolYear(schoolYearId: string) {
  const response = await apiRequest<DeletedPenaltyResultsResult>(
    "/api/fines/penalty-results",
    {
      method: "DELETE",
      body: JSON.stringify({ schoolYearId }),
    },
  );

  return response.data ?? { deletedCount: 0, deletedRecords: [] };
}

export async function getFineSummary() {
  const response = await apiRequest<FineSummary>("/api/fines/summary");
  return response.data ?? { unpaid: 0, paid: 0, waived: 0 };
}

export async function registerZeroAttendanceFine(payload: ZeroAttendanceFinePayload) {
  const response = await apiRequest<ZeroAttendanceFineResult>("/api/fines/zero-attendance", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!response.data) {
    throw new Error("Unable to register zero attendance record.");
  }

  return response.data;
}

export async function updateFineStatus(id: string, status: FineStatus) {
  const response = await apiRequest<FineRecord>(`/api/fines/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  return response.data;
}

export async function listPenalties() {
  const response = await apiRequest<PenaltyRecord[]>("/api/fines/penalties");
  return response.data ?? [];
}

export async function createPenalty(noOfAbsences: number, prescribedPenalty: string) {
  const response = await apiRequest<PenaltyRecord>("/api/fines/penalties", {
    method: "POST",
    body: JSON.stringify({
      noOfAbsences,
      prescribedPenalty
    })
  });

  return response.data;
}

export async function savePenalty(noOfAbsences: number, prescribedPenalty: string) {
  return createPenalty(noOfAbsences, prescribedPenalty);
}

export async function updatePenalty(id: string, noOfAbsences: number, prescribedPenalty: string) {
  const response = await apiRequest<PenaltyRecord>(`/api/fines/penalties/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({
      noOfAbsences,
      prescribedPenalty
    })
  });

  return response.data;
}

export async function deletePenalty(id: string) {
  const response = await apiRequest<PenaltyRecord>(`/api/fines/penalties/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  return response.data;
}

export async function seedDefaultPenalties() {
  const response = await apiRequest<PenaltyRecord[]>("/api/fines/penalties/seed", {
    method: "POST"
  });

  return response.data ?? [];
}

export async function matchPenalty(noOfAbsences: number) {
  const response = await apiRequest<PenaltyRecord>(`/api/fines/penalties/match/${noOfAbsences}`);
  return response.data ?? null;
}