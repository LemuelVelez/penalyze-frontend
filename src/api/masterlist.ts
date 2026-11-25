import { checkUnauthorized, getApiBaseUrl } from "./auth";
import type { SchoolYearRecord } from "./schoolYears";

export type MasterlistFilters = { schoolYearId?: string; college?: string; yearLevel?: string; program?: string; search?: string; limit?: number; offset?: number };
export type MasterlistRow = { id: string; student_number: string; last_name: string; given_name: string; middle_initial: string | null; program: string | null; year_level: string | null; college: string | null };
export type MasterlistSummary = { schoolYear: SchoolYearRecord; masterlistRows: number; matchedById: number; matchedByName: number; idNameMismatches: number; unmatched: number; studentsUpdated: number; recordsUpdated: number; unmappedPrograms: string[] };
export type MasterlistImport = { id: string; file_name: string; rows_total: number; rows_valid: number; rows_invalid: number; summary: MasterlistSummary | null; created_at: string };
export type FinalAttendanceRow = Omit<MasterlistRow, "id" | "last_name" | "given_name"> & { name: string; last_name: string | null; given_name: string | null; attended_events: number; expected_events: number | null; total_absences: number | null; attendance_status: string; event_details: Record<string, "P" | "A" | "E"> };
export type FinalAttendanceResponse = { rows: FinalAttendanceRow[]; total: number; schoolYear: SchoolYearRecord; events: { id: string; name: string }[]; unmatched: { student_id: string; name: string; college: string | null; program: string | null; reason: string }[]; hasMasterlist: boolean; programs: string[] };
export function isMasterlistTerm(year: SchoolYearRecord | null | undefined) {
  return !!year && year.semester === "first_semester" && (/2026\s*[-–—/]\s*2027/.test(year.name) || (new Date(year.starts_at).getUTCFullYear() === 2026 && new Date(year.ends_at).getUTCFullYear() === 2027));
}
function queryString(filters: MasterlistFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
  return `?${params.toString()}`;
}
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("X-Penalyze-Request", "1");
  const response = checkUnauthorized(await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers, credentials: "include" }));
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Masterlist request failed.");
  }
  return response;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> { return (await request(path, init)).json() as Promise<T>; }
export function uploadMasterlist(file: File) { const form = new FormData(); form.append("file", file); return json<{ import: MasterlistImport; schoolYear: SchoolYearRecord; summary: MasterlistSummary }>("/api/masterlist/upload", { method: "POST", body: form }); }
export const listMasterlist = (filters: MasterlistFilters = {}) => json<{ rows: MasterlistRow[]; total: number; schoolYear: SchoolYearRecord | null; import: MasterlistImport | null }>(`/api/masterlist${queryString(filters)}`);
export const reconcileMasterlist = () => json<MasterlistSummary>("/api/masterlist/reconcile", { method: "POST" });
export const deleteMasterlist = () => json<{ schoolYear: SchoolYearRecord }>("/api/masterlist", { method: "DELETE" });
export const getFinalAttendance = (filters: MasterlistFilters = {}) => json<FinalAttendanceResponse>(`/api/attendance/final-attendance${queryString(filters)}`);
export async function downloadFinalAttendanceXlsx(filters: MasterlistFilters = {}) {
  const response = await request(`/api/attendance/final-attendance/export${queryString(filters)}`);
  const filename = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "final-attendance.xlsx";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
