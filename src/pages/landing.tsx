import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import { getStudentAttendanceRecords } from "../api/attendance";
import type { AttendanceRecord } from "../api/attendance";
import { getStudentFines } from "../api/fines";
import type { FineRecord } from "../api/fines";
import { LogoMark } from "../components/layout";

type LookupState = {
  attendance: AttendanceRecord[];
  fines: FineRecord[];
};

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

function formatAbsenceCount(value: number, useTenPlusFallback: boolean) {
  if (useTenPlusFallback && Number(value || 0) <= 0) return "10+";
  return String(value ?? 0);
}

export default function LandingPage() {
  const [studentId, setStudentId] = useState("");
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [searchedId, setSearchedId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const totalAbsences = useMemo(() => {
    return lookup?.attendance.reduce((total, row) => total + Number(row.no_of_absences || 0), 0) ?? 0;
  }, [lookup]);

  const unpaidFines = useMemo(() => {
    return lookup?.fines.filter((fine) => fine.status === "unpaid").length ?? 0;
  }, [lookup]);

  const zeroOrNoResultMeansTenPlus = Boolean(
    lookup && lookup.fines.length === 0 && (lookup.attendance.length === 0 || totalAbsences === 0)
  );
  const totalAbsencesLabel = zeroOrNoResultMeansTenPlus ? "10+" : String(totalAbsences);

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

      setLookup({ attendance, fines });
    } catch (searchError) {
      setLookup(null);
      setError(searchError instanceof Error ? searchError.message : "Unable to search student records.");
    } finally {
      setIsSearching(false);
    }
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
                {zeroOrNoResultMeansTenPlus ? (
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">Zero/no result means 10+ absences.</p>
                ) : null}
              </div>
              <div className="rounded-2xl border bg-card px-5 py-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Unpaid fines</p>
                <p className="text-2xl font-black">{zeroOrNoResultMeansTenPlus ? "Review" : unpaidFines}</p>
              </div>
            </div>
          </div>

          {zeroOrNoResultMeansTenPlus ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
              No fine record or zero-absence result was returned. This search is treated as 10 or more absences.
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
                          {formatAbsenceCount(row.no_of_absences, zeroOrNoResultMeansTenPlus)} absence/s
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
                            {formatAbsenceCount(row.no_of_absences, zeroOrNoResultMeansTenPlus)}
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
                  {lookup.fines.length} record/s
                </span>
              </div>

              {lookup.fines.length ? (
                <div className="space-y-3">
                  {lookup.fines.map((fine) => (
                    <article key={fine.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-black">{fine.prescribed_penalty}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {fine.no_of_absences} absence/s • {formatDate(fine.created_at)}
                          </p>
                        </div>
                        {statusBadge(fine.status)}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No fine record found. Zero/no result means 10 or more absences.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
