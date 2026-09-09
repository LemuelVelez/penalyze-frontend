import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  listAttendanceRequests,
  reviewAttendanceRequest,
} from "../../api/attendanceRequests";
import type {
  AttendanceRequest,
  AttendanceRequestStatus,
} from "../../api/attendanceRequests";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearRecordLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const ALL_STATUSES = "__all_statuses__";

type StatusFilter = AttendanceRequestStatus | typeof ALL_STATUSES;

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
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function AttendanceRequestsPage() {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [schoolYearFilter, setSchoolYearFilter] = useState(
    ALL_SCHOOL_YEARS_VALUE,
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState("");

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) =>
        matchesDateRange(request.created_at, fromDate, toDate),
      ),
    [requests, fromDate, toDate],
  );

  const pendingCount = useMemo(
    () => filteredRequests.filter((request) => request.status === "pending").length,
    [filteredRequests],
  );

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const [requestRows, schoolYearRows] = await Promise.all([
        listAttendanceRequests({
          status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
          schoolYearId:
            schoolYearFilter === ALL_SCHOOL_YEARS_VALUE
              ? undefined
              : schoolYearFilter,
        }),
        listSchoolYears(),
      ]);
      setRequests(requestRows);
      setSchoolYears(schoolYearRows);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load attendance requests.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [schoolYearFilter, statusFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleReview(
    request: AttendanceRequest,
    status: "approved" | "rejected",
  ) {
    setReviewingId(request.id);
    try {
      const result = await reviewAttendanceRequest(request.id, {
        status,
        reviewNote: reviewNotes[request.id]?.trim() || undefined,
      });

      if (status === "approved") {
        toast.success(
          result?.createdAttendanceCount
            ? `Request approved. ${result.createdAttendanceCount} attendance record/s added.`
            : "Request approved. Existing attendance records were kept without duplicates.",
        );
      } else {
        toast.success("Attendance request rejected.");
      }

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
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Attendance verification
        </p>
        <h1 className="text-3xl font-black tracking-tight">
          Attendance Requests
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Review student-submitted event attendance claims and open each evidence
          link before approving or rejecting the request. Approval adds manual
          attendance only for events that do not already have an attendance
          record for the student.
        </p>
      </header>

      <section className="grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-3 sm:p-5">
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

      <section className="grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
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
          {filteredRequests.map((request) => (
            <article
              key={request.id}
              className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {request.school_year_name} /{" "}
                    {request.semester === "second_semester"
                      ? "Second Semester"
                      : "First Semester"}
                  </p>
                  <h2 className="mt-1 text-xl font-black">
                    {request.student_id} · {request.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Submitted {formatDate(request.created_at)}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${getStatusClassName(request.status)}`}
                >
                  {request.status}
                </span>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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

              {request.request_note ? (
                <div className="rounded-2xl border bg-background p-4 text-sm leading-6">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Student note
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{request.request_note}</p>
                </div>
              ) : null}

              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wide">
                  Claimed events and evidence
                </h3>
                {request.events.map((event) => (
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
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      className="min-h-10 shrink-0 rounded-xl"
                    >
                      <a
                        href={event.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Evidence
                      </a>
                    </Button>
                  </div>
                ))}
              </div>

              {request.status === "pending" ? (
                <div className="space-y-3 rounded-2xl border bg-background p-4">
                  <label className="block space-y-2 text-sm font-bold">
                    <span>Reviewer note (optional)</span>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={reviewingId === request.id}
                      onClick={() => void handleReview(request, "rejected")}
                      className="min-h-11 rounded-xl px-5"
                    >
                      {reviewingId === request.id ? "Saving..." : "Reject"}
                    </Button>
                    <Button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => void handleReview(request, "approved")}
                      className="min-h-11 rounded-xl px-5"
                    >
                      {reviewingId === request.id
                        ? "Saving..."
                        : "Approve & Add Attendance"}
                    </Button>
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
        </section>
      ) : (
        <div className="rounded-3xl border border-dashed bg-card p-8 text-center text-sm font-semibold text-muted-foreground">
          No attendance requests match the selected filters.
        </div>
      )}
    </main>
  );
}
