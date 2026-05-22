export type FineStatus = "unpaid" | "paid" | "waived";

export type FineRecord = {
  id: string;
  attendance_record_id: string | null;
  penalty_id: string | null;
  student_id: string;
  name: string;
  no_of_absences: number;
  prescribed_penalty: string;
  status: FineStatus;
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

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

type ListFineOptions = {
  status?: FineStatus | "";
  studentId?: string;
  limit?: number;
  offset?: number;
};

function getApiBaseUrl() {
  const env = (import.meta as any).env ?? {};
  const value =
    env.VITE_API_URL ||
    env.VITE_BACKEND_URL ||
    env.Backend_URL ||
    env.BACKEND_URL ||
    "http://localhost:3000";

  return String(value).replace(/\/+$/, "");
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
    status: options.status || undefined,
    studentId: options.studentId,
    limit: options.limit ?? 100,
    offset: options.offset ?? 0
  });

  const response = await apiRequest<FineRecord[]>(`/api/fines${query}`);
  return response.data ?? [];
}

export async function getStudentFines(studentId: string) {
  return listFines({
    studentId,
    limit: 1000,
    offset: 0
  });
}

export async function getFineSummary() {
  const response = await apiRequest<FineSummary>("/api/fines/summary");
  return response.data ?? { unpaid: 0, paid: 0, waived: 0 };
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

export async function savePenalty(noOfAbsences: number, prescribedPenalty: string) {
  const response = await apiRequest<PenaltyRecord>("/api/fines/penalties", {
    method: "POST",
    body: JSON.stringify({
      noOfAbsences,
      prescribedPenalty
    })
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
