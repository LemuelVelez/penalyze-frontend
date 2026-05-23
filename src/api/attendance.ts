export type ImportStatus = "previewed" | "saved" | "failed";

export type AttendanceEvent = {
  id: string;
  name: string;
  event_start_at: string | null;
  event_end_at: string | null;
  description: string | null;
  attendees_count: number;
  created_at: string;
  updated_at: string;
};

export type AttendanceRecord = {
  id: string;
  import_id: string | null;
  event_id: string | null;
  event_name: string | null;
  student_id: string;
  name: string;
  year_level: string | null;
  college: string | null;
  program: string | null;
  institution: string | null;
  no_of_absences: number;
  remarks: string | null;
  scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceImportRecord = {
  id: string;
  event_id: string | null;
  event_name: string | null;
  file_name: string;
  file_type: string;
  rows_total: number;
  rows_valid: number;
  rows_invalid: number;
  status: ImportStatus;
  created_at: string;
};

export type DeletedAttendanceImportsResult = {
  deletedCount: number;
  deletedImports: AttendanceImportRecord[];
};

export type AttendanceImportInput = {
  eventId?: string;
  eventName?: string;
  eventStartAt?: string;
  eventEndAt?: string;
  scannedAt?: string;
  studentId: string;
  name: string;
  yearLevel?: string;
  college?: string;
  program?: string;
  institution?: string;
  noOfAbsences?: number;
  remarks?: string;
};

export type ManualAttendanceInput = AttendanceImportInput;

export type AttendanceEventInput = {
  name: string;
  eventStartAt?: string;
  eventEndAt?: string;
  description?: string;
};

export type ParsedAttendanceRow = AttendanceImportInput & {
  rowNumber: number;
  errors: string[];
  raw: Record<string, unknown>;
};

export type AttendancePreviewResult = {
  fileName: string;
  fileType: string;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  rows: ParsedAttendanceRow[];
};

export type SavedAttendanceImportResult = AttendancePreviewResult & {
  importId: string;
  event: AttendanceEvent | null;
  savedRecords: AttendanceRecord[];
  createdFines: Array<{
    id: string;
    student_id: string;
    name: string;
    no_of_absences: number;
    prescribed_penalty: string;
    status: string;
  }>;
};

export type ManualAttendanceSaveResult = {
  event: AttendanceEvent | null;
  record: AttendanceRecord;
  fine: SavedAttendanceImportResult["createdFines"][number] | null;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

type ListOptions = {
  studentId?: string;
  eventId?: string;
  college?: string;
  limit?: number;
  offset?: number;
};

export type AttendanceImportSaveOptions = {
  eventId?: string;
  eventName?: string;
  eventStartAt?: string;
  eventEndAt?: string;
  eventDescription?: string;
};

const ACCEPTED_ATTENDANCE_FILE_TYPES = ".xlsx,.xls,.csv,.txt,.docx,.doc";

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

function appendSaveOptions(body: FormData, options: AttendanceImportSaveOptions = {}) {
  if (options.eventId) body.set("eventId", options.eventId);
  if (options.eventName) body.set("eventName", options.eventName);
  if (options.eventStartAt) body.set("eventStartAt", options.eventStartAt);
  if (options.eventEndAt) body.set("eventEndAt", options.eventEndAt);
  if (options.eventDescription) body.set("eventDescription", options.eventDescription);
}

export function getAcceptedAttendanceFileTypes() {
  return ACCEPTED_ATTENDANCE_FILE_TYPES;
}

export function normalizeStudentId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function listAttendanceEvents(options: Pick<ListOptions, "limit" | "offset"> = {}) {
  const query = buildSearchParams({
    limit: options.limit ?? 100,
    offset: options.offset ?? 0
  });

  const response = await apiRequest<AttendanceEvent[]>(`/api/attendance/events${query}`);
  return response.data ?? [];
}

export async function saveAttendanceEvent(input: AttendanceEventInput) {
  const response = await apiRequest<AttendanceEvent>("/api/attendance/events", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function updateAttendanceEvent(id: string, input: AttendanceEventInput) {
  const response = await apiRequest<AttendanceEvent>(`/api/attendance/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function deleteAttendanceEvent(id: string) {
  const response = await apiRequest<AttendanceEvent>(`/api/attendance/events/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  return response.data;
}

export async function listAttendanceRecords(options: ListOptions = {}) {
  const query = buildSearchParams({
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    studentId: options.studentId,
    eventId: options.eventId,
    college: options.college
  });

  const response = await apiRequest<AttendanceRecord[]>(`/api/attendance${query}`);
  const rows = response.data ?? [];

  if (!options.studentId && !options.college) return rows;

  const targetStudentId = options.studentId ? normalizeStudentId(options.studentId) : "";
  const targetCollege = options.college ? String(options.college).trim().toLowerCase() : "";

  return rows.filter((row) => {
    const matchesStudent = !targetStudentId || normalizeStudentId(row.student_id) === targetStudentId;
    const matchesCollege = !targetCollege || String(row.college ?? "").trim().toLowerCase() === targetCollege;

    return matchesStudent && matchesCollege;
  });
}

type ListAllAttendanceRecordsOptions = Omit<ListOptions, "limit" | "offset"> & {
  pageSize?: number;
  maxPages?: number;
};

export async function listAllAttendanceRecords(options: ListAllAttendanceRecordsOptions = {}) {
  const pageSize = options.pageSize ?? 500;
  const maxPages = options.maxPages ?? 100;
  const records: AttendanceRecord[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await listAttendanceRecords({
      ...options,
      limit: pageSize,
      offset: page * pageSize
    });

    records.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return records;
}

export async function getStudentAttendanceRecords(studentId: string) {
  return listAllAttendanceRecords({
    studentId
  });
}

export async function listAttendanceImports(options: Pick<ListOptions, "limit" | "offset"> = {}) {
  const query = buildSearchParams({
    limit: options.limit ?? 50,
    offset: options.offset ?? 0
  });

  const response = await apiRequest<AttendanceImportRecord[]>(`/api/attendance/imports${query}`);
  return response.data ?? [];
}

export async function getAttendanceImport(importId: string) {
  const response = await apiRequest<{
    import: AttendanceImportRecord;
    records: AttendanceRecord[];
  }>(`/api/attendance/imports/${encodeURIComponent(importId)}`);

  return response.data ?? null;
}

export async function deleteAttendanceImport(importId: string) {
  const response = await apiRequest<AttendanceImportRecord>(`/api/attendance/imports/${encodeURIComponent(importId)}`, {
    method: "DELETE"
  });

  return response.data;
}

export async function deleteAllAttendanceImports() {
  const response = await apiRequest<DeletedAttendanceImportsResult>("/api/attendance/imports", {
    method: "DELETE"
  });

  return response.data;
}

export async function previewAttendanceFile(file: File) {
  const body = new FormData();
  body.set("file", file);

  const response = await apiRequest<AttendancePreviewResult>("/api/attendance/import/preview", {
    method: "POST",
    body
  });

  return response.data;
}

export async function saveAttendanceFile(file: File, options: AttendanceImportSaveOptions = {}) {
  const body = new FormData();
  body.set("file", file);
  appendSaveOptions(body, options);

  const response = await apiRequest<SavedAttendanceImportResult>("/api/attendance/import/save", {
    method: "POST",
    body
  });

  return response.data;
}

export async function saveAttendanceRows(input: {
  eventId?: string;
  eventName?: string;
  eventStartAt?: string;
  eventEndAt?: string;
  eventDescription?: string;
  fileName?: string;
  fileType?: string;
  rows: ParsedAttendanceRow[];
}) {
  const response = await apiRequest<SavedAttendanceImportResult>("/api/attendance/import/save", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function saveManualAttendanceRecord(input: ManualAttendanceInput) {
  const response = await apiRequest<ManualAttendanceSaveResult>("/api/attendance/manual", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function updateAttendanceRecord(id: string, input: ManualAttendanceInput) {
  const response = await apiRequest<ManualAttendanceSaveResult>(`/api/attendance/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });

  return response.data;
}

export async function deleteAttendanceRecord(id: string) {
  const response = await apiRequest<AttendanceRecord>(`/api/attendance/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  return response.data;
}