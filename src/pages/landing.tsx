import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { getStudentAttendanceRecords } from "../api/attendance";
import type { AttendanceRecord } from "../api/attendance";
import { getStudentFines, matchPenalty } from "../api/fines";
import type { FineRecord, PenaltyRecord } from "../api/fines";
import { LogoMark, navigateTo } from "../components/layout";

type LookupState = {
  attendance: AttendanceRecord[];
  fines: FineRecord[];
  fallbackFine: FineRecord | null;
};

const AUTH_STORAGE_KEYS = [
  "penalyze.auth.session",
  "penalyze.auth.token",
  "penalyze.session",
  "penalyze.token",
  "auth.session",
  "auth.token",
  "session",
  "token",
  "accessToken"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getExpiryTime(value: unknown) {
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedNumericValue = Number(value);
    if (!Number.isNaN(parsedNumericValue)) {
      return parsedNumericValue < 1_000_000_000_000 ? parsedNumericValue * 1000 : parsedNumericValue;
    }

    const parsedDateValue = new Date(value).getTime();
    if (!Number.isNaN(parsedDateValue)) return parsedDateValue;
  }

  return null;
}

function hasUsableSessionPayload(payload: Record<string, unknown>) {
  const expiresAt = payload.expiresAt ?? payload.expires_at ?? payload.exp;
  const expiryTime = getExpiryTime(expiresAt);

  if (expiryTime !== null && expiryTime <= Date.now()) return false;

  return Boolean(
    payload.token ||
      payload.accessToken ||
      payload.access_token ||
      payload.jwt ||
      payload.user ||
      payload.email ||
      payload.id
  );
}

function hasStoredSessionValue(value: string | null) {
  if (!value) return false;

  const cleanValue = value.trim();
  if (!cleanValue || cleanValue === "null" || cleanValue === "undefined") return false;

  try {
    const parsedValue: unknown = JSON.parse(cleanValue);

    if (typeof parsedValue === "string") return parsedValue.trim().length > 0;
    if (!isRecord(parsedValue)) return Boolean(parsedValue);

    return hasUsableSessionPayload(parsedValue);
  } catch {
    return true;
  }
}

function hasCurrentSession() {
  if (typeof window === "undefined") return false;

  const storageAreas: Storage[] = [window.localStorage, window.sessionStorage];

  return storageAreas.some((storageArea) => {
    try {
      return AUTH_STORAGE_KEYS.some((key) => hasStoredSessionValue(storageArea.getItem(key)));
    } catch {
      return false;
    }
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function statusBadge(status: FineRecord["status"]) {
  const styles: Record<FineRecord["status"], string> = {
    unpaid: "border-red-200 bg-red-50 text-red-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    waived: "border-blue-200 bg-blue-50 text-blue-700"
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatAbsenceCount(value: number, forceTenPlus = false) {
  const numericValue = Number(value || 0);

  if (forceTenPlus || numericValue >= 10) return "10+";

  return String(numericValue);
}

function getTotalAbsences(attendance: AttendanceRecord[]) {
  return attendance.reduce((total, row) => total + Number(row.no_of_absences || 0), 0);
}

function getFallbackAbsenceCount(attendance: AttendanceRecord[]) {
  const total = getTotalAbsences(attendance);

  if (!attendance.length || total <= 0) return 10;

  return total;
}

function isFallbackFine(fine: FineRecord) {
  return fine.id.startsWith("fallback-fine-");
}

async function resolveFallbackPenalty(noOfAbsences: number) {
  try {
    return await matchPenalty(noOfAbsences);
  } catch {
    return null;
  }
}

function buildFallbackFine(
  studentId: string,
  attendance: AttendanceRecord[],
  noOfAbsences: number,
  penalty: PenaltyRecord | null
): FineRecord {
  const latestAttendance = attendance[0];
  const now = new Date().toISOString();

  return {
    id: `fallback-fine-${studentId}-${noOfAbsences}`,
    attendance_record_id: latestAttendance?.id ?? null,
    penalty_id: penalty?.id ?? null,
    student_id: latestAttendance?.student_id ?? studentId,
    name: latestAttendance?.name ?? "Student record pending",
    no_of_absences: noOfAbsences,
    prescribed_penalty: penalty?.prescribed_penalty ?? "No prescribed penalty configured.",
    status: "unpaid",
    created_at: String(latestAttendance?.created_at ?? now),
    updated_at: String(latestAttendance?.updated_at ?? latestAttendance?.created_at ?? now)
  };
}

export default function LandingPage() {
  const [studentId, setStudentId] = useState("");
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [searchedId, setSearchedId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasCurrentSession()) {
      navigateTo("/dashboard");
      return;
    }

    setIsCheckingSession(false);
  }, []);

  const totalAbsences = useMemo(() => {
    return lookup ? getTotalAbsences(lookup.attendance) : 0;
  }, [lookup]);

  const displayedFines = useMemo(() => {
    if (!lookup) return [];
    return lookup.fallbackFine ? [lookup.fallbackFine] : lookup.fines;
  }, [lookup]);

  const unpaidFines = useMemo(() => {
    return displayedFines.filter((fine) => fine.status === "unpaid").length;
  }, [displayedFines]);

  const fallbackFineActive = Boolean(lookup?.fallbackFine);
  const fallbackFineUsesTenPlus = Boolean(lookup?.fallbackFine && lookup.fallbackFine.no_of_absences >= 10);
  const totalAbsencesLabel = lookup?.fallbackFine
    ? formatAbsenceCount(lookup.fallbackFine.no_of_absences, fallbackFineUsesTenPlus)
    : formatAbsenceCount(totalAbsences);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanStudentId = studentId.trim();
    if (!cleanStudentId) {
      setError("Please enter your Student ID.");
      setLookup(null);
      return;
    }

    setIsSearching(true);
    setError("");
    setSearchedId(cleanStudentId);

    try {
      const [attendance, fines] = await Promise.all([
        getStudentAttendanceRecords(cleanStudentId),
        getStudentFines(cleanStudentId)
      ]);

      const fallbackAbsenceCount = getFallbackAbsenceCount(attendance);
      const shouldBuildFallbackFine = fines.length === 0;
      const fallbackFine = shouldBuildFallbackFine
        ? buildFallbackFine(
            cleanStudentId,
            attendance,
            fallbackAbsenceCount,
            await resolveFallbackPenalty(fallbackAbsenceCount)
          )
        : null;

      setLookup({ attendance, fines, fallbackFine });
    } catch (searchError) {
      setLookup(null);
      setError(searchError instanceof Error ? searchError.message : "Unable to search student records.");
    } finally {
      setIsSearching(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <LogoMark textClassName="text-2xl" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b bg-linear-to-b from-muted/80 to-background">
        <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <a href="/" className="inline-flex">
              <LogoMark textClassName="text-2xl" />
            </a>
            <a
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-5 py-2 text-sm font-bold shadow-sm transition hover:bg-accent"
            >
              Admin Login
            </a>
          </header>

          <div className="mx-auto w-full max-w-4xl py-10 text-center lg:py-14">
            <p className="mx-auto mb-4 inline-flex rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
              Attendance and fines lookup for students
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Search your Student ID and view your attendance record instantly.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Students can check recorded absences and penalty status without logging in. Enter your Student ID to
              see attendance entries and related fines.
            </p>

            <form
              onSubmit={handleSearch}
              className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-3 rounded-3xl border bg-card p-3 text-left shadow-xl shadow-black/5 sm:flex-row sm:items-center"
            >
              <label className="sr-only" htmlFor="student-id-search">
                Student ID
              </label>
              <input
                id="student-id-search"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder="Enter Student ID"
                className="min-h-12 w-full rounded-2xl border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 sm:flex-1"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSearching ? "Searching..." : "Search Records"}
              </button>
            </form>

            {error ? (
              <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">Fast lookup</p>
                <p className="mt-2 text-3xl font-black">Student ID</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">View status</p>
                <p className="mt-2 text-3xl font-black">Fines</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">Monitor records</p>
                <p className="mt-2 text-3xl font-black">Attendance</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {lookup ? (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Search result</p>
              <h2 className="text-2xl font-black sm:text-3xl">Student ID: {searchedId}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-auto">
              <div className="rounded-2xl border bg-card px-5 py-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Total absences</p>
                <p className="text-2xl font-black">{totalAbsencesLabel}</p>
                {fallbackFineActive ? (
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    Computed from the configured penalty table.
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border bg-card px-5 py-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Unpaid fines</p>
                <p className="text-2xl font-black">{unpaidFines}</p>
              </div>
            </div>
          </div>

          {fallbackFineActive ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
              No saved fine record was returned. A computed unpaid fine is shown using the configured penalty table.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-black">Attendance</h3>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {lookup.attendance.length} record/s
                </span>
              </div>

              {lookup.attendance.length ? (
                <div className="space-y-3 lg:hidden">
                  {lookup.attendance.map((row) => (
                    <article key={row.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-black">{row.name}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(row.created_at)}</p>
                        </div>
                        <p className="text-sm font-bold">
                          {formatAbsenceCount(row.no_of_absences)} absence/s
                        </p>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{row.remarks || "No remarks"}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {lookup.attendance.length ? (
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead className="border-b text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Absences</th>
                        <th className="px-3 py-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookup.attendance.map((row) => (
                        <tr key={row.id} className="border-b last:border-b-0">
                          <td className="px-3 py-3 font-semibold">{formatDate(row.created_at)}</td>
                          <td className="px-3 py-3">{row.name}</td>
                          <td className="px-3 py-3">
                            {formatAbsenceCount(row.no_of_absences)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{row.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No attendance record found. This search is treated as 10 or more absences.
                </div>
              )}
            </div>

            <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-black">Fines</h3>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {displayedFines.length} record/s
                </span>
              </div>

              {displayedFines.length ? (
                <div className="space-y-3">
                  {displayedFines.map((fine) => (
                    <article key={fine.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-black">{fine.prescribed_penalty}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatAbsenceCount(fine.no_of_absences, isFallbackFine(fine) && fine.no_of_absences >= 10)} absence/s •{" "}
                            {formatDate(fine.created_at)}
                            {isFallbackFine(fine) ? " • computed" : ""}
                          </p>
                        </div>
                        {statusBadge(fine.status)}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No fine record found.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}