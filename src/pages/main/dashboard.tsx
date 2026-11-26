import { isDatabaseBusy } from "../../api/http";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import {
  getAttendanceDashboardOverview,
} from "../../api/attendance";
import type {
  AttendanceDashboardOverview,
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
import { navigateTo } from "../../components/layout";
import { BACKGROUND_CARD } from "../../lib/backgrounds";
import { Button } from "../../components/ui/button";

const AttendanceTrendChart = lazy(() =>
  import("../../components/dashboard-charts").then((module) => ({
    default: module.AttendanceTrendChart,
  })),
);

const RecentImportsQualityChart = lazy(() =>
  import("../../components/dashboard-charts").then((module) => ({
    default: module.RecentImportsQualityChart,
  })),
);

const AttendanceByCollegeChart = lazy(() =>
  import("../../components/dashboard-charts").then((module) => ({
    default: module.AttendanceByCollegeChart,
  })),
);

function ChartSuspenseFallback({ heightClass = "h-72" }: { heightClass?: string }) {
  return <div className={`${heightClass} animate-pulse rounded-2xl bg-muted`} />;
}

type DashboardLoadProgress = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
};

type AttendanceSection = NonNullable<AttendanceDashboardOverview["failedSections"]>[number];
type AttendanceSectionStatus = "pending" | "ready" | "unavailable" | "stale";
const EMPTY_ATTENDANCE_STATUS: Record<AttendanceSection, AttendanceSectionStatus> = {
  summary: "pending",
  recentRecords: "pending",
  recentImports: "pending",
};
const ATTENDANCE_SECTIONS: AttendanceSection[] = ["summary", "recentRecords", "recentImports"];

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
  image: string;
}) {
  return (
    <article className="relative isolate min-w-0 max-w-full overflow-hidden rounded-3xl border bg-card/30 p-5 shadow-sm dark:bg-card/30">
      <img
        src={props.image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-100 saturate-105"
      />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-card/88 via-card/65 to-card/22 dark:from-card/90 dark:via-card/70 dark:to-card/26" />
      <p className="text-sm font-bold text-muted-foreground">{props.label}</p>
      <p className="mt-3 text-3xl font-black">{props.value}</p>
      <p className="mt-2 max-w-full break-words text-xs font-semibold text-muted-foreground sm:max-w-[85%]">
        {props.helper}
      </p>
    </article>
  );
}

function SchoolYearBadge(props: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] min-h-11 items-center rounded-xl border bg-background px-4 text-sm font-black ${props.className ?? ""}`}
    >
      {props.label}
    </span>
  );
}

export default function DashboardPage() {
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [recentImports, setRecentImports] = useState<AttendanceImportRecord[]>([]);
  const [attendanceRecordCount, setAttendanceRecordCount] = useState<number | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState(EMPTY_ATTENDANCE_STATUS);
  const attendanceYearRef = useRef<string | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<
    Array<{ date: string; count: number }>
  >([]);
  const [attendanceByCollege, setAttendanceByCollege] = useState<
    Array<{ college: string; count: number }>
  >([]);
  const [fineSummary, setFineSummary] = useState<FineSummary>({ total: 0 });
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [yearFilter, setYearFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<DashboardLoadProgress | null>(
    null,
  );
  const [error, setError] = useState("");
  const [databaseBusy,setDatabaseBusy] = useState(false);
  const loadRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  function updateAttendanceStatus(failedSections: AttendanceSection[]) {
    setAttendanceStatus((current) => {
      const next = { ...current };
      for (const section of ATTENDANCE_SECTIONS) {
        next[section] = failedSections.includes(section)
          ? current[section] === "ready" || current[section] === "stale"
            ? "stale"
            : "unavailable"
          : "ready";
      }
      return next;
    });
  }

  async function loadDashboard() {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort(new DOMException("The attendance summary took too long to load.", "TimeoutError")),
      45000,
    );

    setIsLoading(true);
    setError("");
    setDatabaseBusy(false);
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

      if (attendanceYearRef.current !== activeSchoolYearId) {
        attendanceYearRef.current = activeSchoolYearId;
        setRecentRecords([]);
        setRecentImports([]);
        setAttendanceRecordCount(null);
        setAttendanceTrend([]);
        setAttendanceByCollege([]);
        setAttendanceStatus(EMPTY_ATTENDANCE_STATUS);
      }
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
        updateAttendanceStatus([]);
        setAttendanceTrend([]);
        setAttendanceByCollege([]);
        setFineSummary({ total: 0 });
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
        "Counting fine records",
        32,
        "Attendance summary and fine totals are loading in parallel.",
      );

      const attendancePromise = getAttendanceDashboardOverview({
        schoolYearId: activeSchoolYearId,
        signal: controller.signal,
      }).then((overview) => {
        if (!isCurrentRequest()) return overview;
        const failedSections = overview.failedSections;
        updateAttendanceStatus(failedSections);
        if (!failedSections.includes("summary")) {
          setAttendanceRecordCount(overview.attendanceRecordCount);
          setAttendanceTrend(overview.attendanceTrend);
          setAttendanceByCollege(overview.attendanceByCollege);
        }
        if (!failedSections.includes("recentRecords")) {
          setRecentRecords(overview.recentAttendanceRecords);
        }
        if (!failedSections.includes("recentImports")) {
          setRecentImports(overview.recentImports);
        }
        if (overview.partial) {
          setDatabaseBusy(true);
          updateLoadStep(
            "Attendance",
            "error",
            `Unavailable: ${failedSections.map((section) => ({ summary: "count and charts", recentRecords: "recent attendance", recentImports: "recent imports" })[section]).join(", ")}. Retry to load missing data.`,
            76,
            "Attendance loaded partially. Finishing the remaining dashboard totals.",
          );
        } else {
          updateLoadStep(
            "Attendance",
            "done",
            `${overview.attendanceRecordCount.toLocaleString()} total record/s; recent rows ready`,
            76,
            "Attendance summary is visible. Finishing the remaining dashboard totals.",
          );
        }
        return overview;
      });

      const finesPromise = getFineSummary(activeSchoolYearId).then((summary) => {
        if (!isCurrentRequest()) return summary;
        setFineSummary(summary);
        updateLoadStep(
          "Fine totals",
          "done",
          `${summary.total.toLocaleString()} fine record/s counted`,
          86,
          "Fine totals are ready. Finalizing the dashboard.",
        );
        return summary;
      });

      const [attendanceResult, finesResult] = await Promise.allSettled([attendancePromise, finesPromise]);
      if (!isCurrentRequest()) return;

      function handleSectionError(label: string, detail: string, reason: unknown) {
        const name = reason instanceof Error || reason instanceof DOMException ? reason.name : "";
        const message = reason instanceof Error || reason instanceof DOMException
          ? reason.message
          : "Unable to load dashboard.";
        if (
          isDatabaseBusy(reason) ||
          (controller.signal.aborted &&
            controller.signal.reason instanceof DOMException &&
            controller.signal.reason.name === "TimeoutError" &&
            (name === "TimeoutError" || name === "AbortError"))
        ) {
          setDatabaseBusy(true);
        } else {
          setError(message);
        }
        updateLoadStep(label, "error", detail, 100, "Loaded with some sections unavailable. Use Retry to try again.");
      }

      if (attendanceResult.status === "rejected") {
        updateAttendanceStatus(ATTENDANCE_SECTIONS);
        handleSectionError("Attendance", "Attendance summary unavailable — Retry", attendanceResult.reason);
      }
      if (finesResult.status === "rejected") {
        handleSectionError("Fine totals", "Fine totals unavailable — Retry", finesResult.reason);
      }

      setLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: current.steps.some((step) => step.status === "error")
                ? "Loaded with some sections unavailable. Use Retry to try again."
                : "Ready.",
              steps: current.steps.map((step) => ({
                ...step,
                status: step.status === "error" ? "error" : "done",
              })),
            }
          : current,
      );
    } catch (loadError) {
      if (!isCurrentRequest()) return;
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load dashboard.";
      updateAttendanceStatus(ATTENDANCE_SECTIONS);
      if(isDatabaseBusy(loadError)) setDatabaseBusy(true);
      else setError(message);
      setLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: `Loading stopped: ${message}`,
              steps: current.steps.map((step) => ({
                ...step,
                status: step.status === "loading" ? "error" : step.status,
                detail: step.status === "loading" ? message : step.detail,
              })),
            }
          : current,
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (isCurrentRequest()) {
        setIsLoading(false);
        window.setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            setLoadProgress((current) =>
              current?.steps.some((step) => step.status === "error") ? current : null,
            );
          }
        }, 1600);
      }
    }
  }

  useEffect(() => {
    void loadDashboard();
    return () => {
      loadRequestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  return (
    <main className="min-h-svh w-full min-w-0 max-w-full px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full min-w-0 max-w-400">
        <div className="page-heading mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Overview
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Monitor attendance imports and fine records by selected year in one responsive view.
            </p>
          </div>
          <div className="flex min-w-0 flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
            <SchoolYearBadge
              label={yearLabel}
              className="justify-center sm:w-auto"
            />
            <Button
              type="button"
              variant="outline"
              onClick={loadDashboard}
              disabled={isLoading}
              className="min-h-11 w-full rounded-xl px-5 py-2 text-sm font-black sm:w-auto"
            >
              {isLoading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        {databaseBusy && <aside role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3 text-sm">The database is busy. Previously loaded dashboard data is retained. <Button variant="outline" disabled={isLoading} onClick={()=>void loadDashboard()}>Retry</Button></aside>}
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {loadProgress ? (
          <div className="mb-6">
            <LoadingStatus
              title={isLoading ? "Loading dashboard" : "Dashboard load status"}
              detail={loadProgress.detail}
              progress={loadProgress.progress}
              steps={loadProgress.steps}
            />
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <StatCard
            label="Attendance records"
            value={attendanceRecordCount ?? "—"}
            helper={attendanceStatus.summary === "unavailable"
              ? "Attendance count unavailable — Retry"
              : attendanceStatus.summary === "stale"
                ? `${yearLabel} saved entries · last loaded count`
                : attendanceRecordCount === null
                  ? "Loading attendance count..."
                  : `${yearLabel} saved entries`}
            image={BACKGROUND_CARD.dashboardAttendance}
          />
          <StatCard
            label="Fine records"
            value={fineSummary.total}
            helper={`${yearLabel} saved fine records`}
            image={BACKGROUND_CARD.dashboardFines}
          />
        </section>

        <section className="mt-6 grid gap-6">
          <article className="rounded-3xl border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-6">
            <h2 className="text-xl font-black">Attendance trend</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Attendance records from the last 14 days for {yearLabel}.{attendanceStatus.summary === "stale" ? " Showing last loaded data." : ""}
            </p>
            <div className="mt-4">
              {attendanceStatus.summary === "unavailable" ? (
                <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Attendance trend unavailable — Retry.</p>
              ) : (
                <Suspense fallback={<ChartSuspenseFallback />}>
                  <AttendanceTrendChart data={attendanceTrend} isLoading={isLoading && attendanceStatus.summary === "pending"} />
                </Suspense>
              )}
            </div>
          </article>

        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <article className="flex h-full flex-col rounded-3xl border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-6 lg:col-span-2">
            <h2 className="text-xl font-black">Recent attendance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest saved attendance records for {yearLabel}.{attendanceStatus.recentRecords === "stale" ? " Showing last loaded data." : ""}
            </p>

            <div className="flex-1">
              <div className="mt-4 space-y-3 lg:hidden">
                {recentRecords.length ? (
                  recentRecords.map((record) => (
                    <article
                      key={record.id}
                      className="min-w-0 rounded-2xl border bg-background p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="break-words font-black">{record.name}</p>
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
                    {attendanceStatus.recentRecords === "unavailable"
                      ? "Recent attendance unavailable — Retry."
                      : isLoading && attendanceStatus.recentRecords === "pending"
                        ? "Loading recent attendance..."
                        : "No attendance records available."}
                  </div>
                )}
              </div>

              <div className="mt-4 hidden min-w-0 max-w-full overflow-x-auto lg:block">
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
                          <td className="max-w-56 break-words px-3 py-3">
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
                          {attendanceStatus.recentRecords === "unavailable"
                            ? "Recent attendance unavailable — Retry."
                            : isLoading && attendanceStatus.recentRecords === "pending"
                              ? "Loading recent attendance..."
                              : "No attendance records available."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigateTo("/attendance")}
              className="mt-auto self-start pt-4 text-sm font-black text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              View all attendance
            </button>
          </article>

          <article className="flex h-full flex-col rounded-3xl border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-6">
            <h2 className="text-xl font-black">Recent imports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest attendance import batches for {yearLabel}.{attendanceStatus.recentImports === "stale" ? " Showing last loaded data." : ""}
            </p>

            <div className="mt-4">
              {attendanceStatus.recentImports !== "unavailable" && (
                <Suspense fallback={<ChartSuspenseFallback heightClass="h-40" />}>
                  <RecentImportsQualityChart data={recentImports} isLoading={isLoading && attendanceStatus.recentImports === "pending"} />
                </Suspense>
              )}
            </div>

            <div className="mt-4 flex-1 space-y-2">
              {recentImports.length ? (
                recentImports.map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 max-w-full rounded-xl border bg-background px-2.5 py-2"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
                      <p
                        className="w-full min-w-0 flex-none truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] text-xs font-black sm:w-auto sm:flex-1"
                        title={item.file_name}
                      >
                        {item.file_name}
                      </p>
                      <p className="mr-auto shrink-0 text-[10px] font-semibold text-muted-foreground sm:mr-0">
                        {formatDate(item.created_at)}
                      </p>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        Total <strong className="text-foreground">{item.rows_total}</strong>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        Valid <strong className="text-foreground">{item.rows_valid}</strong>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        Invalid <strong className="text-foreground">{item.rows_invalid}</strong>
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  {isLoading ? "Loading recent imports..." : "No imports available."}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigateTo("/attendance")}
              className="mt-auto self-start pt-4 text-sm font-black text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              View all imports
            </button>
          </article>
        </section>

        <section className="mt-6">
          <article className="rounded-3xl border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-6">
            <h2 className="text-xl font-black">Attendance by college</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Top colleges by visible attendance records for {yearLabel}.{attendanceStatus.summary === "stale" ? " Showing last loaded data." : ""}
            </p>
            <div className="mt-4">
              <Suspense fallback={<ChartSuspenseFallback />}>
                <AttendanceByCollegeChart
                  data={attendanceByCollege}
                  isLoading={isLoading}
                />
              </Suspense>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
