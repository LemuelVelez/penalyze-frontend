import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import * as attendanceApi from "../../api/attendance";
import type {
  AttendanceImportRecord,
  AttendanceRecord,
  CalculationResultRecord,
  CalculationSourceType,
  ManualAttendanceInput,
  ManualAttendanceRecord,
} from "../../api/attendance";
import type { PenaltyRecord } from "../../api/fines";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { ProtectedDeleteDialog } from "../../components/protected-delete-dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
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

const ZERO_ATTENDANCE_REMARK =
  "Zero attendance registration from landing page.";

const CALCULATION_SOURCE_OPTIONS: Array<{
  value: CalculationSourceType;
  title: string;
  description: string;
}> = [
  {
    value: "imported",
    title: "Imported files",
    description: "Include selected uploaded attendance files.",
  },
  {
    value: "manual",
    title: "Manual attendance",
    description: "Include manual attendance records encoded by officers.",
  },
  {
    value: "zero_attendance",
    title: "Zero attendance",
    description: "Include zero-attendance registrations and records.",
  },
];

const DEFAULT_SELECTED_CALCULATION_SOURCES = CALCULATION_SOURCE_OPTIONS.map(
  (option) => option.value,
);

type CalculationRow = {
  key: string;
  resultId?: string;
  schoolYearId: string | null;
  calculationScopeKey?: string;
  importIds: string[];
  sourceTypes?: CalculationSourceType[];
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

function isZeroAttendanceRecord(record: AttendanceRecord) {
  return normalizeValue(record.remarks)
    .toLowerCase()
    .includes(ZERO_ATTENDANCE_REMARK.toLowerCase());
}

function isZeroManualAttendanceRecord(record: ManualAttendanceRecord) {
  return (
    record.attendance_type === "zero_attendance" ||
    normalizeValue(record.remarks)
      .toLowerCase()
      .includes(ZERO_ATTENDANCE_REMARK.toLowerCase())
  );
}

function sortCalculationSourceTypes(sourceTypes: CalculationSourceType[]) {
  const selectedSourceTypes = new Set(sourceTypes);

  return CALCULATION_SOURCE_OPTIONS.map((option) => option.value).filter(
    (sourceType) => selectedSourceTypes.has(sourceType),
  );
}

function normalizeCalculationSourceTypes(sourceTypes: CalculationSourceType[]) {
  const sortedSourceTypes = sortCalculationSourceTypes(sourceTypes);

  return sortedSourceTypes.length
    ? sortedSourceTypes
    : [...DEFAULT_SELECTED_CALCULATION_SOURCES];
}

function getCalculationScopeKey(
  importIds: string[],
  sourceTypes: CalculationSourceType[],
) {
  const normalizedImportIds = [...importIds].sort((leftId, rightId) =>
    leftId.localeCompare(rightId),
  );
  const normalizedSourceTypes = normalizeCalculationSourceTypes(sourceTypes);

  if (
    !normalizedImportIds.length &&
    normalizedSourceTypes.length === DEFAULT_SELECTED_CALCULATION_SOURCES.length
  ) {
    return "school_year";
  }

  return [
    `sources:${normalizedSourceTypes.join(",") || "none"}`,
    `imports:${normalizedImportIds.join(",") || "all"}`,
  ].join("|");
}

function getCalculationSourceLabel(sourceType: CalculationSourceType) {
  return (
    CALCULATION_SOURCE_OPTIONS.find((option) => option.value === sourceType)
      ?.title ?? sourceType
  );
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

function buildRecordEditForms(
  attendanceRecords: AttendanceRecord[],
  manualRecords: ManualAttendanceRecord[],
) {
  return [
    ...attendanceRecords.map((record) => ({
      record,
      recordType: "imported" as const,
    })),
    ...manualRecords.map((record) => ({
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function listAllAttendanceImports(options: {
  schoolYearId?: string;
  signal: AbortSignal;
}) {
  const pageSize = 500;
  const rows: AttendanceImportRecord[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageRows = await attendanceApi.listAttendanceImports({
      schoolYearId: options.schoolYearId,
      limit: pageSize,
      offset,
      signal: options.signal,
    });
    rows.push(...pageRows);

    if (pageRows.length < pageSize) return rows;
  }
}

async function listAllCalculationResults(options: {
  schoolYearId?: string;
  importIds?: string[];
  sourceTypes: CalculationSourceType[];
  signal: AbortSignal;
}) {
  const pageSize = 1000;
  const rows: CalculationResultRecord[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageRows = await attendanceApi.listCalculationResults({
      schoolYearId: options.schoolYearId,
      importIds: options.importIds,
      sourceTypes: options.sourceTypes,
      limit: pageSize,
      offset,
      signal: options.signal,
    });
    rows.push(...pageRows);

    if (pageRows.length < pageSize) return rows;
  }
}

async function listStudentAttendanceRecords(options: {
  studentId: string;
  schoolYearId?: string;
  importIds?: string[];
  signal: AbortSignal;
}) {
  const pageSize = 500;
  const rows: AttendanceRecord[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageRows = await attendanceApi.listAttendanceRecords({
      studentId: options.studentId,
      schoolYearId: options.schoolYearId,
      importIds: options.importIds,
      limit: pageSize,
      offset,
      signal: options.signal,
    });
    rows.push(...pageRows);

    if (pageRows.length < pageSize) return rows;
  }
}

async function listStudentManualAttendanceRecords(options: {
  studentId: string;
  schoolYearId?: string;
  signal: AbortSignal;
}) {
  const pageSize = 500;
  const rows: ManualAttendanceRecord[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageRows = await attendanceApi.listManualAttendanceRecords({
      studentId: options.studentId,
      schoolYearId: options.schoolYearId,
      limit: pageSize,
      offset,
      signal: options.signal,
    });
    rows.push(...pageRows);

    if (pageRows.length < pageSize) return rows;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onCompleted?: (completed: number) => void,
) {
  if (!items.length) return;

  let nextIndex = 0;
  let completed = 0;
  let firstError: unknown;
  let hasError = false;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!hasError) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;

        try {
          await worker(items[index], index);
          completed += 1;
          onCompleted?.(completed);
        } catch (error) {
          if (!hasError) firstError = error;
          hasError = true;
        }
      }
    }),
  );

  if (hasError) throw firstError;
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
    calculatedAt: result.calculated_at,
    isSavedResult: true,
  } satisfies CalculationRow;
}

type CalculationTableRowProps = {
  row: CalculationRow;
  selected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  onEdit: (row: CalculationRow) => void;
};

const CalculationTableRow = memo(function CalculationTableRow({
  row,
  selected,
  onSelect,
  onEdit,
}: CalculationTableRowProps) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3 align-top">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(row.key, checked === true)}
          aria-label={`Select calculation row for ${row.studentId}`}
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
        <p className="text-muted-foreground">{row.program || "—"}</p>
        <p className="text-xs text-muted-foreground">{row.yearLevel || "—"}</p>
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
          <p className="font-semibold text-emerald-700">No fine</p>
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
          onClick={() => onEdit(row)}
          disabled={row.isSavedResult}
          className="min-h-10 rounded-xl px-4 text-xs font-black"
        >
          Edit
        </Button>
      </td>
    </tr>
  );
});

export default function CalculatePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(
    ALL_SCHOOL_YEARS_VALUE,
  );
  const [attendanceImports, setAttendanceImports] = useState<
    AttendanceImportRecord[]
  >([]);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [selectedCalculationSources, setSelectedCalculationSources] = useState<
    CalculationSourceType[]
  >([...DEFAULT_SELECTED_CALCULATION_SOURCES]);
  const [calculationRows, setCalculationRows] = useState<CalculationRow[]>([]);
  const [selectedCalculationRowKeys, setSelectedCalculationRowKeys] = useState<
    string[]
  >([]);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
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
  const [isLoadingEditRecords, setIsLoadingEditRecords] = useState(false);
  const [calculationProgress, setCalculationProgress] =
    useState<CalculationProgressState | null>(() =>
      readStoredCalculationProgress(),
    );
  const activeProgressTaskIdRef = useRef("");
  const progressClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeRequestIdRef = useRef(0);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const editRequestIdRef = useRef(0);
  const editRequestControllerRef = useRef<AbortController | null>(null);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const selectedImportLabels = useMemo(() => {
    const selectedIds = new Set(selectedImportIds);
    return attendanceImports
      .filter((importRecord) => selectedIds.has(importRecord.id))
      .map(formatImportLabel);
  }, [attendanceImports, selectedImportIds]);

  const selectedCalculationSourceLabels = useMemo(() => {
    return selectedCalculationSources.map(getCalculationSourceLabel);
  }, [selectedCalculationSources]);

  const selectedCalculationSourceSet = useMemo(() => {
    return new Set(selectedCalculationSources);
  }, [selectedCalculationSources]);

  const includesImportedSource = selectedCalculationSourceSet.has("imported");
  const canRunCalculation =
    selectedCalculationSources.length > 0 &&
    (!includesImportedSource || selectedImportIds.length > 0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  const searchableRows = useMemo(() => {
    return calculationRows.map((row) => ({
      row,
      searchText: [
        row.studentId,
        row.name,
        row.college,
        row.program,
        row.yearLevel,
        row.prescribedPenalty,
      ]
        .join(" ")
        .toLowerCase(),
    }));
  }, [calculationRows]);

  const filteredRows = useMemo(() => {
    const query = debouncedSearchText.trim().toLowerCase();
    if (!query) return calculationRows;

    return searchableRows
      .filter((searchableRow) => searchableRow.searchText.includes(query))
      .map((searchableRow) => searchableRow.row);
  }, [calculationRows, debouncedSearchText, searchableRows]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredRows.length / Number(rowsPerPage)));
  }, [filteredRows.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchText, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    if (rowsPerPage === "all") return filteredRows;
    const pageSize = Number(rowsPerPage);
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredRows, rowsPerPage]);

  const rangeStart = filteredRows.length
    ? rowsPerPage === "all"
      ? 1
      : (currentPage - 1) * Number(rowsPerPage) + 1
    : 0;
  const rangeEnd =
    rowsPerPage === "all"
      ? filteredRows.length
      : Math.min(currentPage * Number(rowsPerPage), filteredRows.length);

  const filteredRowKeys = useMemo(
    () => filteredRows.map((row) => row.key),
    [filteredRows],
  );

  const selectedCalculationRowKeySet = useMemo(
    () => new Set(selectedCalculationRowKeys),
    [selectedCalculationRowKeys],
  );

  const allFilteredRowsSelected = useMemo(() => {
    if (!filteredRowKeys.length) return false;

    return filteredRowKeys.every((key) => selectedCalculationRowKeySet.has(key));
  }, [filteredRowKeys, selectedCalculationRowKeySet]);

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

  const beginRequestRun = useCallback(() => {
    activeRequestControllerRef.current?.abort();

    const controller = new AbortController();
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    activeRequestControllerRef.current = controller;

    return { requestId, controller };
  }, []);

  const loadSavedResults = useCallback(
    async (
      nextSchoolYearId: string,
      nextImportIds: string[],
      nextSourceTypes: CalculationSourceType[],
      progressTaskId?: string,
    ) => {
      const { requestId, controller } = beginRequestRun();
      const { signal } = controller;
      const isCurrentRun = () =>
        activeRequestIdRef.current === requestId && !signal.aborted;
      const taskId =
        progressTaskId ??
        startCalculationProgress(
          "Loading saved calculation results",
          "Loading school years",
        );

      setIsPreviewing(false);
      setIsLoading(true);
      updateCalculationProgress(taskId, {
        detail: "Loading school years",
        percent: progressTaskId ? 72 : 8,
        processed: 0,
        total: 0,
      });
      await yieldCalculationProgressFrame();

      try {
        const schoolYearRows = await listSchoolYears({
          activeOnly: true,
          signal,
        });
        if (!isCurrentRun()) return;

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
        const normalizedSourceTypes =
          normalizeCalculationSourceTypes(nextSourceTypes);
        const requestImportIds =
          normalizedSourceTypes.includes("imported") && nextImportIds.length
            ? nextImportIds
            : undefined;

        updateCalculationProgress(taskId, {
          detail: "Loading imports and saved calculation rows",
          percent: progressTaskId ? 78 : 32,
          processed: 0,
          total: 0,
        });
        await yieldCalculationProgressFrame();

        const [importRows, resultRows] = await Promise.all([
          listAllAttendanceImports({
            schoolYearId: requestSchoolYearId,
            signal,
          }),
          listAllCalculationResults({
            schoolYearId: requestSchoolYearId,
            importIds: requestImportIds,
            sourceTypes: normalizedSourceTypes,
            signal,
          }),
        ]);
        if (!isCurrentRun()) return;

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
        if (!isCurrentRun()) return;

        setSchoolYears(schoolYearRows);
        setSelectedSchoolYearId(fallbackSchoolYearId);
        setSelectedCalculationSources(normalizedSourceTypes);
        setAttendanceImports(sortByBackendEventOrder(importRows));
        setCalculationRows(savedRows);
        setLastCalculatedAt(latestCalculatedAt ?? "");
        setCalculationMode("saved");

        finishCalculationProgress(taskId, "Saved calculation results loaded.");
      } catch (error) {
        if (isAbortError(error) || !isCurrentRun()) return;

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
        if (activeRequestIdRef.current === requestId) {
          setIsLoading(false);
          activeRequestControllerRef.current = null;
        }
      }
    },
    [
      beginRequestRun,
      failCalculationProgress,
      finishCalculationProgress,
      startCalculationProgress,
      updateCalculationProgress,
    ],
  );

  const loadPreviewRows = useCallback(
    async (
      nextSchoolYearId: string,
      nextImportIds: string[],
      nextSourceTypes: CalculationSourceType[],
      progressTaskId?: string,
    ) => {
      const { requestId, controller } = beginRequestRun();
      const { signal } = controller;
      const isCurrentRun = () =>
        activeRequestIdRef.current === requestId && !signal.aborted;
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
      const normalizedSourceTypes =
        normalizeCalculationSourceTypes(nextSourceTypes);
      const includeImported = normalizedSourceTypes.includes("imported");
      const effectiveImportIds = includeImported ? nextImportIds : [];
      const calculationScopeKey = getCalculationScopeKey(
        effectiveImportIds,
        normalizedSourceTypes,
      );

      setIsPreviewing(true);
      updateCalculationProgress(taskId, {
        label: "Calculating attendance fines",
        detail: "Requesting calculation preview from the server",
        percent: progressTaskId ? 62 : 18,
        processed: 0,
        total: 0,
      });
      await yieldCalculationProgressFrame();

      try {
        const previewResults = await attendanceApi.previewCalculationResults({
          schoolYearId: requestSchoolYearId,
          importIds: effectiveImportIds,
          sourceTypes: normalizedSourceTypes,
          signal,
        });
        if (!isCurrentRun()) return null;

        const nextRows = previewResults.map((result) => {
          const resultRow = calculationResultToRow(result);

          return {
            ...resultRow,
            key: `preview-${calculationScopeKey}-${result.school_year_id ?? "all"}-${normalizeStudentId(result.student_id)}`,
            resultId: undefined,
            sourceTypes: normalizedSourceTypes,
            isSavedResult: false,
          } satisfies CalculationRow;
        });

        updateCalculationProgress(taskId, {
          detail: `Prepared ${nextRows.length.toLocaleString()} calculation row/s using the server calculation engine`,
          percent: 98,
          processed: nextRows.length,
          total: nextRows.length,
        });
        await yieldCalculationProgressFrame();
        if (!isCurrentRun()) return null;

        setCalculationRows(nextRows);
        setSelectedCalculationRowKeys([]);
        setLastCalculatedAt(new Date().toISOString());
        setCalculationMode("preview");

        finishCalculationProgress(taskId, "Calculation preview completed.");

        return nextRows;
      } catch (error) {
        if (isAbortError(error) || !isCurrentRun()) return null;

        failCalculationProgress(
          taskId,
          error instanceof Error
            ? error.message
            : "Unable to preview calculation.",
        );

        throw error;
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setIsPreviewing(false);
          activeRequestControllerRef.current = null;
        }
      }
    },
    [
      beginRequestRun,
      failCalculationProgress,
      finishCalculationProgress,
      startCalculationProgress,
      updateCalculationProgress,
    ],
  );

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
    const timeoutId = window.setTimeout(() => {
      void loadSavedResults(
        ALL_SCHOOL_YEARS_VALUE,
        [],
        DEFAULT_SELECTED_CALCULATION_SOURCES,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSavedResults]);

  useEffect(() => {
    return () => {
      activeRequestIdRef.current += 1;
      editRequestIdRef.current += 1;
      activeRequestControllerRef.current?.abort();
      editRequestControllerRef.current?.abort();
    };
  }, []);

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

  function handleCalculationSourceToggle(
    sourceType: CalculationSourceType,
    checked: boolean,
  ) {
    setSelectedCalculationSources((currentSources) => {
      const nextSources = checked
        ? [...currentSources, sourceType]
        : currentSources.filter((currentSource) => currentSource !== sourceType);

      return sortCalculationSourceTypes(nextSources);
    });
  }

  function handleSelectAllImports() {
    setSelectedImportIds(
      attendanceImports.map((importRecord) => importRecord.id),
    );
  }

  async function handleLoadSavedResults() {
    await loadSavedResults(
      selectedSchoolYearId,
      selectedImportIds,
      selectedCalculationSources,
    );
  }

  async function handlePreviewCalculation() {
    if (!selectedCalculationSources.length) {
      toast.error("Choose at least one attendance source to calculate.");
      return;
    }

    if (includesImportedSource && !selectedImportIds.length) {
      toast.error("Choose at least one imported file to calculate.");
      return;
    }

    try {
      const rows = await loadPreviewRows(
        selectedSchoolYearId,
        selectedImportIds,
        selectedCalculationSources,
      );

      if (!rows) return;

      toast.success(
        rows.length
          ? "Calculation preview updated."
          : "No rows found for the selected attendance sources.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to preview calculation.",
      );
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

  const handleCalculationRowSelection = useCallback(
    (key: string, checked: boolean) => {
      setSelectedCalculationRowKeys((currentKeys) => {
        if (checked) return Array.from(new Set([...currentKeys, key]));
        return currentKeys.filter((currentKey) => currentKey !== key);
      });
    },
    [],
  );

  function handleSelectAllCalculationRows(checked: boolean) {
    setSelectedCalculationRowKeys((currentKeys) => {
      const filteredKeySet = new Set(filteredRowKeys);

      if (!checked) {
        return currentKeys.filter((key) => !filteredKeySet.has(key));
      }

      return Array.from(new Set([...currentKeys, ...filteredRowKeys]));
    });
  }

  async function handleDeleteSelectedCalculationRows() {
    const selectedKeySet = new Set(selectedCalculationRowKeys);
    const selectedRows = calculationRows.filter((row) =>
      selectedKeySet.has(row.key),
    );

    if (!selectedRows.length) {
      toast.error("Select calculation rows to delete.");
      return;
    }

    setIsDeletingCalculationRows(true);

    try {
      const savedResultIds = selectedRows
        .map((row) => row.resultId)
        .filter((id): id is string => Boolean(id));

      if (savedResultIds.length) {
        await attendanceApi.deleteCalculationResultsByIds(savedResultIds);
      }

      setCalculationRows((currentRows) =>
        currentRows.filter((row) => !selectedKeySet.has(row.key)),
      );
      setSelectedCalculationRowKeys((currentKeys) =>
        currentKeys.filter((key) => !selectedKeySet.has(key)),
      );
      toast.success("Selected calculation rows deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete selected calculation rows.",
      );
    } finally {
      setIsDeletingCalculationRows(false);
    }
  }

  async function handleDeleteAllCalculationRows() {
    if (!calculationRows.length) {
      toast.error("No calculation rows to delete.");
      return;
    }

    setIsDeletingCalculationRows(true);

    try {
      const savedResultIds = calculationRows
        .map((row) => row.resultId)
        .filter((id): id is string => Boolean(id));

      if (
        calculationMode === "saved" &&
        selectedSchoolYearId !== ALL_SCHOOL_YEARS_VALUE
      ) {
        await attendanceApi.deleteCalculationResultsBySchoolYear(
          selectedSchoolYearId,
        );
      } else if (savedResultIds.length) {
        await attendanceApi.deleteCalculationResultsByIds(savedResultIds);
      }

      setCalculationRows([]);
      setSelectedCalculationRowKeys([]);
      toast.success("All calculation rows deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete all calculation rows.",
      );
    } finally {
      setIsDeletingCalculationRows(false);
    }
  }

  const handleOpenEditRow = useCallback(async (row: CalculationRow) => {
    if (!row.sourceRecordCount) {
      toast.error(
        "Load a preview for the selected imported files before editing source records.",
      );
      return;
    }

    editRequestControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = editRequestIdRef.current + 1;
    editRequestIdRef.current = requestId;
    editRequestControllerRef.current = controller;

    const sourceTypes = normalizeCalculationSourceTypes(
      row.sourceTypes ?? DEFAULT_SELECTED_CALCULATION_SOURCES,
    );
    const sourceTypeSet = new Set(sourceTypes);
    const includeImported = sourceTypeSet.has("imported");
    const includeManual = sourceTypeSet.has("manual");
    const includeZeroAttendance = sourceTypeSet.has("zero_attendance");
    const schoolYearId = row.schoolYearId ?? undefined;

    setEditingRow(row);
    setRecordEditForms([]);
    setIsLoadingEditRecords(true);

    try {
      const [importedRows, zeroAttendanceRows, manualRows] = await Promise.all([
        includeImported
          ? listStudentAttendanceRecords({
              studentId: row.studentId,
              schoolYearId,
              importIds: row.importIds,
              signal: controller.signal,
            })
          : Promise.resolve<AttendanceRecord[]>([]),
        includeZeroAttendance
          ? listStudentAttendanceRecords({
              studentId: row.studentId,
              schoolYearId,
              signal: controller.signal,
            })
          : Promise.resolve<AttendanceRecord[]>([]),
        includeManual || includeZeroAttendance
          ? listStudentManualAttendanceRecords({
              studentId: row.studentId,
              schoolYearId,
              signal: controller.signal,
            })
          : Promise.resolve<ManualAttendanceRecord[]>([]),
      ]);

      if (
        controller.signal.aborted ||
        editRequestIdRef.current !== requestId
      ) {
        return;
      }

      const attendanceRecordMap = new Map<string, AttendanceRecord>();
      importedRows.forEach((record) => attendanceRecordMap.set(record.id, record));
      zeroAttendanceRows
        .filter(isZeroAttendanceRecord)
        .forEach((record) => attendanceRecordMap.set(record.id, record));

      const selectedManualRows = manualRows.filter((record) => {
        const isZeroAttendance = isZeroManualAttendanceRecord(record);
        return isZeroAttendance ? includeZeroAttendance : includeManual;
      });
      const forms = buildRecordEditForms(
        Array.from(attendanceRecordMap.values()),
        selectedManualRows,
      );

      if (!forms.length) {
        setEditingRow(null);
        toast.error(
          "Load a preview for the selected imported files before editing source records.",
        );
        return;
      }

      setRecordEditForms(forms);
    } catch (error) {
      if (isAbortError(error)) return;

      setEditingRow(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load source records for editing.",
      );
    } finally {
      if (editRequestIdRef.current === requestId) {
        setIsLoadingEditRecords(false);
        editRequestControllerRef.current = null;
      }
    }
  }, []);

  async function handleSaveResults() {
    if (!selectedCalculationSources.length) {
      toast.error("Choose at least one attendance source before saving results.");
      return;
    }

    if (includesImportedSource && !selectedImportIds.length) {
      toast.error("Choose at least one imported file before saving results.");
      return;
    }

    const progressTaskId = startCalculationProgress(
      "Saving calculation results",
      "Saving calculated results",
    );
    const { requestId, controller } = beginRequestRun();
    const { signal } = controller;
    const isCurrentRun = () =>
      activeRequestIdRef.current === requestId && !signal.aborted;

    setIsPreviewing(false);
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
      const normalizedSourceTypes = normalizeCalculationSourceTypes(
        selectedCalculationSources,
      );
      const requestImportIds = normalizedSourceTypes.includes("imported")
        ? selectedImportIds
        : [];

      await attendanceApi.refreshCalculationResults({
        schoolYearId: requestSchoolYearId,
        importIds: requestImportIds,
        sourceTypes: normalizedSourceTypes,
        signal,
      });
      if (!isCurrentRun()) return;

      updateCalculationProgress(progressTaskId, {
        percent: 70,
        detail: "Reloading saved calculation results",
        processed: calculationRows.length,
        total: calculationRows.length,
      });
      await yieldCalculationProgressFrame();
      if (!isCurrentRun()) return;

      toast.success("Calculation results saved.");
      await loadSavedResults(
        selectedSchoolYearId,
        requestImportIds,
        normalizedSourceTypes,
        progressTaskId,
      );
    } catch (error) {
      if (isAbortError(error) || !isCurrentRun()) return;

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
      if (activeRequestIdRef.current === requestId) {
        activeRequestControllerRef.current = null;
      }
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
      await runWithConcurrency(
        recordEditForms,
        5,
        async (form) => {
          await attendanceApi.updateAttendanceRecord(
            form.recordId,
            buildAttendanceInput(form),
          );
        },
        (completed) => {
          updateCalculationProgress(progressTaskId, {
            detail: `Saved ${completed} of ${recordEditForms.length} source record/s`,
            percent: getProgressRangePercent(
              completed,
              recordEditForms.length,
              12,
              54,
            ),
            processed: completed,
            total: recordEditForms.length,
          });
        },
      );

      toast.success("Source records updated.");
      setEditingRow(null);
      setRecordEditForms([]);
      await loadPreviewRows(
        selectedSchoolYearId,
        selectedImportIds,
        selectedCalculationSources,
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
                  disabled={isPreviewing || isLoading || !canRunCalculation}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isPreviewing ? "Calculating..." : "Calculate Selected Files"}
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveResults}
                  disabled={
                    isSavingResults ||
                    isLoading ||
                    !calculationRows.length ||
                    !canRunCalculation
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
              School Year / Semester
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
                Sources and imported files to calculate
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the source types, then select the imported files to
                include in preview and saved calculation results.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectAllImports}
                disabled={!attendanceImports.length || !includesImportedSource}
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

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {CALCULATION_SOURCE_OPTIONS.map((sourceOption) => (
              <label
                key={sourceOption.value}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-background p-4 text-sm"
              >
                <Checkbox
                  checked={selectedCalculationSources.includes(
                    sourceOption.value,
                  )}
                  onCheckedChange={(checked) =>
                    handleCalculationSourceToggle(
                      sourceOption.value,
                      checked === true,
                    )
                  }
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate font-black">
                    {sourceOption.title}
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {sourceOption.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {attendanceImports.length ? (
              attendanceImports.map((importRecord) => (
                <label
                  key={importRecord.id}
                  className={`flex items-start gap-3 rounded-2xl border bg-background p-4 text-sm ${
                    includesImportedSource
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <Checkbox
                    checked={selectedImportIds.includes(importRecord.id)}
                    disabled={!includesImportedSource}
                    onCheckedChange={() => handleImportToggle(importRecord.id)}
                    className="mt-1"
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
            Selected sources:{" "}
            {selectedCalculationSourceLabels.length
              ? selectedCalculationSourceLabels.join(" | ")
              : "None"}
            <span className="mx-2">•</span>
            Selected files:{" "}
            {includesImportedSource && selectedImportLabels.length
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search student, college, program, or penalty"
                className="min-h-12 rounded-2xl lg:max-w-md"
              />
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isDeletingCalculationRows ||
                      !selectedCalculationRowKeys.length
                    }
                    className="min-h-12 rounded-2xl px-4 text-xs font-black"
                  >
                    Delete Selected
                  </Button>
                }
                title="Delete selected calculation rows?"
                description={
                  <>
                    This will delete {selectedCalculationRowKeys.length.toLocaleString()} selected calculation row(s). Saved calculation records will also be removed when applicable. This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE SELECTED"
                confirmLabel="Delete Selected"
                isPending={isDeletingCalculationRows}
                onConfirm={handleDeleteSelectedCalculationRows}
              />
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isDeletingCalculationRows || !calculationRows.length}
                    className="min-h-12 rounded-2xl px-4 text-xs font-black"
                  >
                    Delete All
                  </Button>
                }
                title="Delete all calculation rows?"
                description={
                  <>
                    This will delete all {calculationRows.length.toLocaleString()} calculation row(s) currently loaded. Saved calculation records will also be removed when applicable. This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE ALL"
                confirmLabel="Delete All"
                isPending={isDeletingCalculationRows}
                onConfirm={handleDeleteAllCalculationRows}
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <Checkbox
                      checked={allFilteredRowsSelected}
                      onCheckedChange={(checked) =>
                        handleSelectAllCalculationRows(checked === true)
                      }
                      aria-label="Select all calculation rows"
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
                  paginatedRows.map((row) => (
                    <CalculationTableRow
                      key={row.key}
                      row={row}
                      selected={selectedCalculationRowKeySet.has(row.key)}
                      onSelect={handleCalculationRowSelection}
                      onEdit={handleOpenEditRow}
                    />
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

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
              {filteredRows.length.toLocaleString()} result/s
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Show
              </span>
              <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                <SelectTrigger className="h-10 w-28 rounded-xl bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 rows</SelectItem>
                  <SelectItem value="50">50 rows</SelectItem>
                  <SelectItem value="100">100 rows</SelectItem>
                  <SelectItem value="all">All rows</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={currentPage <= 1 || rowsPerPage === "all"}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="h-10 rounded-xl px-4 text-xs font-black"
              >
                Previous
              </Button>
              <span className="min-w-20 text-center text-xs font-black text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={currentPage >= totalPages || rowsPerPage === "all"}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                className="h-10 rounded-xl px-4 text-xs font-black"
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => {
          if (!open) {
            editRequestControllerRef.current?.abort();
            setEditingRow(null);
            setRecordEditForms([]);
            setIsLoadingEditRecords(false);
          }
        }}
      >
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit source records for calculation row</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEditedRow} className="space-y-5">
            <div className="space-y-4">
              {isLoadingEditRecords ? (
                <div className="rounded-2xl border bg-background p-6 text-sm font-semibold text-muted-foreground">
                  Loading source records...
                </div>
              ) : (
                recordEditForms.map((form, index) => (
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
                ))
              )}
            </div>

            <div className="rounded-2xl border bg-background p-4 text-sm font-semibold text-muted-foreground">
              Editing {(recordEditForms.length || 0).toLocaleString()} specific
              source record/s for this calculation row.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingEdit || isLoadingEditRecords}
                onClick={() => {
                  editRequestControllerRef.current?.abort();
                  setEditingRow(null);
                  setRecordEditForms([]);
                  setIsLoadingEditRecords(false);
                }}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingEdit || isLoadingEditRecords}
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