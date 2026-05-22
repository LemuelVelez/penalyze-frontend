import { useEffect, useState } from "react";

import { listAttendanceImports, listAttendanceRecords } from "../../api/attendance";
import type { AttendanceImportRecord, AttendanceRecord } from "../../api/attendance";
import { getFineSummary } from "../../api/fines";
import type { FineSummary } from "../../api/fines";

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

function StatCard(props: { label: string; value: string | number; helper: string }) {
  return (
    <article className="rounded-3xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-bold text-muted-foreground">{props.label}</p>
      <p className="mt-3 text-3xl font-black">{props.value}</p>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{props.helper}</p>
    </article>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<FineSummary>({ unpaid: 0, paid: 0, waived: 0 });
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const [fineSummary, attendanceRows, importRows] = await Promise.all([
        getFineSummary(),
        listAttendanceRecords({ limit: 8, offset: 0 }),
        listAttendanceImports({ limit: 5, offset: 0 })
      ]);

      setSummary(fineSummary);
      setRecords(attendanceRows);
      setImports(importRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Overview</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Monitor attendance imports, unpaid fines, paid records, and waived penalties in one responsive view.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={isLoading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-5 py-2 text-sm font-black shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Attendance records" value={records.length} helper="Latest entries loaded" />
          <StatCard label="Unpaid fines" value={summary.unpaid} helper="Needs settlement" />
          <StatCard label="Paid fines" value={summary.paid} helper="Settled penalties" />
          <StatCard label="Waived fines" value={summary.waived} helper="Approved waivers" />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Recent attendance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest saved attendance records.</p>

            <div className="mt-4 space-y-3 lg:hidden">
              {records.length ? (
                records.map((record) => (
                  <article key={record.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black">{record.name}</p>
                        <p className="text-sm text-muted-foreground">{record.student_id}</p>
                      </div>
                      <p className="text-sm font-bold">{record.no_of_absences} absence/s</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{formatDate(record.created_at)}</p>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No attendance records available.
                </div>
              )}
            </div>

            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Student ID</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Absences</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length ? (
                    records.map((record) => (
                      <tr key={record.id} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-semibold">{formatDate(record.created_at)}</td>
                        <td className="px-3 py-3">{record.student_id}</td>
                        <td className="px-3 py-3">{record.name}</td>
                        <td className="px-3 py-3">{record.no_of_absences}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm font-semibold text-muted-foreground">
                        No attendance records available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Recent imports</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest attendance import batches.</p>

            <div className="mt-4 space-y-3">
              {imports.length ? (
                imports.map((item) => (
                  <article key={item.id} className="rounded-2xl border bg-background p-4">
                    <p className="truncate text-sm font-black">{item.file_name}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-muted px-2 py-2">
                        <p className="font-bold text-muted-foreground">Total</p>
                        <p className="font-black">{item.rows_total}</p>
                      </div>
                      <div className="rounded-xl bg-muted px-2 py-2">
                        <p className="font-bold text-muted-foreground">Valid</p>
                        <p className="font-black">{item.rows_valid}</p>
                      </div>
                      <div className="rounded-xl bg-muted px-2 py-2">
                        <p className="font-bold text-muted-foreground">Invalid</p>
                        <p className="font-black">{item.rows_invalid}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-muted-foreground">{formatDate(item.created_at)}</p>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No imports available.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}