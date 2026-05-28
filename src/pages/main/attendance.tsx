import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  getAcceptedAttendanceFileTypes,
  deleteAttendanceFinalResultsByIds,
  deleteAttendanceFinalResultsBySchoolYear,
  listAllAttendanceRecords,
  listAttendanceEvents,
  listAttendanceFinalResults,
  listAttendanceImports,
  listManualAttendanceRecords,
  previewAttendanceFile,
  refreshAttendanceFinalResults,
  saveAttendanceFile,
  updateAttendanceRecord,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceFinalResultRecord,
  AttendanceImportProgress,
  AttendanceImportRecord,
  AttendanceRecord,
  ManualAttendanceInput,
  ManualAttendanceRecord,
  ParsedAttendanceRow,
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
import { Textarea } from "../../components/ui/textarea";

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;
const CUSTOM_UPLOAD_EVENT_VALUE = "__custom_upload_event__";

type UploadFormState = {
  schoolYearId: string;
  eventId: string;
  eventName: string;
  eventStartAt: string;
  eventEndAt: string;
};

type FinalResultFormState = {
  id: string;
  originalStudentId: string;
  schoolYearId: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  totalAbsences: string;
  latestScannedAt: string;
  remarks: string;
};

type StudentEventSummary = {
  key: string;
  eventName: string;
  scannedAt: string | null;
  source: "Uploaded" | "Manual";
  recordId: string;
  remarks: string | null;
};

const emptyUploadForm: UploadFormState = {
  schoolYearId: "",
  eventId: "",
  eventName: "",
  eventStartAt: "",
  eventEndAt: "",
};

const emptyFinalResultForm: FinalResultFormState = {
  id: "",
  originalStudentId: "",
  schoolYearId: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "",
  totalAbsences: "0",
  latestScannedAt: "",
  remarks: "",
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

function formatDateTimeInputValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function handleDateTimePickerClick(event: SyntheticEvent<HTMLInputElement>) {
  const input = event.currentTarget as HTMLInputElement & {
    showPicker?: () => void;
  };

  input.focus();

  try {
    input.showPicker?.();
  } catch {
    return;
  }
}

type AttendanceFileMetadata = Partial<UploadFormState>;

type AttendanceFileContents = {
  text: string;
  byteLength: number;
};

async function readAttendanceFileContents(
  file: File,
): Promise<AttendanceFileContents> {
  const buffer = await file.arrayBuffer();

  if (!buffer.byteLength) {
    throw new Error("The uploaded attendance file is empty.");
  }

  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(buffer)
    .replace(/\u0000/g, "");

  return {
    text,
    byteLength: buffer.byteLength,
  };
}

function cleanAttendanceMetadataValue(value: unknown) {
  return String(value ?? "")
    .replace(/[\u00A0\u202F]+/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

function splitAttendanceMetadataRow(line: string) {
  return line
    .split(/\t|,|;/)
    .map(cleanAttendanceMetadataValue)
    .filter((cell) => cell.length > 0);
}

function getAttendanceMetadataKey(value: string) {
  const key = value
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(s\.?\s*y\.?|school year|schoolyear|academic year)$/.test(key)) {
    return "schoolYear";
  }

  if (/^(event|event name|activity|activity name)$/.test(key)) {
    return "event";
  }

  if (
    /^(start date\/time|start datetime|start date time|event start|event start at|event start date|event start date time|start date|date start)$/.test(
      key,
    )
  ) {
    return "start";
  }

  if (
    /^(end date\/time|end datetime|end date time|event end|event end at|event end date|event end date time|end date|date end)$/.test(
      key,
    )
  ) {
    return "end";
  }

  return "";
}

function parseAttendanceMetadataDateTime(value: string) {
  const cleanValue = cleanAttendanceMetadataValue(value);
  if (!cleanValue) return "";

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanValue)) {
    return cleanValue.slice(0, 16);
  }

  const normalizedValue = cleanValue.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/,
    "$1T$2",
  );
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) return "";

  return formatDateTimeInputValue(parsedDate.toISOString());
}

function resolveAttendanceMetadataSchoolYearId(
  value: string,
  schoolYears: SchoolYearRecord[],
) {
  const cleanValue = cleanAttendanceMetadataValue(value);
  if (!cleanValue) return "";

  const normalizedValue = cleanValue.toLowerCase();

  const exactMatch = schoolYears.find((schoolYear) => {
    return (
      schoolYear.id.toLowerCase() === normalizedValue ||
      schoolYear.name.toLowerCase() === normalizedValue
    );
  });

  if (exactMatch) return exactMatch.id;

  const years = cleanValue.match(/\d{4}/g) ?? [];

  if (years.length) {
    const yearMatch = schoolYears.find((schoolYear) => {
      const normalizedName = schoolYear.name.toLowerCase();
      return years.every((year) => normalizedName.includes(year));
    });

    if (yearMatch) return yearMatch.id;
  }

  return "";
}

function assignAttendanceMetadataValue(
  metadata: AttendanceFileMetadata,
  key: string,
  value: string,
  schoolYears: SchoolYearRecord[],
) {
  const cleanValue = cleanAttendanceMetadataValue(value);
  if (!key || !cleanValue) return;

  if (key === "schoolYear") {
    const schoolYearId = resolveAttendanceMetadataSchoolYearId(
      cleanValue,
      schoolYears,
    );
    if (schoolYearId) metadata.schoolYearId = schoolYearId;
    return;
  }

  if (key === "event") {
    metadata.eventName = cleanValue;
    return;
  }

  if (key === "start") {
    const startValue = parseAttendanceMetadataDateTime(cleanValue);
    if (startValue) metadata.eventStartAt = startValue;
    return;
  }

  if (key === "end") {
    const endValue = parseAttendanceMetadataDateTime(cleanValue);
    if (endValue) metadata.eventEndAt = endValue;
  }
}

function extractAttendanceFileMetadata(
  fileText: string,
  schoolYears: SchoolYearRecord[],
) {
  const metadata: AttendanceFileMetadata = {};
  const rows = fileText
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .slice(0, 80)
    .map((line) => line.trim())
    .filter(Boolean);

  rows.forEach((line, rowIndex) => {
    const cells = splitAttendanceMetadataRow(line);

    cells.forEach((cell, cellIndex) => {
      const keyValueMatch = cell.match(/^([^:=]+)\s*[:=]\s*(.+)$/);

      if (keyValueMatch) {
        assignAttendanceMetadataValue(
          metadata,
          getAttendanceMetadataKey(keyValueMatch[1]),
          keyValueMatch[2],
          schoolYears,
        );
        return;
      }

      const key = getAttendanceMetadataKey(cell);

      if (key && cells[cellIndex + 1]) {
        assignAttendanceMetadataValue(
          metadata,
          key,
          cells[cellIndex + 1],
          schoolYears,
        );
      }
    });

    const headerKeys = cells.map(getAttendanceMetadataKey);
    const recognizedHeaderCount = headerKeys.filter(Boolean).length;
    const nextCells = rows[rowIndex + 1]
      ? splitAttendanceMetadataRow(rows[rowIndex + 1])
      : [];

    if (recognizedHeaderCount >= 2 && nextCells.length) {
      headerKeys.forEach((key, cellIndex) => {
        assignAttendanceMetadataValue(
          metadata,
          key,
          nextCells[cellIndex] ?? "",
          schoolYears,
        );
      });
    }
  });

  return metadata;
}

function extractAttendancePreviewMetadata(
  rows: ParsedAttendanceRow[],
  schoolYears: SchoolYearRecord[],
) {
  const metadata: AttendanceFileMetadata = {};
  const metadataRow =
    rows.find(
      (row) =>
        row.errors.length === 0 &&
        (row.eventName || row.eventStartAt || row.eventEndAt),
    ) ??
    rows.find((row) => row.eventName || row.eventStartAt || row.eventEndAt);

  if (!metadataRow) return metadata;

  if (metadataRow.schoolYearId) {
    const schoolYearId = resolveAttendanceMetadataSchoolYearId(
      metadataRow.schoolYearId,
      schoolYears,
    );
    if (schoolYearId) metadata.schoolYearId = schoolYearId;
  }

  if (metadataRow.eventName) metadata.eventName = metadataRow.eventName;

  if (metadataRow.eventStartAt) {
    metadata.eventStartAt = formatDateTimeInputValue(metadataRow.eventStartAt);
  }

  if (metadataRow.eventEndAt) {
    metadata.eventEndAt = formatDateTimeInputValue(metadataRow.eventEndAt);
  }

  return metadata;
}

async function getAttendanceFileTextMetadata(
  file: File,
  schoolYears: SchoolYearRecord[],
) {
  const { text } = await readAttendanceFileContents(file);

  return extractAttendanceFileMetadata(text.slice(0, 120_000), schoolYears);
}

async function getAttendanceFileMetadata(
  file: File,
  schoolYears: SchoolYearRecord[],
) {
  try {
    const preview = await previewAttendanceFile(file);
    const previewMetadata = extractAttendancePreviewMetadata(
      preview?.rows ?? [],
      schoolYears,
    );

    if (hasAttendanceFileMetadata(previewMetadata)) return previewMetadata;
  } catch {
    return getAttendanceFileTextMetadata(file, schoolYears);
  }

  return getAttendanceFileTextMetadata(file, schoolYears);
}

function hasAttendanceFileMetadata(metadata: AttendanceFileMetadata) {
  return Boolean(
    metadata.schoolYearId ||
    metadata.eventName ||
    metadata.eventStartAt ||
    metadata.eventEndAt,
  );
}

function getSchoolYearBadgeLabel(
  schoolYears: SchoolYearRecord[],
  schoolYearId: string,
) {
  return getSchoolYearLabel(schoolYears, schoolYearId) || "No school year";
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

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString() : "0";
}

function normalizeStudentId(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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

type BackendEventOrderedRecord = {
  id?: string | null;
  event_order?: number | string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  latest_scanned_at?: string | null;
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
    record.latest_scanned_at ??
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

function isAcceptedAttendanceFile(file: File, acceptedFileTypes: string) {
  const extension = file.name.includes(".")
    ? `.${file.name.split(".").pop()}`.toLowerCase()
    : "";
  const acceptedExtensions = acceptedFileTypes
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return acceptedExtensions.includes(extension);
}

function getUploadedRecordEventName(record: AttendanceRecord) {
  if (record.event_name) return record.event_name;
  if (record.event_id) return `Event ${record.event_id}`;
  if (record.import_id) return "Uploaded attendance";
  return "Attendance record";
}

function getManualRecordEventName(record: ManualAttendanceRecord) {
  if (record.event_name) return record.event_name;
  if (record.event_id) return `Event ${record.event_id}`;
  return "Manual attendance";
}

function getRecordEventSortKey(summary: StudentEventSummary) {
  return `${summary.eventName.toLowerCase()}-${summary.scannedAt ?? ""}`;
}

function getStudentEventSummaries(
  result: AttendanceFinalResultRecord,
  uploadedRecords: AttendanceRecord[],
  manualRecords: ManualAttendanceRecord[],
) {
  const targetStudentId = normalizeStudentId(result.student_id);
  const targetSchoolYearId = result.school_year_id ?? "";

  const uploadedEvents = uploadedRecords
    .filter((record) => {
      return (
        normalizeStudentId(record.student_id) === targetStudentId &&
        (!targetSchoolYearId || record.school_year_id === targetSchoolYearId) &&
        (record.event_id || record.event_name || record.import_id)
      );
    })
    .map((record) => ({
      key: `uploaded-${record.id}`,
      eventName: getUploadedRecordEventName(record),
      scannedAt: record.scanned_at ?? record.created_at ?? null,
      source: "Uploaded" as const,
      recordId: record.id,
      remarks: record.remarks ?? null,
    }));

  const manualEvents = manualRecords
    .filter((record) => {
      return (
        normalizeStudentId(record.student_id) === targetStudentId &&
        (!targetSchoolYearId || record.school_year_id === targetSchoolYearId) &&
        record.event_id
      );
    })
    .map((record) => ({
      key: `manual-${record.id}`,
      eventName: getManualRecordEventName(record),
      scannedAt: record.scanned_at ?? record.created_at ?? null,
      source: "Manual" as const,
      recordId: record.id,
      remarks: record.remarks ?? null,
    }));

  const uniqueEvents = new Map<string, StudentEventSummary>();

  [...uploadedEvents, ...manualEvents].forEach((summary) => {
    const key = `${summary.source}-${summary.eventName}-${summary.recordId}`;
    uniqueEvents.set(key, summary);
  });

  return Array.from(uniqueEvents.values()).sort((left, right) => {
    const leftTime = left.scannedAt ? new Date(left.scannedAt).getTime() : 0;
    const rightTime = right.scannedAt ? new Date(right.scannedAt).getTime() : 0;

    if (leftTime !== rightTime) return leftTime - rightTime;

    return getRecordEventSortKey(left).localeCompare(
      getRecordEventSortKey(right),
    );
  });
}

function getStudentSourceRecords(
  result: AttendanceFinalResultRecord,
  uploadedRecords: AttendanceRecord[],
  manualRecords: ManualAttendanceRecord[],
) {
  const targetStudentId = normalizeStudentId(result.student_id);
  const targetSchoolYearId = result.school_year_id ?? "";

  return [
    ...uploadedRecords.filter(
      (record) =>
        normalizeStudentId(record.student_id) === targetStudentId &&
        (!targetSchoolYearId || record.school_year_id === targetSchoolYearId),
    ),
    ...manualRecords.filter(
      (record) =>
        normalizeStudentId(record.student_id) === targetStudentId &&
        (!targetSchoolYearId || record.school_year_id === targetSchoolYearId),
    ),
  ];
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
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>(
    [],
  );
  const [finalResults, setFinalResults] = useState<
    AttendanceFinalResultRecord[]
  >([]);
  const [selectedFinalResultIds, setSelectedFinalResultIds] = useState<
    string[]
  >([]);
  const [uploadedAttendanceRecords, setUploadedAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [manualAttendanceRecords, setManualAttendanceRecords] = useState<
    ManualAttendanceRecord[]
  >([]);
  const [eventsDialogResult, setEventsDialogResult] =
    useState<AttendanceFinalResultRecord | null>(null);
  const [finalResultDialogOpen, setFinalResultDialogOpen] = useState(false);
  const [finalResultForm, setFinalResultForm] =
    useState<FinalResultFormState>(emptyFinalResultForm);
  const [isSavingFinalResult, setIsSavingFinalResult] = useState(false);
  const [isDeletingFinalResults, setIsDeletingFinalResults] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<AttendanceImportProgress | null>(
    null,
  );
  const acceptedFileTypes = getAcceptedAttendanceFileTypes();

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const uploadSchoolYearLabel = useMemo(() => {
    return getSchoolYearBadgeLabel(
      schoolYears,
      uploadForm.schoolYearId || selectedSchoolYearId,
    );
  }, [schoolYears, uploadForm.schoolYearId, selectedSchoolYearId]);

  const uploadEventOptions = useMemo(() => {
    return sortByBackendEventOrder(attendanceEvents);
  }, [attendanceEvents]);

  const selectedUploadEventValue =
    uploadForm.eventId || CUSTOM_UPLOAD_EVENT_VALUE;

  const collegeOptions = useMemo(() => {
    const colleges = finalResults
      .map((row) => String(row.college ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [finalResults]);

  const displayedFinalResults = useMemo(() => {
    const rows = sortByBackendEventOrder(finalResults);

    if (collegeFilter === "__all_colleges__") return rows;

    return rows.filter(
      (row) => String(row.college ?? "").trim() === collegeFilter,
    );
  }, [finalResults, collegeFilter]);

  const displayedFinalResultIds = useMemo(
    () => displayedFinalResults.map((result) => result.id),
    [displayedFinalResults],
  );

  const allDisplayedFinalResultsSelected = useMemo(() => {
    if (!displayedFinalResultIds.length) return false;

    const selectedIds = new Set(selectedFinalResultIds);
    return displayedFinalResultIds.every((id) => selectedIds.has(id));
  }, [displayedFinalResultIds, selectedFinalResultIds]);

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

  const eventsDialogSummaries = useMemo(() => {
    if (!eventsDialogResult) return [];

    return getStudentEventSummaries(
      eventsDialogResult,
      uploadedAttendanceRecords,
      manualAttendanceRecords,
    );
  }, [eventsDialogResult, uploadedAttendanceRecords, manualAttendanceRecords]);

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
      const [eventRows, importRows, resultRows, uploadedRows, manualRows] =
        fallbackSchoolYearId
          ? await Promise.all([
              listAttendanceEvents({
                schoolYearId: fallbackSchoolYearId,
                limit: 100,
                offset: 0,
              }),
              listAttendanceImports({
                schoolYearId: fallbackSchoolYearId,
                limit: 50,
                offset: 0,
              }),
              listAttendanceFinalResults({
                schoolYearId: fallbackSchoolYearId,
                limit: 1000,
                offset: 0,
              }),
              listAllAttendanceRecords({
                schoolYearId: fallbackSchoolYearId,
                pageSize: 500,
                maxPages: 100,
              }),
              listManualAttendanceRecords({
                schoolYearId: fallbackSchoolYearId,
                limit: 1000,
                offset: 0,
              }),
            ])
          : [[], [], [], [], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId || ALL_YEARS_VALUE);
      setAttendanceEvents(sortByBackendEventOrder(eventRows));
      setImports(sortByBackendEventOrder(importRows));
      setFinalResults(sortByBackendEventOrder(resultRows));
      setSelectedFinalResultIds([]);
      setUploadedAttendanceRecords(uploadedRows);
      setManualAttendanceRecords(manualRows);
      setUploadForm((current) => ({
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
          : "Unable to load attendance records.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  async function selectAttendanceFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isAcceptedAttendanceFile(nextFile, acceptedFileTypes)) {
      toast.error(
        "Please upload a TXT, CSV, XLS, XLSX, XLSM, XLSB, XLTX, XLTM, or ODS file.",
      );
      return;
    }

    setFile(nextFile);

    try {
      const metadata = await getAttendanceFileMetadata(nextFile, schoolYears);

      if (hasAttendanceFileMetadata(metadata)) {
        setUploadForm((current) => ({
          ...current,
          ...metadata,
          eventId: metadata.eventName ? "" : current.eventId,
          schoolYearId:
            metadata.schoolYearId ||
            current.schoolYearId ||
            selectedSchoolYearId,
        }));
        toast.success(
          "Attendance file details detected. Review before saving.",
        );
      }
    } catch {
      return;
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void selectAttendanceFile(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    void selectAttendanceFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleUploadEventSelect(value: string) {
    if (value === CUSTOM_UPLOAD_EVENT_VALUE) {
      setUploadForm((current) => ({
        ...current,
        eventId: "",
      }));
      return;
    }

    const selectedEvent = uploadEventOptions.find(
      (event) => event.id === value,
    );

    if (!selectedEvent) return;

    setUploadForm((current) => ({
      ...current,
      eventId: selectedEvent.id,
      eventName: selectedEvent.name,
      eventStartAt: formatDateTimeInputValue(selectedEvent.event_start_at),
      eventEndAt: formatDateTimeInputValue(selectedEvent.event_end_at),
      schoolYearId: selectedEvent.school_year_id || current.schoolYearId,
    }));
  }

  function handleUploadFieldChange(
    field: keyof UploadFormState,
    value: string,
  ) {
    setUploadForm((current) => ({
      ...current,
      [field]: value,
      eventId: field === "eventName" ? "" : current.eventId,
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
      setProgress({
        stage: "parsing",
        percent: 3,
        message: "Reading uploaded attendance file contents...",
        processedRows: 0,
        totalRows: 0,
        savedRecords: 0,
        createdFines: 0,
      });

      await readAttendanceFileContents(file);

      const result = await saveAttendanceFile(file, {
        schoolYearId: uploadForm.schoolYearId || undefined,
        eventId: uploadForm.eventId || undefined,
        eventName: uploadForm.eventName.trim(),
        eventStartAt: uploadForm.eventStartAt || undefined,
        eventEndAt: uploadForm.eventEndAt || undefined,
        onProgress: setProgress,
      });

      await refreshAttendanceFinalResults({
        schoolYearId: uploadForm.schoolYearId || undefined,
        importId: result?.importId,
      });

      toast.success("Attendance file saved and final results updated.");
      setFile(null);
      setUploadForm((current) => ({
        ...current,
        eventId: "",
        eventName: "",
        eventStartAt: "",
        eventEndAt: "",
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

  function handleFinalResultSelection(id: string, checked: boolean) {
    setSelectedFinalResultIds((currentIds) => {
      if (checked) return Array.from(new Set([...currentIds, id]));
      return currentIds.filter((currentId) => currentId !== id);
    });
  }

  function handleSelectAllFinalResults(checked: boolean) {
    setSelectedFinalResultIds((currentIds) => {
      const displayedIdSet = new Set(displayedFinalResultIds);

      if (!checked) {
        return currentIds.filter((id) => !displayedIdSet.has(id));
      }

      return Array.from(new Set([...currentIds, ...displayedFinalResultIds]));
    });
  }

  async function handleDeleteSelectedFinalResults() {
    if (!selectedFinalResultIds.length) {
      toast.error("Select final attendance results to delete.");
      return;
    }

    setIsDeletingFinalResults(true);

    try {
      await deleteAttendanceFinalResultsByIds(selectedFinalResultIds);
      await loadPageData(selectedSchoolYearId);
      toast.success("Selected final attendance results deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete selected final attendance results.",
      );
    } finally {
      setIsDeletingFinalResults(false);
    }
  }

  async function handleDeleteAllFinalResults() {
    if (!displayedFinalResults.length) {
      toast.error("No final attendance results to delete.");
      return;
    }

    setIsDeletingFinalResults(true);

    try {
      if (selectedSchoolYearId !== ALL_YEARS_VALUE) {
        await deleteAttendanceFinalResultsBySchoolYear(selectedSchoolYearId);
      } else {
        await deleteAttendanceFinalResultsByIds(
          displayedFinalResults.map((result) => result.id),
        );
      }

      await loadPageData(selectedSchoolYearId);
      toast.success("All final attendance results deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete all final attendance results.",
      );
    } finally {
      setIsDeletingFinalResults(false);
    }
  }

  function handleOpenEditFinalResult(result: AttendanceFinalResultRecord) {
    setFinalResultForm({
      id: result.id,
      originalStudentId: result.student_id,
      schoolYearId: result.school_year_id ?? "",
      studentId: result.student_id,
      name: result.name,
      yearLevel: result.year_level ?? "",
      college: result.college ?? "",
      program: result.program ?? "",
      institution: result.institution ?? "",
      totalAbsences: String(result.total_absences ?? 0),
      latestScannedAt: formatDateTimeInputValue(result.latest_scanned_at),
      remarks: "",
    });
    setFinalResultDialogOpen(true);
  }

  function handleFinalResultDialogOpenChange(open: boolean) {
    setFinalResultDialogOpen(open);

    if (!open) setFinalResultForm(emptyFinalResultForm);
  }

  function handleFinalResultFieldChange(
    field: keyof FinalResultFormState,
    value: string,
  ) {
    setFinalResultForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSaveFinalResult(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const totalAbsences = Number(finalResultForm.totalAbsences);

    if (!finalResultForm.studentId.trim() || !finalResultForm.name.trim()) {
      toast.error("Student ID and name are required.");
      return;
    }

    if (!Number.isInteger(totalAbsences) || totalAbsences < 0) {
      toast.error("Total absences must be a whole number.");
      return;
    }

    const originalResult = finalResults.find(
      (result) => result.id === finalResultForm.id,
    );

    if (!originalResult) {
      toast.error("Final result record was not found.");
      return;
    }

    const sourceRecords = getStudentSourceRecords(
      {
        ...originalResult,
        student_id: finalResultForm.originalStudentId,
      },
      uploadedAttendanceRecords,
      manualAttendanceRecords,
    );

    if (!sourceRecords.length) {
      toast.error("No source attendance records found for this final result.");
      return;
    }

    setIsSavingFinalResult(true);

    try {
      await Promise.all(
        sourceRecords.map((record) => {
          const payload: ManualAttendanceInput = {
            schoolYearId:
              finalResultForm.schoolYearId ||
              record.school_year_id ||
              undefined,
            eventId: record.event_id ?? undefined,
            eventName:
              "event_name" in record
                ? (record.event_name ?? undefined)
                : undefined,
            scannedAt:
              finalResultForm.latestScannedAt || record.scanned_at || undefined,
            studentId: finalResultForm.studentId.trim(),
            name: finalResultForm.name.trim(),
            yearLevel: finalResultForm.yearLevel.trim(),
            college: finalResultForm.college.trim(),
            program: finalResultForm.program.trim(),
            institution: finalResultForm.institution.trim(),
            noOfAbsences: totalAbsences,
            remarks:
              finalResultForm.remarks.trim() || record.remarks || undefined,
            attendanceType:
              "attendance_type" in record ? record.attendance_type : undefined,
          };

          return updateAttendanceRecord(record.id, payload);
        }),
      );

      await refreshAttendanceFinalResults({
        schoolYearId:
          selectedSchoolYearId === ALL_YEARS_VALUE
            ? undefined
            : selectedSchoolYearId,
      });
      await loadPageData(selectedSchoolYearId);
      handleFinalResultDialogOpenChange(false);
      toast.success("Final attendance result updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update final attendance result.",
      );
    } finally {
      setIsSavingFinalResult(false);
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
                Upload attendance files, finalize merged results, and review all
                uploaded and manual attendance records by Student ID.
              </p>
            </div>

            <div className="w-full max-w-64 lg:text-right">
              <SchoolYearBadge
                label={selectedSchoolYearLabel}
                className="w-full justify-center lg:w-auto"
              />
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
                Drag and drop or choose TXT, CSV, XLS, XLSX, XLSM, XLSB, XLTX,
                XLTM, or ODS.
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
            <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-5">
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex min-h-40 min-w-0 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed bg-background p-6 text-center transition lg:col-span-5 ${
                  isDraggingFile ? "border-primary bg-primary/10" : ""
                }`}
              >
                <span className="max-w-full break-all text-base font-black">
                  {file ? file.name : "Drop attendance file here"}
                </span>
                <span className="mt-2 max-w-full wrap-break-word text-sm font-semibold text-muted-foreground">
                  TXT, CSV, XLS, XLSX, XLSM, XLSB, XLTX, XLTM, and ODS are
                  supported.
                </span>
                <Input
                  type="file"
                  accept={acceptedFileTypes}
                  onChange={handleFileChange}
                  disabled={isSaving}
                  className="mt-4 min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm font-bold">School year</span>
                <SchoolYearBadge
                  label={uploadSchoolYearLabel}
                  className="w-full justify-center"
                />
              </label>

              <label className="space-y-2 lg:col-span-3">
                <span className="text-sm font-bold">Select event</span>
                <Select
                  value={selectedUploadEventValue}
                  onValueChange={handleUploadEventSelect}
                  disabled={isSaving}
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 rounded-2xl">
                    <SelectValue placeholder="Select existing event" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM_UPLOAD_EVENT_VALUE}>
                      New event / manual input
                    </SelectItem>
                    {uploadEventOptions.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2 lg:col-span-5">
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

              <label className="space-y-2 lg:col-span-5">
                <span className="text-sm font-bold">Start date/time</span>
                <Input
                  type="datetime-local"
                  value={uploadForm.eventStartAt}
                  onClick={handleDateTimePickerClick}
                  onChange={(event) =>
                    handleUploadFieldChange("eventStartAt", event.target.value)
                  }
                  disabled={isSaving}
                  className="min-h-12 w-full min-w-0 rounded-2xl"
                />
              </label>

              <label className="space-y-2 lg:col-span-5">
                <span className="text-sm font-bold">End date/time</span>
                <Input
                  type="datetime-local"
                  value={uploadForm.eventEndAt}
                  onClick={handleDateTimePickerClick}
                  onChange={(event) =>
                    handleUploadFieldChange("eventEndAt", event.target.value)
                  }
                  disabled={isSaving}
                  className="min-h-12 w-full min-w-0 rounded-2xl"
                />
              </label>

              <div className="flex items-end lg:col-span-5">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-12 w-full rounded-2xl font-black"
                >
                  {isSaving ? "Saving..." : "Save File"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(eventsDialogResult)}
          onOpenChange={(open) => {
            if (!open) setEventsDialogResult(null);
          }}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Events attended by{" "}
                {eventsDialogResult?.name || eventsDialogResult?.student_id}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {eventsDialogSummaries.length ? (
                eventsDialogSummaries.map((eventSummary, index) => (
                  <article
                    key={eventSummary.key}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="wrap-break-word font-black">
                          {eventSummary.eventName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {eventSummary.source} •{" "}
                          {formatDateTime(eventSummary.scannedAt)}
                        </p>
                        {eventSummary.remarks ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {eventSummary.remarks}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No attended events found for this student.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={finalResultDialogOpen}
          onOpenChange={handleFinalResultDialogOpenChange}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Edit final attendance result</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleSaveFinalResult}
              className="grid gap-4 lg:grid-cols-4"
            >
              <label className="space-y-2">
                <span className="text-sm font-bold">Student ID</span>
                <Input
                  value={finalResultForm.studentId}
                  onChange={(event) =>
                    handleFinalResultFieldChange(
                      "studentId",
                      event.target.value,
                    )
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Name</span>
                <Input
                  value={finalResultForm.name}
                  onChange={(event) =>
                    handleFinalResultFieldChange("name", event.target.value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Year level</span>
                <Input
                  value={finalResultForm.yearLevel}
                  onChange={(event) =>
                    handleFinalResultFieldChange(
                      "yearLevel",
                      event.target.value,
                    )
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Total absences</span>
                <Input
                  type="number"
                  min={0}
                  value={finalResultForm.totalAbsences}
                  onChange={(event) =>
                    handleFinalResultFieldChange(
                      "totalAbsences",
                      event.target.value,
                    )
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">College</span>
                <Input
                  value={finalResultForm.college}
                  onChange={(event) =>
                    handleFinalResultFieldChange("college", event.target.value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Program</span>
                <Input
                  value={finalResultForm.program}
                  onChange={(event) =>
                    handleFinalResultFieldChange("program", event.target.value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Latest scan</span>
                <Input
                  type="datetime-local"
                  value={finalResultForm.latestScannedAt}
                  onClick={handleDateTimePickerClick}
                  onChange={(event) =>
                    handleFinalResultFieldChange(
                      "latestScannedAt",
                      event.target.value,
                    )
                  }
                  className="min-h-12 w-full min-w-0 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Institution</span>
                <Input
                  value={finalResultForm.institution}
                  onChange={(event) =>
                    handleFinalResultFieldChange(
                      "institution",
                      event.target.value,
                    )
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2 lg:col-span-4">
                <span className="text-sm font-bold">Remarks</span>
                <Textarea
                  value={finalResultForm.remarks}
                  onChange={(event) =>
                    handleFinalResultFieldChange("remarks", event.target.value)
                  }
                  className="min-h-24 rounded-2xl"
                />
              </label>

              <div className="flex flex-wrap gap-3 lg:col-span-4">
                <Button
                  type="submit"
                  disabled={isSavingFinalResult}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSavingFinalResult ? "Saving..." : "Update Final Result"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingFinalResult}
                  onClick={() => handleFinalResultDialogOpenChange(false)}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Final attendance results</h2>
              <p className="text-sm text-muted-foreground">
                Uploaded and manual attendance are merged by Student ID.
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
              <Button
                type="button"
                variant="outline"
                disabled={
                  isDeletingFinalResults || !selectedFinalResultIds.length
                }
                onClick={handleDeleteSelectedFinalResults}
                className="min-h-11 rounded-2xl px-4 text-xs font-black"
              >
                Delete Selected
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  isDeletingFinalResults || !displayedFinalResults.length
                }
                onClick={handleDeleteAllFinalResults}
                className="min-h-11 rounded-2xl px-4 text-xs font-black"
              >
                Delete All
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allDisplayedFinalResultsSelected}
                      onChange={(event) =>
                        handleSelectAllFinalResults(event.target.checked)
                      }
                      aria-label="Select all final attendance results"
                      className="size-4 rounded border"
                    />
                  </th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">Absences</th>
                  <th className="px-4 py-3">Latest Scan</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedFinalResults.length ? (
                  displayedFinalResults.map((result) => {
                    const eventCount = getStudentEventSummaries(
                      result,
                      uploadedAttendanceRecords,
                      manualAttendanceRecords,
                    ).length;

                    return (
                      <tr key={result.id} className="border-t">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedFinalResultIds.includes(result.id)}
                            onChange={(event) =>
                              handleFinalResultSelection(
                                result.id,
                                event.target.checked,
                              )
                            }
                            aria-label={`Select final result for ${result.student_id}`}
                            className="size-4 rounded border"
                          />
                        </td>
                        <td className="px-4 py-3 wrap-break-word font-black">
                          {result.student_id}
                        </td>
                        <td className="px-4 py-3 wrap-break-word font-semibold">
                          {result.name}
                        </td>
                        <td className="px-4 py-3 wrap-break-word text-muted-foreground">
                          {result.college || "—"}
                        </td>
                        <td className="px-4 py-3 wrap-break-word text-muted-foreground">
                          {result.program || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEventsDialogResult(result)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Events ({eventCount})
                          </Button>
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
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenEditFinalResult(result)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={9}
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
            {imports.length ? (
              imports.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-black">{item.file_name}</p>
                      <p className="mt-1 wrap-break-word text-sm text-muted-foreground">
                        {item.event_name || "Uploaded attendance"} •{" "}
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-muted-foreground">
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