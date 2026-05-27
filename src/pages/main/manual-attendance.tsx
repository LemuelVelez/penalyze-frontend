import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceRecord,
  listAttendanceEvents,
  listManualAttendanceRecords,
  saveManualAttendanceRecord,
  updateAttendanceRecord,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  ManualAttendanceInput,
  ManualAttendanceRecord,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

type ManualAttendanceFormState = {
  schoolYearId: string;
  eventIds: string[];
  scannedAt: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
};

type ManualAttendanceStudentGroup = {
  key: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
  latestScannedAt: string | null;
  attendanceType: ManualAttendanceRecord["attendance_type"];
  records: ManualAttendanceRecord[];
  events: ManualAttendanceRecord[];
};

const emptyForm: ManualAttendanceFormState = {
  schoolYearId: "",
  eventIds: [],
  scannedAt: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "Jose Rizal Memorial State University - Tampilisan Campus",
  remarks: "",
};

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeInputValue(value = new Date()) {
  const offset = value.getTimezoneOffset();
  const localDate = new Date(value.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function normalizeStudentId(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

type BackendEventOrderedRecord = {
  id?: string | null;
  event_order?: number | string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  scanned_at?: string | null;
  created_at?: string | null;
  event_name?: string | null;
  name?: string | null;
};

const eventOrderCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function getBackendEventOrder(record: BackendEventOrderedRecord) {
  const numericValue = Number(record.event_order ?? 0);

  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : Number.MAX_SAFE_INTEGER;
}

function getBackendEventTime(record: BackendEventOrderedRecord) {
  const value =
    record.event_start_at ??
    record.event_end_at ??
    record.scanned_at ??
    record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function compareByBackendEventOrder<T extends BackendEventOrderedRecord>(
  leftRecord: T,
  rightRecord: T,
) {
  const orderDifference =
    getBackendEventOrder(leftRecord) - getBackendEventOrder(rightRecord);
  if (orderDifference !== 0) return orderDifference;

  const timeDifference =
    getBackendEventTime(leftRecord) - getBackendEventTime(rightRecord);
  if (timeDifference !== 0) return timeDifference;

  return eventOrderCollator.compare(
    leftRecord.event_name ?? leftRecord.name ?? leftRecord.id ?? "",
    rightRecord.event_name ?? rightRecord.name ?? rightRecord.id ?? "",
  );
}

function sortByBackendEventOrder<T extends BackendEventOrderedRecord>(
  records: T[],
) {
  return [...records].sort(compareByBackendEventOrder);
}

function getRecordTimestamp(record: ManualAttendanceRecord) {
  const value = record.scanned_at ?? record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getLatestRecord(records: ManualAttendanceRecord[]) {
  return [...records].sort(
    (leftRecord, rightRecord) =>
      getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord),
  )[0];
}

function getEventLabel(event: AttendanceEvent) {
  const eventOrder = getBackendEventOrder(event);

  if (eventOrder !== Number.MAX_SAFE_INTEGER) {
    return `#${eventOrder} • ${event.name || `Event ${event.id}`}`;
  }

  return event.name || `Event ${event.id}`;
}

function getRecordEventLabel(record: ManualAttendanceRecord) {
  if (record.event_name) return record.event_name;
  if (record.event_id) return `Event ${record.event_id}`;
  return "No event assigned";
}

function mergeManualAttendanceByStudent(
  records: ManualAttendanceRecord[],
): ManualAttendanceStudentGroup[] {
  const groups = new Map<string, ManualAttendanceRecord[]>();

  records.forEach((record) => {
    const key = normalizeStudentId(record.student_id) || record.id;
    const current = groups.get(key) ?? [];

    current.push(record);
    groups.set(key, current);
  });

  return Array.from(groups.entries())
    .map(([key, groupRecords]) => {
      const sortedRecords = sortByBackendEventOrder(groupRecords);
      const latestRecord = getLatestRecord(groupRecords) ?? sortedRecords[0];
      const eventRecords = sortedRecords.filter((record) => record.event_id);

      return {
        key,
        studentId: latestRecord?.student_id ?? key,
        name: latestRecord?.name ?? key,
        yearLevel: latestRecord?.year_level ?? "",
        college: latestRecord?.college ?? "",
        program: latestRecord?.program ?? "",
        institution: latestRecord?.institution ?? "",
        remarks: latestRecord?.remarks ?? "",
        latestScannedAt:
          latestRecord?.scanned_at ?? latestRecord?.created_at ?? null,
        attendanceType: groupRecords.some(
          (record) => record.attendance_type === "manual",
        )
          ? "manual"
          : "zero_attendance",
        records: sortedRecords,
        events: eventRecords,
      } satisfies ManualAttendanceStudentGroup;
    })
    .sort((leftGroup, rightGroup) => {
      const collegeCompare = leftGroup.college.localeCompare(rightGroup.college);
      if (collegeCompare !== 0) return collegeCompare;
      return leftGroup.studentId.localeCompare(rightGroup.studentId);
    });
}

function getSelectedEventRecords(
  records: ManualAttendanceRecord[],
  eventIds: string[],
) {
  const selectedEventIds = new Set(eventIds);

  return records.filter((record) =>
    record.event_id ? selectedEventIds.has(record.event_id) : false,
  );
}

export default function ManualAttendancePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [records, setRecords] = useState<ManualAttendanceRecord[]>([]);
  const [form, setForm] = useState<ManualAttendanceFormState>({
    ...emptyForm,
    scannedAt: formatDateTimeInputValue(),
  });
  const [editingGroupKey, setEditingGroupKey] = useState("");
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [manualAttendanceDialogOpen, setManualAttendanceDialogOpen] =
    useState(false);
  const [eventsDialogGroup, setEventsDialogGroup] =
    useState<ManualAttendanceStudentGroup | null>(null);

  const studentGroups = useMemo(
    () => mergeManualAttendanceByStudent(records),
    [records],
  );

  const collegeOptions = useMemo<string[]>(() => {
    const colleges = studentGroups
      .map((group) => String(group.college ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set<string>(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [studentGroups]);

  const filteredGroups = useMemo(() => {
    const targetCollege = collegeFilter.trim().toLowerCase();

    return studentGroups.filter((group) => {
      if (!targetCollege) return true;
      return group.college.trim().toLowerCase() === targetCollege;
    });
  }, [studentGroups, collegeFilter]);

  const selectedEventRecords = useMemo(
    () => getSelectedEventRecords(records, form.eventIds),
    [records, form.eventIds],
  );

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
      const [eventRows, manualRows] = fallbackSchoolYearId
        ? await Promise.all([
            listAttendanceEvents({
              schoolYearId: fallbackSchoolYearId,
              limit: 500,
              offset: 0,
            }),
            listManualAttendanceRecords({
              schoolYearId: fallbackSchoolYearId,
              limit: 1000,
              offset: 0,
            }),
          ])
        : [[], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId || ALL_YEARS_VALUE);
      setEvents(sortByBackendEventOrder(eventRows));
      setRecords(sortByBackendEventOrder(manualRows));
      setForm((current) => ({
        ...current,
        schoolYearId:
          current.schoolYearId &&
          schoolYearRows.some(
            (schoolYear) => schoolYear.id === current.schoolYearId,
          )
            ? current.schoolYearId
            : activeSchoolYearId,
      }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load manual attendance.",
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

  function handleFieldChange(
    field: Exclude<keyof ManualAttendanceFormState, "eventIds">,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleEventToggle(eventId: string) {
    setForm((current) => {
      const isSelected = current.eventIds.includes(eventId);

      return {
        ...current,
        eventIds: isSelected
          ? current.eventIds.filter((id) => id !== eventId)
          : [...current.eventIds, eventId],
      };
    });
  }

  function handleOpenCreateDialog() {
    setEditingGroupKey("");
    setForm((current) => ({
      ...emptyForm,
      schoolYearId:
        current.schoolYearId ||
        (selectedSchoolYearId === ALL_YEARS_VALUE ? "" : selectedSchoolYearId),
      scannedAt: formatDateTimeInputValue(),
    }));
    setManualAttendanceDialogOpen(true);
  }

  function handleEditGroup(group: ManualAttendanceStudentGroup) {
    const latestRecord = getLatestRecord(group.records);

    setEditingGroupKey(group.key);
    setForm({
      schoolYearId:
        latestRecord?.school_year_id ||
        (selectedSchoolYearId === ALL_YEARS_VALUE ? "" : selectedSchoolYearId),
      eventIds: group.events
        .map((record) => record.event_id)
        .filter(Boolean) as string[],
      scannedAt: formatDateTimeInputValue(
        latestRecord?.scanned_at
          ? new Date(latestRecord.scanned_at)
          : new Date(),
      ),
      studentId: group.studentId,
      name: group.name,
      yearLevel: group.yearLevel,
      college: group.college,
      program: group.program,
      institution: group.institution,
      remarks: group.remarks,
    });
    setManualAttendanceDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setManualAttendanceDialogOpen(open);

    if (!open) {
      setEditingGroupKey("");
      setForm((current) => ({
        ...emptyForm,
        schoolYearId: current.schoolYearId,
        scannedAt: formatDateTimeInputValue(),
      }));
    }
  }

  function buildManualPayload(eventId?: string): ManualAttendanceInput {
    const event = events.find((item) => item.id === eventId) ?? null;

    return {
      attendanceType: eventId ? "manual" : "zero_attendance",
      schoolYearId: form.schoolYearId || undefined,
      eventId,
      eventName: event?.name,
      scannedAt: form.scannedAt || undefined,
      studentId: form.studentId.trim(),
      name: form.name.trim(),
      yearLevel: form.yearLevel.trim(),
      college: form.college.trim(),
      program: form.program.trim(),
      institution: form.institution.trim(),
      noOfAbsences: 0,
      remarks: form.remarks.trim(),
    };
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.schoolYearId) {
      toast.error("Active school year is required.");
      return;
    }

    if (!form.studentId.trim() || !form.name.trim()) {
      toast.error("Student ID and name are required.");
      return;
    }

    setIsSaving(true);

    try {
      const selectedEventIds = Array.from(new Set(form.eventIds));
      const editingGroup = editingGroupKey
        ? studentGroups.find((group) => group.key === editingGroupKey)
        : null;

      if (editingGroup) {
        const existingRecords = editingGroup.records;
        const existingByEventId = new Map(
          existingRecords
            .filter((record) => record.event_id)
            .map((record) => [record.event_id as string, record]),
        );
        const selectedEventIdSet = new Set(selectedEventIds);
        const recordsToDelete = existingRecords.filter(
          (record) => !record.event_id || !selectedEventIdSet.has(record.event_id),
        );

        await Promise.all(
          recordsToDelete.map((record) => deleteAttendanceRecord(record.id)),
        );

        await Promise.all(
          selectedEventIds.map((eventId) => {
            const existingRecord = existingByEventId.get(eventId);
            const payload = buildManualPayload(eventId);

            return existingRecord
              ? updateAttendanceRecord(existingRecord.id, payload)
              : saveManualAttendanceRecord(payload);
          }),
        );

        if (!selectedEventIds.length) {
          await saveManualAttendanceRecord(buildManualPayload());
        }

        toast.success("Manual attendance updated.");
      } else {
        if (!selectedEventIds.length) {
          toast.error("Please select at least one event.");
          return;
        }

        await Promise.all(
          selectedEventIds.map((eventId) =>
            saveManualAttendanceRecord(buildManualPayload(eventId)),
          ),
        );
        toast.success("Manual attendance saved.");
      }

      handleDialogOpenChange(false);
      await loadPageData(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save manual attendance.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteGroup(group: ManualAttendanceStudentGroup) {
    setIsSaving(true);

    try {
      await Promise.all(
        group.records.map((record) => deleteAttendanceRecord(record.id)),
      );
      await loadPageData(selectedSchoolYearId);
      toast.success("Manual attendance deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete manual attendance.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                Manual Attendance
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                College-based manual attendance
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Manual attendance is merged by Student ID and can store multiple
                attended events for each attendee.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto">
              <Select
                value={selectedSchoolYearId}
                onValueChange={handleSchoolYearChange}
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

              <Select
                value={collegeFilter || "__all_colleges__"}
                onValueChange={(value) =>
                  setCollegeFilter(value === "__all_colleges__" ? "" : value)
                }
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="College filter" />
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
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Add manual attendance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one attendee row and select all events attended by that
                student.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOpenCreateDialog}
              className="min-h-12 rounded-2xl px-6 font-black"
            >
              Add Manual Attendance
            </Button>
          </div>
        </section>

        <Dialog open={manualAttendanceDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {editingGroupKey ? "Edit manual attendance" : "Add manual attendance"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleSubmit}
              className="mt-5 grid gap-4 lg:grid-cols-4"
            >
              <label className="space-y-2">
                <span className="text-sm font-bold">School year</span>
                <Select
                  value={form.schoolYearId}
                  onValueChange={(value) =>
                    handleFieldChange("schoolYearId", value)
                  }
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
                <span className="text-sm font-bold">Scanned at</span>
                <Input
                  type="datetime-local"
                  value={form.scannedAt}
                  onChange={(event) =>
                    handleFieldChange("scannedAt", event.target.value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Student ID</span>
                <Input
                  value={form.studentId}
                  onChange={(event) =>
                    handleFieldChange("studentId", event.target.value)
                  }
                  placeholder="Student ID"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Name</span>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    handleFieldChange("name", event.target.value)
                  }
                  placeholder="Full name"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Year level</span>
                <Input
                  value={form.yearLevel}
                  onChange={(event) =>
                    handleFieldChange("yearLevel", event.target.value)
                  }
                  placeholder="Year level"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">College</span>
                <Input
                  value={form.college}
                  onChange={(event) =>
                    handleFieldChange("college", event.target.value)
                  }
                  placeholder="College"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Program</span>
                <Input
                  value={form.program}
                  onChange={(event) =>
                    handleFieldChange("program", event.target.value)
                  }
                  placeholder="Program"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm font-bold">Institution</span>
                <Input
                  value={form.institution}
                  onChange={(event) =>
                    handleFieldChange("institution", event.target.value)
                  }
                  placeholder="Institution"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <div className="space-y-2 lg:col-span-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-bold">Events attended</span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {form.eventIds.length} selected
                  </span>
                </div>
                <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border bg-background p-3 sm:grid-cols-2">
                  {events.length ? (
                    events.map((eventItem) => {
                      const isSelected = form.eventIds.includes(eventItem.id);

                      return (
                        <button
                          key={eventItem.id}
                          type="button"
                          onClick={() => handleEventToggle(eventItem.id)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-card hover:bg-muted"
                          }`}
                        >
                          {getEventLabel(eventItem)}
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-card p-5 text-center text-sm font-semibold text-muted-foreground sm:col-span-2">
                      No events available.
                    </div>
                  )}
                </div>
              </div>

              <label className="space-y-2 lg:col-span-4">
                <span className="text-sm font-bold">Remarks</span>
                <Textarea
                  value={form.remarks}
                  onChange={(event) =>
                    handleFieldChange("remarks", event.target.value)
                  }
                  placeholder="Optional remarks"
                  className="min-h-24 rounded-2xl"
                />
              </label>

              {selectedEventRecords.length ? (
                <div className="rounded-2xl border bg-background p-4 text-sm lg:col-span-4">
                  <p className="font-black">Currently selected existing records</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedEventRecords.map((record) => (
                      <span
                        key={record.id}
                        className="rounded-full border bg-muted px-3 py-1 text-xs font-black"
                      >
                        {getRecordEventLabel(record)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 lg:col-span-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSaving
                    ? "Saving..."
                    : editingGroupKey
                      ? "Update Manual Attendance"
                      : "Save Manual Attendance"}
                </Button>
                {editingGroupKey ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => handleDialogOpenChange(false)}
                    className="min-h-12 rounded-2xl px-6 font-black"
                  >
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(eventsDialogGroup)}
          onOpenChange={(open) => {
            if (!open) setEventsDialogGroup(null);
          }}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Events attended by{" "}
                {eventsDialogGroup?.name || eventsDialogGroup?.studentId}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {eventsDialogGroup?.events.length ? (
                eventsDialogGroup.events.map((record, index) => (
                  <article
                    key={record.id}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-black">{getRecordEventLabel(record)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDateTime(record.scanned_at ?? record.created_at)}
                        </p>
                        {record.remarks ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {record.remarks}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No attended events selected.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Manual attendance records</h2>
              <p className="text-sm text-muted-foreground">
                {filteredGroups.length.toLocaleString()} attendee/s shown
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Latest Scan</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length ? (
                  filteredGroups.map((group) => (
                    <tr key={group.key} className="border-t">
                      <td className="px-4 py-3 font-black">
                        {group.studentId}
                      </td>
                      <td className="px-4 py-3 font-semibold">{group.name}</td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEventsDialogGroup(group)}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                        >
                          Events ({group.events.length})
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.college || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.program || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-black">
                          {group.attendanceType === "zero_attendance"
                            ? "Zero attendance"
                            : "Manual"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(group.latestScannedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditGroup(group)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                              >
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete manual attendance?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes all manual attendance records for
                                  the selected Student ID.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteGroup(group)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoading
                        ? "Loading manual attendance..."
                        : "No manual attendance records found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}