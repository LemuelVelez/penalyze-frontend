import { fetchWithRetry, responseError } from "./http";
import { checkUnauthorized, getApiBaseUrl } from "./auth";
import type { SchoolYearRecord } from "./schoolYears";
import { readProgressStream } from "./progressStream";

export type MasterlistFilters = { schoolYearId?: string; college?: string; yearLevel?: string; program?: string; search?: string; limit?: number; offset?: number; includeUnmatched?: boolean };
export type MasterlistProgress = {
  stage: "parsing" | "saving_masterlist" | "reconciling_records" | "remapping_overrides" | "updating_students" | "syncing_absences" | "refreshing_final_results" | "refreshing_calculations" | "refreshing_penalties" | "finalizing";
  percent: number;
  message: string;
  table?: string;
  processed?: number;
  total?: number;
  chunkIndex?: number;
  chunkTotal?: number;
};
export type MasterlistUploadCheckpoint = { id: string; fileName: string; rowsValid: number; phase: "staged" | "syncing" | "refreshing"; processed: number; totalStudents: number; percent: number };
export type MasterlistRow = { id: string; student_number: string; last_name: string; given_name: string; middle_initial: string | null; program: string | null; year_level: string | null; college: string | null };
export type MasterlistSummary = { schoolYear: SchoolYearRecord; masterlistRows: number; matchedById: number; matchedByPartialId: number; matchedByName: number; idNameMismatches: number; unmatched: number; studentsUpdated: number; recordsUpdated: number; unmappedPrograms: string[] };
export type MasterlistImport = { id: string; file_name: string; rows_total: number; rows_valid: number; rows_invalid: number; summary: MasterlistSummary | null; created_at: string };
export type FinalAttendanceRow = Omit<MasterlistRow, "id" | "last_name" | "given_name"> & { name: string; last_name: string | null; given_name: string | null; attended_events: number; expected_events: number | null; total_absences: number | null; attendance_status: string; event_details: Record<string, "P" | "A" | "E"> };
export type FinalAttendanceResponse = { rows: FinalAttendanceRow[]; total: number; schoolYear: SchoolYearRecord; events: { id: string; name: string }[]; unmatched: UnmatchedStudent[]; unmatchedCount: number | null; hasMasterlist: boolean; programs: string[] };
export function isMasterlistTerm(year: SchoolYearRecord | null | undefined) {
  return !!year && year.semester === "first_semester" && (/2026\s*[-–—/]\s*2027/.test(year.name) || (new Date(year.starts_at).getUTCFullYear() === 2026 && new Date(year.ends_at).getUTCFullYear() === 2027));
}
function queryString(filters: MasterlistFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, key === "includeUnmatched" ? (value ? "1" : "0") : String(value)); });
  return `?${params.toString()}`;
}
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("X-Penalyze-Request", "1");
  const response = checkUnauthorized(await fetchWithRetry(`${getApiBaseUrl()}${path}`, { ...init, headers, credentials: "include" }));
  if (!response.ok) {
    const body = await response.json().catch((error: unknown) => {
      if (init.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return null;
    });
    throw responseError(response,body,"Masterlist request failed.");
  }
  return response;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> { return (await request(path, init)).json() as Promise<T>; }
export function uploadMasterlist(file: File) { const form = new FormData(); form.append("file", file); return json<{ import: MasterlistImport; schoolYear: SchoolYearRecord; summary: MasterlistSummary }>("/api/masterlist/upload", { method: "POST", body: form }); }
export const listMasterlist = (filters: MasterlistFilters = {}) => json<{ rows: MasterlistRow[]; total: number; schoolYear: SchoolYearRecord | null; import: MasterlistImport | null; pendingUpload: MasterlistUploadCheckpoint | null }>(`/api/masterlist${queryString(filters)}`);
export const reconcileMasterlist = () => json<MasterlistSummary>("/api/masterlist/reconcile", { method: "POST" });
async function progressRequest<T>(path: string, init: RequestInit, onProgress?: (progress: MasterlistProgress) => void): Promise<T> {
  const response = await request(path, init);
  const result = await readProgressStream<MasterlistProgress, T>(response,onProgress,{errorFallback:"Masterlist request failed.",missingSuccessMessage:"Masterlist operation finished without a result."});
  if (result.data === undefined) throw new Error("Masterlist operation finished without a result.");
  return result.data;
}
export function uploadMasterlistWithProgress(file: File, onProgress?: (progress: MasterlistProgress) => void) {
  const form = new FormData(); form.append("file",file);
  return progressRequest<{ import: MasterlistImport; schoolYear: SchoolYearRecord; summary: MasterlistSummary }>("/api/masterlist/upload/progress",{method:"POST",body:form},onProgress);
}
export const resumeMasterlistUploadWithProgress = (jobId: string, onProgress?: (progress: MasterlistProgress) => void) => progressRequest<{ import: MasterlistImport; schoolYear: SchoolYearRecord; summary: MasterlistSummary }>("/api/masterlist/upload/resume/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId})},onProgress);
export const discardMasterlistUpload = (jobId: string) => json<{schoolYear: SchoolYearRecord; discardedRows: number}>("/api/masterlist/upload/pending",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId,confirmation:"DISCARD UPLOAD"})});
export const reconcileMasterlistWithProgress = (onProgress?: (progress: MasterlistProgress) => void) => progressRequest<MasterlistSummary>("/api/masterlist/reconcile/progress",{method:"POST"},onProgress);
export const deleteMasterlist = (importId: string) => json<{ schoolYear: SchoolYearRecord; deletedRows: number }>("/api/masterlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({confirmation:"DELETE MASTERLIST",importId}) });
async function finalAttendanceJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  try {
    return await json<T>(path, { signal: controller.signal });
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new Error("Final attendance is taking too long to load. Please retry or narrow your filters.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
export const getFinalAttendance = (filters: MasterlistFilters = {}, signal?: AbortSignal) => finalAttendanceJson<FinalAttendanceResponse>(`/api/attendance/final-attendance${queryString(filters)}`,signal);
export const getFinalAttendanceUnmatched = (filters: MasterlistFilters = {}, signal?: AbortSignal) => finalAttendanceJson<{rows: FinalAttendanceResponse["unmatched"]; total: number}>(`/api/attendance/final-attendance/unmatched${queryString(filters)}`,signal);
export async function downloadFinalAttendanceXlsx(filters: MasterlistFilters = {}) {
  const response = await request(`/api/attendance/final-attendance/export${queryString(filters)}`);
  const filename = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "final-attendance.xlsx";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type StudentSuggestion = { student_number:string;full_name:string;program:string|null;year_level:string|null;college:string|null };
export type UnmatchedStudent = {student_id:string;name:string;college:string|null;program:string|null;year_level:string|null;reason:string;is_placeholder?:boolean;id_owner?:{student_number:string;full_name:string}|null;suggestions?:StudentSuggestion[]};
export type CorrectedStudent = {original_student_id:string;original_name:string;corrected_student_id:string;corrected_name:string;college:string|null;program:string|null;year_level:string|null;masterlist_status:string;record_count:number;latest_scanned_at:string|null};
export const reassignStudentAttendance = (body:{schoolYearId:string;originalStudentId:string;originalName:string;studentNumber:string}) => json<{studentNumber:string;name:string;recordsUpdated:number}>("/api/masterlist/reassign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
export const getFinalAttendanceCorrected = (filters:MasterlistFilters={},signal?:AbortSignal) => finalAttendanceJson<{rows:CorrectedStudent[];total:number}>(`/api/attendance/final-attendance/corrected${queryString(filters)}`,signal);
