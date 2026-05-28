import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import * as attendanceApi from "../../api/attendance";
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
import { Progress } from "../../components/ui/progress";

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

type CalculationProgressState = {
  id: string;
  label: string;
  detail: string;
  percent: number;
  processed: number;
  total: number;
  completed: boolean;
  startedAt: number;
  updatedAt: number;
};

type CalculationProgressPatch = Partial<
  Pick<
    CalculationProgressState,
    "label" | "detail" | "percent" | "processed" | "total" | "completed"
  >
>;

type ImportedAttendanceLoadProgress = {
  loadedRecords: number;
  selectedRecords: number;
  page: number;
  pageSize: number;
  isComplete: boolean;
};

type ManualAttendanceLoadProgress = {
  loadedRecords: number;
  page: number;
  pageSize: number;
  isComplete: boolean;
};

type BuildCalculationRowsProgress = {
  processedStudents: number;
  totalStudents: number;
  sourceRecords: number;
};

type SelectedImportProgressSummary = {
  selectedImports: AttendanceImportRecord[];
  expectedImportedRecords: number;
};

type PaginatedAttendanceApi = typeof attendanceApi & {
  listAttendanceRecords?: (options: {
    schoolYearId?: string;
    limit?: number;
    offset?: number;
  }) => Promise<AttendanceRecord[]>;
};

const attendanceApiWithPagination = attendanceApi as PaginatedAttendanceApi;

const CALCULATION_PROGRESS_STORAGE_KEY = "penalyze.calculate.progress";
const CALCULATION_PROGRESS_STALE_MS = 1000 * 60 * 60;

function clampProgressPercent(value: unknown) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.min(100, Math.max(0, numericValue));
}

function getProgressRangePercent(
  processed: number,
  total: number,
  startPercent: number,
  endPercent: number,
) {
  if (!total || total <= 0) return clampProgressPercent(startPercent);

  const safeProcessed = Math.min(Math.max(processed, 0), total);
  const safeTotal = Math.max(total, 1);
  const ratio = safeProcessed / safeTotal;

  return clampProgressPercent(
    startPercent + ratio * (endPercent - startPercent),
  );
}

function getSelectedImportProgressSummary(
  imports: AttendanceImportRecord[],
  selectedImportIds: string[],
): SelectedImportProgressSummary {
  const selectedIds = new Set(selectedImportIds);
  const selectedImports = imports.filter((importRecord) =>
    selectedIds.has(importRecord.id),
  );
  const expectedImportedRecords = selectedImports.reduce(
    (totalRows, importRecord) => {
      const validRows = Number(importRecord.rows_valid ?? 0);
      const totalImportedRows = Number(importRecord.rows_total ?? 0);
      const bestKnownRows =
        Number.isFinite(validRows) && validRows > 0
          ? validRows
          : totalImportedRows;

      if (!Number.isFinite(bestKnownRows)) return totalRows;

      return totalRows + Math.max(0, bestKnownRows);
    },
    0,
  );

  return {
    selectedImports,
    expectedImportedRecords,
  };
}

function readStoredCalculationProgress() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(
      CALCULATION_PROGRESS_STORAGE_KEY,
    );

    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue) as CalculationProgressState;
    const updatedAt = Number(parsedValue.updatedAt || 0);
    const isStale =
      !updatedAt || Date.now() - updatedAt > CALCULATION_PROGRESS_STALE_MS;

    if (isStale || (parsedValue.completed && Date.now() - updatedAt > 5000)) {
      window.localStorage.removeItem(CALCULATION_PROGRESS_STORAGE_KEY);
      return null;
    }

    return {
      ...parsedValue,
      percent: clampProgressPercent(parsedValue.percent),
      processed: Math.max(0, Number(parsedValue.processed || 0)),
      total: Math.max(0, Number(parsedValue.total || 0)),
      completed: Boolean(parsedValue.completed),
    } satisfies CalculationProgressState;
  } catch {
    window.localStorage.removeItem(CALCULATION_PROGRESS_STORAGE_KEY);
    return null;
  }
}

function persistCalculationProgress(progress: CalculationProgressState | null) {
  if (typeof window === "undefined") return;

  if (!progress) {
    window.localStorage.removeItem(CALCULATION_PROGRESS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    CALCULATION_PROGRESS_STORAGE_KEY,
    JSON.stringify(progress),
  );
}

function yieldCalculationProgressFrame() {
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();

      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };

      channel.port2.postMessage(undefined);
      return;
    }

    if (typeof window === "undefined") {
      resolve();
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

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

type BackendEventOrderedRecord = {
  id?: string | null;
  event_order?: number | string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  scanned_at?: string | null;
  created_at?: string | null;
  event_name?: string | null;
  file_name?: string | null;
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
    leftRecord.event_name ?? leftRecord.file_name ?? leftRecord.id ?? "",
    rightRecord.event_name ?? rightRecord.file_name ?? rightRecord.id ?? "",
  );
}

function sortByBackendEventOrder<T extends BackendEventOrderedRecord>(
  records: T[],
) {
  return [...records].sort(compareByBackendEventOrder);
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
    ...row.attendanceRecords.map((record) => ({
      record,
      recordType: "imported" as const,
    })),
    ...row.manualRecords.map((record) => ({
      record,
      recordType: "manual" as const,
    })),
  ]
    .sort((leftRecord, rightRecord) =>
      compareByBackendEventOrder(leftRecord.record, rightRecord.record),
    )
    .map((item) => toSourceRecordEditForm(item.record, item.recordType));
}

function buildAttendanceInput(
  form: SourceRecordEditFormState,
): ManualAttendanceInput {
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

async function listSelectedImportedAttendanceRecords(
  options: { schoolYearId?: string; importIds: string[] } = { importIds: [] },
  onProgress?: (progress: ImportedAttendanceLoadProgress) => void,
) {
  const pageSize = 500;
  const maxPages = 100;
  const selectedImportIds = new Set(options.importIds);
  const rows: AttendanceRecord[] = [];
  let loadedRecords = 0;

  const appendSelectedRows = (pageRows: AttendanceRecord[]) => {
    pageRows.forEach((record) => {
      if (!record.import_id) return;
      if (selectedImportIds.size && !selectedImportIds.has(record.import_id)) {
        return;
      }

      rows.push(record);
    });
  };

  const emitProgress = (pageRows: AttendanceRecord[], page: number) => {
    loadedRecords += pageRows.length;

    const isComplete = pageRows.length < pageSize || page >= maxPages;

    onProgress?.({
      loadedRecords,
      selectedRecords: rows.length,
      page,
      pageSize,
      isComplete,
    });

    return isComplete;
  };

  const paginatedListAttendanceRecords =
    attendanceApiWithPagination.listAttendanceRecords;

  if (!paginatedListAttendanceRecords) {
    const allRows = await attendanceApi.listAllAttendanceRecords({
      schoolYearId: options.schoolYearId,
      importIds: options.importIds,
      pageSize,
      maxPages,
    });

    for (let page = 0; page < maxPages; page += 1) {
      const pageRows = allRows.slice(page * pageSize, (page + 1) * pageSize);

      appendSelectedRows(pageRows);

      const isComplete = emitProgress(pageRows, page + 1);

      await yieldCalculationProgressFrame();

      if (isComplete) break;
    }

    return rows;
  }

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await paginatedListAttendanceRecords({
      schoolYearId: options.schoolYearId,
      importIds: options.importIds,
      limit: pageSize,
      offset: page * pageSize,
    });

    appendSelectedRows(pageRows);

    const isComplete = emitProgress(pageRows, page + 1);

    await yieldCalculationProgressFrame();

    if (isComplete) break;
  }

  return rows;
}

async function listAllManualAttendanceRecords(
  options: { schoolYearId?: string } = {},
  onProgress?: (progress: ManualAttendanceLoadProgress) => void,
) {
  const pageSize = 500;
  const rows: ManualAttendanceRecord[] = [];

  for (let page = 0; page < 100; page += 1) {
    const pageRows = await attendanceApi.listManualAttendanceRecords({
      schoolYearId: options.schoolYearId,
      limit: pageSize,
      offset: page * pageSize,
    });

    rows.push(...pageRows);

    const isComplete = pageRows.length < pageSize;

    onProgress?.({
      loadedRecords: rows.length,
      page: page + 1,
      pageSize,
      isComplete,
    });

    await yieldCalculationProgressFrame();

    if (isComplete) break;
  }

  return rows;
}

async function buildCalculationRows(
  props: {
    attendanceRecords: AttendanceRecord[];
    manualRecords: ManualAttendanceRecord[];
    penalties: PenaltyRecord[];
    importIds: string[];
  },
  onProgress?: (progress: BuildCalculationRowsProgress) => void,
) {
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
  const totalStudents = studentKeys.length;
  const sourceRecords = importedRecords.length + props.manualRecords.length;
  const rows: CalculationRow[] = [];

  if (!totalStudents) {
    onProgress?.({
      processedStudents: 0,
      totalStudents: 0,
      sourceRecords,
    });

    return rows;
  }

  for (let index = 0; index < studentKeys.length; index += 1) {
    const studentKey = studentKeys[index];
    const attendanceGroup = sortByBackendEventOrder(
      groupedRecords.get(studentKey) ?? [],
    );
    const manualGroup = sortByBackendEventOrder(
      groupedManualRecords.get(studentKey) ?? [],
    );
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

    rows.push({
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
          ? (penalty?.prescribed_penalty ?? "No prescribed penalty configured.")
          : null,
      penalty,
      sourceRecordCount: attendanceGroup.length + manualGroup.length,
      attendanceRecords: attendanceGroup,
      manualRecords: manualGroup,
      calculatedAt: new Date().toISOString(),
      isSavedResult: false,
    } satisfies CalculationRow);

    const processedStudents = index + 1;

    onProgress?.({
      processedStudents,
      totalStudents,
      sourceRecords,
    });

    await yieldCalculationProgressFrame();
  }

  return rows.sort((leftRow, rightRow) => {
    const absenceDifference = rightRow.totalAbsences - leftRow.totalAbsences;
    if (absenceDifference !== 0) return absenceDifference;

    return leftRow.studentId.localeCompare(rightRow.studentId, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function SchoolYearBadge(props: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-h-12 items-center rounded-2xl border bg-background px-4 text-sm font-black ${props.className ?? ""}`}
    >
      {props.label}
    </span>
  );
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
              result.prescribed_penalty ?? "No prescribed penalty configured.",
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
  const [selectedCalculationRowKeys, setSelectedCalculationRowKeys] = useState<
    string[]
  >([]);
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
  const [isDeletingCalculationRows, setIsDeletingCalculationRows] =
    useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [calculationProgress, setCalculationProgress] =
    useState<CalculationProgressState | null>(() =>
      readStoredCalculationProgress(),
    );
  const activeProgressTaskIdRef = useRef("");
  const progressClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  const filteredRowKeys = useMemo(() => {
    return filteredRows.map((row) => row.key);
  }, [filteredRows]);

  const selectedFilteredCalculationRowCount = useMemo(() => {
    const filteredKeys = new Set(filteredRowKeys);

    return selectedCalculationRowKeys.filter((key) => filteredKeys.has(key))
      .length;
  }, [filteredRowKeys, selectedCalculationRowKeys]);

  const allFilteredCalculationRowsSelected =
    filteredRowKeys.length > 0 &&
    selectedFilteredCalculationRowCount === filteredRowKeys.length;

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

  const setStoredCalculationProgress = useCallback(
    (progress: CalculationProgressState | null) => {
      setCalculationProgress(progress);
      persistCalculationProgress(progress);
    },
    [],
  );

  const startCalculationProgress = useCallback(
    (label: string, detail: string) => {
      const now = Date.now();
      const id = `${now}-${Math.random().toString(36).slice(2)}`;
      const nextProgress = {
        id,
        label,
        detail,
        percent: 0,
        processed: 0,
        total: 0,
        completed: false,
        startedAt: now,
        updatedAt: now,
      } satisfies CalculationProgressState;

      activeProgressTaskIdRef.current = id;

      if (progressClearTimeoutRef.current) {
        clearTimeout(progressClearTimeoutRef.current);
        progressClearTimeoutRef.current = null;
      }

      setStoredCalculationProgress(nextProgress);

      return id;
    },
    [setStoredCalculationProgress],
  );

  const updateCalculationProgress = useCallback(
    (taskId: string, patch: CalculationProgressPatch) => {
      if (!taskId || activeProgressTaskIdRef.current !== taskId) return;

      setCalculationProgress((currentProgress) => {
        if (!currentProgress || currentProgress.id !== taskId) {
          return currentProgress;
        }

        const nextProgress = {
          ...currentProgress,
          ...patch,
          percent: clampProgressPercent(
            patch.percent ?? currentProgress.percent,
          ),
          processed: Math.max(
            0,
            Number(patch.processed ?? currentProgress.processed ?? 0),
          ),
          total: Math.max(0, Number(patch.total ?? currentProgress.total ?? 0)),
          updatedAt: Date.now(),
        } satisfies CalculationProgressState;

        persistCalculationProgress(nextProgress);

        return nextProgress;
      });
    },
    [],
  );

  const finishCalculationProgress = useCallback(
    (taskId: string, detail: string) => {
      updateCalculationProgress(taskId, {
        detail,
        percent: 100,
        completed: true,
      });

      if (progressClearTimeoutRef.current) {
        clearTimeout(progressClearTimeoutRef.current);
      }

      progressClearTimeoutRef.current = setTimeout(() => {
        if (activeProgressTaskIdRef.current !== taskId) return;

        activeProgressTaskIdRef.current = "";
        setStoredCalculationProgress(null);
        progressClearTimeoutRef.current = null;
      }, 1800);
    },
    [setStoredCalculationProgress, updateCalculationProgress],
  );

  const failCalculationProgress = useCallback(
    (taskId: string, detail: string) => {
      updateCalculationProgress(taskId, {
        detail,
        completed: true,
      });

      if (activeProgressTaskIdRef.current === taskId) {
        activeProgressTaskIdRef.current = "";
      }
    },
    [updateCalculationProgress],
  );

  async function loadSavedResults(
    nextSchoolYearId = selectedSchoolYearId,
    nextImportIds = selectedImportIds,
    progressTaskId?: string,
  ) {
    const taskId =
      progressTaskId ??
      startCalculationProgress(
        "Loading saved calculation results",
        "Loading school years and penalties",
      );

    setIsLoading(true);
    updateCalculationProgress(taskId, {
      detail: "Loading school years and penalties",
      percent: progressTaskId ? 72 : 8,
      processed: 0,
      total: 0,
    });
    await yieldCalculationProgressFrame();

    try {
      const [schoolYearRows, penaltyRows] = await Promise.all([
        listSchoolYears({ activeOnly: true }),
        listPenalties(),
      ]);
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        nextSchoolYearId !== ALL_SCHOOL_YEARS_VALUE &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : getActiveSchoolYearId(schoolYearRows) || ALL_SCHOOL_YEARS_VALUE;
      const requestSchoolYearId =
        fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE
          ? undefined
          : fallbackSchoolYearId || undefined;
      const requestImportIds = nextImportIds.length ? nextImportIds : undefined;

      updateCalculationProgress(taskId, {
        detail: "Loading imports and saved calculation rows",
        percent: progressTaskId ? 78 : 32,
        processed: 0,
        total: 0,
      });
      await yieldCalculationProgressFrame();

      const [importRows, resultRows] = await Promise.all([
        attendanceApi.listAttendanceImports({
          schoolYearId: requestSchoolYearId,
          limit: 500,
          offset: 0,
        }),
        attendanceApi.listCalculationResults({
          schoolYearId: requestSchoolYearId,
          importIds: requestImportIds,
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

      updateCalculationProgress(taskId, {
        detail: `Loaded ${savedRows.length.toLocaleString()} saved calculation row/s`,
        percent: progressTaskId ? 92 : 82,
        processed: savedRows.length,
        total: savedRows.length,
      });
      await yieldCalculationProgressFrame();

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setAttendanceImports(sortByBackendEventOrder(importRows));
      setPenalties(penaltyRows);
      setCalculationRows(savedRows);
      setSelectedCalculationRowKeys([]);
      setLastCalculatedAt(latestCalculatedAt ?? "");
      setCalculationMode("saved");

      finishCalculationProgress(taskId, "Saved calculation results loaded.");
    } catch (error) {
      failCalculationProgress(
        taskId,
        error instanceof Error
          ? error.message
          : "Unable to load saved calculation results.",
      );
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
    progressTaskId?: string,
  ) {
    const taskId =
      progressTaskId ??
      startCalculationProgress(
        "Calculating attendance fines",
        "Preparing calculation",
      );
    const requestSchoolYearId =
      nextSchoolYearId === ALL_SCHOOL_YEARS_VALUE
        ? undefined
        : nextSchoolYearId;
    const { selectedImports, expectedImportedRecords } =
      getSelectedImportProgressSummary(attendanceImports, nextImportIds);
    const selectedImportCount = selectedImports.length || nextImportIds.length;
    const importedStartPercent = progressTaskId ? 58 : 8;
    const importedRequestPercent = progressTaskId ? 62 : 18;
    const importedEndPercent = progressTaskId ? 68 : 46;
    const manualStartPercent = progressTaskId ? 68 : 48;
    const manualEndPercent = progressTaskId ? 78 : 68;
    const calculationStartPercent = progressTaskId ? 80 : 72;
    const calculationEndPercent = 96;

    updateCalculationProgress(taskId, {
      label: "Calculating attendance fines",
      detail: expectedImportedRecords
        ? `Preparing ${expectedImportedRecords.toLocaleString()} expected imported row/s from ${selectedImportCount.toLocaleString()} selected file/s`
        : `Preparing selected imported file/s`,
      percent: importedStartPercent,
      processed: 0,
      total: expectedImportedRecords,
    });
    await yieldCalculationProgressFrame();

    updateCalculationProgress(taskId, {
      detail: expectedImportedRecords
        ? `Requesting ${expectedImportedRecords.toLocaleString()} imported attendance row/s`
        : "Requesting imported attendance records",
      percent: importedRequestPercent,
      processed: 0,
      total: expectedImportedRecords,
    });
    await yieldCalculationProgressFrame();

    try {
      const selectedAttendanceRows =
        await listSelectedImportedAttendanceRecords(
          {
            schoolYearId: requestSchoolYearId,
            importIds: nextImportIds,
          },
          (progress) => {
            const importedProgressTotal =
              expectedImportedRecords ||
              Math.max(
                progress.selectedRecords,
                progress.page * progress.pageSize,
              );
            const pagePercent = Math.min(
              importedEndPercent,
              importedRequestPercent + progress.page * 2,
            );
            const rowPercent = getProgressRangePercent(
              progress.selectedRecords,
              importedProgressTotal,
              importedRequestPercent,
              importedEndPercent,
            );

            updateCalculationProgress(taskId, {
              detail: progress.isComplete
                ? `Loaded ${progress.selectedRecords.toLocaleString()} selected imported attendance record/s from ${progress.page.toLocaleString()} page/s`
                : `Loaded page ${progress.page.toLocaleString()} with ${progress.selectedRecords.toLocaleString()} selected imported row/s from ${progress.loadedRecords.toLocaleString()} fetched row/s`,
              percent: progress.isComplete
                ? importedEndPercent
                : Math.max(pagePercent, rowPercent),
              processed: progress.selectedRecords,
              total: expectedImportedRecords || importedProgressTotal,
            });
          },
        );
      const selectedImportedRecordCount = selectedAttendanceRows.length;
      const importedRecordProgressTotal =
        expectedImportedRecords || selectedImportedRecordCount;

      updateCalculationProgress(taskId, {
        detail: `Loaded ${selectedImportedRecordCount.toLocaleString()} imported attendance record/s`,
        percent: importedEndPercent,
        processed: selectedImportedRecordCount,
        total: importedRecordProgressTotal,
      });
      await yieldCalculationProgressFrame();

      updateCalculationProgress(taskId, {
        detail: "Loading manual attendance records",
        percent: manualStartPercent,
        processed: 0,
        total: 0,
      });
      await yieldCalculationProgressFrame();

      const manualRows = await listAllManualAttendanceRecords(
        {
          schoolYearId: requestSchoolYearId,
        },
        (progress) => {
          const pagePercent = Math.min(
            manualEndPercent,
            manualStartPercent + progress.page * 2,
          );

          updateCalculationProgress(taskId, {
            detail: `Loaded ${progress.loadedRecords.toLocaleString()} manual attendance record/s from ${progress.page.toLocaleString()} page/s`,
            percent: progress.isComplete ? manualEndPercent : pagePercent,
            processed: progress.loadedRecords,
            total: progress.isComplete
              ? progress.loadedRecords
              : Math.max(progress.loadedRecords, progress.pageSize),
          });
        },
      );
      const totalSourceRecords =
        selectedImportedRecordCount + manualRows.length;

      updateCalculationProgress(taskId, {
        detail: `Calculating ${totalSourceRecords.toLocaleString()} source record/s`,
        percent: calculationStartPercent,
        processed: 0,
        total: totalSourceRecords,
      });
      await yieldCalculationProgressFrame();

      const nextRows = await buildCalculationRows(
        {
          attendanceRecords: selectedAttendanceRows,
          manualRecords: manualRows,
          penalties,
          importIds: nextImportIds,
        },
        (progress) => {
          updateCalculationProgress(taskId, {
            detail: `Calculated ${progress.processedStudents.toLocaleString()} of ${progress.totalStudents.toLocaleString()} student/s from ${progress.sourceRecords.toLocaleString()} source record/s`,
            percent: getProgressRangePercent(
              progress.processedStudents,
              progress.totalStudents,
              calculationStartPercent,
              calculationEndPercent,
            ),
            processed: progress.processedStudents,
            total: progress.totalStudents,
          });
        },
      );

      updateCalculationProgress(taskId, {
        detail: `Prepared ${nextRows.length.toLocaleString()} calculation row/s`,
        percent: 98,
        processed: nextRows.length,
        total: nextRows.length,
      });
      await yieldCalculationProgressFrame();

      setCalculationRows(nextRows);
      setSelectedCalculationRowKeys([]);
      setLastCalculatedAt(new Date().toISOString());
      setCalculationMode("preview");

      finishCalculationProgress(taskId, "Calculation preview completed.");

      return nextRows;
    } catch (error) {
      failCalculationProgress(
        taskId,
        error instanceof Error
          ? error.message
          : "Unable to preview calculation.",
      );

      throw error;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncStoredProgress = () => {
      setCalculationProgress(readStoredCalculationProgress());
    };
    const handleStorageProgress = (event: StorageEvent) => {
      if (event.key !== CALCULATION_PROGRESS_STORAGE_KEY) return;

      syncStoredProgress();
    };

    window.addEventListener("storage", handleStorageProgress);
    window.addEventListener("focus", syncStoredProgress);
    document.addEventListener("visibilitychange", syncStoredProgress);

    return () => {
      window.removeEventListener("storage", handleStorageProgress);
      window.removeEventListener("focus", syncStoredProgress);
      document.removeEventListener("visibilitychange", syncStoredProgress);

      if (progressClearTimeoutRef.current) {
        clearTimeout(progressClearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void loadSavedResults();
  }, []);


  function handleToggleCalculationRow(rowKey: string) {
    setSelectedCalculationRowKeys((currentKeys) => {
      if (currentKeys.includes(rowKey)) {
        return currentKeys.filter((key) => key !== rowKey);
      }

      return [...currentKeys, rowKey];
    });
  }

  function handleToggleAllCalculationRows() {
    setSelectedCalculationRowKeys((currentKeys) => {
      if (allFilteredCalculationRowsSelected) {
        const filteredKeys = new Set(filteredRowKeys);

        return currentKeys.filter((key) => !filteredKeys.has(key));
      }

      return Array.from(new Set([...currentKeys, ...filteredRowKeys]));
    });
  }

  function getSelectedCalculationRows(rowKeys: string[]) {
    const keySet = new Set(rowKeys);

    return filteredRows.filter((row) => keySet.has(row.key));
  }

  async function deleteSavedCalculationRows(rows: CalculationRow[]) {
    const resultIds = rows
      .map((row) => row.resultId)
      .filter((id): id is string => Boolean(id));

    if (resultIds.length) {
      await attendanceApi.deleteCalculationResultsByIds(resultIds);
    }

    return resultIds.length;
  }

  async function handleDeleteSelectedCalculationRows() {
    const filteredKeys = new Set(filteredRowKeys);
    const keysToDelete = selectedCalculationRowKeys.filter((key) =>
      filteredKeys.has(key),
    );
    const rowsToDelete = getSelectedCalculationRows(keysToDelete);

    if (!rowsToDelete.length) {
      toast.error("Please select calculation rows to delete.");
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete the selected calculation rows?")
    ) {
      return;
    }

    setIsDeletingCalculationRows(true);

    try {
      const savedDeleteCount = await deleteSavedCalculationRows(rowsToDelete);

      setCalculationRows((currentRows) =>
        currentRows.filter((row) => !keysToDelete.includes(row.key)),
      );
      setSelectedCalculationRowKeys((currentKeys) =>
        currentKeys.filter((key) => !keysToDelete.includes(key)),
      );

      if (savedDeleteCount > 0) {
        await loadSavedResults(selectedSchoolYearId, selectedImportIds);
      }

      toast.success(
        `${rowsToDelete.length.toLocaleString()} calculation row/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete calculation rows.",
      );
    } finally {
      setIsDeletingCalculationRows(false);
    }
  }

  async function handleDeleteAllCalculationRows() {
    const rowsToDelete = filteredRows;

    if (!rowsToDelete.length) {
      toast.error("No calculation rows to delete.");
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete all displayed calculation rows?")
    ) {
      return;
    }

    setIsDeletingCalculationRows(true);

    try {
      const shouldDeleteWholeSchoolYear =
        calculationMode === "saved" &&
        selectedSchoolYearId !== ALL_SCHOOL_YEARS_VALUE &&
        !searchText.trim() &&
        !selectedImportIds.length;

      if (shouldDeleteWholeSchoolYear) {
        await attendanceApi.deleteCalculationResultsBySchoolYear(
          selectedSchoolYearId,
        );
        await loadSavedResults(selectedSchoolYearId, selectedImportIds);
      } else {
        const savedDeleteCount = await deleteSavedCalculationRows(rowsToDelete);
        const keysToDelete = new Set(rowsToDelete.map((row) => row.key));

        setCalculationRows((currentRows) =>
          currentRows.filter((row) => !keysToDelete.has(row.key)),
        );

        if (savedDeleteCount > 0) {
          await loadSavedResults(selectedSchoolYearId, selectedImportIds);
        }
      }

      setSelectedCalculationRowKeys([]);
      toast.success(
        `${rowsToDelete.length.toLocaleString()} calculation row/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete calculation rows.",
      );
    } finally {
      setIsDeletingCalculationRows(false);
    }
  }

  function sortImportIdsByBackendEventOrder(importIds: string[]) {
    const importOrder = new Map<string, number>(
      attendanceImports.map((importRecord, index) => [importRecord.id, index]),
    );

    return [...importIds].sort((leftId, rightId) => {
      const leftIndex = importOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = importOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER;

      if (leftIndex !== rightIndex) return leftIndex - rightIndex;

      return leftId.localeCompare(rightId);
    });
  }

  function handleImportToggle(importId: string) {
    setSelectedImportIds((current) => {
      const next = current.includes(importId)
        ? current.filter((id) => id !== importId)
        : [...current, importId];

      return sortImportIdsByBackendEventOrder(next);
    });
  }

  function handleSelectAllImports() {
    setSelectedImportIds(
      attendanceImports.map((importRecord) => importRecord.id),
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
      const rows = await loadPreviewRows(
        selectedSchoolYearId,
        selectedImportIds,
      );

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

    const progressTaskId = startCalculationProgress(
      "Saving calculation results",
      "Saving calculated results",
    );

    setIsSavingResults(true);
    updateCalculationProgress(progressTaskId, {
      percent: 12,
      detail: "Saving calculated results",
      processed: 0,
      total: calculationRows.length,
    });
    await yieldCalculationProgressFrame();

    try {
      const requestSchoolYearId =
        selectedSchoolYearId === ALL_SCHOOL_YEARS_VALUE
          ? undefined
          : selectedSchoolYearId;

      await attendanceApi.refreshCalculationResults({
        schoolYearId: requestSchoolYearId,
        importIds: selectedImportIds,
      });

      updateCalculationProgress(progressTaskId, {
        percent: 70,
        detail: "Reloading saved calculation results",
        processed: calculationRows.length,
        total: calculationRows.length,
      });
      await yieldCalculationProgressFrame();

      toast.success("Calculation results saved.");
      await loadSavedResults(
        selectedSchoolYearId,
        selectedImportIds,
        progressTaskId,
      );
    } catch (error) {
      failCalculationProgress(
        progressTaskId,
        error instanceof Error
          ? error.message
          : "Unable to save calculated results.",
      );
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

    const progressTaskId = startCalculationProgress(
      "Saving source record edits",
      "Saving source records",
    );

    setIsSavingEdit(true);
    updateCalculationProgress(progressTaskId, {
      detail: "Saving source records",
      percent: 8,
      processed: 0,
      total: recordEditForms.length,
    });
    await yieldCalculationProgressFrame();

    try {
      for (let index = 0; index < recordEditForms.length; index += 1) {
        const form = recordEditForms[index];

        await attendanceApi.updateAttendanceRecord(
          form.recordId,
          buildAttendanceInput(form),
        );

        updateCalculationProgress(progressTaskId, {
          detail: `Saved ${index + 1} of ${recordEditForms.length} source record/s`,
          percent: getProgressRangePercent(
            index + 1,
            recordEditForms.length,
            12,
            54,
          ),
          processed: index + 1,
          total: recordEditForms.length,
        });
        await yieldCalculationProgressFrame();
      }

      toast.success("Source records updated.");
      setEditingRow(null);
      setRecordEditForms([]);
      await loadPreviewRows(
        selectedSchoolYearId,
        [],
        progressTaskId,
      );
    } catch (error) {
      failCalculationProgress(
        progressTaskId,
        error instanceof Error
          ? error.message
          : "Unable to update calculation row.",
      );
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
              <SchoolYearBadge
                label={selectedSchoolYearLabel}
                className="w-full justify-center sm:w-auto"
              />

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
                  disabled={
                    isPreviewing || isLoading || !selectedImportIds.length
                  }
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

          {calculationProgress ? (
            <div className="mt-5 rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {calculationProgress.label}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                    {calculationProgress.detail}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-black">
                  {Math.round(calculationProgress.percent)}%
                </p>
              </div>
              <Progress
                value={calculationProgress.percent}
                className="mt-4 h-3 rounded-full"
              />
              {calculationProgress.total > 0 ? (
                <div className="mt-2 flex justify-end text-xs font-bold text-muted-foreground">
                  {calculationProgress.processed.toLocaleString()} /{" "}
                  {calculationProgress.total.toLocaleString()}
                </div>
              ) : null}
            </div>
          ) : null}
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
            <p className="text-sm font-bold text-muted-foreground">Students</p>
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
              <h2 className="text-xl font-black">
                Imported files to calculate
              </h2>
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
                      Valid rows:{" "}
                      {Number(importRecord.rows_valid || 0).toLocaleString()} /{" "}
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
                Mode:{" "}
                {calculationMode === "saved" ? "Saved results" : "Preview"} •
                Source records: {summary.sourceRecords.toLocaleString()} • Last
                calculated: {formatDateTime(lastCalculatedAt)}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search student, college, program, or penalty"
                className="min-h-12 rounded-2xl lg:max-w-md"
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  isDeletingCalculationRows ||
                  selectedFilteredCalculationRowCount === 0
                }
                onClick={handleDeleteSelectedCalculationRows}
                className="min-h-12 rounded-2xl px-4 text-xs font-black"
              >
                {isDeletingCalculationRows
                  ? "Deleting..."
                  : `Delete Selected (${selectedFilteredCalculationRowCount})`}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeletingCalculationRows || filteredRows.length === 0}
                onClick={handleDeleteAllCalculationRows}
                className="min-h-12 rounded-2xl px-4 text-xs font-black"
              >
                Delete All
              </Button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredCalculationRowsSelected}
                      onChange={handleToggleAllCalculationRows}
                      disabled={!filteredRows.length}
                      aria-label="Select all calculation rows"
                      className="size-4 rounded border"
                    />
                  </th>
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
                        <input
                          type="checkbox"
                          checked={selectedCalculationRowKeys.includes(row.key)}
                          onChange={() => handleToggleCalculationRow(row.key)}
                          aria-label={`Select ${row.studentId}`}
                          className="size-4 rounded border"
                        />
                      </td>
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
                      colSpan={10}
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