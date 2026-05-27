import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  listAllAttendanceRecords,
  listAttendanceImports,
  listCalculationResults,
  listManualAttendanceRecords,
  refreshCalculationResults,
  updateAttendanceRecord,
} from "../../api/attendance";
import type {
  AttendanceImportRecord,
  AttendanceRecord,
  CalculationResultRecord,
  ManualAttendanceInput,
  ManualAttendanceRecord,
} from "../../api/attendance";
import { listPenalties } from "../../api/fines";
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
  resultId?: string;
  schoolYearId: string | null;
  calculationScopeKey?: string;
  importIds: string[];
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
  prescribedPenalty: string | null;
  penalty: PenaltyRecord | null;
  sourceRecordCount: number;
  attendanceRecords: AttendanceRecord[];
  manualRecords: ManualAttendanceRecord[];
  calculatedAt?: string;
  isSavedResult: boolean;
};

type SourceRecordEditFormState = {
  recordId: string;
  recordType: "imported" | "manual";
  schoolYearId: string;
  eventId: string;
  eventName: string;
  attendanceType?: ManualAttendanceRecord["attendance_type"];
  scannedAt: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  noOfAbsences: string;
  remarks: string;
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
  return normalizeValue(
    record.event_id || record.event_name || record.import_id || record.id,
  );
}

function getBestTextValue(...values: Array<string | null | undefined>) {
  return values.map(normalizeValue).find(Boolean) ?? "";
}

function getBestStudentRecord(
  records: AttendanceRecord[],
  manualRecords: ManualAttendanceRecord[],
) {
  const combined = [...records, ...manualRecords].sort(
    (leftRecord, rightRecord) => {
      return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
    },
  );

  return combined[0] ?? null;
}

function matchPenaltyForAbsences(
  penalties: PenaltyRecord[],
  totalAbsences: number,
) {
  return (
    [...penalties]
      .filter((penalty) => Number(penalty.no_of_absences) <= totalAbsences)
      .sort(
        (leftPenalty, rightPenalty) =>
          Number(rightPenalty.no_of_absences) -
          Number(leftPenalty.no_of_absences),
      )[0] ?? null
  );
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

function formatImportLabel(importRecord: AttendanceImportRecord) {
  const fileName = importRecord.file_name || "Imported file";
  const eventName = importRecord.event_name || "No event";
  return `${fileName} • ${eventName} • ${formatDateTime(importRecord.created_at)}`;
}

function toAbsenceInputValue(value: number) {
  return String(Math.max(0, Number(value || 0)));
}

function parseAbsenceInput(value: string) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) return null;

  return Math.max(0, Math.trunc(parsedValue));
}

function toSourceRecordEditForm(
  record: AttendanceRecord | ManualAttendanceRecord,
  recordType: SourceRecordEditFormState["recordType"],
): SourceRecordEditFormState {
  return {
    recordId: record.id,
    recordType,
    schoolYearId: record.school_year_id ?? "",
    eventId: record.event_id ?? "",
    eventName: record.event_name ?? "",
    attendanceType:
      recordType === "manual"
        ? (record as ManualAttendanceRecord).attendance_type
        : undefined,
    scannedAt: record.scanned_at ?? "",
    studentId: record.student_id ?? "",
    name: record.name ?? "",
    yearLevel: record.year_level ?? "",
    college: record.college ?? "",
    program: record.program ?? "",
    institution: record.institution ?? "",
    noOfAbsences: toAbsenceInputValue(record.no_of_absences),
    remarks: record.remarks ?? "",
  };
}

function buildRecordEditForms(row: CalculationRow) {
  return [
    ...row.attendanceRecords.map((record) =>
      toSourceRecordEditForm(record, "imported"),
    ),
    ...row.manualRecords.map((record) =>
      toSourceRecordEditForm(record, "manual"),
    ),
  ];
}

function buildAttendanceInput(form: SourceRecordEditFormState): ManualAttendanceInput {
  const input: ManualAttendanceInput = {
    schoolYearId: form.schoolYearId || undefined,
    eventId: form.eventId || undefined,
    eventName: form.eventName || undefined,
    scannedAt: form.scannedAt || undefined,
    studentId: form.studentId.trim(),
    name: form.name.trim(),
    yearLevel: form.yearLevel.trim(),
    college: form.college.trim(),
    program: form.program.trim(),
    institution: form.institution.trim(),
    noOfAbsences: parseAbsenceInput(form.noOfAbsences) ?? 0,
    remarks: form.remarks.trim(),
  };

  if (form.recordType === "manual" && form.attendanceType) {
    input.attendanceType = form.attendanceType;
  }

  return input;
}

async function listAllManualAttendanceRecords(
  options: { schoolYearId?: string } = {},
) {
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
  importIds: string[];
}) {
  const selectedImportIds = new Set(props.importIds);
  const importedRecords = props.attendanceRecords.filter((record) => {
    if (!record.import_id) return false;
    if (!selectedImportIds.size) return true;

    return selectedImportIds.has(record.import_id);
  });
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

  const studentKeys = Array.from(
    new Set([...groupedRecords.keys(), ...groupedManualRecords.keys()]),
  );

  return studentKeys
    .map((studentKey) => {
      const attendanceGroup = groupedRecords.get(studentKey) ?? [];
      const manualGroup = groupedManualRecords.get(studentKey) ?? [];
      const bestRecord = getBestStudentRecord(attendanceGroup, manualGroup);
      const eventKeys = new Set(
        attendanceGroup.map(getEventKey).filter(Boolean),
      );
      const importedAbsences = attendanceGroup.reduce(
        (highestCount, record) => {
          return Math.max(highestCount, getAbsenceCount(record.no_of_absences));
        },
        0,
      );
      const manualAbsences = manualGroup.reduce((total, record) => {
        return total + getAbsenceCount(record.no_of_absences);
      }, 0);
      const totalAbsences = importedAbsences + manualAbsences;
      const penalty = matchPenaltyForAbsences(props.penalties, totalAbsences);

      return {
        key: `preview-${props.importIds.join("-") || "all"}-${bestRecord?.school_year_id ?? "all"}-${studentKey}`,
        schoolYearId: bestRecord?.school_year_id ?? null,
        calculationScopeKey: props.importIds.length
          ? [...props.importIds].sort().join(":")
          : "all_imports",
        importIds: [...props.importIds],
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
        attendanceStatus:
          totalAbsences > 0 ? "with_absences" : "perfect_attendance",
        prescribedPenalty:
          totalAbsences > 0
            ? penalty?.prescribed_penalty ??
              "No prescribed penalty configured."
            : null,
        penalty,
        sourceRecordCount: attendanceGroup.length + manualGroup.length,
        attendanceRecords: attendanceGroup,
        manualRecords: manualGroup,
        calculatedAt: new Date().toISOString(),
        isSavedResult: false,
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

function calculationResultToRow(result: CalculationResultRecord) {
  return {
    key: `saved-${result.id}`,
    resultId: result.id,
    schoolYearId: result.school_year_id,
    calculationScopeKey: result.calculation_scope_key,
    importIds: result.import_ids ?? [],
    studentId: result.student_id,
    name: result.name,
    yearLevel: result.year_level,
    college: result.college,
    program: result.program,
    institution: result.institution,
    attendedEvents: Number(result.attended_events || 0),
    importedAbsences: Number(result.imported_absences || 0),
    manualAbsences: Number(result.manual_absences || 0),
    totalAbsences: Number(result.total_absences || 0),
    attendanceStatus: result.attendance_status,
    prescribedPenalty: result.prescribed_penalty,
    penalty:
      result.penalty_id || result.prescribed_penalty
        ? {
            id: result.penalty_id ?? result.id,
            no_of_absences: Number(result.total_absences || 0),
            prescribed_penalty:
              result.prescribed_penalty ??
              "No prescribed penalty configured.",
            created_at: result.created_at,
            updated_at: result.updated_at,
          }
        : null,
    sourceRecordCount: Number(result.source_record_count || 0),
    attendanceRecords: [],
    manualRecords: [],
    calculatedAt: result.calculated_at,
    isSavedResult: true,
  } satisfies CalculationRow;
}

export default function CalculatePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(
    ALL_SCHOOL_YEARS_VALUE,
  );
  const [attendanceImports, setAttendanceImports] = useState<
    AttendanceImportRecord[]
  >([]);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [calculationRows, setCalculationRows] = useState<CalculationRow[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [searchText, setSearchText] = useState("");
  const [lastCalculatedAt, setLastCalculatedAt] = useState("");
  const [calculationMode, setCalculationMode] = useState<"saved" | "preview">(
    "saved",
  );
  const [editingRow, setEditingRow] = useState<CalculationRow | null>(null);
  const [recordEditForms, setRecordEditForms] = useState<
    SourceRecordEditFormState[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const selectedImportLabels = useMemo(() => {
    const selectedIds = new Set(selectedImportIds);
    return attendanceImports
      .filter((importRecord) => selectedIds.has(importRecord.id))
      .map(formatImportLabel);
  }, [attendanceImports, selectedImportIds]);

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
        row.prescribedPenalty,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [calculationRows, searchText]);

  const summary = useMemo(() => {
    return {
      students: calculationRows.length,
      absences: calculationRows.reduce(
        (total, row) => total + row.totalAbsences,
        0,
      ),
      withFines: calculationRows.filter((row) => row.totalAbsences > 0).length,
      sourceRecords: calculationRows.reduce(
        (total, row) => total + row.sourceRecordCount,
        0,
      ),
    };
  }, [calculationRows]);

  async function loadSavedResults(
    nextSchoolYearId = selectedSchoolYearId,
    nextImportIds = selectedImportIds,
  ) {
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
        fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE
          ? undefined
          : fallbackSchoolYearId;
      const [importRows, resultRows] = await Promise.all([
        listAttendanceImports({
          schoolYearId: requestSchoolYearId,
          limit: 500,
          offset: 0,
        }),
        listCalculationResults({
          schoolYearId: requestSchoolYearId,
          importIds: nextImportIds,
          limit: 1000,
          offset: 0,
        }),
      ]);
      const savedRows = resultRows.map(calculationResultToRow);
      const calculatedDates = savedRows
        .map((row) => row.calculatedAt)
        .filter(Boolean)
        .sort();
      const latestCalculatedAt =
        calculatedDates[calculatedDates.length - 1] ?? "";

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setAttendanceImports(importRows);
      setPenalties(penaltyRows);
      setCalculationRows(savedRows);
      setLastCalculatedAt(latestCalculatedAt ?? "");
      setCalculationMode("saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load saved calculation results.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPreviewRows(
    nextSchoolYearId = selectedSchoolYearId,
    nextImportIds = selectedImportIds,
  ) {
    const requestSchoolYearId =
      nextSchoolYearId === ALL_SCHOOL_YEARS_VALUE
        ? undefined
        : nextSchoolYearId;
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
    const nextRows = buildCalculationRows({
      attendanceRecords: attendanceRows,
      manualRecords: manualRows,
      penalties,
      importIds: nextImportIds,
    });

    setCalculationRows(nextRows);
    setLastCalculatedAt(new Date().toISOString());
    setCalculationMode("preview");

    return nextRows;
  }

  useEffect(() => {
    void loadSavedResults();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    setSelectedImportIds([]);
    await loadSavedResults(value, []);
  }

  function handleImportToggle(importId: string) {
    setSelectedImportIds((current) => {
      const next = current.includes(importId)
        ? current.filter((id) => id !== importId)
        : [...current, importId];

      return next.sort((left, right) => left.localeCompare(right));
    });
  }

  function handleSelectAllImports() {
    setSelectedImportIds(
      attendanceImports
        .map((importRecord) => importRecord.id)
        .sort((left, right) => left.localeCompare(right)),
    );
  }

  async function handleLoadSavedResults() {
    await loadSavedResults(selectedSchoolYearId, selectedImportIds);
  }

  async function handlePreviewCalculation() {
    if (!selectedImportIds.length) {
      toast.error("Choose at least one imported file to calculate.");
      return;
    }

    setIsPreviewing(true);

    try {
      const rows = await loadPreviewRows(selectedSchoolYearId, selectedImportIds);

      toast.success(
        rows.length
          ? "Calculation preview updated."
          : "No rows found for the selected imported files.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to preview calculation.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleRecordEditFieldChange(
    index: number,
    field: keyof SourceRecordEditFormState,
    value: string,
  ) {
    setRecordEditForms((current) =>
      current.map((form, formIndex) =>
        formIndex === index
          ? ({ ...form, [field]: value } as SourceRecordEditFormState)
          : form,
      ),
    );
  }

  function handleOpenEditRow(row: CalculationRow) {
    const forms = buildRecordEditForms(row);

    if (!forms.length) {
      toast.error(
        "Load a preview for the selected imported files before editing source records.",
      );
      return;
    }

    setEditingRow(row);
    setRecordEditForms(forms);
  }

  async function handleSaveResults() {
    if (!selectedImportIds.length) {
      toast.error("Choose at least one imported file before saving results.");
      return;
    }

    setIsSavingResults(true);

    try {
      const requestSchoolYearId =
        selectedSchoolYearId === ALL_SCHOOL_YEARS_VALUE
          ? undefined
          : selectedSchoolYearId;

      await refreshCalculationResults({
        schoolYearId: requestSchoolYearId,
        importIds: selectedImportIds,
      });

      toast.success("Calculation results saved.");
      await loadSavedResults(selectedSchoolYearId, selectedImportIds);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save calculated results.",
      );
    } finally {
      setIsSavingResults(false);
    }
  }

  async function handleSaveEditedRow(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingRow) return;
    if (!recordEditForms.length) {
      toast.error("No source records found for this calculation row.");
      return;
    }

    const hasInvalidForm = recordEditForms.some((form) => {
      return (
        !form.studentId.trim() ||
        !form.name.trim() ||
        parseAbsenceInput(form.noOfAbsences) === null
      );
    });

    if (hasInvalidForm) {
      toast.error("Student ID, name, and valid absences are required.");
      return;
    }

    setIsSavingEdit(true);

    try {
      for (const form of recordEditForms) {
        await updateAttendanceRecord(form.recordId, buildAttendanceInput(form));
      }

      toast.success("Source records updated.");
      setEditingRow(null);
      setRecordEditForms([]);
      await loadPreviewRows(selectedSchoolYearId, selectedImportIds);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update calculation row.",
      );
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
                Load saved calculation results, choose imported files, preview
                selected records, edit source rows, then save the final
                calculated result only when ready.
              </p>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto lg:items-end">
              <Select
                value={selectedSchoolYearId}
                onValueChange={handleSchoolYearChange}
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl sm:w-64">
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent className="max-w-xs">
                  <SelectItem value={ALL_SCHOOL_YEARS_VALUE}>
                    All school years
                  </SelectItem>
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLoadSavedResults}
                  disabled={isLoading}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isLoading ? "Loading..." : "Load Saved Results"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewCalculation}
                  disabled={isPreviewing || isLoading || !selectedImportIds.length}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isPreviewing ? "Calculating..." : "Preview Selected Files"}
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveResults}
                  disabled={
                    isSavingResults ||
                    isLoading ||
                    !calculationRows.length ||
                    !selectedImportIds.length
                  }
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSavingResults ? "Saving..." : "Save Results"}
                </Button>
              </div>
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
              Students
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.students.toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Total Absences
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.absences.toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Students With Fines
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.withFines.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Imported files to calculate</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose one or more imported files before previewing and saving
                calculation results.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectAllImports}
                disabled={!attendanceImports.length}
                className="min-h-10 rounded-xl px-4 text-xs font-black"
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedImportIds([])}
                disabled={!selectedImportIds.length}
                className="min-h-10 rounded-xl px-4 text-xs font-black"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {attendanceImports.length ? (
              attendanceImports.map((importRecord) => (
                <label
                  key={importRecord.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-background p-4 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedImportIds.includes(importRecord.id)}
                    onChange={() => handleImportToggle(importRecord.id)}
                    className="mt-1 size-4"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-black">
                      {importRecord.file_name}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {importRecord.event_name || "No linked event"} •{" "}
                      {formatDateTime(importRecord.created_at)}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-muted-foreground">
                      Valid rows: {Number(importRecord.rows_valid || 0).toLocaleString()} /{" "}
                      {Number(importRecord.rows_total || 0).toLocaleString()}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <div className="rounded-2xl border bg-background p-6 text-sm font-semibold text-muted-foreground">
                No imported files found for the selected school year.
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border bg-background p-4 text-sm font-semibold text-muted-foreground">
            Selected files:{" "}
            {selectedImportLabels.length
              ? selectedImportLabels.join(" | ")
              : "None"}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Calculation preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Mode: {calculationMode === "saved" ? "Saved results" : "Preview"}{" "}
                • Source records: {summary.sourceRecords.toLocaleString()} •
                Last calculated: {formatDateTime(lastCalculatedAt)}
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
                        <p className="text-xs text-muted-foreground">
                          {row.sourceRecordCount} source record/s
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold">{row.college || "—"}</p>
                        <p className="text-muted-foreground">
                          {row.program || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.yearLevel || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top font-bold">
                        {row.attendedEvents.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top font-bold">
                        {row.importedAbsences.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top font-bold">
                        {row.manualAbsences.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top text-base font-black">
                        {row.totalAbsences.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.totalAbsences > 0 ? (
                          <p className="font-semibold">
                            {row.prescribedPenalty ??
                              row.penalty?.prescribed_penalty ??
                              "No prescribed penalty configured."}
                          </p>
                        ) : (
                          <p className="font-semibold text-emerald-700">
                            No fine
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                            row.attendanceStatus === "perfect_attendance"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {row.attendanceStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenEditRow(row)}
                          disabled={row.isSavedResult}
                          className="min-h-10 rounded-xl px-4 text-xs font-black"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoading || isPreviewing
                        ? "Loading calculation records..."
                        : "No calculation rows found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
            setRecordEditForms([]);
          }
        }}
      >
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit source records for calculation row</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEditedRow} className="space-y-5">
            <div className="space-y-4">
              {recordEditForms.map((form, index) => (
                <div
                  key={`${form.recordType}-${form.recordId}`}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="mb-4 flex flex-col gap-1">
                    <p className="text-sm font-black uppercase tracking-wide">
                      {form.recordType === "imported"
                        ? "Imported record"
                        : "Manual record"}
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Event: {form.eventName || "—"}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-2 text-sm font-bold">
                      <span>Student ID</span>
                      <Input
                        value={form.studentId}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "studentId",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>Name</span>
                      <Input
                        value={form.name}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "name",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>No. of Absences</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={form.noOfAbsences}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "noOfAbsences",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>Year Level</span>
                      <Input
                        value={form.yearLevel}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "yearLevel",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>College</span>
                      <Input
                        value={form.college}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "college",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>Program</span>
                      <Input
                        value={form.program}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "program",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold">
                      <span>Institution</span>
                      <Input
                        value={form.institution}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "institution",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-bold lg:col-span-2">
                      <span>Remarks</span>
                      <Input
                        value={form.remarks}
                        onChange={(event) =>
                          handleRecordEditFieldChange(
                            index,
                            "remarks",
                            event.target.value,
                          )
                        }
                        className="min-h-12 rounded-2xl"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border bg-background p-4 text-sm font-semibold text-muted-foreground">
              Editing {(recordEditForms.length || 0).toLocaleString()} specific
              source record/s for this calculation row.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingEdit}
                onClick={() => {
                  setEditingRow(null);
                  setRecordEditForms([]);
                }}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingEdit}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isSavingEdit ? "Saving..." : "Save Source Records"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}