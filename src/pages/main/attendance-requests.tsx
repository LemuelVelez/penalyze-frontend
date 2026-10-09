import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  listAttendanceRequests,
  removeAttendanceRequestEvent,
  reviewAttendanceRequest,
  reviewAttendanceRequestWithProgress,
} from "../../api/attendanceRequests";
import type {
  AttendanceRequest,
  AttendanceRequestReviewProgress,
  AttendanceRequestStatus,
  AttendanceRequestType,
} from "../../api/attendanceRequests";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearRecordLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { ActionMenu } from "../../components/action-menu";
import { LoadingStatus } from "../../components/loading-status";
import { SortSelect } from "../../components/sort-select";
import type { LoadingStatusStep } from "../../components/loading-status";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { sortByDate, useSortOrderSearchParam } from "../../lib/sort";

const ALL_STATUSES = "__all_statuses__";
const ALL_REQUEST_TYPES = "__all_request_types__";

type StatusFilter = AttendanceRequestStatus | typeof ALL_STATUSES;
type RequestTypeFilter = AttendanceRequestType | typeof ALL_REQUEST_TYPES;

type RequestsLoadProgress = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
};

type ReviewProgressState = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
  error?: string;
  done?: boolean;
};

const REVIEW_STEP_LABELS = [
  "Validate",
  "Resolve events",
  "Add attendance",
  "Recalculate absences",
  "Refresh results & fines",
  "Finalize",
  "Refresh list",
] as const;

function createReviewSteps(): LoadingStatusStep[] {
  return REVIEW_STEP_LABELS.map((label) => ({ label, status: "pending" }));
}

function getReviewStepIndex(
  stage: AttendanceRequestReviewProgress["stage"],
  requestType: AttendanceRequestType,
) {
  if (stage === "validating") return 0;
  if (stage === "resolving_events") return 1;
  if (stage === "adding_attendance") return 2;
  if (stage === "waiting_for_lock" || stage === "syncing_absences") return 3;
  if (
    stage === "refreshing_final_results" ||
    stage === "refreshing_calculations" ||
    stage === "refreshing_penalties"
  ) {
    return 4;
  }
  if (stage === "updating_records") {
    return requestType === "details_correction" ? 3 : 2;
  }
  return 5;
}

function buildReviewSteps(
  progress: AttendanceRequestReviewProgress,
  requestType: AttendanceRequestType,
): LoadingStatusStep[] {
  const activeIndex = getReviewStepIndex(progress.stage, requestType);
  return createReviewSteps().map((step, index) => {
    if (requestType === "details_correction" && (index === 1 || index === 2)) {
      return {
        ...step,
        status: activeIndex >= 3 ? "done" : index < activeIndex ? "done" : "pending",
        detail: activeIndex >= 3 ? "Not needed for a details correction" : undefined,
      };
    }
    if (index < activeIndex) return { ...step, status: "done" };
    if (index === activeIndex) {
      return { ...step, status: "loading", detail: progress.message };
    }
    return step;
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function matchesDateRange(
  value: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  if (!fromDate && !toDate) return true;
  if (!value) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const localDate = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");

  return (!fromDate || localDate >= fromDate) && (!toDate || localDate <= toDate);
}

function getStatusClassName(status: AttendanceRequestStatus) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-200";
}

function normalizeComparisonValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getCorrectionChanges(request: AttendanceRequest) {
  const fields = [
    ["Name", request.current_name, request.name],
    ["Year Level", request.current_year_level, request.year_level],
    ["College", request.current_college, request.college],
    ["Program", request.current_program, request.program],
  ] as const;

  return fields.filter(
    ([, currentValue, requestedValue]) =>
      normalizeComparisonValue(currentValue) !==
      normalizeComparisonValue(requestedValue),
  );
}

function correctionChangesCollege(request: AttendanceRequest) {
  return (
    request.request_type === "details_correction" &&
    normalizeComparisonValue(request.current_college) !==
      normalizeComparisonValue(request.college)
  );
}

export default function AttendanceRequestsPage() {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [requestTypeFilter, setRequestTypeFilter] =
    useState<RequestTypeFilter>(ALL_REQUEST_TYPES);
  const [schoolYearFilter, setSchoolYearFilter] = useState(
    ALL_SCHOOL_YEARS_VALUE,
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [sortOrder, setSortOrder] = useSortOrderSearchParam();
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pageLoadProgress, setPageLoadProgress] =
    useState<RequestsLoadProgress | null>(null);
  const loadRequestIdRef = useRef(0);
  const [reviewingId, setReviewingId] = useState("");
  const [removingEventId, setRemovingEventId] = useState("");
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    request: AttendanceRequest;
    status: "approved" | "rejected";
  } | null>(null);
  const [reviewProgress, setReviewProgress] =
    useState<ReviewProgressState | null>(null);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = studentSearch.trim().toLowerCase();

    const filtered = requests.filter((request) => {
      const matchesDate = matchesDateRange(request.created_at, fromDate, toDate);
      const matchesStudent =
        !normalizedSearch ||
        String(request.student_id ?? "").toLowerCase().includes(normalizedSearch) ||
        String(request.name ?? "").toLowerCase().includes(normalizedSearch);

      return matchesDate && matchesStudent;
    });

    return sortByDate(filtered, (request) => request.created_at, sortOrder);
  }, [requests, fromDate, toDate, studentSearch, sortOrder]);

  const requestsTotalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredRequests.length / Number(rowsPerPage)));
  }, [filteredRequests.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, requestTypeFilter, schoolYearFilter, fromDate, toDate, studentSearch, sortOrder, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, requestsTotalPages));
  }, [requestsTotalPages]);

  const paginatedRequests = useMemo(() => {
    if (rowsPerPage === "all") return filteredRequests;
    const pageSize = Number(rowsPerPage);
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRequests.slice(startIndex, startIndex + pageSize);
  }, [filteredRequests, currentPage, rowsPerPage]);

  const requestRangeStart = filteredRequests.length
    ? rowsPerPage === "all"
      ? 1
      : (currentPage - 1) * Number(rowsPerPage) + 1
    : 0;
  const requestRangeEnd = rowsPerPage === "all"
    ? filteredRequests.length
    : Math.min(currentPage * Number(rowsPerPage), filteredRequests.length);

  const pendingCount = useMemo(
    () => filteredRequests.filter((request) => request.status === "pending").length,
    [filteredRequests],
  );

  const loadRequests = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;

    setIsLoading(true);
    setPageLoadProgress({
      progress: 8,
      detail: "Loading request records and school-year labels in parallel.",
      steps: [
        { label: "Requests", status: "loading", detail: "Fetching filtered requests" },
        { label: "School years", status: "loading", detail: "Loading labels" },
      ],
    });

    const updateStep = (
      label: string,
      status: LoadingStatusStep["status"],
      detail: string,
      progress: number,
      overallDetail: string,
    ) => {
      if (!isCurrentRequest()) return;
      setPageLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: Math.max(current.progress, progress),
              detail: overallDetail,
              steps: current.steps.map((step) =>
                step.label === label ? { ...step, status, detail } : step,
              ),
            }
          : current,
      );
    };

    try {
      const requestPromise = listAttendanceRequests({
        status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
        requestType:
          requestTypeFilter === ALL_REQUEST_TYPES ? undefined : requestTypeFilter,
        schoolYearId:
          schoolYearFilter === ALL_SCHOOL_YEARS_VALUE
            ? undefined
            : schoolYearFilter,
      }).then((rows) => {
        if (!isCurrentRequest()) return rows;
        setRequests(rows);
        updateStep(
          "Requests",
          "done",
          `${rows.length.toLocaleString()} request/s ready`,
          72,
          "Attendance requests are visible. Finishing school-year labels.",
        );
        return rows;
      });

      const schoolYearPromise = listSchoolYears().then((rows) => {
        if (!isCurrentRequest()) return rows;
        setSchoolYears(rows);
        updateStep(
          "School years",
          "done",
          `${rows.length.toLocaleString()} school-year record/s ready`,
          82,
          "School-year labels are ready. Finalizing the request page.",
        );
        return rows;
      });

      await Promise.all([requestPromise, schoolYearPromise]);
      if (!isCurrentRequest()) return;
      setPageLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: "Ready. Request rows were shown as soon as they arrived.",
              steps: current.steps.map((step) => ({ ...step, status: "done" })),
            }
          : current,
      );
    } catch (error) {
      if (!isCurrentRequest()) return;
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load attendance requests.";
      setPageLoadProgress((current) =>
        current ? { ...current, detail: `Loading stopped: ${message}` } : current,
      );
      toast.error(message);
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        window.setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            setPageLoadProgress(null);
          }
        }, 1200);
      }
    }
  }, [requestTypeFilter, schoolYearFilter, statusFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleRemoveRequestEvent(
    request: AttendanceRequest,
    requestEventId: string,
  ) {
    setRemovingEventId(requestEventId);
    try {
      const updatedRequest = await removeAttendanceRequestEvent(
        request.id,
        requestEventId,
      );
      if (updatedRequest) {
        setRequests((current) =>
          current.map((item) =>
            item.id === request.id ? updatedRequest : item,
          ),
        );
      }
      toast.success("Event removed from request.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to remove event from attendance request.",
      );
    } finally {
      setRemovingEventId("");
    }
  }

  async function handleReview(
    request: AttendanceRequest,
    status: "approved" | "rejected",
  ) {
    setReviewingId(request.id);

    if (status === "approved") {
      setReviewProgress({
        progress: 2,
        detail: "Starting approval.",
        steps: createReviewSteps().map((step, index) =>
          index === 0 ? { ...step, status: "loading" } : step,
        ),
      });

      try {
        const result = await reviewAttendanceRequestWithProgress(
          request.id,
          {
            status,
            reviewNote: reviewNotes[request.id]?.trim() || undefined,
          },
          (progress) => {
            setReviewProgress({
              progress: Math.min(92, Math.max(2, progress.percent * 0.92)),
              detail: progress.message,
              steps: buildReviewSteps(progress, request.request_type),
            });
          },
        );

        setReviewProgress({
          progress: 94,
          detail: "Approval saved. Refreshing the request list.",
          steps: createReviewSteps().map((step, index) => ({
            ...step,
            status: index < 6 ? "done" : "loading",
            detail: index === 6 ? "Loading the updated request list" : undefined,
          })),
        });

        await loadRequests();

        setReviewProgress({
          progress: 100,
          detail: "Approval complete and the request list is up to date.",
          done: true,
          steps: createReviewSteps().map((step) => ({
            ...step,
            status: "done",
          })),
        });

        if (request.request_type === "details_correction") {
          toast.success(
            result?.updatedRowCount
              ? `Details correction approved. ${result.updatedRowCount} row/s updated.`
              : "Details correction approved.",
          );
        } else {
          toast.success(
            result?.createdAttendanceCount
              ? `Request approved. ${result.createdAttendanceCount} attendance record/s added.`
              : "Request approved. Existing attendance records were kept without duplicates.",
          );
        }

        setReviewNotes((current) => {
          const next = { ...current };
          delete next[request.id];
          return next;
        });

        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setReviewConfirmation(null);
        setReviewProgress(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to review attendance request.";
        setReviewProgress((current) => ({
          progress: current?.progress ?? 0,
          detail: message,
          steps: current?.steps ?? createReviewSteps(),
          error: message,
        }));
        toast.error(message);
      } finally {
        setReviewingId("");
      }
      return;
    }

    setReviewConfirmation(null);
    setReviewProgress(null);
    try {
      await reviewAttendanceRequest(request.id, {
        status,
        reviewNote: reviewNotes[request.id]?.trim() || undefined,
      });

      toast.success(
        request.request_type === "details_correction"
          ? "Details correction request rejected."
          : "Attendance request rejected.",
      );

      setReviewNotes((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      await loadRequests();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to review attendance request.",
      );
    } finally {
      setReviewingId("");
    }
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-400 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="page-heading space-y-2">
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Attendance verification
        </p>
        <h1 className="text-3xl font-black tracking-tight">
          Attendance Requests
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Review student-submitted attendance claims and details corrections. Open
          the evidence before approving or rejecting each request.
        </p>
      </header>

      {pageLoadProgress ? (
        <LoadingStatus
          title="Loading attendance requests"
          detail={pageLoadProgress.detail}
          progress={pageLoadProgress.progress}
          steps={pageLoadProgress.steps}
        />
      ) : null}

      <section className="grid min-w-0 gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Loaded requests
          </p>
          <p className="mt-1 text-3xl font-black">{filteredRequests.length}</p>
        </div>
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Pending in view
          </p>
          <p className="mt-1 text-3xl font-black">{pendingCount}</p>
        </div>
        <div className="flex items-end justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadRequests()}
            disabled={isLoading}
            className="min-h-11 w-full rounded-xl sm:w-auto"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:p-5">
        <div className="space-y-2">
          <label className="text-sm font-bold">Search student</label>
          <Input
            type="search"
            placeholder="Search student name or ID..."
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="min-h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">Sort by</label>
          <SortSelect
            value={sortOrder}
            onValueChange={setSortOrder}
            ariaLabel="Sort attendance requests"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">Status</label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="min-h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">Request type</label>
          <Select
            value={requestTypeFilter}
            onValueChange={(value) =>
              setRequestTypeFilter(value as RequestTypeFilter)
            }
          >
            <SelectTrigger className="min-h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_REQUEST_TYPES}>All</SelectItem>
              <SelectItem value="event_review">Event Review</SelectItem>
              <SelectItem value="details_correction">Details Correction</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">From date</label>
          <Input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
            className="min-h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">To date</label>
          <Input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
            className="min-h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold">School Year / Semester</label>
          <Select value={schoolYearFilter} onValueChange={setSchoolYearFilter}>
            <SelectTrigger className="min-h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL_SCHOOL_YEARS_VALUE}>
                All school years / semesters
              </SelectItem>
              {schoolYears.map((schoolYear) => (
                <SelectItem key={schoolYear.id} value={schoolYear.id}>
                  {getSchoolYearRecordLabel(schoolYear)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-3xl border bg-card p-8 text-center text-sm font-semibold text-muted-foreground">
          Loading attendance requests...
        </div>
      ) : filteredRequests.length ? (
        <section className="space-y-4">
          {paginatedRequests.map((request) => (
            <article
              key={request.id}
              className="min-w-0 space-y-5 rounded-3xl border bg-card p-5 shadow-sm [overflow-wrap:anywhere]"
            >
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {request.school_year_name} /{" "}
                    {request.semester === "second_semester"
                      ? "Second Semester"
                      : "First Semester"}
                  </p>
                  <h2 className="mt-1 break-words text-xl font-black [overflow-wrap:anywhere]">
                    {request.student_id} · {request.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Submitted {formatDate(request.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex w-fit rounded-full border bg-muted px-3 py-1 text-xs font-black uppercase text-muted-foreground">
                    {request.request_type === "details_correction"
                      ? "Details Correction"
                      : "Event Review"}
                  </span>
                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${getStatusClassName(request.status)}`}
                  >
                    {request.status}
                  </span>
                </div>
              </div>

              {request.request_type === "details_correction" ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    Current → requested
                  </h3>
                  <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                    {getCorrectionChanges(request).map(
                      ([label, currentValue, requestedValue]) => (
                        <div key={label} className="rounded-2xl border bg-background p-4">
                          <p className="text-xs font-bold uppercase text-muted-foreground">
                            {label}
                          </p>
                          <p className="mt-2 font-semibold">
                            {currentValue || "—"} → {requestedValue || "—"}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border bg-background p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Year Level
                    </p>
                    <p className="mt-1 font-semibold">{request.year_level || "—"}</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      College
                    </p>
                    <p className="mt-1 font-semibold">{request.college || "—"}</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Program
                    </p>
                    <p className="mt-1 font-semibold">{request.program || "—"}</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Institution
                    </p>
                    <p className="mt-1 font-semibold">{request.institution || "—"}</p>
                  </div>
                </div>
              )}

              {request.request_note ? (
                <div className="rounded-2xl border bg-background p-4 text-sm leading-6">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Student note
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{request.request_note}</p>
                </div>
              ) : null}

              {request.request_type === "details_correction" ? null : (
                <div className="space-y-3">
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    Claimed events and evidence
                  </h3>
                  {request.events.map((event) => {
                    const isRemovingThisEvent = removingEventId === event.id;
                    const isLastEvent = request.events.length === 1;
                    const removeDisabled =
                      isLastEvent ||
                      Boolean(removingEventId) ||
                      reviewingId === request.id;

                    return (
                      <div
                        key={event.id}
                        className="flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-black">{event.event_name}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {event.evidence_url}
                          </p>
                        </div>
                        <div className="shrink-0 space-y-1 text-right">
                          <ActionMenu
                            ariaLabel={`Actions for ${event.event_name}`}
                            actions={[
                              {
                                label: (
                                  <span className="font-black text-sky-700 dark:text-sky-300">
                                    Open Evidence
                                  </span>
                                ),
                                disabled: isRemovingThisEvent || !event.evidence_url,
                                onSelect: () => {
                                  if (!event.evidence_url) return;
                                  window.open(
                                    event.evidence_url,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                },
                              },
                            ]}
                            deleteAction={
                              request.status === "pending"
                                ? {
                                    label: isRemovingThisEvent ? "Removing..." : "Remove",
                                    disabled: removeDisabled,
                                    title: `Remove "${event.event_name}" from ${request.name}'s request?`,
                                    description:
                                      "This event will not be credited if the request is approved. The student will no longer see it on their request. This cannot be undone.",
                                    confirmationPhrase: "REMOVE",
                                    confirmLabel: "Remove Event",
                                    pendingLabel: "Removing...",
                                    isPending: isRemovingThisEvent,
                                    confirmDisabled:
                                      removeDisabled && !isRemovingThisEvent,
                                    onConfirm: () =>
                                      handleRemoveRequestEvent(request, event.id),
                                  }
                                : undefined
                            }
                          />
                          {request.status === "pending" && isLastEvent ? (
                            <p className="max-w-56 text-xs font-semibold text-muted-foreground">
                              A request needs at least one event. Reject the request instead.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {request.status === "pending" ? (
                <div className="space-y-3 rounded-2xl border bg-background p-4">
                  <label className="block space-y-2 text-sm font-bold">
                    <span>Note to student (optional, visible to the student)</span>
                    <p className="text-xs font-semibold text-muted-foreground">
                      The student sees this note when they search their Student ID.
                    </p>
                    {request.request_type === "event_review" ? (
                      <p className="text-xs font-semibold text-muted-foreground">
                        If you removed any events, consider explaining why here.
                      </p>
                    ) : null}
                    <Textarea
                      value={reviewNotes[request.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="Add a reason, verification note, or instruction for this request."
                      className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                    />
                  </label>
                  <div className="flex justify-end">
                    <ActionMenu
                      ariaLabel={`Review actions for ${request.name}`}
                      actions={[
                        {
                          label:
                            reviewingId === request.id ? (
                              "Saving..."
                            ) : (
                              <span className="font-black text-red-600 dark:text-red-400">
                                Reject
                              </span>
                            ),
                          disabled:
                            Boolean(reviewingId) ||
                            (request.request_type === "event_review" &&
                              request.events.some(
                                (event) => event.id === removingEventId,
                              )),
                          onSelect: () =>
                            setReviewConfirmation({
                              request,
                              status: "rejected",
                            }),
                        },
                        {
                          label:
                            reviewingId === request.id ? (
                              "Saving..."
                            ) : (
                              <span className="font-black text-emerald-700 dark:text-emerald-400">
                                {request.request_type === "details_correction"
                                  ? "Approve Correction"
                                  : "Approve & Add Attendance"}
                              </span>
                            ),
                          disabled:
                            Boolean(reviewingId) ||
                            (request.request_type === "event_review" &&
                              request.events.some(
                                (event) => event.id === removingEventId,
                              )),
                          onSelect: () =>
                            setReviewConfirmation({
                              request,
                              status: "approved",
                            }),
                        },
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border bg-background p-4 text-sm">
                  <p className="font-bold">
                    Reviewed by {request.reviewed_by_name || "authenticated user"}
                    {request.reviewed_at
                      ? ` on ${formatDate(request.reviewed_at)}`
                      : ""}
                  </p>
                  {request.review_note ? (
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {request.review_note}
                    </p>
                  ) : null}
                </div>
              )}
            </article>
          ))}

          <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Showing {requestRangeStart.toLocaleString()}–{requestRangeEnd.toLocaleString()} of {filteredRequests.length.toLocaleString()} request/s
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Show</span>
              <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                <SelectTrigger className="h-10 w-28 rounded-xl bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 rows</SelectItem>
                  <SelectItem value="50">50 rows</SelectItem>
                  <SelectItem value="100">100 rows</SelectItem>
                  <SelectItem value="all">All rows</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" disabled={currentPage <= 1 || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="h-10 rounded-xl px-4 text-xs font-black">Previous</Button>
              <span className="min-w-20 text-center text-xs font-black text-muted-foreground">Page {currentPage} of {requestsTotalPages}</span>
              <Button type="button" variant="outline" disabled={currentPage >= requestsTotalPages || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.min(requestsTotalPages, page + 1))} className="h-10 rounded-xl px-4 text-xs font-black">Next</Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-3xl border border-dashed bg-card p-8 text-center text-sm font-semibold text-muted-foreground">
          No attendance requests match the selected filters.
        </div>
      )}

      <AlertDialog
        open={Boolean(reviewConfirmation)}
        onOpenChange={(open) => {
          if (!open && !reviewingId) {
            setReviewConfirmation(null);
            setReviewProgress(null);
          }
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (reviewingId) event.preventDefault();
          }}
        >
          {reviewProgress ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {reviewProgress.error
                    ? "Approval failed"
                    : reviewProgress.done
                      ? "Approval complete"
                      : reviewConfirmation?.request.request_type === "details_correction"
                        ? "Approving details correction"
                        : "Approving attendance request"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {reviewProgress.error
                    ? "The request was not approved. Review the message below."
                    : "Progress is reported by the server as each real approval step runs."}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <LoadingStatus
                title={reviewProgress.done ? "Done" : "Processing approval"}
                detail={reviewProgress.detail}
                progress={reviewProgress.progress}
                steps={reviewProgress.steps}
              />

              {reviewProgress.error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {reviewProgress.error}
                </div>
              ) : null}

              <AlertDialogFooter>
                {reviewProgress.error ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setReviewConfirmation(null);
                      setReviewProgress(null);
                    }}
                  >
                    Close
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" disabled>
                      Cancel
                    </Button>
                    <Button type="button" disabled>
                      {reviewProgress.done ? "Completed" : "Approving..."}
                    </Button>
                  </>
                )}
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {reviewConfirmation?.status === "approved"
                    ? reviewConfirmation.request.request_type === "details_correction"
                      ? "Approve details correction?"
                      : "Approve attendance request?"
                    : reviewConfirmation?.request.request_type === "details_correction"
                      ? "Reject details correction?"
                      : "Reject attendance request?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {reviewConfirmation?.status === "approved" ? (
                    reviewConfirmation.request.request_type === "details_correction" ? (
                      correctionChangesCollege(reviewConfirmation.request) ? (
                        <>
                          This will apply the requested student details. Changing the
                          college will also recalculate this student's absences and fines.
                        </>
                      ) : (
                        "This will apply the requested student detail changes."
                      )
                    ) : (
                      "This will approve the request and add the verified attendance records."
                    )
                  ) : (
                    "This will reject the request. The student will see the review note, if provided."
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={Boolean(reviewingId)}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  type="button"
                  disabled={Boolean(reviewingId)}
                  className={
                    reviewConfirmation?.status === "rejected"
                      ? "!bg-red-600 !text-white hover:!bg-red-700"
                      : "!bg-emerald-600 !text-white hover:!bg-emerald-700"
                  }
                  onClick={() => {
                    const confirmation = reviewConfirmation;
                    if (confirmation) {
                      void handleReview(confirmation.request, confirmation.status);
                    }
                  }}
                >
                  {reviewConfirmation?.status === "approved"
                    ? reviewConfirmation.request.request_type === "details_correction"
                      ? "Approve Correction"
                      : "Approve Attendance"
                    : "Reject Request"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
