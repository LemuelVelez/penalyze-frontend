import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  listAllAttendanceRecords,
  listManualAttendanceRecords,
  refreshAttendanceFinalResults,
  updateAttendanceRecord,
} from "../../api/attendance";
import type { AttendanceRecord, ManualAttendanceRecord, ManualAttendanceInput } from "../../api/attendance";
import { listPenalties, refreshPenaltyResults } from "../../api/fines";
import type { PenaltyRecord } from "../../api/fines";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type CalculationRow = {
  key: string;
  schoolYearId: string | null;
  studentId: string;
  name: string;
  yearLevel: string | null;
  college: string | null;
  program: string | null;
  institution: string | null;
  attendedEvents: number;
  importedAbsences: number;
  manualAbsences: number;
  totalAbsences: number;
  attendanceStatus: string;
  penalty: PenaltyRecord | null;
  sourceRecordCount: number;
  attendanceRecords: AttendanceRecord[];
  manualRecords: ManualAttendanceRecord[];
};

type CalculationEditFormState = {
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  importedAbsences: string;
  manualAbsences: string;
  remarks: string;
};

const emptyEditForm: CalculationEditFormState = {
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "",
  importedAbsences: "0",
  manualAbsences: "0",
  remarks: "",
};

function normalizeValue(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStudentId(value: unknown) {
  return normalizeValue(value).toLowerCase();
}

function getRecordTimestamp(record: AttendanceRecord | ManualAttendanceRecord) {
  const value = record.scanned_at ?? record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getAbsenceCount(value: unknown) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function getEventKey(record: AttendanceRecord) {
  return normalizeValue(record.event_id || record.event_name || record.import_id || record.id);
}

function getBestTextValue(...values: Array<string | null | undefined>) {
  return values.map(normalizeValue).find(Boolean) ?? "";
}

function getBestStudentRecord(records: AttendanceRecord[], manualRecords: ManualAttendanceRecord[]) {
  const combined = [...records, ...manualRecords].sort((leftRecord, rightRecord) => {
    return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
  });

  return combined[0] ?? null;
}

function matchPenaltyForAbsences(penalties: PenaltyRecord[], totalAbsences: number) {
  return [...penalties]
    .filter((penalty) => Number(penalty.no_of_absences) <= totalAbsences)
    .sort((leftPenalty, rightPenalty) => Number(rightPenalty.no_of_absences) - Number(leftPenalty.no_of_absences))[0] ?? null;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toAbsenceInputValue(value: number) {
  return String(Math.max(0, Number(value || 0)));
}

function parseAbsenceInput(value: string) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) return null;

  return Math.max(0, Math.trunc(parsedValue));
}

function buildEditForm(row: CalculationRow): CalculationEditFormState {
  const representativeRecord = getBestStudentRecord(row.attendanceRecords, row.manualRecords);

  return {
    studentId: row.studentId,
    name: row.name,
    yearLevel: row.yearLevel ?? "",
    college: row.college ?? "",
    program: row.program ?? "",
    institution: row.institution ?? "",
    importedAbsences: toAbsenceInputValue(row.importedAbsences),
    manualAbsences: toAbsenceInputValue(row.manualAbsences),
    remarks: representativeRecord?.remarks ?? "",
  };
}

function buildAttendanceInput(props: {
  form: CalculationEditFormState;
  record: AttendanceRecord | ManualAttendanceRecord;
  noOfAbsences: number;
}): ManualAttendanceInput {
  const input: ManualAttendanceInput = {
    schoolYearId: props.record.school_year_id ?? undefined,
    eventId: props.record.event_id ?? undefined,
    eventName: props.record.event_name ?? undefined,
    scannedAt: props.record.scanned_at ?? undefined,
    studentId: props.form.studentId.trim(),
    name: props.form.name.trim(),
    yearLevel: props.form.yearLevel.trim(),
    college: props.form.college.trim(),
    program: props.form.program.trim(),
    institution: props.form.institution.trim(),
    noOfAbsences: props.noOfAbsences,
    remarks: props.form.remarks.trim(),
  };

  if ("attendance_type" in props.record) {
    input.attendanceType = props.record.attendance_type;
  }

  return input;
}

async function listAllManualAttendanceRecords(options: { schoolYearId?: string } = {}) {
  const pageSize = 500;
  const rows: ManualAttendanceRecord[] = [];

  for (let page = 0; page < 100; page += 1) {
    const pageRows = await listManualAttendanceRecords({
      schoolYearId: options.schoolYearId,
      limit: pageSize,
      offset: page * pageSize,
    });

    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return rows;
}

function buildCalculationRows(props: {
  attendanceRecords: AttendanceRecord[];
  manualRecords: ManualAttendanceRecord[];
  penalties: PenaltyRecord[];
}) {
  const importedRecords = props.attendanceRecords.filter((record) => record.import_id);
  const groupedRecords = new Map<string, AttendanceRecord[]>();
  const groupedManualRecords = new Map<string, ManualAttendanceRecord[]>();

  importedRecords.forEach((record) => {
    const studentId = normalizeStudentId(record.student_id);
    if (!studentId) return;

    const groupKey = `${record.school_year_id ?? "unassigned"}::${studentId}`;
    const rows = groupedRecords.get(groupKey) ?? [];
    rows.push(record);
    groupedRecords.set(groupKey, rows);
  });

  props.manualRecords.forEach((record) => {
    const studentId = normalizeStudentId(record.student_id);
    if (!studentId) return;

    const groupKey = `${record.school_year_id ?? "unassigned"}::${studentId}`;
    const rows = groupedManualRecords.get(groupKey) ?? [];
    rows.push(record);
    groupedManualRecords.set(groupKey, rows);
  });

  const studentKeys = Array.from(new Set([...groupedRecords.keys(), ...groupedManualRecords.keys()]));

  return studentKeys
    .map((studentKey) => {
      const attendanceGroup = groupedRecords.get(studentKey) ?? [];
      const manualGroup = groupedManualRecords.get(studentKey) ?? [];
      const bestRecord = getBestStudentRecord(attendanceGroup, manualGroup);
      const eventKeys = new Set(attendanceGroup.map(getEventKey).filter(Boolean));
      const importedAbsences = attendanceGroup.reduce((highestCount, record) => {
        return Math.max(highestCount, getAbsenceCount(record.no_of_absences));
      }, 0);
      const manualAbsences = manualGroup.reduce((total, record) => {
        return total + getAbsenceCount(record.no_of_absences);
      }, 0);
      const totalAbsences = importedAbsences + manualAbsences;
      const penalty = matchPenaltyForAbsences(props.penalties, totalAbsences);

      return {
        key: `${bestRecord?.school_year_id ?? "all"}-${studentKey}`,
        schoolYearId: bestRecord?.school_year_id ?? null,
        studentId: bestRecord?.student_id ?? studentKey,
        name: getBestTextValue(bestRecord?.name, studentKey),
        yearLevel: getBestTextValue(bestRecord?.year_level) || null,
        college: getBestTextValue(bestRecord?.college) || null,
        program: getBestTextValue(bestRecord?.program) || null,
        institution: getBestTextValue(bestRecord?.institution) || null,
        attendedEvents: eventKeys.size,
        importedAbsences,
        manualAbsences,
        totalAbsences,
        attendanceStatus: totalAbsences > 0 ? "with_absences" : "perfect_attendance",
        penalty,
        sourceRecordCount: attendanceGroup.length + manualGroup.length,
        attendanceRecords: attendanceGroup,
        manualRecords: manualGroup,
      } satisfies CalculationRow;
    })
    .sort((leftRow, rightRow) => {
      const absenceDifference = rightRow.totalAbsences - leftRow.totalAbsences;
      if (absenceDifference !== 0) return absenceDifference;

      return leftRow.studentId.localeCompare(rightRow.studentId, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export default function CalculatePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(ALL_SCHOOL_YEARS_VALUE);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualAttendanceRecord[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [searchText, setSearchText] = useState("");
  const [lastCalculatedAt, setLastCalculatedAt] = useState("");
  const [editingRow, setEditingRow] = useState<CalculationRow | null>(null);
  const [editForm, setEditForm] = useState<CalculationEditFormState>(emptyEditForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const calculationRows = useMemo(() => {
    return buildCalculationRows({
      attendanceRecords,
      manualRecords,
      penalties,
    });
  }, [attendanceRecords, manualRecords, penalties]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return calculationRows;

    return calculationRows.filter((row) => {
      return [
        row.studentId,
        row.name,
        row.college,
        row.program,
        row.yearLevel,
        row.penalty?.prescribed_penalty,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [calculationRows, searchText]);

  const summary = useMemo(() => {
    return {
      students: calculationRows.length,
      absences: calculationRows.reduce((total, row) => total + row.totalAbsences, 0),
      withFines: calculationRows.filter((row) => row.totalAbsences > 0).length,
      sourceRecords: attendanceRecords.length + manualRecords.length,
    };
  }, [attendanceRecords.length, calculationRows, manualRecords.length]);

  async function loadCalculation(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const [schoolYearRows, penaltyRows] = await Promise.all([
        listSchoolYears(),
        listPenalties(),
      ]);
      const fallbackSchoolYearId =
        nextSchoolYearId ||
        getActiveSchoolYearId(schoolYearRows) ||
        ALL_SCHOOL_YEARS_VALUE;
      const requestSchoolYearId =
        fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE ? undefined : fallbackSchoolYearId;
      const [attendanceRows, manualRows] = await Promise.all([
        listAllAttendanceRecords({
          schoolYearId: requestSchoolYearId,
          pageSize: 500,
          maxPages: 100,
        }),
        listAllManualAttendanceRecords({
          schoolYearId: requestSchoolYearId,
        }),
      ]);

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setPenalties(penaltyRows);
      setAttendanceRecords(attendanceRows);
      setManualRecords(manualRows);
      setLastCalculatedAt(new Date().toISOString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to calculate attendance records.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCalculation();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    await loadCalculation(value);
  }

  function handleEditFieldChange(field: keyof CalculationEditFormState, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function handleOpenEditRow(row: CalculationRow) {
    setEditingRow(row);
    setEditForm(buildEditForm(row));
  }

  async function refreshCalculatedOutputs() {
    const requestSchoolYearId =
      selectedSchoolYearId === ALL_SCHOOL_YEARS_VALUE ? undefined : selectedSchoolYearId;

    await refreshAttendanceFinalResults({
      schoolYearId: requestSchoolYearId,
    });
    await refreshPenaltyResults({
      schoolYearId: requestSchoolYearId,
    });
  }

  async function handleSaveResults() {
    setIsSavingResults(true);

    try {
      await refreshCalculatedOutputs();
      toast.success("Calculated final attendance and fine results saved.");
      await loadCalculation(selectedSchoolYearId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save calculated results.");
    } finally {
      setIsSavingResults(false);
    }
  }

  async function handleSaveEditedRow(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingRow) return;
    if (!editForm.studentId.trim() || !editForm.name.trim()) {
      toast.error("Student ID and name are required.");
      return;
    }

    const importedAbsences = parseAbsenceInput(editForm.importedAbsences);
    const manualAbsences = parseAbsenceInput(editForm.manualAbsences);

    if (importedAbsences === null || manualAbsences === null) {
      toast.error("Absences must be valid whole numbers.");
      return;
    }

    if (!editingRow.attendanceRecords.length && !editingRow.manualRecords.length) {
      toast.error("No source records found for this calculation row.");
      return;
    }

    setIsSavingEdit(true);

    try {
      for (const record of editingRow.attendanceRecords) {
        await updateAttendanceRecord(record.id, buildAttendanceInput({
          form: editForm,
          record,
          noOfAbsences: importedAbsences,
        }));
      }

      const [primaryManualRecord, ...secondaryManualRecords] = editingRow.manualRecords;

      for (const record of secondaryManualRecords) {
        await updateAttendanceRecord(record.id, buildAttendanceInput({
          form: editForm,
          record,
          noOfAbsences: 0,
        }));
      }

      if (primaryManualRecord) {
        await updateAttendanceRecord(primaryManualRecord.id, buildAttendanceInput({
          form: editForm,
          record: primaryManualRecord,
          noOfAbsences: manualAbsences,
        }));
      }

      await refreshCalculatedOutputs();
      toast.success("Calculation row records updated.");
      setEditingRow(null);
      setEditForm(emptyEditForm);
      await loadCalculation(selectedSchoolYearId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update calculation row.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                Calculate
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Attendance and fine calculation
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Merge attendance records by Student ID, preview total absences and penalties, edit row records, then save the final result only when ready.
              </p>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row lg:items-center">
              <Select value={selectedSchoolYearId} onValueChange={handleSchoolYearChange}>
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-xs rounded-2xl sm:w-56">
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent className="max-w-xs">
                  <SelectItem value={ALL_SCHOOL_YEARS_VALUE}>All school years</SelectItem>
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                onClick={() => loadCalculation(selectedSchoolYearId)}
                disabled={isLoading}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isLoading ? "Calculating..." : "Recalculate"}
              </Button>

              <Button
                type="button"
                onClick={handleSaveResults}
                disabled={isSavingResults || isLoading || !calculationRows.length}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isSavingResults ? "Saving..." : "Save Results"}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">School Year</p>
            <p className="mt-2 text-2xl font-black">{selectedSchoolYearLabel}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Merged Students</p>
            <p className="mt-2 text-2xl font-black">{summary.students.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Total Absences</p>
            <p className="mt-2 text-2xl font-black">{summary.absences.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Students With Fines</p>
            <p className="mt-2 text-2xl font-black">{summary.withFines.toLocaleString()}</p>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Calculation preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Source records: {summary.sourceRecords.toLocaleString()} • Last calculated: {formatDateTime(lastCalculatedAt)}
              </p>
            </div>
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search student, college, program, or penalty"
              className="min-h-12 rounded-2xl lg:max-w-md"
            />
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">College / Program</th>
                  <th className="px-4 py-3">Attended Events</th>
                  <th className="px-4 py-3">Imported Absences</th>
                  <th className="px-4 py-3">Manual Absences</th>
                  <th className="px-4 py-3">Total Absences</th>
                  <th className="px-4 py-3">Fine / Penalty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((row) => (
                    <tr key={row.key} className="border-t">
                      <td className="px-4 py-3 align-top">
                        <p className="font-black">{row.studentId}</p>
                        <p className="text-muted-foreground">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.sourceRecordCount} source record/s</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold">{row.college || "—"}</p>
                        <p className="text-muted-foreground">{row.program || "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.yearLevel || "—"}</p>
                      </td>
                      <td className="px-4 py-3 align-top font-bold">{row.attendedEvents.toLocaleString()}</td>
                      <td className="px-4 py-3 align-top font-bold">{row.importedAbsences.toLocaleString()}</td>
                      <td className="px-4 py-3 align-top font-bold">{row.manualAbsences.toLocaleString()}</td>
                      <td className="px-4 py-3 align-top text-base font-black">{row.totalAbsences.toLocaleString()}</td>
                      <td className="px-4 py-3 align-top">
                        {row.totalAbsences > 0 ? (
                          <p className="font-semibold">{row.penalty?.prescribed_penalty ?? "No prescribed penalty configured."}</p>
                        ) : (
                          <p className="font-semibold text-emerald-700">No fine</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                          row.attendanceStatus === "perfect_attendance"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}>
                          {row.attendanceStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenEditRow(row)}
                          className="min-h-10 rounded-xl px-4 text-xs font-black"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
                      {isLoading ? "Calculating attendance records..." : "No calculation rows found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit calculation row records</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEditedRow} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">
                <span>Student ID</span>
                <Input
                  value={editForm.studentId}
                  onChange={(event) => handleEditFieldChange("studentId", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Name</span>
                <Input
                  value={editForm.name}
                  onChange={(event) => handleEditFieldChange("name", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Year Level</span>
                <Input
                  value={editForm.yearLevel}
                  onChange={(event) => handleEditFieldChange("yearLevel", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>College</span>
                <Input
                  value={editForm.college}
                  onChange={(event) => handleEditFieldChange("college", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Program</span>
                <Input
                  value={editForm.program}
                  onChange={(event) => handleEditFieldChange("program", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Institution</span>
                <Input
                  value={editForm.institution}
                  onChange={(event) => handleEditFieldChange("institution", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Imported Absences</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.importedAbsences}
                  onChange={(event) => handleEditFieldChange("importedAbsences", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>Manual Absences</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.manualAbsences}
                  onChange={(event) => handleEditFieldChange("manualAbsences", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                <span>Remarks</span>
                <Input
                  value={editForm.remarks}
                  onChange={(event) => handleEditFieldChange("remarks", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
            </div>

            <div className="rounded-2xl border bg-background p-4 text-sm font-semibold text-muted-foreground">
              Source records: {(editingRow?.attendanceRecords.length ?? 0).toLocaleString()} imported and {(editingRow?.manualRecords.length ?? 0).toLocaleString()} manual record/s.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingEdit}
                onClick={() => setEditingRow(null)}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingEdit} className="min-h-12 rounded-2xl px-6 font-black">
                {isSavingEdit ? "Saving..." : "Save Row Records"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}