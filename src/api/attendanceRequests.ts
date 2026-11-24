import { getApiBaseUrl, checkUnauthorized } from "./auth";
import { notifyCalculationStatusUpdated } from "./attendance";
import { readProgressStream } from "./progressStream";
import type { SchoolSemester, SchoolYearRecord } from "./schoolYears";
import type {
  AttendanceRecord,
  ManualAttendanceRecord,
  AttendanceFinalResultRecord,
  AttendanceEvent,
} from "./attendance";
import type { FineRecord, PenaltyRecord, PenaltyResultRecord } from "./fines";

export const ATTENDANCE_REQUESTS_UPDATED_EVENT = "attendance-requests-updated";
const STATUS_RECEIPTS_PREFIX = "penalyze:attendance:receipts:";

function receiptStorageKey(studentId: string) {
  return `${STATUS_RECEIPTS_PREFIX}${studentId.trim().toLowerCase()}`;
}

function readStatusReceipts(studentId: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(receiptStorageKey(studentId)) || "[]");
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.length <= 1024).slice(-20) : [];
  } catch { return []; }
}

export function rememberStatusReceipt(studentId: string, code: string) {
  if (!code || code.length > 1024) return;
  try {
    const receipts = [...new Set([...readStatusReceipts(studentId), code])].slice(-20);
    localStorage.setItem(receiptStorageKey(studentId), JSON.stringify(receipts));
  } catch { /* Private mode or disabled storage: users may supply the code manually. */ }
}


function notifyAttendanceRequestsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ATTENDANCE_REQUESTS_UPDATED_EVENT));
  }
}

export type PublicStudentLookup = {
  student_id: string;
  course: string | null;
  year_level: string | null;
  college: string | null;
  status: "pending" | "approved" | "rejected" | null;
};

export async function lookupPublicStudentById(studentId: string): Promise<PublicStudentLookup | null> {
  const response = await apiRequest<PublicStudentLookup | null>(
    "/api/attendance/requests/student-lookup",
    { method: "POST", body: JSON.stringify({ studentId: studentId.trim() }) },
  );
  return response.data ?? null;
}

export type PublicStudentRecords = {
  profile: PublicStudentLookup | null;
  attendance: AttendanceRecord[];
  manualAttendance: ManualAttendanceRecord[];
  finalResults: AttendanceFinalResultRecord[];
  fines: FineRecord[];
  penaltyResults: PenaltyResultRecord[];
  penalties: PenaltyRecord[];
  schoolYears: SchoolYearRecord[];
  attendanceEvents: AttendanceEvent[];
  collegeEventRecords: AttendanceRecord[];
};

// A rapid double-submit should share its request, not consume two lookup slots.
const inFlightPublicStudentRecords = new Map<string, Promise<PublicStudentRecords | null>>();

export function getPublicStudentRecords(studentId: string): Promise<PublicStudentRecords | null> {
  const cleanStudentId = studentId.trim();
  const key = cleanStudentId.toLowerCase();
  const existing = inFlightPublicStudentRecords.get(key);
  if (existing) return existing;

  const request = apiRequest<PublicStudentRecords | null>(
    "/api/public/student-records",
    { method: "POST", body: JSON.stringify({ studentId: cleanStudentId }) },
  ).then((response) => response.data ?? null);
  inFlightPublicStudentRecords.set(key, request);
  void request.finally(() => {
    if (inFlightPublicStudentRecords.get(key) === request) {
      inFlightPublicStudentRecords.delete(key);
    }
  }).catch(() => undefined);
  return request;
}

export type AttendanceRequestStatus = "pending" | "approved" | "rejected";
export type AttendanceRequestType = "event_review" | "details_correction" | "zero_attendance";

export type AttendanceRequestEvent = {
  id: string;
  request_id: string;
  event_id: string | null;
  event_name: string;
  evidence_url: string;
  created_at: string;
};


// Public lookups expose request status metadata; reviewer notes require a receipt.
export type StudentAttendanceRequestStatus = {
  id: string;
  school_year_id: string;
  school_year_name: string;
  semester: SchoolSemester;
  request_type: AttendanceRequestType;
  status: AttendanceRequestStatus;
  review_note: string | null;
  review_note_access: boolean;
  reviewed_at: string | null;
  created_at: string;
};

export type AttendanceRequest = {
  id: string;
  school_year_id: string;
  school_year_name: string;
  semester: SchoolSemester;
  request_type: AttendanceRequestType;
  student_id: string;
  name: string;
  year_level: string | null;
  college: string | null;
  program: string | null;
  institution: string | null;
  current_name: string | null;
  current_year_level: string | null;
  current_college: string | null;
  current_program: string | null;
  evidence_url: string | null;
  request_note: string | null;
  status: AttendanceRequestStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  events: AttendanceRequestEvent[];
};

type BaseCreateAttendanceRequestInput = {
  schoolYearId: string;
  studentId: string;
  honeypot: string;
  formStartedAt: number;
  name: string;
  yearLevel?: string;
  college?: string;
  program?: string;
  institution?: string;
  note?: string;
};

type AttendanceRequestEventInput = {
  eventId: string;
  eventName?: string;
  evidenceUrl: string;
};

export type CreateAttendanceRequestInput =
  | (BaseCreateAttendanceRequestInput & {
      requestType: "event_review";
      events: AttendanceRequestEventInput[];
      evidenceUrl?: never;
    })
  | (BaseCreateAttendanceRequestInput & {
      requestType: "details_correction";
      evidenceUrl?: never;
      events?: never;
    })
  | (BaseCreateAttendanceRequestInput & {
      requestType: "zero_attendance";
      evidenceUrl?: never;
      events?: never;
    });

export type ReviewAttendanceRequestInput = {
  status: Exclude<AttendanceRequestStatus, "pending">;
  reviewNote?: string;
};

export type AttendanceRequestReviewProgress = {
  stage:
    | "validating"
    | "resolving_events"
    | "adding_attendance"
    | "waiting_for_lock"
    | "syncing_absences"
    | "updating_records"
    | "refreshing_final_results"
    | "refreshing_calculations"
    | "refreshing_penalties"
    | "finalizing";
  percent: number;
  message: string;
  completed?: number;
  total?: number;
};

export type ReviewAttendanceRequestResult = {
  request: AttendanceRequest | null;
  createdAttendanceCount?: number;
  updatedRowCount?: number;
  removedExemptedEventCount?: number;
  autoClosedByExemption?: boolean;
};

export type ReviewAttendanceRequestGroupInput = {
  studentId: string;
  requestIds: string[];
  status: "approved" | "rejected";
  reviewNote?: string;
};

export type ReviewAttendanceRequestGroupResult = {
  requests: AttendanceRequest[];
  approvedCount: number;
  rejectedCount: number;
  autoClosedCount: number;
  createdAttendanceCount: number;
  updatedRowCount: number;
  removedExemptedEventCount: number;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("X-Penalyze-Request", "1");

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  checkUnauthorized(response);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 429) {
      const retrySeconds = Number(response.headers.get("Retry-After"));
      const wait = Number.isFinite(retrySeconds) && retrySeconds > 0
        ? ` Please try again in ${retrySeconds < 60
          ? `${Math.ceil(retrySeconds)} second(s)`
          : `${Math.ceil(retrySeconds / 60)} minute(s)`}.`
        : " Please try again later.";
      throw new Error(`Too many requests.${wait}`);
    }
    throw new Error(
      payload?.message || `Request failed with status ${response.status}.`,
    );
  }

  return payload as ApiEnvelope<T>;
}

export async function createAttendanceRequest(
  input: CreateAttendanceRequestInput,
) {
  const response = await apiRequest<{ id: string; statusToken: string }>(
    "/api/attendance/requests",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  if (response.data?.statusToken) rememberStatusReceipt(input.studentId, response.data.statusToken);
  notifyAttendanceRequestsUpdated();
  return response.data ?? null;
}

export async function listAttendanceRequests(options: {
  status?: AttendanceRequestStatus;
  requestType?: AttendanceRequestType;
  schoolYearId?: string;
  studentId?: string;
} = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.requestType) params.set("requestType", options.requestType);
  if (options.schoolYearId) params.set("schoolYearId", options.schoolYearId);
  if (options.studentId) params.set("studentId", options.studentId);
  const query = params.toString();
  const response = await apiRequest<AttendanceRequest[]>(
    `/api/attendance/requests${query ? `?${query}` : ""}`,
  );
  return response.data ?? [];
}

export async function reviewAttendanceRequest(
  id: string,
  input: ReviewAttendanceRequestInput,
) {
  const response = await apiRequest<ReviewAttendanceRequestResult>(
    `/api/attendance/requests/${encodeURIComponent(id)}/review`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  notifyAttendanceRequestsUpdated();
  notifyCalculationStatusUpdated();
  return response.data ?? null;
}

export async function reviewAttendanceRequestWithProgress(
  id: string,
  input: ReviewAttendanceRequestInput,
  onProgress?: (progress: AttendanceRequestReviewProgress) => void,
) {
  const headers = new Headers();
  headers.set("X-Penalyze-Request", "1");
  headers.set("Content-Type", "application/json");

  const response = await fetch(
    `${getApiBaseUrl()}/api/attendance/requests/${encodeURIComponent(id)}/review/progress`,
    {
      method: "PATCH",
      headers,
      credentials: "include",
      body: JSON.stringify(input),
    },
  );
  checkUnauthorized(response);

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : null;
    throw new Error(
      payload?.message || `Request failed with status ${response.status}.`,
    );
  }

  const payload = await readProgressStream<
    AttendanceRequestReviewProgress,
    ReviewAttendanceRequestResult
  >(response, onProgress, {
    errorFallback: "Unable to review attendance request.",
    missingSuccessMessage: "Attendance request review finished without a result.",
  });

  notifyAttendanceRequestsUpdated();
  notifyCalculationStatusUpdated();
  return payload.data ?? null;
}

export async function reviewAttendanceRequestGroup(
  input: ReviewAttendanceRequestGroupInput,
) {
  const response = await apiRequest<ReviewAttendanceRequestGroupResult>(
    "/api/attendance/requests/group-review",
    { method: "PATCH", body: JSON.stringify(input) },
  );
  notifyAttendanceRequestsUpdated();
  notifyCalculationStatusUpdated();
  return response.data ?? null;
}

export async function reviewAttendanceRequestGroupWithProgress(
  input: ReviewAttendanceRequestGroupInput,
  onProgress?: (progress: AttendanceRequestReviewProgress) => void,
) {
  const headers = new Headers();
  headers.set("X-Penalyze-Request", "1");
  headers.set("Content-Type", "application/json");

  const response = await fetch(
    `${getApiBaseUrl()}/api/attendance/requests/group-review/progress`,
    {
      method: "PATCH",
      headers,
      credentials: "include",
      body: JSON.stringify(input),
    },
  );
  checkUnauthorized(response);
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : null;
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }
  const payload = await readProgressStream<
    AttendanceRequestReviewProgress,
    ReviewAttendanceRequestGroupResult
  >(response, onProgress, {
    errorFallback: "Unable to review attendance request group.",
    missingSuccessMessage: "Attendance request group review finished without a result.",
  });
  notifyAttendanceRequestsUpdated();
  notifyCalculationStatusUpdated();
  return payload.data ?? null;
}

export async function removeAttendanceRequestEvent(
  requestId: string,
  requestEventId: string,
): Promise<AttendanceRequest | null> {
  const response = await apiRequest<AttendanceRequest>(
    `/api/attendance/requests/${encodeURIComponent(requestId)}/events/${encodeURIComponent(requestEventId)}`,
    { method: "DELETE" },
  );
  notifyAttendanceRequestsUpdated();
  return response.data ?? null;
}

export async function getStudentAttendanceRequestStatus(
  studentId: string,
  schoolYearId?: string,
  accessCode?: string,
) {
  const cleanStudentId = studentId.trim();
  if (accessCode?.trim()) rememberStatusReceipt(cleanStudentId, accessCode.trim());
  const receipts = readStatusReceipts(cleanStudentId);
  const response = await apiRequest<StudentAttendanceRequestStatus[]>(
    "/api/attendance/requests/student-status",
    { method: "POST", body: JSON.stringify({ studentId: cleanStudentId, receipts }) },
  );
  const rows = response.data ?? [];
  return schoolYearId ? rows.filter((row) => row.school_year_id === schoolYearId) : rows;
}
