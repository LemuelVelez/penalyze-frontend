import { useEffect, useMemo, useState } from "react";

import { listAttendanceImports, listAttendanceRecords } from "../../api/attendance";
import type { AttendanceImportRecord, AttendanceRecord } from "../../api/attendance";
import { listFines } from "../../api/fines";
import type { FineRecord } from "../../api/fines";
import { Button } from "../../components/ui/button";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;

type DashboardFineSummary = {
  unpaid: number;
  paid: number;
  waived: number;
};

function getDateYear(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return String(date.getFullYear());
}

function getAttendanceRecordYear(record: AttendanceRecord) {
  return record.school_year_id || getDateYear(record.scanned_at ?? record.created_at ?? null);
}

function getFineRecordYear(fine: FineRecord) {
  return fine.school_year_id || getDateYear(fine.created_at ?? null);
}

function getImportYear(record: AttendanceImportRecord) {
  return record.school_year_id || getDateYear(record.created_at ?? null);
}

function getYearOptions(
  attendanceRecords: AttendanceRecord[],
  fines: FineRecord[],
  imports: AttendanceImportRecord[],
  schoolYears: SchoolYearRecord[],
) {
  return Array.from(
    new Set([
      ...schoolYears.map((schoolYear) => schoolYear.id),
      ...attendanceRecords.map(getAttendanceRecordYear),
      ...fines.map(getFineRecordYear),
      ...imports.map(getImportYear)
    ].filter(Boolean))
  );
}

function matchesSelectedYear(recordYear: string, selectedYear: string) {
  return selectedYear === ALL_YEARS_VALUE || recordYear === selectedYear;
}

function getFineSummaryForYear(fines: FineRecord[]): DashboardFineSummary {
  return fines.reduce<DashboardFineSummary>(
    (summary, fine) => ({
      ...summary,
      [fine.status]: summary[fine.status] + 1
    }),
    { unpaid: 0, paid: 0, waived: 0 },
  );
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
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [yearFilter, setYearFilter] = useState(ALL_YEARS_VALUE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const yearOptions = useMemo(() => getYearOptions(records, fines, imports, schoolYears), [records, fines, imports, schoolYears]);
  const filteredRecords = useMemo(() => {
    return records.filter((record) => matchesSelectedYear(getAttendanceRecordYear(record), yearFilter));
  }, [records, yearFilter]);
  const filteredFines = useMemo(() => {
    return fines.filter((fine) => matchesSelectedYear(getFineRecordYear(fine), yearFilter));
  }, [fines, yearFilter]);
  const filteredImports = useMemo(() => {
    return imports.filter((record) => matchesSelectedYear(getImportYear(record), yearFilter));
  }, [imports, yearFilter]);
  const summary = useMemo(() => getFineSummaryForYear(filteredFines), [filteredFines]);
  const recentRecords = filteredRecords.slice(0, 8);
  const recentImports = filteredImports.slice(0, 5);
  const yearLabel = getSchoolYearLabel(schoolYears, yearFilter);

  async function loadDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const [fineRows, attendanceRows, importRows, schoolYearRows] = await Promise.all([
        listFines({ limit: 5000, offset: 0 }),
        listAttendanceRecords({ limit: 5000, offset: 0 }),
        listAttendanceImports({ limit: 500, offset: 0 }),
        listSchoolYears()
      ]);

      setFines(fineRows);
      setRecords(attendanceRows);
      setImports(importRows);
      setSchoolYears(schoolYearRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (yearFilter !== ALL_YEARS_VALUE && !yearOptions.includes(yearFilter)) {
      setYearFilter(ALL_YEARS_VALUE);
    }
  }, [yearFilter, yearOptions]);

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Overview</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Monitor attendance imports, unpaid fines, paid records, and waived penalties by selected year in one responsive view.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="min-h-11 rounded-xl px-4 text-sm font-black sm:w-40">
                <SelectValue placeholder="All school years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS_VALUE}>All school years</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {getSchoolYearLabel(schoolYears, year)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={loadDashboard}
              disabled={isLoading}
              className="min-h-11 rounded-xl px-5 py-2 text-sm font-black"
            >
              {isLoading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Attendance records" value={filteredRecords.length} helper={`${yearLabel} entries loaded`} />
          <StatCard label="Unpaid fines" value={summary.unpaid} helper={`${yearLabel} needs settlement`} />
          <StatCard label="Paid fines" value={summary.paid} helper={`${yearLabel} settled penalties`} />
          <StatCard label="Waived fines" value={summary.waived} helper={`${yearLabel} approved waivers`} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Recent attendance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest saved attendance records for {yearLabel}.</p>

            <div className="mt-4 space-y-3 lg:hidden">
              {recentRecords.length ? (
                recentRecords.map((record) => (
                  <article key={record.id} className="min-w-0 rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="wrap-break-word font-black">{record.name}</p>
                        <p className="break-all text-sm text-muted-foreground">{record.student_id}</p>
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
                  {recentRecords.length ? (
                    recentRecords.map((record) => (
                      <tr key={record.id} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-semibold">{formatDate(record.created_at)}</td>
                        <td className="max-w-40 break-all px-3 py-3">{record.student_id}</td>
                        <td className="max-w-56 wrap-break-word px-3 py-3">{record.name}</td>
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
            <p className="mt-1 text-sm text-muted-foreground">Latest attendance import batches for {yearLabel}.</p>

            <div className="mt-4 space-y-3">
              {recentImports.length ? (
                recentImports.map((item) => (
                  <article key={item.id} className="rounded-2xl border bg-background p-4">
                    <p className="break-all text-sm font-black">{item.file_name}</p>
                    <div className="mt-3 flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                        <p className="font-bold text-muted-foreground">Total</p>
                        <p className="font-black">{item.rows_total}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                        <p className="font-bold text-muted-foreground">Valid</p>
                        <p className="font-black">{item.rows_valid}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
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