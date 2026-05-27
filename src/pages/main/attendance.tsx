import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  getAcceptedAttendanceFileTypes,
  listAttendanceEvents,
  listAttendanceFinalResults,
  listAttendanceImports,
  refreshAttendanceFinalResults,
  saveAttendanceFile,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceFinalResultRecord,
  AttendanceImportProgress,
  AttendanceImportRecord,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;

type UploadFormState = {
  schoolYearId: string;
  eventOrder: string;
  eventName: string;
  eventStartAt: string;
  eventEndAt: string;
};

const emptyUploadForm: UploadFormState = {
  schoolYearId: "",
  eventOrder: "",
  eventName: "",
  eventStartAt: "",
  eventEndAt: "",
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

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString() : "0";
}

function getResultBadgeClassName(absences: number) {
  if (absences <= 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (absences >= 10) return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function getResultLabel(result: AttendanceFinalResultRecord) {
  if (result.total_absences <= 0) return "Perfect attendance";
  return `${result.total_absences} absence${result.total_absences === 1 ? "" : "s"}`;
}

function normalizeEventIdentity(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function getPositiveIntegerValue(value: unknown) {
  const numericValue = Number(value ?? 0);

  if (!Number.isInteger(numericValue) || numericValue <= 0) return null;

  return numericValue;
}

function getTimestamp(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getAttendanceEventOrder(event?: AttendanceEvent | null) {
  if (!event) return null;

  const eventData = event as Record<string, unknown>;

  return getPositiveIntegerValue(
    eventData.event_order ?? eventData.eventOrder ?? eventData.order,
  );
}

function getAttendanceEventDateTimestamp(event?: AttendanceEvent | null) {
  return getTimestamp(event?.event_start_at ?? event?.event_end_at ?? null);
}

function compareAttendanceEventsByOrder(
  leftEvent: AttendanceEvent,
  rightEvent: AttendanceEvent,
) {
  const leftOrder = getAttendanceEventOrder(leftEvent);
  const rightOrder = getAttendanceEventOrder(rightEvent);

  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  const dateDifference =
    getAttendanceEventDateTimestamp(leftEvent) -
    getAttendanceEventDateTimestamp(rightEvent);
  if (dateDifference !== 0) return dateDifference;

  return String(leftEvent.name ?? "").localeCompare(
    String(rightEvent.name ?? ""),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

function sortAttendanceEventsByOrder(events: AttendanceEvent[]) {
  return [...events].sort(compareAttendanceEventsByOrder);
}

function buildAttendanceEventLookup(events: AttendanceEvent[]) {
  const eventsById = new Map<string, AttendanceEvent>();
  const eventsByName = new Map<string, AttendanceEvent>();

  events.forEach((event) => {
    const eventId = String(event.id ?? "").trim();
    const eventName = normalizeEventIdentity(event.name);

    if (eventId) eventsById.set(eventId, event);
    if (eventName) eventsByName.set(eventName, event);
  });

  return { eventsById, eventsByName };
}

function getAttendanceImportEventId(importRecord: AttendanceImportRecord) {
  const importData = importRecord as Record<string, unknown>;

  return String(
    importData.event_id ?? importData.attendance_event_id ?? "",
  ).trim();
}

function getAttendanceImportEventName(importRecord: AttendanceImportRecord) {
  return String(importRecord.event_name ?? "").trim();
}

function getAttendanceImportOrder(
  importRecord: AttendanceImportRecord,
  lookup: ReturnType<typeof buildAttendanceEventLookup>,
) {
  const importData = importRecord as Record<string, unknown>;
  const linkedEvent =
    lookup.eventsById.get(getAttendanceImportEventId(importRecord)) ??
    lookup.eventsByName.get(normalizeEventIdentity(getAttendanceImportEventName(importRecord))) ??
    null;

  return (
    getAttendanceEventOrder(linkedEvent) ??
    getPositiveIntegerValue(
      importData.event_order ??
        importData.eventOrder ??
        importData.attendance_event_order ??
        importData.attendanceEventOrder,
    )
  );
}

function compareAttendanceImportsByEventOrder(
  leftImport: AttendanceImportRecord,
  rightImport: AttendanceImportRecord,
  lookup: ReturnType<typeof buildAttendanceEventLookup>,
) {
  const leftOrder = getAttendanceImportOrder(leftImport, lookup);
  const rightOrder = getAttendanceImportOrder(rightImport, lookup);

  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  const leftEventName = getAttendanceImportEventName(leftImport);
  const rightEventName = getAttendanceImportEventName(rightImport);
  const eventNameDifference = leftEventName.localeCompare(
    rightEventName,
    undefined,
    { numeric: true, sensitivity: "base" },
  );

  if (eventNameDifference !== 0) return eventNameDifference;

  return getTimestamp(rightImport.created_at) - getTimestamp(leftImport.created_at);
}

function sortAttendanceImportsByEventOrder(
  imports: AttendanceImportRecord[],
  events: AttendanceEvent[],
) {
  const lookup = buildAttendanceEventLookup(events);

  return [...imports].sort((leftImport, rightImport) =>
    compareAttendanceImportsByEventOrder(leftImport, rightImport, lookup),
  );
}

export default function AttendancePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [collegeFilter, setCollegeFilter] = useState("__all_colleges__");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadForm, setUploadForm] =
    useState<UploadFormState>(emptyUploadForm);
  const [file, setFile] = useState<File | null>(null);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>([]);
  const [finalResults, setFinalResults] = useState<
    AttendanceFinalResultRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<AttendanceImportProgress | null>(
    null,
  );
  const acceptedFileTypes = getAcceptedAttendanceFileTypes();

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const collegeOptions = useMemo(() => {
    const colleges = finalResults
      .map((row) => String(row.college ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [finalResults]);

  const displayedFinalResults = useMemo(() => {
    if (collegeFilter === "__all_colleges__") return finalResults;

    return finalResults.filter(
      (row) => String(row.college ?? "").trim() === collegeFilter,
    );
  }, [finalResults, collegeFilter]);

  const displayedImports = useMemo(() => {
    return sortAttendanceImportsByEventOrder(imports, attendanceEvents);
  }, [imports, attendanceEvents]);

  const summary = useMemo(() => {
    const totalStudents = displayedFinalResults.length;
    const studentsWithAbsences = displayedFinalResults.filter(
      (row) => row.total_absences > 0,
    ).length;
    const totalAbsences = displayedFinalResults.reduce(
      (total, row) => total + Number(row.total_absences || 0),
      0,
    );
    const perfectAttendance = totalStudents - studentsWithAbsences;

    return {
      totalStudents,
      studentsWithAbsences,
      totalAbsences,
      perfectAttendance,
    };
  }, [displayedFinalResults]);

  async function loadPageData(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const schoolYearRows = await listSchoolYears({ activeOnly: true });
      const activeSchoolYearId = getActiveSchoolYearId(schoolYearRows);
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        nextSchoolYearId !== ALL_YEARS_VALUE &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : activeSchoolYearId;
      const [eventRows, importRows, resultRows] = fallbackSchoolYearId
        ? await Promise.all([
            listAttendanceEvents({
              schoolYearId: fallbackSchoolYearId,
              limit: 500,
              offset: 0,
            }),
            listAttendanceImports({
              schoolYearId: fallbackSchoolYearId,
              limit: 50,
              offset: 0,
            }),
            listAttendanceFinalResults({
              schoolYearId: fallbackSchoolYearId,
              limit: 500,
              offset: 0,
            }),
          ])
        : [[], [], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId || ALL_YEARS_VALUE);
      setAttendanceEvents(sortAttendanceEventsByOrder(eventRows));
      setImports(importRows);
      setFinalResults(resultRows);
      setUploadForm((current) => ({
        ...current,
        schoolYearId:
          current.schoolYearId &&
          schoolYearRows.some((schoolYear) => schoolYear.id === current.schoolYearId)
            ? current.schoolYearId
            : activeSchoolYearId,
      }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load attendance records.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    await loadPageData(value);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleUploadFieldChange(
    field: keyof UploadFormState,
    value: string,
  ) {
    setUploadForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      toast.error("Please choose an attendance file first.");
      return;
    }

    if (!uploadForm.eventName.trim()) {
      toast.error("Please enter the event name for this uploaded file.");
      return;
    }

    if (uploadForm.eventOrder) {
      const eventOrder = Number(uploadForm.eventOrder);

      if (!Number.isInteger(eventOrder) || eventOrder < 1) {
        toast.error("Event order must be a positive whole number.");
        return;
      }
    }

    setIsSaving(true);
    setProgress({
      stage: "preparing",
      percent: 1,
      message: "Preparing attendance import...",
      processedRows: 0,
      totalRows: 0,
      savedRecords: 0,
      createdFines: 0,
    });

    try {
      const eventOrder = Number(uploadForm.eventOrder);
      const uploadOptions = {
        schoolYearId: uploadForm.schoolYearId || undefined,
        eventName: uploadForm.eventName.trim(),
        eventStartAt: uploadForm.eventStartAt || undefined,
        eventEndAt: uploadForm.eventEndAt || undefined,
        onProgress: setProgress,
        eventOrder:
          Number.isInteger(eventOrder) && eventOrder > 0
            ? eventOrder
            : undefined,
      };
      const result = await saveAttendanceFile(file, uploadOptions);

      await refreshAttendanceFinalResults({
        schoolYearId: uploadForm.schoolYearId || undefined,
        importId: result?.importId,
      });

      toast.success("Attendance file saved and final results updated.");
      setFile(null);
      setUploadForm((current) => ({
        ...current,
        eventOrder: "",
        eventName: "",
        eventStartAt: "",
        eventEndAt: ""
      }));
      setUploadDialogOpen(false);
      await loadPageData(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save attendance file.",
      );
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }

  async function handleRefreshFinalResults() {
    setIsLoading(true);

    try {
      await refreshAttendanceFinalResults({
        schoolYearId:
          selectedSchoolYearId === ALL_YEARS_VALUE
            ? undefined
            : selectedSchoolYearId,
      });
      await loadPageData(selectedSchoolYearId);
      toast.success("Final attendance results refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to refresh final results.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                Attendance
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                File-upload attendance records
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Upload an attendance file, finalize the calculated results, and
                load the saved final records instead of recalculating the same
                file every time.
              </p>
            </div>

            <div className="w-full max-w-64">
              <Select
                value={selectedSchoolYearId}
                onValueChange={handleSchoolYearChange}
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent>
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              School Year
            </p>
            <p className="mt-2 text-2xl font-black">
              {selectedSchoolYearLabel}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Final Results
            </p>
            <p className="mt-2 text-2xl font-black">
              {formatNumber(summary.totalStudents)}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Perfect Attendance
            </p>
            <p className="mt-2 text-2xl font-black">
              {formatNumber(summary.perfectAttendance)}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Total Absences
            </p>
            <p className="mt-2 text-2xl font-black">
              {formatNumber(summary.totalAbsences)}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Upload attendance file</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the upload form in a dialog to create a new attendance
                import.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => setUploadDialogOpen(true)}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Upload Attendance File
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleRefreshFinalResults}
                disabled={isSaving || isLoading}
                className="min-h-12 rounded-2xl px-5 font-black"
              >
                Refresh Final Results
              </Button>
            </div>
          </div>
          {progress ? (
            <div className="mt-5 rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-3 text-sm font-bold">
                <span>{progress.message}</span>
                <span>{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="mt-3 h-3" />
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {formatNumber(progress.savedRecords)} saved record/s from{" "}
                {formatNumber(progress.totalRows)} parsed row/s
              </p>
            </div>
          ) : null}
        </section>

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Upload attendance file</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-6">
              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm font-bold">Attendance file</span>
                <Input
                  type="file"
                  accept={acceptedFileTypes}
                  onChange={handleFileChange}
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">School year</span>
                <Select
                  value={uploadForm.schoolYearId}
                  onValueChange={(value) =>
                    handleUploadFieldChange("schoolYearId", value)
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                    <SelectValue placeholder="School year" />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map((schoolYear) => (
                      <SelectItem key={schoolYear.id} value={schoolYear.id}>
                        {schoolYear.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Event order</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={uploadForm.eventOrder}
                  onChange={(event) =>
                    handleUploadFieldChange("eventOrder", event.target.value)
                  }
                  placeholder="1"
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Event name</span>
                <Input
                  value={uploadForm.eventName}
                  onChange={(event) =>
                    handleUploadFieldChange("eventName", event.target.value)
                  }
                  placeholder="Event name"
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-12 w-full rounded-2xl font-black"
                >
                  {isSaving ? "Saving..." : "Save File"}
                </Button>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-bold">Start date/time</span>
                <Input
                  type="datetime-local"
                  value={uploadForm.eventStartAt}
                  onChange={(event) =>
                    handleUploadFieldChange("eventStartAt", event.target.value)
                  }
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">End date/time</span>
                <Input
                  type="datetime-local"
                  value={uploadForm.eventEndAt}
                  onChange={(event) =>
                    handleUploadFieldChange("eventEndAt", event.target.value)
                  }
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl"
                />
              </label>
            </form>
          </DialogContent>
        </Dialog>
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Final attendance results</h2>
              <p className="text-sm text-muted-foreground">
                These rows come from the final results table and can be switched
                by college.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                <SelectTrigger className="min-h-11 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="College" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_colleges__">All colleges</SelectItem>
                  {collegeOptions.map((college) => (
                    <SelectItem key={college} value={college}>
                      {college}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm font-bold text-muted-foreground">
                {formatNumber(displayedFinalResults.length)} result/s
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Attended</th>
                  <th className="px-4 py-3">Absences</th>
                  <th className="px-4 py-3">Latest Scan</th>
                </tr>
              </thead>
              <tbody>
                {displayedFinalResults.length ? (
                  displayedFinalResults.map((result) => (
                    <tr key={result.id} className="border-t">
                      <td className="px-4 py-3 font-black">
                        {result.student_id}
                      </td>
                      <td className="px-4 py-3 font-semibold">{result.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.college || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.program || "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatNumber(result.attended_events)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getResultBadgeClassName(result.total_absences)}`}
                        >
                          {getResultLabel(result)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(result.latest_scanned_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoading
                        ? "Loading final results..."
                        : "No final attendance results found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-black">Recent uploaded files</h2>
          <div className="mt-4 grid gap-3">
            {displayedImports.length ? (
              displayedImports.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black">{item.file_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.event_name || "Uploaded attendance"} •{" "}
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-muted-foreground">
                      {formatNumber(item.rows_valid)} valid /{" "}
                      {formatNumber(item.rows_total)} total
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                No uploaded attendance files found.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}