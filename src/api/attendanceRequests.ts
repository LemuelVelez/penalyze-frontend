import { getApiBaseUrl, getAuthToken } from "./auth";
import type { SchoolSemester } from "./schoolYears";

export const ATTENDANCE_REQUESTS_UPDATED_EVENT = "attendance-requests-updated";

function notifyAttendanceRequestsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ATTENDANCE_REQUESTS_UPDATED_EVENT));
  }
}

export type AttendanceRequestStatus = "pending" | "approved" | "rejected";
export type AttendanceRequestType = "event_review" | "details_correction";

export type AttendanceRequestEvent = {
  id: string;
  request_id: string;
  event_id: string | null;
  event_name: string;
  evidence_url: string;
  created_at: string;
};


export type StudentAttendanceRequestStatus = {
  id: string;
  school_year_id: string;
  school_year_name: string;
  semester: SchoolSemester;
  request_type: AttendanceRequestType;
  name: string;
  year_level: string | null;
  college: string | null;
  program: string | null;
  current_name: string | null;
  current_year_level: string | null;
  current_college: string | null;
  current_program: string | null;
  status: AttendanceRequestStatus;
  request_note: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  events: Array<{
    event_id: string | null;
    event_name: string;
  }>;
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
  name: string;
  yearLevel?: string;
  college?: string;
  program?: string;
  institution?: string;
  note?: string;
};

type AttendanceRequestEventInput = {
  eventId: string;
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
    });

export type ReviewAttendanceRequestInput = {
  status: Exclude<AttendanceRequestStatus, "pending">;
  reviewNote?: string;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  if (!headers.has("Content-Type") && options.body) {
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
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.message || `Request failed with status ${response.status}.`,
    );
  }

  return payload as ApiEnvelope<T>;
}

export async function createAttendanceRequest(
  input: CreateAttendanceRequestInput,
) {
  const response = await apiRequest<AttendanceRequest>(
    "/api/attendance/requests",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
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
  const response = await apiRequest<{
    request: AttendanceRequest | null;
    createdAttendanceCount?: number;
    updatedRowCount?: number;
  }>(`/api/attendance/requests/${encodeURIComponent(id)}/review`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  notifyAttendanceRequestsUpdated();
  return response.data ?? null;
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
) {
  const params = new URLSearchParams({ studentId });
  if (schoolYearId) params.set("schoolYearId", schoolYearId);
  const response = await fetch(
    `${getApiBaseUrl()}/api/attendance/requests/student-status?${params.toString()}`,
    { credentials: "include" },
  );
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new Error(
      payload?.message || `Request failed with status ${response.status}.`,
    );
  }
  return (payload?.data ?? []) as StudentAttendanceRequestStatus[];
}
