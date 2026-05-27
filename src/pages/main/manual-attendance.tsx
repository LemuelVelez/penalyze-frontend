import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  listAttendanceEvents,
  listManualAttendanceRecords,
  saveManualAttendanceRecord,
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
  eventId: string;
  scannedAt: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
};

const emptyForm: ManualAttendanceFormState = {
  schoolYearId: "",
  eventId: "",
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

function getEventLabel(event: AttendanceEvent) {
  return event.name || `Event ${event.id}`;
}

export default function ManualAttendancePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [records, setRecords] = useState<ManualAttendanceRecord[]>([]);
  const [form, setForm] = useState<ManualAttendanceFormState>({
    ...emptyForm,
    scannedAt: formatDateTimeInputValue(),
  });
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [manualAttendanceDialogOpen, setManualAttendanceDialogOpen] =
    useState(false);

  const collegeOptions = useMemo<string[]>(() => {
    const colleges = records
      .map((record) => String(record.college ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set<string>(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [records]);

  const filteredRecords = useMemo(() => {
    const targetCollege = collegeFilter.trim().toLowerCase();

    return records.filter((record) => {
      if (!targetCollege) return true;
      return (
        String(record.college ?? "")
          .trim()
          .toLowerCase() === targetCollege
      );
    });
  }, [records, collegeFilter]);

  async function loadPageData(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const [schoolYearRows, eventRows, manualRows] = await Promise.all([
        listSchoolYears(),
        listAttendanceEvents({
          schoolYearId:
            nextSchoolYearId === ALL_YEARS_VALUE ? undefined : nextSchoolYearId,
          limit: 500,
          offset: 0,
        }),
        listManualAttendanceRecords({
          schoolYearId:
            nextSchoolYearId === ALL_YEARS_VALUE ? undefined : nextSchoolYearId,
          limit: 500,
          offset: 0,
        }),
      ]);
      const activeSchoolYearId = getActiveSchoolYearId(schoolYearRows);

      setSchoolYears(schoolYearRows);
      setEvents(eventRows);
      setRecords(manualRows);
      setForm((current) => ({
        ...current,
        schoolYearId: current.schoolYearId || activeSchoolYearId,
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
    field: keyof ManualAttendanceFormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.eventId) {
      toast.error("Please select an existing event.");
      return;
    }

    if (!form.studentId.trim() || !form.name.trim()) {
      toast.error("Student ID and name are required.");
      return;
    }

    const payload: ManualAttendanceInput = {
      attendanceType: "manual",
      schoolYearId: form.schoolYearId || undefined,
      eventId: form.eventId,
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

    setIsSaving(true);

    try {
      await saveManualAttendanceRecord(payload);
      toast.success("Manual attendance saved.");
      setForm((current) => ({
        ...emptyForm,
        schoolYearId: current.schoolYearId,
        scannedAt: formatDateTimeInputValue(),
      }));
      setManualAttendanceDialogOpen(false);
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
                Manual attendance is stored in its own table and uses existing
                events. The main attendance page stays focused on uploaded files
                only.
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
                  <SelectItem value={ALL_YEARS_VALUE}>
                    All school years
                  </SelectItem>
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
                Open the form in a dialog to create a manual attendance record.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setManualAttendanceDialogOpen(true)}
              className="min-h-12 rounded-2xl px-6 font-black"
            >
              Add Manual Attendance
            </Button>
          </div>
        </section>

        <Dialog
          open={manualAttendanceDialogOpen}
          onOpenChange={setManualAttendanceDialogOpen}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Add manual attendance</DialogTitle>
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

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm font-bold">Existing event</span>
                <Select
                  value={form.eventId}
                  onValueChange={(value) => handleFieldChange("eventId", value)}
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                    <SelectValue
                      placeholder={
                        events.length ? "Select event" : "No events available"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((eventItem) => (
                      <SelectItem key={eventItem.id} value={eventItem.id}>
                        {getEventLabel(eventItem)}
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

              <div className="lg:col-span-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSaving ? "Saving..." : "Save Manual Attendance"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Manual attendance records</h2>
              <p className="text-sm text-muted-foreground">
                {filteredRecords.length.toLocaleString()} record/s shown
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Scanned At</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length ? (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="border-t">
                      <td className="px-4 py-3 font-black">
                        {record.student_id}
                      </td>
                      <td className="px-4 py-3 font-semibold">{record.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.event_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.college || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.program || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-black">
                          {record.attendance_type === "zero_attendance"
                            ? "Zero attendance"
                            : "Manual"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(record.scanned_at ?? record.created_at)}
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