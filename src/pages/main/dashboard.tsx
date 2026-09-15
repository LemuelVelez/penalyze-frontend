import { useEffect, useRef, useState } from "react";

import {
  getAttendanceDashboardOverview,
} from "../../api/attendance";
import type {
  AttendanceImportRecord,
  AttendanceRecord,
} from "../../api/attendance";
import { getFineSummary } from "../../api/fines";
import type { FineSummary } from "../../api/fines";
import {
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { LoadingStatus } from "../../components/loading-status";
import type { LoadingStatusStep } from "../../components/loading-status";
import { Button } from "../../components/ui/button";

type DashboardLoadProgress = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function StatCard(props: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <article className="rounded-3xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-bold text-muted-foreground">{props.label}</p>
      <p className="mt-3 text-3xl font-black">{props.value}</p>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        {props.helper}
      </p>
    </article>
  );
}

function SchoolYearBadge(props: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-h-11 items-center rounded-xl border bg-background px-4 text-sm font-black ${props.className ?? ""}`}
    >
      {props.label}
    </span>
  );
}

export default function DashboardPage() {
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [recentImports, setRecentImports] = useState<AttendanceImportRecord[]>([]);
  const [attendanceRecordCount, setAttendanceRecordCount] = useState(0);
  const [fineSummary, setFineSummary] = useState<FineSummary>({
    unpaid: 0,
    paid: 0,
    waived: 0,
  });
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [yearFilter, setYearFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<DashboardLoadProgress | null>(
    null,
  );
  const [error, setError] = useState("");
  const loadRequestIdRef = useRef(0);

  const yearLabel = getSchoolYearLabel(schoolYears, yearFilter);

  function updateLoadStep(
    label: string,
    status: LoadingStatusStep["status"],
    detail: string,
    progress: number,
    overallDetail: string,
  ) {
    setLoadProgress((current) => {
      if (!current) return current;

      return {
        ...current,
        progress: Math.max(current.progress, progress),
        detail: overallDetail,
        steps: current.steps.map((step) =>
          step.label === label ? { ...step, status, detail } : step,
        ),
      };
    });
  }

  async function loadDashboard() {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;

    setIsLoading(true);
    setError("");
    setLoadProgress({
      progress: 6,
      detail: "Finding the active school year before requesting dashboard data.",
      steps: [
        { label: "School year", status: "loading", detail: "Checking active scope" },
        { label: "Attendance", status: "pending", detail: "Waiting for scope" },
        { label: "Fine totals", status: "pending", detail: "Waiting for scope" },
      ],
    });

    try {
      const schoolYearRows = await listSchoolYears();
      if (!isCurrentRequest()) return;

      const activeSchoolYearId =
        schoolYearRows.find((schoolYear) => schoolYear.is_active)?.id ??
        schoolYearRows[0]?.id ??
        "";

      setSchoolYears(schoolYearRows);
      setYearFilter(activeSchoolYearId);
      updateLoadStep(
        "School year",
        "done",
        activeSchoolYearId ? "Active school year ready" : "No school year found",
        24,
        activeSchoolYearId
          ? "School year ready. Loading lightweight attendance and fine summaries in parallel."
          : "No school year is available to load.",
      );

      if (!activeSchoolYearId) {
        setRecentRecords([]);
        setRecentImports([]);
        setAttendanceRecordCount(0);
        setFineSummary({ unpaid: 0, paid: 0, waived: 0 });
        setLoadProgress((current) =>
          current
            ? {
                ...current,
                progress: 100,
                detail: "Dashboard is ready. No school-year data was requested.",
                steps: current.steps.map((step) => ({
                  ...step,
                  status: "done",
                  detail:
                    step.status === "done" ? step.detail : "No data requested",
                })),
              }
            : current,
        );
        return;
      }

      updateLoadStep(
        "Attendance",
        "loading",
        "Loading count + 8 recent rows + 5 recent imports",
        32,
        "Loading only the dashboard summary instead of thousands of raw attendance rows.",
      );
      updateLoadStep(
        "Fine totals",
        "loading",
        "Counting unpaid, paid, and waived fines",
        32,
        "Attendance summary and fine totals are loading in parallel.",
      );

      const attendancePromise = getAttendanceDashboardOverview({
        schoolYearId: activeSchoolYearId,
      }).then((overview) => {
        if (!isCurrentRequest()) return overview;
        setAttendanceRecordCount(overview.attendanceRecordCount);
        setRecentRecords(overview.recentAttendanceRecords);
        setRecentImports(overview.recentImports);
        updateLoadStep(
          "Attendance",
          "done",
          `${overview.attendanceRecordCount.toLocaleString()} total record/s; recent rows ready`,
          76,
          "Attendance summary is visible. Finishing the remaining dashboard totals.",
        );
        return overview;
      });

      const finesPromise = getFineSummary(activeSchoolYearId).then((summary) => {
        if (!isCurrentRequest()) return summary;
        setFineSummary(summary);
        updateLoadStep(
          "Fine totals",
          "done",
          `${(
            summary.unpaid + summary.paid + summary.waived
          ).toLocaleString()} fine record/s counted`,
          86,
          "Fine totals are ready. Finalizing the dashboard.",
        );
        return summary;
      });

      await Promise.all([attendancePromise, finesPromise]);
      if (!isCurrentRequest()) return;

      setLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail:
                "Ready. The dashboard loaded summaries and recent rows without downloading the full attendance and fines tables.",
              steps: current.steps.map((step) => ({
                ...step,
                status: "done",
              })),
            }
          : current,
      );
    } catch (loadError) {
      if (!isCurrentRequest()) return;
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load dashboard.";
      setError(message);
      setLoadProgress((current) =>
        current ? { ...current, detail: `Loading stopped: ${message}` } : current,
      );
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        window.setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            setLoadProgress(null);
          }
        }, 1600);
      }
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Overview
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Monitor attendance imports, unpaid fines, paid records, and waived
              penalties by selected year in one responsive view.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SchoolYearBadge
              label={yearLabel}
              className="justify-center sm:w-auto"
            />
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

        {loadProgress ? (
          <div className="mb-6">
            <LoadingStatus
              title="Loading dashboard"
              detail={loadProgress.detail}
              progress={loadProgress.progress}
              steps={loadProgress.steps}
            />
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Attendance records"
            value={attendanceRecordCount}
            helper={`${yearLabel} saved entries`}
          />
          <StatCard
            label="Unpaid fines"
            value={fineSummary.unpaid}
            helper={`${yearLabel} needs settlement`}
          />
          <StatCard
            label="Paid fines"
            value={fineSummary.paid}
            helper={`${yearLabel} settled penalties`}
          />
          <StatCard
            label="Waived fines"
            value={fineSummary.waived}
            helper={`${yearLabel} approved waivers`}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Recent attendance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest saved attendance records for {yearLabel}.
            </p>

            <div className="mt-4 space-y-3 lg:hidden">
              {recentRecords.length ? (
                recentRecords.map((record) => (
                  <article
                    key={record.id}
                    className="min-w-0 rounded-2xl border bg-background p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="wrap-break-word font-black">{record.name}</p>
                        <p className="break-all text-sm text-muted-foreground">
                          {record.student_id}
                        </p>
                      </div>
                      <p className="text-sm font-bold">
                        {record.no_of_absences} absence/s
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDate(record.scanned_at ?? record.created_at)}
                    </p>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  {isLoading ? "Loading recent attendance..." : "No attendance records available."}
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
                        <td className="px-3 py-3 font-semibold">
                          {formatDate(record.scanned_at ?? record.created_at)}
                        </td>
                        <td className="max-w-40 break-all px-3 py-3">
                          {record.student_id}
                        </td>
                        <td className="max-w-56 wrap-break-word px-3 py-3">
                          {record.name}
                        </td>
                        <td className="px-3 py-3">{record.no_of_absences}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-sm font-semibold text-muted-foreground"
                      >
                        {isLoading ? "Loading recent attendance..." : "No attendance records available."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Recent imports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest attendance import batches for {yearLabel}.
            </p>

            <div className="mt-4 space-y-3">
              {recentImports.length ? (
                recentImports.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border bg-background p-4"
                  >
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
                    <p className="mt-3 text-xs font-semibold text-muted-foreground">
                      {formatDate(item.created_at)}
                    </p>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  {isLoading ? "Loading recent imports..." : "No imports available."}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
