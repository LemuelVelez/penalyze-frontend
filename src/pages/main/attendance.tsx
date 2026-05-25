import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAllAttendanceImports,
  deleteAttendanceEvent,
  deleteAttendanceImport,
  deleteAttendanceRecord,
  getAcceptedAttendanceFileTypes,
  listAttendanceEvents,
  listAttendanceImports,
  listAttendanceRecords,
  previewAttendanceFile,
  saveAttendanceEvent,
  saveAttendanceRows,
  saveManualAttendanceRecord,
  updateAttendanceEvent,
  updateAttendanceRecords,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearLabel,
  listSchoolYears,
  transferSchoolYearRecords,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import type {
  AttendanceEvent,
  AttendanceEventInput,
  AttendanceImportProgress,
  AttendanceImportRecord,
  AttendancePreviewResult,
  SavedAttendanceImportResult,
  AttendanceRecord,
  ManualAttendanceInput,
  ManualAttendanceSaveResult,
  ParsedAttendanceRow,
} from "../../api/attendance";
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
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

type ManualAttendanceFormState = {
  eventId: string;
  eventIds: string[];
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

type AttendanceEventFormState = {
  name: string;
  eventStartAt: string;
  eventEndAt: string;
  description: string;
};

type AttendanceBulkEventAttendeesFormState = {
  eventId: string;
  scannedAt: string;
  attendees: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
};

type AttendanceBulkEventAttendeeRow = {
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
};

type AttendanceZeroAttendanceAttendeeOption = AttendanceBulkEventAttendeeRow & {
  key: string;
  latestScannedAt: string | null;
};

const DEFAULT_STUDENT_INSTITUTION =
  "Jose Rizal Memorial State University - Tampilisan Campus";

const QR_CODE_YEAR_LEVEL_OPTIONS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
] as const;

const QR_CODE_COLLEGE_PROGRAM_OPTIONS: Record<string, string[]> = {
  "College of Business Administration": ["BSBA", "BSAM", "BSHM"],
  "College of Teacher Education": [
    "BSED Filipino",
    "BSED English",
    "BSED Math",
    "BSED Social Studies",
    "Bachelor of Physical Education",
    "BEED",
  ],
  "College of Computing Studies": [
    "BS Information Systems",
    "BS Computer Science",
  ],
  "College of Agriculture and Forestry": ["BS Agriculture", "BS Forestry"],
  "College of Liberal Arts, Mathematics and Sciences": ["BAELS"],
  "School of Engineering": ["Agricultural Biosystems Engineering"],
  "School of Criminal Justice Education": ["BS Criminology"],
};

const QR_CODE_COLLEGE_OPTIONS = Object.keys(QR_CODE_COLLEGE_PROGRAM_OPTIONS);
const QR_CODE_INSTITUTION_OPTIONS = [DEFAULT_STUDENT_INSTITUTION] as const;

function getQrCodeProgramOptions(college: string) {
  return QR_CODE_COLLEGE_PROGRAM_OPTIONS[college] ?? [];
}

function hasQrCodeSelectOption(
  options: readonly string[],
  value?: string | null,
) {
  const cleanValue = String(value ?? "").trim();

  return Boolean(cleanValue) && options.includes(cleanValue);
}

function renderCurrentQrCodeSelectOption(
  options: readonly string[],
  value?: string | null,
) {
  const cleanValue = String(value ?? "").trim();

  if (!cleanValue || hasQrCodeSelectOption(options, cleanValue)) return null;

  return (
    <SelectItem value={cleanValue} className="max-w-full truncate">
      {cleanValue}
    </SelectItem>
  );
}

const manualSelectTriggerClassName =
  "mt-2 min-h-10 w-full min-w-0 max-w-full overflow-hidden text-left";

const manualCustomInputClassName =
  "mt-2 min-h-10 w-full min-w-0 max-w-full rounded-md text-sm";

const tableFilterSelectTriggerClassName =
  "min-h-10 w-full min-w-0 max-w-full overflow-hidden rounded-2xl text-left";

const emptyManualAttendanceForm: ManualAttendanceFormState = {
  eventId: "",
  eventIds: [],
  scannedAt: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: DEFAULT_STUDENT_INSTITUTION,
  noOfAbsences: "0",
  remarks: "",
};

const emptyAttendanceEventForm: AttendanceEventFormState = {
  name: "",
  eventStartAt: "",
  eventEndAt: "",
  description: "",
};

const emptyBulkEventAttendeesForm: AttendanceBulkEventAttendeesFormState = {
  eventId: "",
  scannedAt: "",
  attendees: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: DEFAULT_STUDENT_INSTITUTION,
  remarks: "",
};

const ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  xla: "application/vnd.ms-excel",
  xlam: "application/vnd.ms-excel.addin.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlt: "application/vnd.ms-excel",
  xltm: "application/vnd.ms-excel.template.macroEnabled.12",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  xlw: "application/vnd.ms-excel",
};

const ATTENDANCE_EXCEL_FILE_TYPES = Array.from(
  new Set([
    ...Object.keys(ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION).map(
      (extension) => `.${extension}`,
    ),
    ...Object.values(ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION),
    "application/msexcel",
    "application/vnd.ms-office",
    "application/x-excel",
    "application/x-msexcel",
    "application/x-ms-excel",
    "application/xls",
    "application/x-xls",
    "application/octet-stream",
  ]),
);

const ATTENDANCE_TEXT_FILE_TYPES = [".csv", ".txt", "text/csv", "text/plain"];
const UPLOAD_FILE_EVENTS_SELECT_VALUE = "__upload_file_events__";
const ALL_YEARS_SELECT_VALUE = ALL_SCHOOL_YEARS_VALUE;
const ALL_COLLEGES_SELECT_VALUE = "__all_colleges__";
const ALL_EVENTS_SELECT_VALUE = "__all_events__";
const NO_COLLEGE_SELECT_VALUE = "__no_college__";
const NO_EVENT_FILTER_SELECT_VALUE = "__no_event_filter__";
const ATTENDANCE_RESUMABLE_IMPORT_STORAGE_KEY =
  "penalyze.attendance.resumableImport";
const ATTENDANCE_RESUMABLE_IMPORT_CHUNK_SIZE = 100;

const ATTENDANCE_IMPORT_HEADERS = [
  "Event",
  "Event Start At",
  "Event End At",
  "Scanned At",
  "Student ID",
  "Name",
  "Year Level",
  "College",
  "Program",
  "Institution",
  "No. of Absences",
  "Remarks",
];

type NormalizedAttendanceImportRow = {
  eventName: string;
  eventStartAt: string;
  eventEndAt: string;
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

type AttendancePreparedUpload = {
  file: File;
  normalizedRowsCount: number;
  normalizedEventNames: string[];
};

type AttendanceSpreadsheetCell = string | number | null | undefined;
type AttendanceSpreadsheetRow = AttendanceSpreadsheetCell[];

type AttendanceZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

type BrowserDecompressionStreamConstructor = new (
  format: string,
) => TransformStream<Uint8Array, Uint8Array>;

type AttendanceWorkbookSheet = {
  name: string;
  path: string;
};

type AttendanceHeaderKey = keyof NormalizedAttendanceImportRow;

type AttendanceEventAttendeeSummary = {
  key: string;
  studentId: string;
  name: string;
  records: AttendanceRecord[];
  totalAbsences: number;
  latestScannedAt: string | null;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
};

type AttendanceEventRecordGroup = {
  key: string;
  eventId: string | null;
  eventName: string;
  eventStartAt: string | null;
  eventEndAt: string | null;
  eventDescription: string | null;
  college: string;
  records: AttendanceRecord[];
  attendees: AttendanceEventAttendeeSummary[];
  totalAbsences: number;
  latestScannedAt: string | null;
};

type AttendanceStudentRecordSummary = {
  key: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  records: AttendanceRecord[];
  totalAbsences: number;
  latestScannedAt: string | null;
};

type AttendanceStudentEventSummary = {
  key: string;
  eventName: string;
  schedule: string;
  latestScannedAt: string | null;
  records: AttendanceRecord[];
  totalAbsences: number;
};

type AttendanceStudentEventsDialogState = {
  studentId: string;
  name: string;
  records: AttendanceRecord[];
} | null;

type AttendanceImportOptionsSnapshot = {
  eventId: string;
  eventName: string;
  eventStartAt: string;
  eventEndAt: string;
  eventDescription: string;
};

type AttendanceResumableImportSnapshot = {
  id: string;
  fileName: string;
  fileType: string;
  fileSignature: string;
  preview: AttendancePreviewResult;
  rows: ParsedAttendanceRow[];
  processedRows: number;
  savedRecordsCount: number;
  createdFinesCount: number;
  importId: string;
  options: AttendanceImportOptionsSnapshot;
  updatedAt: string;
};

type ProgressiveLoadProgress = {
  percent: number;
  message: string;
  detail: string;
};

type AttendanceEventDeleteProgress = {
  processedEvents: number;
  totalEvents: number;
  percent: number;
  message: string;
  currentEventName: string;
};

type AttendanceSelectedRecordsAddProgress = {
  processedSteps: number;
  totalSteps: number;
  totalRecords: number;
  savedRecords: number;
  deletedSourceRecords: number;
  percent: number;
  message: string;
  currentEventName: string;
};

type AttendanceRecordsPageProgress = {
  loadedRows: number;
  pageCount: number;
  isComplete: boolean;
};

type AttendanceBulkUpdateResult = {
  records?: AttendanceRecord[];
  updatedRecordIds?: string[];
  fines?: unknown[];
} | null | undefined;

function getAttendanceBulkUpdateIds(
  result: AttendanceBulkUpdateResult,
  fallbackRecordIds: string[],
) {
  const resultIds = result?.updatedRecordIds ?? [];
  const updateIds = resultIds.length ? resultIds : fallbackRecordIds;

  return Array.from(
    new Set(
      updateIds.map((recordId) => cleanImportValue(recordId)).filter(Boolean),
    ),
  );
}

function getAttendanceBulkUpdatedRecords(
  result: AttendanceBulkUpdateResult,
  fallbackRecordIds: string[],
) {
  const updateIds = new Set(
    getAttendanceBulkUpdateIds(result, fallbackRecordIds),
  );

  return (result?.records ?? []).filter((record) => updateIds.has(record.id));
}

function getAttendanceBulkUpdatedCount(
  result: AttendanceBulkUpdateResult,
  fallbackRecordIds: string[],
) {
  return getAttendanceBulkUpdateIds(result, fallbackRecordIds).length;
}

function getAttendanceBulkFineCount(result: AttendanceBulkUpdateResult) {
  return Array.isArray(result?.fines) ? result.fines.length : 0;
}

function getManualAttendanceSavedRecords(
  result: ManualAttendanceSaveResult | null | undefined,
) {
  const recordsById = new Map<string, AttendanceRecord>();

  result?.records?.forEach((record) => {
    if (record.id) recordsById.set(record.id, record);
  });

  if (result?.record?.id) {
    recordsById.set(result.record.id, result.record);
  }

  return Array.from(recordsById.values());
}

function mergeAttendanceSavedRecords(
  currentRecords: AttendanceRecord[],
  savedRecords: AttendanceRecord[],
) {
  if (!savedRecords.length) return currentRecords;

  const savedRecordById = new Map(
    savedRecords.map((record) => [record.id, record]),
  );
  const uniqueSavedRecords = Array.from(savedRecordById.values());
  const currentRecordIds = new Set(currentRecords.map((record) => record.id));
  const newRecords = uniqueSavedRecords.filter(
    (record) => !currentRecordIds.has(record.id),
  );
  const updatedRecords = currentRecords.map(
    (record) => savedRecordById.get(record.id) ?? record,
  );

  return [...newRecords, ...updatedRecords];
}

const INITIAL_PROGRESSIVE_LOAD_PROGRESS: ProgressiveLoadProgress = {
  percent: 0,
  message: "",
  detail: "",
};

const ATTENDANCE_RECORDS_PAGE_SIZE = 25000;
const ATTENDANCE_RECORDS_MAX_ROWS = 50000;

function useProgressivePercent(isActive: boolean, targetPercent: number) {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setDisplayPercent(targetPercent >= 100 ? 100 : 0);
      return;
    }

    setDisplayPercent((currentPercent) => {
      const nextTarget = Math.max(1, Math.min(100, Math.round(targetPercent)));

      if (currentPercent <= 0) return Math.min(nextTarget, 2);
      return Math.min(currentPercent, nextTarget);
    });
  }, [isActive, targetPercent]);

  useEffect(() => {
    if (!isActive || typeof window === "undefined") return;

    const intervalId = window.setInterval(() => {
      setDisplayPercent((currentPercent) => {
        const nextTarget = Math.max(
          1,
          Math.min(100, Math.round(targetPercent)),
        );

        if (currentPercent >= nextTarget) return currentPercent;

        const remainingPercent = nextTarget - currentPercent;
        const step = Math.max(1, Math.min(5, Math.ceil(remainingPercent / 7)));

        return Math.min(nextTarget, currentPercent + step);
      });
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [isActive, targetPercent]);

  return Math.max(0, Math.min(100, Math.round(displayPercent)));
}

async function listAttendanceRecordsWithProgress(
  onProgress?: (progress: AttendanceRecordsPageProgress) => void,
) {
  const rows: AttendanceRecord[] = [];

  for (
    let offset = 0;
    offset < ATTENDANCE_RECORDS_MAX_ROWS;
    offset += ATTENDANCE_RECORDS_PAGE_SIZE
  ) {
    const page = await listAttendanceRecords({
      limit: ATTENDANCE_RECORDS_PAGE_SIZE,
      offset,
    });
    rows.push(...page);

    onProgress?.({
      loadedRows: rows.length,
      pageCount: Math.floor(offset / ATTENDANCE_RECORDS_PAGE_SIZE) + 1,
      isComplete: page.length < ATTENDANCE_RECORDS_PAGE_SIZE,
    });

    if (page.length < ATTENDANCE_RECORDS_PAGE_SIZE) break;
  }

  return rows;
}

const ATTENDANCE_HEADER_ALIASES: Record<AttendanceHeaderKey, string[]> = {
  eventName: ["event", "event name", "eventname", "activity", "activity name"],
  eventStartAt: [
    "event start at",
    "event start",
    "eventstart",
    "eventstartat",
    "start at",
    "start date",
    "start time",
    "started at",
  ],
  eventEndAt: [
    "event end at",
    "event end",
    "eventend",
    "eventendat",
    "end at",
    "end date",
    "end time",
    "ended at",
  ],
  scannedAt: [
    "scanned at",
    "scanned",
    "scannedat",
    "scan time",
    "scan date",
    "date scanned",
    "time scanned",
    "timestamp",
  ],
  studentId: [
    "student id",
    "studentid",
    "student no",
    "student number",
    "student id no",
    "student id number",
    "id number",
    "id no",
  ],
  name: ["name", "full name", "fullname", "student name", "complete name"],
  yearLevel: ["year level", "yearlevel", "year", "level", "grade level"],
  college: ["college", "department", "school college"],
  program: ["program", "course", "degree", "section program"],
  institution: ["institution", "school", "campus", "university"],
  noOfAbsences: [
    "no of absences",
    "no. of absences",
    "number of absences",
    "absences",
    "absence",
    "total absences",
  ],
  remarks: ["remarks", "remark", "notes", "note", "status"],
};

const ATTENDANCE_OPEN_XML_EXCEL_EXTENSIONS = new Set([
  "xlsx",
  "xlsm",
  "xltx",
  "xltm",
]);
const ATTENDANCE_ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ATTENDANCE_ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ATTENDANCE_ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function getAttendanceUploadAccept() {
  const configuredTypes = getAcceptedAttendanceFileTypes()
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  return Array.from(
    new Set([
      ...configuredTypes,
      ...ATTENDANCE_EXCEL_FILE_TYPES,
      ...ATTENDANCE_TEXT_FILE_TYPES,
    ]),
  ).join(",");
}

function getFileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function isExcelBasedAttendanceFile(file: File) {
  const extension = getFileExtension(file.name);
  const type = file.type.toLowerCase();

  return (
    extension in ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION ||
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    type.includes("ms-office") ||
    type.includes("officedocument")
  );
}

function getAttendanceExcelMimeType(fileName: string) {
  return (
    ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION[getFileExtension(fileName)] ??
    "application/vnd.ms-excel"
  );
}

function getAttendanceUploadFileWithNormalizedType(file: File) {
  if (!isExcelBasedAttendanceFile(file)) return file;

  const normalizedType = getAttendanceExcelMimeType(file.name);
  if (file.type === normalizedType) return file;

  return new File([file], file.name, {
    type: normalizedType,
    lastModified: file.lastModified,
  });
}

function isTextBasedAttendanceFile(file: File) {
  const extension = getFileExtension(file.name);
  const type = file.type.toLowerCase();

  return (
    extension === "csv" ||
    extension === "txt" ||
    type.includes("csv") ||
    type.includes("text")
  );
}

function cleanImportValue(value?: string | number | null) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeImportHeader(value?: string | number | null) {
  return cleanImportValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectDelimiter(text: string) {
  const sampleLine =
    text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";

  const delimiters = [",", "\t", ";", "|"];

  return delimiters.reduce(
    (selected, delimiter) => {
      const count = sampleLine.split(delimiter).length;
      return count > selected.count ? { delimiter, count } : selected;
    },
    { delimiter: ",", count: 0 },
  ).delimiter;
}

function parseDelimitedText(text: string, delimiter = detectDelimiter(text)) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (isQuoted && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (character === delimiter && !isQuoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function getHeaderIndex(headers: string[], key: AttendanceHeaderKey) {
  const normalizedAliases = ATTENDANCE_HEADER_ALIASES[key].map(
    normalizeImportHeader,
  );

  return headers.findIndex((header) =>
    normalizedAliases.includes(normalizeImportHeader(header)),
  );
}

function getHeaderValue(
  row: string[],
  headers: string[],
  key: AttendanceHeaderKey,
) {
  const index = getHeaderIndex(headers, key);
  return index >= 0 ? cleanImportValue(row[index]) : "";
}

function getLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}\\s*[:=\\-]\\s*([^\\n\\r]+)`,
      "i",
    );
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanImportValue(match[1]);
    }
  }

  return "";
}

function getNumericAbsenceValue(value: string) {
  const numericValue = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? String(numericValue)
    : "0";
}

function isNumericSpreadsheetDate(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value.trim());
}

function getDateFromExcelSerial(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 100000) return null;

  const wholeDays = Math.floor(serial);
  const timeFraction = serial - wholeDays;
  const milliseconds = Math.round(
    (wholeDays - 25569) * 86400000 + timeFraction * 86400000,
  );
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAttendanceDateTimeValue(value?: string | number | null) {
  const text = cleanImportValue(value);
  if (!text) return "";

  const serialDate = isNumericSpreadsheetDate(text)
    ? getDateFromExcelSerial(text)
    : null;
  const date = serialDate ?? new Date(text);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toNormalizedAttendanceCsv(rows: NormalizedAttendanceImportRow[]) {
  const csvRows = [
    ATTENDANCE_IMPORT_HEADERS,
    ...rows.map((row) => [
      row.eventName,
      row.eventStartAt,
      row.eventEndAt,
      row.scannedAt,
      row.studentId,
      row.name,
      row.yearLevel,
      row.college,
      row.program,
      row.institution,
      row.noOfAbsences,
      row.remarks,
    ]),
  ];

  return csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function getUniqueAttendanceEventNames(rows: NormalizedAttendanceImportRow[]) {
  return Array.from(
    new Set(rows.map((row) => cleanImportValue(row.eventName)).filter(Boolean)),
  );
}

function getAttendancePreviewEventNames(
  previewResult: AttendancePreviewResult | null,
) {
  return Array.from(
    new Set(
      previewResult?.rows
        .map((row) => cleanImportValue(row.eventName))
        .filter(Boolean) ?? [],
    ),
  );
}

function countHeaderAliasMatches(row: AttendanceSpreadsheetRow) {
  return (
    Object.keys(ATTENDANCE_HEADER_ALIASES) as AttendanceHeaderKey[]
  ).reduce((count, key) => {
    return getHeaderIndex(row.map(cleanImportValue), key) >= 0
      ? count + 1
      : count;
  }, 0);
}

function getBestAttendanceHeaderRowIndex(rows: AttendanceSpreadsheetRow[]) {
  let bestIndex = 0;
  let bestScore = 0;

  rows.slice(0, 25).forEach((row, index) => {
    const headers = row.map(cleanImportValue);
    const score = countHeaderAliasMatches(headers);
    const hasStudentId = getHeaderIndex(headers, "studentId") >= 0;
    const hasName = getHeaderIndex(headers, "name") >= 0;

    if (hasStudentId && hasName) {
      bestIndex = index;
      bestScore = Number.MAX_SAFE_INTEGER;
      return;
    }

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestScore > 0 ? bestIndex : 0;
}

function isGenericSpreadsheetSheetName(sheetName: string) {
  return /^sheet\s*\d+$/i.test(cleanImportValue(sheetName));
}

function getNormalizedAttendanceRowsFromTabularRows(
  rows: AttendanceSpreadsheetRow[],
  fileName: string,
  fallbackEventName = "",
) {
  const cleanedRows = rows
    .map((row) => row.map(cleanImportValue))
    .filter((row) => row.some((value) => value.length > 0));

  if (!cleanedRows.length) return [];

  const headerRowIndex = getBestAttendanceHeaderRowIndex(cleanedRows);
  const headers = cleanedRows[headerRowIndex].map(cleanImportValue);
  const metadataText = cleanedRows
    .slice(0, headerRowIndex)
    .map((row) => row.join("\n"))
    .join("\n");
  const metadataEventName =
    getLabeledValue(metadataText, ATTENDANCE_HEADER_ALIASES.eventName) ||
    cleanImportValue(fallbackEventName);
  const latestRecordByImportKey = new Map<
    string,
    NormalizedAttendanceImportRow
  >();

  cleanedRows.slice(headerRowIndex + 1).forEach((row, index) => {
    const searchableText = row.join("\n");
    const studentId =
      getHeaderValue(row, headers, "studentId") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.studentId);
    const name =
      getHeaderValue(row, headers, "name") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.name);

    if (!studentId || !name) return;

    const normalizedStudentId = cleanImportValue(studentId).toUpperCase();
    const rowEventName =
      getHeaderValue(row, headers, "eventName") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventName) ||
      metadataEventName;
    const rowCollege =
      getHeaderValue(row, headers, "college") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.college);
    const importKey = `${normalizeImportHeader(rowEventName) || "no-event"}:${
      normalizeImportHeader(rowCollege) || "no-college"
    }:${normalizedStudentId}`;
    const currentRecord = latestRecordByImportKey.get(importKey);

    const eventStartAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "eventStartAt") ||
        getLabeledValue(
          searchableText,
          ATTENDANCE_HEADER_ALIASES.eventStartAt,
        ) ||
        currentRecord?.eventStartAt ||
        "",
    );
    const eventEndAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "eventEndAt") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventEndAt) ||
        currentRecord?.eventEndAt ||
        "",
    );
    const scannedAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "scannedAt") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.scannedAt) ||
        currentRecord?.scannedAt ||
        "",
    );

    const normalizedRow: NormalizedAttendanceImportRow = {
      eventName: rowEventName || currentRecord?.eventName || "",
      eventStartAt,
      eventEndAt,
      scannedAt,
      studentId: normalizedStudentId,
      name: cleanImportValue(name),
      yearLevel:
        getHeaderValue(row, headers, "yearLevel") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.yearLevel) ||
        currentRecord?.yearLevel ||
        "",
      college: rowCollege || currentRecord?.college || "",
      program:
        getHeaderValue(row, headers, "program") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.program) ||
        currentRecord?.program ||
        "",
      institution:
        getHeaderValue(row, headers, "institution") ||
        getLabeledValue(
          searchableText,
          ATTENDANCE_HEADER_ALIASES.institution,
        ) ||
        currentRecord?.institution ||
        "",
      noOfAbsences: getNumericAbsenceValue(
        getHeaderValue(row, headers, "noOfAbsences") ||
          currentRecord?.noOfAbsences ||
          "0",
      ),
      remarks:
        getHeaderValue(row, headers, "remarks") ||
        currentRecord?.remarks ||
        `Imported from ${fileName} row ${headerRowIndex + index + 2}`,
    };

    latestRecordByImportKey.set(importKey, normalizedRow);
  });

  return Array.from(latestRecordByImportKey.values());
}

function getNormalizedAttendanceRowsFromText(text: string, fileName: string) {
  return getNormalizedAttendanceRowsFromTabularRows(
    parseDelimitedText(text),
    fileName,
  );
}

function isOpenXmlBasedAttendanceFile(file: File) {
  return ATTENDANCE_OPEN_XML_EXCEL_EXTENSIONS.has(getFileExtension(file.name));
}

function normalizeZipPath(path: string) {
  const segments: string[] = [];

  path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .forEach((segment) => {
      if (!segment || segment === ".") return;

      if (segment === "..") {
        segments.pop();
        return;
      }

      segments.push(segment);
    });

  return segments.join("/");
}

function readZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, AttendanceZipEntry>();
  const minimumSearchOffset = Math.max(0, view.byteLength - 65557);
  let endOfCentralDirectoryOffset = -1;

  for (
    let offset = view.byteLength - 22;
    offset >= minimumSearchOffset;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) ===
      ATTENDANCE_ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      endOfCentralDirectoryOffset = offset;
      break;
    }
  }

  if (endOfCentralDirectoryOffset < 0) return entries;

  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  let centralDirectoryOffset = view.getUint32(
    endOfCentralDirectoryOffset + 16,
    true,
  );

  for (let index = 0; index < entryCount; index += 1) {
    if (
      view.getUint32(centralDirectoryOffset, true) !==
      ATTENDANCE_ZIP_CENTRAL_DIRECTORY_SIGNATURE
    )
      break;

    const compressionMethod = view.getUint16(centralDirectoryOffset + 10, true);
    const compressedSize = view.getUint32(centralDirectoryOffset + 20, true);
    const fileNameLength = view.getUint16(centralDirectoryOffset + 28, true);
    const extraFieldLength = view.getUint16(centralDirectoryOffset + 30, true);
    const fileCommentLength = view.getUint16(centralDirectoryOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralDirectoryOffset + 42, true);
    const fileNameBytes = bytes.slice(
      centralDirectoryOffset + 46,
      centralDirectoryOffset + 46 + fileNameLength,
    );
    const name = normalizeZipPath(new TextDecoder().decode(fileNameBytes));

    if (name && !name.endsWith("/")) {
      entries.set(name, {
        name,
        compressionMethod,
        compressedSize,
        localHeaderOffset,
      });
    }

    centralDirectoryOffset +=
      46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function getUint8ArrayBlobPart(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

async function decompressZipDeflate(data: Uint8Array) {
  const DecompressionStreamConstructor = (
    globalThis as typeof globalThis & {
      DecompressionStream?: BrowserDecompressionStreamConstructor;
    }
  ).DecompressionStream;

  if (!DecompressionStreamConstructor) return null;

  for (const format of ["deflate-raw", "deflate"]) {
    try {
      const decompressedStream = new Blob([getUint8ArrayBlobPart(data)])
        .stream()
        .pipeThrough(new DecompressionStreamConstructor(format));
      return new Uint8Array(
        await new Response(decompressedStream).arrayBuffer(),
      );
    } catch {
      // Try the next browser-supported deflate format.
    }
  }

  return null;
}

async function getZipEntryBytes(
  bytes: Uint8Array,
  entries: Map<string, AttendanceZipEntry>,
  path: string,
) {
  const entry = entries.get(normalizeZipPath(path));
  if (!entry) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localHeaderOffset = entry.localHeaderOffset;

  if (
    view.getUint32(localHeaderOffset, true) !==
    ATTENDANCE_ZIP_LOCAL_FILE_HEADER_SIGNATURE
  )
    return null;

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = bytes.slice(
    dataStart,
    dataStart + entry.compressedSize,
  );

  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod !== 8) return null;

  return decompressZipDeflate(compressedData);
}

async function getZipEntryText(
  bytes: Uint8Array,
  entries: Map<string, AttendanceZipEntry>,
  path: string,
) {
  const entryBytes = await getZipEntryBytes(bytes, entries, path);
  return entryBytes ? new TextDecoder().decode(entryBytes) : "";
}

function parseXmlDocument(text: string) {
  if (!text.trim()) return null;

  const document = new DOMParser().parseFromString(text, "application/xml");
  return document.getElementsByTagName("parsererror").length ? null : document;
}

function getElementsByLocalName(parent: Document | Element, localName: string) {
  return Array.from(parent.getElementsByTagName("*")).filter(
    (element) => element.localName === localName,
  );
}

function getFirstElementTextByLocalName(
  parent: Document | Element,
  localName: string,
) {
  return getElementsByLocalName(parent, localName)[0]?.textContent ?? "";
}

function getWorkbookTargetPath(target: string) {
  if (!target) return "";

  return target.startsWith("/")
    ? normalizeZipPath(target)
    : normalizeZipPath(`xl/${target}`);
}

function getWorkbookSheets(
  workbookDocument: Document,
  workbookRelationshipsDocument: Document | null,
) {
  const relationships = new Map<string, string>();

  if (workbookRelationshipsDocument) {
    getElementsByLocalName(
      workbookRelationshipsDocument,
      "Relationship",
    ).forEach((relationship) => {
      const id = relationship.getAttribute("Id") ?? "";
      const target = relationship.getAttribute("Target") ?? "";

      if (id && target) {
        relationships.set(id, getWorkbookTargetPath(target));
      }
    });
  }

  return getElementsByLocalName(workbookDocument, "sheet")
    .map<AttendanceWorkbookSheet>((sheet, index) => {
      const relationshipId =
        sheet.getAttribute("r:id") ??
        sheet.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id",
        ) ??
        "";
      const name = cleanImportValue(
        sheet.getAttribute("name") ?? `Sheet ${index + 1}`,
      );
      const path =
        relationships.get(relationshipId) ??
        normalizeZipPath(`xl/worksheets/sheet${index + 1}.xml`);

      return { name, path };
    })
    .filter((sheet) => sheet.path);
}

function getSharedStrings(sharedStringsDocument: Document | null) {
  if (!sharedStringsDocument) return [];

  return getElementsByLocalName(sharedStringsDocument, "si").map((item) => {
    return getElementsByLocalName(item, "t")
      .map((textNode) => textNode.textContent ?? "")
      .join("");
  });
}

function getColumnIndexFromCellReference(reference: string) {
  const columnLetters = (reference.match(/^[A-Z]+/i)?.[0] ?? "").toUpperCase();
  if (!columnLetters) return -1;

  return (
    columnLetters
      .split("")
      .reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1
  );
}

function getWorksheetCellValue(cell: Element, sharedStrings: string[]) {
  const cellType = cell.getAttribute("t") ?? "";

  if (cellType === "inlineStr") {
    return getElementsByLocalName(cell, "t")
      .map((textNode) => textNode.textContent ?? "")
      .join("");
  }

  const rawValue = getFirstElementTextByLocalName(cell, "v");

  if (cellType === "s") {
    const sharedStringIndex = Number.parseInt(rawValue, 10);
    return Number.isFinite(sharedStringIndex)
      ? (sharedStrings[sharedStringIndex] ?? "")
      : "";
  }

  return rawValue;
}

function getWorksheetRows(
  worksheetDocument: Document,
  sharedStrings: string[],
) {
  return getElementsByLocalName(worksheetDocument, "row")
    .map<AttendanceSpreadsheetRow>((row) => {
      const rowValues: string[] = [];

      getElementsByLocalName(row, "c").forEach((cell, fallbackIndex) => {
        const columnIndex = getColumnIndexFromCellReference(
          cell.getAttribute("r") ?? "",
        );
        rowValues[columnIndex >= 0 ? columnIndex : fallbackIndex] =
          getWorksheetCellValue(cell, sharedStrings);
      });

      return rowValues;
    })
    .filter((row) => row.some((value) => cleanImportValue(value).length > 0));
}

async function getNormalizedAttendanceRowsFromOpenXmlWorkbook(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  if (!entries.size) return [];

  const workbookDocument = parseXmlDocument(
    await getZipEntryText(bytes, entries, "xl/workbook.xml"),
  );
  if (!workbookDocument) return [];

  const workbookRelationshipsDocument = parseXmlDocument(
    await getZipEntryText(bytes, entries, "xl/_rels/workbook.xml.rels"),
  );
  const sharedStringsDocument = parseXmlDocument(
    await getZipEntryText(bytes, entries, "xl/sharedStrings.xml"),
  );
  const sharedStrings = getSharedStrings(sharedStringsDocument);
  const sheets = getWorkbookSheets(
    workbookDocument,
    workbookRelationshipsDocument,
  );
  const normalizedRows: NormalizedAttendanceImportRow[] = [];

  for (const sheet of sheets) {
    const worksheetDocument = parseXmlDocument(
      await getZipEntryText(bytes, entries, sheet.path),
    );
    if (!worksheetDocument) continue;

    const fallbackEventName =
      sheets.length > 1 || !isGenericSpreadsheetSheetName(sheet.name)
        ? cleanImportValue(sheet.name)
        : "";
    const rows = getNormalizedAttendanceRowsFromTabularRows(
      getWorksheetRows(worksheetDocument, sharedStrings),
      `${file.name} ${sheet.name}`,
      fallbackEventName,
    );

    normalizedRows.push(...rows);
  }

  return normalizedRows;
}

async function getAttendanceUploadFile(
  file: File,
): Promise<AttendancePreparedUpload> {
  const uploadFile = getAttendanceUploadFileWithNormalizedType(file);

  if (isOpenXmlBasedAttendanceFile(uploadFile)) {
    try {
      const normalizedRows =
        await getNormalizedAttendanceRowsFromOpenXmlWorkbook(uploadFile);

      if (normalizedRows.length) {
        const normalizedCsv = toNormalizedAttendanceCsv(normalizedRows);
        const normalizedFileName =
          uploadFile.name.replace(/\.[^.]+$/, "") || "attendance-import";

        return {
          file: new File(
            [normalizedCsv],
            `${normalizedFileName}-normalized.csv`,
            { type: "text/csv" },
          ),
          normalizedRowsCount: normalizedRows.length,
          normalizedEventNames: getUniqueAttendanceEventNames(normalizedRows),
        };
      }
    } catch {
      // Keep the original Excel file so the API can still try to parse it.
    }
  }

  if (!isTextBasedAttendanceFile(uploadFile)) {
    return {
      file: uploadFile,
      normalizedRowsCount: 0,
      normalizedEventNames: [],
    };
  }

  const fileText = await uploadFile.text();
  const normalizedRows = getNormalizedAttendanceRowsFromText(
    fileText,
    file.name,
  );

  if (!normalizedRows.length) {
    return { file, normalizedRowsCount: 0, normalizedEventNames: [] };
  }

  const normalizedCsv = toNormalizedAttendanceCsv(normalizedRows);
  const normalizedFileName =
    uploadFile.name.replace(/\.[^.]+$/, "") || "attendance-import";

  return {
    file: new File([normalizedCsv], `${normalizedFileName}-normalized.csv`, {
      type: "text/csv",
    }),
    normalizedRowsCount: normalizedRows.length,
    normalizedEventNames: getUniqueAttendanceEventNames(normalizedRows),
  };
}

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

function formatEventSchedule(event: AttendanceEvent) {
  const start = formatDateTime(event.event_start_at);
  const end = formatDateTime(event.event_end_at);

  if (start !== "—" && end !== "—") return `${start} - ${end}`;
  if (start !== "—") return `Starts ${start}`;
  if (end !== "—") return `Ends ${end}`;

  return "No schedule set";
}

function getManualRecordSource(record: AttendanceRecord) {
  if (isEventlessAttendanceRecord(record)) return "No event";
  if (record.event_name) return record.event_name;
  return record.import_id ? "File import" : "Manual";
}

function getRecordTimestamp(record: AttendanceRecord) {
  const value = record.scanned_at ?? record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getAttendanceRecordYear(record: AttendanceRecord) {
  if (record.school_year_id) return record.school_year_id;

  const value = record.scanned_at ?? record.created_at;
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return String(date.getFullYear());
}

function getAttendanceYearOptions(
  records: AttendanceRecord[],
  schoolYears: SchoolYearRecord[],
) {
  return Array.from(
    new Set([
      ...schoolYears.map((schoolYear) => schoolYear.id),
      ...records.map(getAttendanceRecordYear),
    ].filter(Boolean)),
  );
}

function recordMatchesSelectedYear(
  record: AttendanceRecord,
  selectedYear: string,
) {
  return (
    selectedYear === ALL_YEARS_SELECT_VALUE ||
    getAttendanceRecordYear(record) === selectedYear
  );
}

function getCollegeLabel(value?: string | null) {
  return cleanImportValue(value) || "No college";
}

function getCollegeFilterValue(value?: string | null) {
  return cleanImportValue(value) || NO_COLLEGE_SELECT_VALUE;
}

function compareAttendanceLabels(left: string, right: string) {
  return cleanImportValue(left).localeCompare(
    cleanImportValue(right),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function getAttendanceEventSequenceNumber(value?: string | null) {
  const match = cleanImportValue(value).match(/^(\d+)(?:\s*[.)\-:]\s*|\s+)/);
  if (!match?.[1]) return Number.POSITIVE_INFINITY;

  const sequenceNumber = Number.parseInt(match[1], 10);

  return Number.isFinite(sequenceNumber)
    ? sequenceNumber
    : Number.POSITIVE_INFINITY;
}

function compareAttendanceEventLabels(left: string, right: string) {
  const leftSequenceNumber = getAttendanceEventSequenceNumber(left);
  const rightSequenceNumber = getAttendanceEventSequenceNumber(right);
  const hasLeftSequenceNumber = Number.isFinite(leftSequenceNumber);
  const hasRightSequenceNumber = Number.isFinite(rightSequenceNumber);

  if (hasLeftSequenceNumber && hasRightSequenceNumber) {
    const sequenceCompare = leftSequenceNumber - rightSequenceNumber;
    if (sequenceCompare !== 0) return sequenceCompare;
  }

  if (hasLeftSequenceNumber !== hasRightSequenceNumber) {
    return hasLeftSequenceNumber ? -1 : 1;
  }

  return compareAttendanceLabels(left, right);
}

function compareAttendanceRecordsByEventSequence(
  leftRecord: AttendanceRecord,
  rightRecord: AttendanceRecord,
) {
  const eventCompare = compareAttendanceEventLabels(
    getManualRecordSource(leftRecord),
    getManualRecordSource(rightRecord),
  );

  if (eventCompare !== 0) return eventCompare;

  const studentIdCompare = compareAttendanceLabels(
    leftRecord.student_id ?? "",
    rightRecord.student_id ?? "",
  );

  if (studentIdCompare !== 0) return studentIdCompare;

  const nameCompare = compareAttendanceLabels(
    leftRecord.name ?? "",
    rightRecord.name ?? "",
  );

  if (nameCompare !== 0) return nameCompare;

  return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
}

function getAttendanceEventIdentityKey(
  eventName?: string | null,
  eventId?: string | null,
) {
  const normalizedEventName = normalizeImportHeader(eventName);
  if (normalizedEventName) return `event:${normalizedEventName}`;
  if (eventId) return `event-id:${eventId}`;

  return NO_EVENT_FILTER_SELECT_VALUE;
}

function getAttendanceEventFilterValue(event: AttendanceEvent) {
  return getAttendanceEventIdentityKey(event.name, event.id);
}

function getRecordEventFilterValue(record: AttendanceRecord) {
  if (isEventlessAttendanceRecord(record)) return NO_EVENT_FILTER_SELECT_VALUE;

  return getAttendanceEventIdentityKey(
    getManualRecordSource(record),
    record.event_id,
  );
}

function getRecordEventGroupKey(record: AttendanceRecord) {
  if (isEventlessAttendanceRecord(record)) return NO_EVENT_FILTER_SELECT_VALUE;

  const eventKey =
    getAttendanceEventIdentityKey(
      getManualRecordSource(record),
      record.event_id,
    ) || `manual-event:${record.id}`;
  const collegeKey =
    normalizeImportHeader(record.college) || NO_COLLEGE_SELECT_VALUE;

  return `${eventKey}:college:${collegeKey}`;
}

function getRecordStudentProfileKey(record: AttendanceRecord) {
  return (
    cleanImportValue(record.student_id).toUpperCase() ||
    `unknown-student:${record.id}`
  );
}

function normalizeAttendanceStatusValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isManualAttendanceMarker(value?: string | null) {
  const normalizedValue = normalizeAttendanceStatusValue(value);

  return (
    normalizedValue === "manual" ||
    normalizedValue === "manual attendance" ||
    normalizedValue === "no event" ||
    normalizedValue === "no event attended" ||
    normalizedValue === "landing page" ||
    normalizedValue === "landing page registration" ||
    normalizedValue === "registered from landing page"
  );
}

function getStoredAttendanceAbsenceCount(record: AttendanceRecord) {
  const numericValue = Number(record.no_of_absences ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function isZeroAttendanceRecord(record: AttendanceRecord) {
  const recordData = record as Record<string, unknown>;
  const statusValues = [
    recordData.status,
    recordData.attendance_status,
    recordData.classification,
    recordData.result,
    recordData.source,
    recordData.registration_source,
    record.remarks,
  ]
    .map(normalizeAttendanceStatusValue)
    .filter(Boolean);

  const hasZeroAttendanceMarker = statusValues.some((value) => {
    return (
      /(^|\s)(zero attendance|no attendance|absent to all|all events absent)(\s|$)/.test(
        value,
      ) ||
      (value.includes("landing page") &&
        (value.includes("zero") || value.includes("absent")))
    );
  });

  if (hasZeroAttendanceMarker) return true;

  return (
    !record.event_id &&
    !cleanImportValue(record.event_name) &&
    getStoredAttendanceAbsenceCount(record) === 0
  );
}

function isEventlessAttendanceRecord(record: AttendanceRecord) {
  if (isZeroAttendanceRecord(record)) return true;

  const eventName = cleanImportValue(record.event_name);
  if (isManualAttendanceMarker(eventName)) return true;
  if (record.event_id) return false;
  if (!eventName) return true;

  return normalizeImportHeader(eventName) === normalizeImportHeader(record.name);
}

function isExplicitAbsentAttendanceRecord(record: AttendanceRecord) {
  const recordData = record as Record<string, unknown>;
  const statusValues = [
    recordData.status,
    recordData.attendance_status,
    recordData.classification,
    recordData.result,
    record.remarks,
  ]
    .map(normalizeAttendanceStatusValue)
    .filter(Boolean);

  return statusValues.some((value) =>
    /(^|\s)(absent|absence|missed|not attended|unattended|no show)(\s|$)/.test(
      value,
    ),
  );
}

function hasAttendanceEventIdentity(record: AttendanceRecord) {
  return getRecordEventGroupKey(record) !== NO_EVENT_FILTER_SELECT_VALUE;
}

function getEffectiveAttendanceRecordAbsenceCount(record: AttendanceRecord) {
  if (isEventlessAttendanceRecord(record))
    return getStoredAttendanceAbsenceCount(record);

  if (isExplicitAbsentAttendanceRecord(record)) {
    return Math.max(1, getStoredAttendanceAbsenceCount(record));
  }

  return 0;
}

function getCollegeScopedAttendanceAbsenceCount(
  studentRecords: AttendanceRecord[],
  allRecords: AttendanceRecord[],
) {
  const studentCollegeKeys = new Set(
    studentRecords
      .map((record) => getAttendanceCollegeScopeKey(record.college))
      .filter((collegeKey) => collegeKey !== NO_COLLEGE_SELECT_VALUE),
  );
  const studentProfileKeys = new Set(
    studentRecords.map(getRecordStudentProfileKey).filter(Boolean),
  );

  if (!studentRecords.length || !allRecords.length) return null;

  const matchesStudentCollegeScope = (
    record: AttendanceRecord,
    useCollegeScope: boolean,
  ) => {
    return (
      !useCollegeScope ||
      studentCollegeKeys.has(getAttendanceCollegeScopeKey(record.college))
    );
  };

  const collectEventKeys = (
    sourceRecords: AttendanceRecord[],
    useCollegeScope: boolean,
    options: {
      excludeAbsentRecords?: boolean;
      matchStudentProfileKeys?: Set<string>;
    } = {},
  ) => {
    const eventKeys = new Set<string>();

    sourceRecords.forEach((record) => {
      if (
        !matchesStudentCollegeScope(record, useCollegeScope) ||
        isEventlessAttendanceRecord(record) ||
        (options.excludeAbsentRecords &&
          isExplicitAbsentAttendanceRecord(record)) ||
        (options.matchStudentProfileKeys &&
          !options.matchStudentProfileKeys.has(
            getRecordStudentProfileKey(record),
          )) ||
        !hasAttendanceEventIdentity(record)
      ) {
        return;
      }

      eventKeys.add(getRecordEventGroupKey(record));
    });

    return eventKeys;
  };

  const shouldUseCollegeScope = studentCollegeKeys.size > 0;
  let collegeEventKeys = collectEventKeys(allRecords, shouldUseCollegeScope);

  if (!collegeEventKeys.size && shouldUseCollegeScope) {
    collegeEventKeys = collectEventKeys(allRecords, false);
  }

  if (!collegeEventKeys.size) return null;

  let attendedEventKeys = collectEventKeys(allRecords, shouldUseCollegeScope, {
    excludeAbsentRecords: true,
    matchStudentProfileKeys: studentProfileKeys,
  });

  if (!attendedEventKeys.size && shouldUseCollegeScope) {
    attendedEventKeys = collectEventKeys(allRecords, false, {
      excludeAbsentRecords: true,
      matchStudentProfileKeys: studentProfileKeys,
    });
  }

  return Array.from(collegeEventKeys).filter(
    (eventKey) => !attendedEventKeys.has(eventKey),
  ).length;
}

type AttendanceStudentProfile = {
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
};

type AttendanceStudentProfileDraft = AttendanceStudentProfile & {
  nameTime: number;
  yearLevelTime: number;
  collegeTime: number;
  programTime: number;
  institutionTime: number;
};

function updateAttendanceStudentProfileField(
  profile: AttendanceStudentProfileDraft,
  key: keyof AttendanceStudentProfile,
  value: string | null | undefined,
  recordTime: number,
) {
  const cleanedValue = cleanImportValue(value);
  if (!cleanedValue) return;

  const timeKey = `${key}Time`;
  const draft = profile as AttendanceStudentProfileDraft &
    Record<string, string | number>;
  const currentTime = Number(draft[timeKey] ?? 0);

  if (!profile[key] || recordTime >= currentTime) {
    draft[key] = cleanedValue;
    draft[timeKey] = recordTime;
  }
}

function mergeAttendanceRecordsByStudentId(records: AttendanceRecord[]) {
  const profiles = new Map<string, AttendanceStudentProfileDraft>();

  records.forEach((record) => {
    const key = getRecordStudentProfileKey(record);
    const recordTime = getRecordTimestamp(record);
    const profile = profiles.get(key) ?? {
      name: "",
      yearLevel: "",
      college: "",
      program: "",
      institution: "",
      nameTime: 0,
      yearLevelTime: 0,
      collegeTime: 0,
      programTime: 0,
      institutionTime: 0,
    };

    updateAttendanceStudentProfileField(
      profile,
      "name",
      record.name,
      recordTime,
    );
    updateAttendanceStudentProfileField(
      profile,
      "yearLevel",
      record.year_level,
      recordTime,
    );
    updateAttendanceStudentProfileField(
      profile,
      "college",
      record.college,
      recordTime,
    );
    updateAttendanceStudentProfileField(
      profile,
      "program",
      record.program,
      recordTime,
    );
    updateAttendanceStudentProfileField(
      profile,
      "institution",
      record.institution,
      recordTime,
    );
    profiles.set(key, profile);
  });

  return records.map((record) => {
    const profile = profiles.get(getRecordStudentProfileKey(record));
    if (!profile) return record;

    return {
      ...record,
      name: profile.name || record.name,
      year_level: profile.yearLevel || record.year_level,
      college: profile.college || record.college,
      program: profile.program || record.program,
      institution: profile.institution || record.institution,
    };
  });
}

function getAttendeeKey(record: AttendanceRecord) {
  const studentId = cleanImportValue(record.student_id).toUpperCase();

  return studentId || `unknown-attendee:${record.id}`;
}

function getAttendanceCollegeScopeKey(value?: string | null) {
  return normalizeImportHeader(value) || NO_COLLEGE_SELECT_VALUE;
}

type AttendanceRecordEditScope = "event-attendee" | "search-student-college";

function getMatchingAttendanceAttendeeEventRecords(
  records: AttendanceRecord[],
  editingRecordId: string,
) {
  const editingRecord = records.find((record) => record.id === editingRecordId);
  if (!editingRecord) return [];

  const editingEventKey = getRecordEventGroupKey(editingRecord);
  const editingAttendeeKey = getAttendeeKey(editingRecord);

  return records.filter((record) => {
    return (
      getRecordEventGroupKey(record) === editingEventKey &&
      getAttendeeKey(record) === editingAttendeeKey
    );
  });
}

function getMatchingAttendanceSearchStudentCollegeRecords(
  records: AttendanceRecord[],
  editingRecordId: string,
) {
  const editingRecord = records.find((record) => record.id === editingRecordId);
  if (!editingRecord) return [];

  const editingAttendeeKey = getAttendeeKey(editingRecord);
  const editingCollegeKey = getAttendanceCollegeScopeKey(editingRecord.college);

  return records.filter((record) => {
    return (
      getAttendeeKey(record) === editingAttendeeKey &&
      getAttendanceCollegeScopeKey(record.college) === editingCollegeKey
    );
  });
}

function getMatchingAttendanceEditRecords(
  records: AttendanceRecord[],
  editingRecordId: string,
  scope: AttendanceRecordEditScope,
) {
  if (!editingRecordId) return [];

  return scope === "search-student-college"
    ? getMatchingAttendanceSearchStudentCollegeRecords(records, editingRecordId)
    : getMatchingAttendanceAttendeeEventRecords(records, editingRecordId);
}

function getManualAttendanceSelectedEventIds(form: ManualAttendanceFormState) {
  const selectedEventIds = form.eventIds.length
    ? form.eventIds
    : form.eventId
      ? [form.eventId]
      : [];

  return Array.from(
    new Set(
      selectedEventIds.map((eventId) => cleanImportValue(eventId)).filter(Boolean),
    ),
  );
}

function getZeroAttendanceRegistrationAttendeeOptions(
  records: AttendanceRecord[],
) {
  const attendeesByKey = new Map<string, AttendanceZeroAttendanceAttendeeOption>();

  records.forEach((record) => {
    if (!isZeroAttendanceRecord(record)) return;

    const studentId = cleanImportValue(record.student_id).toUpperCase();
    const name = cleanImportValue(record.name);

    if (!studentId || !name) return;

    const option: AttendanceZeroAttendanceAttendeeOption = {
      key: getBulkAttendanceEventAttendeeKey(studentId, record.college),
      studentId,
      name,
      yearLevel: cleanImportValue(record.year_level),
      college: cleanImportValue(record.college),
      program: cleanImportValue(record.program),
      institution:
        cleanImportValue(record.institution) || DEFAULT_STUDENT_INSTITUTION,
      remarks: cleanImportValue(record.remarks),
      latestScannedAt: record.scanned_at ?? record.created_at ?? null,
    };
    const currentOption = attendeesByKey.get(option.key);
    const optionTime = getRecordTimestamp(record);
    const currentTime = currentOption?.latestScannedAt
      ? new Date(currentOption.latestScannedAt).getTime()
      : 0;

    if (
      !currentOption ||
      optionTime > (Number.isNaN(currentTime) ? 0 : currentTime)
    ) {
      attendeesByKey.set(option.key, option);
    }
  });

  return Array.from(attendeesByKey.values()).sort((left, right) => {
    const nameCompare = compareAttendanceLabels(left.name, right.name);
    if (nameCompare !== 0) return nameCompare;

    return compareAttendanceLabels(left.studentId, right.studentId);
  });
}

function findZeroAttendanceAttendeeOption(
  zeroAttendanceAttendees: AttendanceZeroAttendanceAttendeeOption[],
  value?: string | null,
) {
  const cleanValue = cleanImportValue(value);
  if (!cleanValue) return null;

  const normalizedValue = normalizeImportHeader(cleanValue);
  const upperValue = cleanValue.toUpperCase();

  return (
    zeroAttendanceAttendees.find((attendee) => {
      return (
        attendee.studentId.toUpperCase() === upperValue ||
        normalizeImportHeader(attendee.name) === normalizedValue
      );
    }) ?? null
  );
}

function getBulkAttendanceAttendeeNameFromInputRow(row: string[]) {
  if (row.length <= 1) return cleanImportValue(row[0]);

  return cleanImportValue(row[1]) || cleanImportValue(row[0]);
}

function appendBulkAttendanceAttendeeName(
  attendees: string,
  attendeeName: string,
) {
  const name = cleanImportValue(attendeeName);
  if (!name) return attendees;

  const existingNames = new Set(
    parseDelimitedText(attendees)
      .map((row) => getBulkAttendanceAttendeeNameFromInputRow(row))
      .map(normalizeImportHeader)
      .filter(Boolean),
  );

  if (existingNames.has(normalizeImportHeader(name))) return attendees;

  const currentAttendees = attendees.trimEnd();

  return currentAttendees ? `${currentAttendees}\n${name}` : name;
}

function getZeroAttendanceAttendeeSelectLabel(
  attendee: AttendanceZeroAttendanceAttendeeOption,
) {
  return [
    attendee.name,
    attendee.studentId,
    attendee.yearLevel,
    attendee.college,
    attendee.program,
  ]
    .map(cleanImportValue)
    .filter(Boolean)
    .join(" • ");
}

function bulkAttendanceFieldMatchesSelectedFilter(
  selectedValue: string,
  attendeeValue: string,
) {
  const selected = normalizeImportHeader(selectedValue);
  if (!selected) return true;

  const attendee = normalizeImportHeader(attendeeValue);

  return !attendee || attendee === selected;
}

function getFilteredZeroAttendanceAttendees(
  attendees: AttendanceZeroAttendanceAttendeeOption[],
  form: AttendanceBulkEventAttendeesFormState,
) {
  return attendees.filter((attendee) => {
    return (
      bulkAttendanceFieldMatchesSelectedFilter(
        form.yearLevel,
        attendee.yearLevel,
      ) &&
      bulkAttendanceFieldMatchesSelectedFilter(form.college, attendee.college) &&
      bulkAttendanceFieldMatchesSelectedFilter(form.program, attendee.program) &&
      bulkAttendanceFieldMatchesSelectedFilter(
        form.institution,
        attendee.institution,
      )
    );
  });
}

function getBulkEventAttendeeRowFallbackValue(
  row: string[],
  index: number,
  fallback: string,
) {
  return cleanImportValue(row[index]) || cleanImportValue(fallback);
}

function getBulkEventAttendeeRowHeaderValue(
  row: string[],
  headers: string[],
  key: AttendanceHeaderKey,
  fallback: string,
) {
  return (
    getHeaderValue(row, headers, key) ||
    getLabeledValue(row.join("\n"), ATTENDANCE_HEADER_ALIASES[key]) ||
    cleanImportValue(fallback)
  );
}

function getBulkAttendanceEventAttendeeRows(
  form: AttendanceBulkEventAttendeesFormState,
  zeroAttendanceAttendees: AttendanceZeroAttendanceAttendeeOption[] = [],
) {
  const rows = parseDelimitedText(form.attendees)
    .map((row) => row.map(cleanImportValue))
    .filter((row) => row.some(Boolean));

  if (!rows.length) return [];

  const headerRowIndex = getBestAttendanceHeaderRowIndex(rows);
  const headers = rows[headerRowIndex].map(cleanImportValue);
  const hasHeaderRow =
    getHeaderIndex(headers, "studentId") >= 0 ||
    getHeaderIndex(headers, "name") >= 0;
  const dataRows = hasHeaderRow ? rows.slice(headerRowIndex + 1) : rows;
  const attendeesByKey = new Map<string, AttendanceBulkEventAttendeeRow>();

  dataRows.forEach((row) => {
    const inputStudentId = cleanImportValue(
      hasHeaderRow
        ? getBulkEventAttendeeRowHeaderValue(row, headers, "studentId", "")
        : row.length > 1
          ? row[0]
          : "",
    ).toUpperCase();
    const inputName = cleanImportValue(
      hasHeaderRow
        ? getBulkEventAttendeeRowHeaderValue(row, headers, "name", "")
        : getBulkAttendanceAttendeeNameFromInputRow(row),
    );
    const matchedAttendee =
      findZeroAttendanceAttendeeOption(zeroAttendanceAttendees, inputStudentId) ??
      findZeroAttendanceAttendeeOption(zeroAttendanceAttendees, inputName);
    const studentId =
      inputStudentId || matchedAttendee?.studentId || inputName.toUpperCase();
    const name = inputName || matchedAttendee?.name || "";

    if (!studentId || !name) return;

    const attendee: AttendanceBulkEventAttendeeRow = hasHeaderRow
      ? {
          studentId,
          name,
          yearLevel:
            form.yearLevel ||
            getBulkEventAttendeeRowHeaderValue(
              row,
              headers,
              "yearLevel",
              matchedAttendee?.yearLevel ?? "",
            ),
          college:
            form.college ||
            getBulkEventAttendeeRowHeaderValue(
              row,
              headers,
              "college",
              matchedAttendee?.college ?? "",
            ),
          program:
            form.program ||
            getBulkEventAttendeeRowHeaderValue(
              row,
              headers,
              "program",
              matchedAttendee?.program ?? "",
            ),
          institution:
            form.institution ||
            getBulkEventAttendeeRowHeaderValue(
              row,
              headers,
              "institution",
              matchedAttendee?.institution ?? DEFAULT_STUDENT_INSTITUTION,
            ),
          remarks:
            getBulkEventAttendeeRowHeaderValue(
              row,
              headers,
              "remarks",
              form.remarks || matchedAttendee?.remarks || "",
            ) || form.remarks,
        }
      : {
          studentId,
          name,
          yearLevel:
            form.yearLevel ||
            getBulkEventAttendeeRowFallbackValue(
              row,
              2,
              matchedAttendee?.yearLevel ?? "",
            ),
          college:
            form.college ||
            getBulkEventAttendeeRowFallbackValue(
              row,
              3,
              matchedAttendee?.college ?? "",
            ),
          program:
            form.program ||
            getBulkEventAttendeeRowFallbackValue(
              row,
              4,
              matchedAttendee?.program ?? "",
            ),
          institution:
            form.institution ||
            getBulkEventAttendeeRowFallbackValue(
              row,
              5,
              matchedAttendee?.institution ?? DEFAULT_STUDENT_INSTITUTION,
            ),
          remarks:
            getBulkEventAttendeeRowFallbackValue(
              row,
              6,
              form.remarks || matchedAttendee?.remarks || "",
            ) || form.remarks,
        };

    const attendeeKey = [
      attendee.studentId,
      normalizeImportHeader(attendee.college),
    ].join(":");

    attendeesByKey.set(attendeeKey, attendee);
  });

  return Array.from(attendeesByKey.values());
}

function getBulkAttendanceEventAttendeeKey(
  studentId?: string | null,
  college?: string | null,
) {
  return [
    cleanImportValue(studentId).toUpperCase(),
    getAttendanceCollegeScopeKey(college),
  ].join(":");
}


function getAttendanceNoEventSourceRecordIdsForAttendeeKeys(
  records: AttendanceRecord[],
  attendeeKeys: string[],
) {
  const sourceKeys = new Set(
    attendeeKeys.map((key) => cleanImportValue(key)).filter(Boolean),
  );

  if (!sourceKeys.size) return [];

  return Array.from(
    new Set(
      records
        .filter(isEventlessAttendanceRecord)
        .filter((record) =>
          sourceKeys.has(
            getBulkAttendanceEventAttendeeKey(record.student_id, record.college),
          ),
        )
        .map((record) => record.id)
        .filter(Boolean),
    ),
  );
}

function getAttendanceNoEventSourceRecordIdsForAttendees(
  records: AttendanceRecord[],
  attendees: AttendanceBulkEventAttendeeRow[],
) {
  return getAttendanceNoEventSourceRecordIdsForAttendeeKeys(
    records,
    attendees.map((attendee) =>
      getBulkAttendanceEventAttendeeKey(attendee.studentId, attendee.college),
    ),
  );
}

function getAttendanceNoEventSourceRecordIdsForRecords(
  records: AttendanceRecord[],
  sourceRecords: AttendanceRecord[],
) {
  return getAttendanceNoEventSourceRecordIdsForAttendeeKeys(
    records,
    sourceRecords.map((record) =>
      getBulkAttendanceEventAttendeeKey(record.student_id, record.college),
    ),
  );
}

function getAttendanceEventById(
  events: AttendanceEvent[],
  eventId: string,
) {
  return events.find((event) => event.id === eventId) ?? null;
}

function recordMatchesAttendanceEventId(
  record: AttendanceRecord,
  eventId: string,
  events: AttendanceEvent[],
) {
  if (!eventId || isEventlessAttendanceRecord(record)) return false;
  if (record.event_id === eventId) return true;

  const event = getAttendanceEventById(events, eventId);
  const eventName = normalizeImportHeader(event?.name);

  return Boolean(eventName) && eventName === normalizeImportHeader(getManualRecordSource(record));
}

function getMatchingAttendanceEventRecordsForAttendee(
  records: AttendanceRecord[],
  editingRecord: AttendanceRecord,
  eventId: string,
  events: AttendanceEvent[],
) {
  const editingAttendeeKey = getAttendeeKey(editingRecord);
  const editingCollegeKey = getAttendanceCollegeScopeKey(editingRecord.college);

  return records.filter((record) => {
    return (
      getAttendeeKey(record) === editingAttendeeKey &&
      getAttendanceCollegeScopeKey(record.college) === editingCollegeKey &&
      recordMatchesAttendanceEventId(record, eventId, events)
    );
  });
}

function getAttendanceRecordEventIds(
  record: AttendanceRecord,
  events: AttendanceEvent[],
) {
  if (isEventlessAttendanceRecord(record)) return [];

  const eventIds = new Set<string>();

  if (record.event_id && events.some((event) => event.id === record.event_id)) {
    eventIds.add(record.event_id);
  }

  events.forEach((event) => {
    if (recordMatchesAttendanceEventId(record, event.id, events)) {
      eventIds.add(event.id);
    }
  });

  return events
    .filter((event) => eventIds.has(event.id))
    .map((event) => event.id);
}

function getAttendancePresentEventIdsForAttendee(
  records: AttendanceRecord[],
  editingRecord: AttendanceRecord | null | undefined,
  events: AttendanceEvent[],
) {
  if (!editingRecord) return [];

  const editingAttendeeKey = getAttendeeKey(editingRecord);
  const editingCollegeKey = getAttendanceCollegeScopeKey(editingRecord.college);
  const eventIds = new Set<string>();

  records.forEach((record) => {
    if (
      getAttendeeKey(record) !== editingAttendeeKey ||
      getAttendanceCollegeScopeKey(record.college) !== editingCollegeKey ||
      isEventlessAttendanceRecord(record) ||
      isExplicitAbsentAttendanceRecord(record)
    ) {
      return;
    }

    getAttendanceRecordEventIds(record, events).forEach((eventId) =>
      eventIds.add(eventId),
    );
  });

  return events
    .filter((event) => eventIds.has(event.id))
    .map((event) => event.id);
}

function getAttendancePresentEventsForAttendee(
  records: AttendanceRecord[],
  editingRecord: AttendanceRecord | null | undefined,
  events: AttendanceEvent[],
) {
  const eventIds = new Set(
    getAttendancePresentEventIdsForAttendee(records, editingRecord, events),
  );

  return events.filter((event) => eventIds.has(event.id));
}

function getMissingAttendanceEventIdsForAttendee(
  records: AttendanceRecord[],
  editingRecord: AttendanceRecord,
  eventIds: string[],
  events: AttendanceEvent[],
) {
  const uniqueEventIds = Array.from(
    new Set(eventIds.map((eventId) => cleanImportValue(eventId)).filter(Boolean)),
  );

  return uniqueEventIds.filter((eventId) => {
    return !getMatchingAttendanceEventRecordsForAttendee(
      records,
      editingRecord,
      eventId,
      events,
    ).length;
  });
}

function getAttendanceAttendeeSummaries(records: AttendanceRecord[]) {
  const attendees = new Map<string, AttendanceEventAttendeeSummary>();

  records.forEach((record) => {
    const key = getAttendeeKey(record);
    const currentAttendee = attendees.get(key);
    const recordTime = getRecordTimestamp(record);

    if (!currentAttendee) {
      attendees.set(key, {
        key,
        studentId: record.student_id,
        name: record.name,
        records: [record],
        totalAbsences: getEffectiveAttendanceRecordAbsenceCount(record),
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
        yearLevel: record.year_level ?? "",
        college: record.college ?? "",
        program: record.program ?? "",
        institution: record.institution ?? "",
      });
      return;
    }

    const latestTime = currentAttendee.latestScannedAt
      ? new Date(currentAttendee.latestScannedAt).getTime()
      : 0;

    currentAttendee.records.push(record);
    currentAttendee.totalAbsences = Math.max(
      currentAttendee.totalAbsences,
      getEffectiveAttendanceRecordAbsenceCount(record),
    );

    if (recordTime > (Number.isNaN(latestTime) ? 0 : latestTime)) {
      currentAttendee.latestScannedAt =
        record.scanned_at ??
        record.created_at ??
        currentAttendee.latestScannedAt;
      if (record.name) currentAttendee.name = record.name;
    }

    if (!currentAttendee.name && record.name)
      currentAttendee.name = record.name;
    if (!currentAttendee.yearLevel && record.year_level)
      currentAttendee.yearLevel = record.year_level;
    if (!currentAttendee.college && record.college)
      currentAttendee.college = record.college;
    if (!currentAttendee.program && record.program)
      currentAttendee.program = record.program;
    if (!currentAttendee.institution && record.institution)
      currentAttendee.institution = record.institution;
  });

  return Array.from(attendees.values())
    .map((attendee) => ({
      ...attendee,
      records: [...attendee.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
      }),
    }))
    .sort((leftAttendee, rightAttendee) => {
      const leftTime = leftAttendee.latestScannedAt
        ? new Date(leftAttendee.latestScannedAt).getTime()
        : 0;
      const rightTime = rightAttendee.latestScannedAt
        ? new Date(rightAttendee.latestScannedAt).getTime()
        : 0;

      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    });
}

function getAttendanceEventGroups(
  records: AttendanceRecord[],
  events: AttendanceEvent[],
) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const groups = new Map<string, AttendanceEventRecordGroup>();

  records.forEach((record) => {
    const key = getRecordEventGroupKey(record);
    const event = record.event_id
      ? (eventById.get(record.event_id) ?? null)
      : null;
    const currentGroup = groups.get(key);
    const recordTime = getRecordTimestamp(record);

    if (!currentGroup) {
      groups.set(key, {
        key,
        eventId: record.event_id ?? null,
        eventName: event?.name ?? getManualRecordSource(record),
        eventStartAt: event?.event_start_at ?? null,
        eventEndAt: event?.event_end_at ?? null,
        eventDescription: event?.description ?? null,
        college: record.college ?? "",
        records: [record],
        attendees: [],
        totalAbsences: getEffectiveAttendanceRecordAbsenceCount(record),
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
      });
      return;
    }

    const latestTime = currentGroup.latestScannedAt
      ? new Date(currentGroup.latestScannedAt).getTime()
      : 0;

    currentGroup.records.push(record);
    currentGroup.totalAbsences += getEffectiveAttendanceRecordAbsenceCount(record);

    if (recordTime > (Number.isNaN(latestTime) ? 0 : latestTime)) {
      currentGroup.latestScannedAt =
        record.scanned_at ?? record.created_at ?? currentGroup.latestScannedAt;
    }

    if (!currentGroup.eventStartAt && event?.event_start_at)
      currentGroup.eventStartAt = event.event_start_at;
    if (!currentGroup.eventEndAt && event?.event_end_at)
      currentGroup.eventEndAt = event.event_end_at;
    if (!currentGroup.eventDescription && event?.description)
      currentGroup.eventDescription = event.description;
    if (!currentGroup.college && record.college)
      currentGroup.college = record.college;
  });

  return Array.from(groups.values())
    .map((group) => {
      const sortedRecords = [...group.records].sort(
        (leftRecord, rightRecord) => {
          return (
            getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord)
          );
        },
      );

      const attendees = getAttendanceAttendeeSummaries(sortedRecords).map(
        (attendee) => {
          if (group.key !== NO_EVENT_FILTER_SELECT_VALUE) return attendee;

          return {
            ...attendee,
            totalAbsences: getAttendanceRecordTotalAbsences(
              attendee.records,
              records,
            ),
          };
        },
      );

      return {
        ...group,
        records: sortedRecords,
        attendees,
        totalAbsences: attendees.reduce(
          (total, attendee) => total + attendee.totalAbsences,
          0,
        ),
      };
    })
    .sort((leftGroup, rightGroup) => {
      const eventNameCompare = compareAttendanceLabels(
        leftGroup.eventName,
        rightGroup.eventName,
      );

      if (eventNameCompare !== 0) return eventNameCompare;

      const collegeCompare = compareAttendanceLabels(
        getAttendanceGroupCollegeLabel(leftGroup),
        getAttendanceGroupCollegeLabel(rightGroup),
      );

      if (collegeCompare !== 0) return collegeCompare;

      return compareAttendanceLabels(
        formatEventGroupSchedule(leftGroup),
        formatEventGroupSchedule(rightGroup),
      );
    });
}

function getAttendanceGroupCollegeLabel(group: AttendanceEventRecordGroup) {
  const colleges = Array.from(
    new Set(
      group.records
        .map((record) => cleanImportValue(record.college))
        .filter(Boolean),
    ),
  );

  if (!colleges.length) return "No college";
  if (colleges.length === 1) return colleges[0];

  return `${colleges.length} colleges`;
}

function normalizeManualAttendanceRecords(
  records: AttendanceRecord[],
  events: AttendanceEvent[],
) {
  const manualEventIds = new Set(
    events
      .filter((event) => isManualAttendanceMarker(event.name))
      .map((event) => event.id),
  );

  return records.map((record) => {
    if (
      isManualAttendanceMarker(record.event_name) ||
      (record.event_id && manualEventIds.has(record.event_id))
    ) {
      return {
        ...record,
        event_id: null,
        event_name: null,
      };
    }

    return record;
  });
}

function getDeduplicatedAttendanceEvents(events: AttendanceEvent[]) {
  const eventMap = new Map<string, AttendanceEvent>();

  events.forEach((event) => {
    if (isManualAttendanceMarker(event.name)) return;

    const key = getAttendanceEventFilterValue(event);
    const currentEvent = eventMap.get(key);

    if (!currentEvent) {
      eventMap.set(key, { ...event });
      return;
    }

    eventMap.set(key, {
      ...currentEvent,
      event_start_at: currentEvent.event_start_at || event.event_start_at,
      event_end_at: currentEvent.event_end_at || event.event_end_at,
      description: currentEvent.description || event.description,
      attendees_count: Math.max(
        currentEvent.attendees_count ?? 0,
        event.attendees_count ?? 0,
      ),
    });
  });

  return Array.from(eventMap.values()).sort((left, right) =>
    compareAttendanceLabels(left.name, right.name),
  );
}

function getAttendanceRecordTotalAbsences(
  records: AttendanceRecord[],
  allRecords: AttendanceRecord[] = records,
) {
  const recordsByStudentScope = new Map<string, AttendanceRecord[]>();

  records.forEach((record) => {
    const key = [
      getRecordStudentProfileKey(record),
      normalizeImportHeader(record.college),
    ].join(":");
    const studentScopeRecords = recordsByStudentScope.get(key) ?? [];

    studentScopeRecords.push(record);
    recordsByStudentScope.set(key, studentScopeRecords);
  });

  return Array.from(recordsByStudentScope.values()).reduce(
    (total, studentScopeRecords) => {
      const collegeScopedAbsences = getCollegeScopedAttendanceAbsenceCount(
        studentScopeRecords,
        allRecords,
      );

      if (collegeScopedAbsences !== null) return total + collegeScopedAbsences;

      const effectiveAbsenceCounts = studentScopeRecords.map(
        getEffectiveAttendanceRecordAbsenceCount,
      );
      const hasEffectiveAbsence = effectiveAbsenceCounts.some(
        (absenceCount) => absenceCount > 0,
      );

      if (hasEffectiveAbsence) {
        return total + Math.max(0, ...effectiveAbsenceCounts);
      }

      if (studentScopeRecords.some(hasAttendanceEventIdentity)) return total;

      return (
        total +
        Math.max(0, ...studentScopeRecords.map(getStoredAttendanceAbsenceCount))
      );
    },
    0,
  );
}

function getManualZeroAttendanceCalculatedAbsenceCount(
  record: AttendanceRecord,
  allRecords: AttendanceRecord[],
) {
  if (!isEventlessAttendanceRecord(record)) return null;

  return getCollegeScopedAttendanceAbsenceCount([record], allRecords);
}


function getAttendanceSearchRecordDeduplicationKey(record: AttendanceRecord) {
  return [getRecordEventGroupKey(record), getAttendeeKey(record)].join(":");
}

function getPreferredDeduplicatedAttendanceRecord(
  currentRecord: AttendanceRecord,
  candidateRecord: AttendanceRecord,
) {
  const currentAbsences = Number(currentRecord.no_of_absences ?? 0);
  const candidateAbsences = Number(candidateRecord.no_of_absences ?? 0);
  const shouldUseCandidate =
    candidateAbsences > currentAbsences ||
    (candidateAbsences === currentAbsences &&
      getRecordTimestamp(candidateRecord) >= getRecordTimestamp(currentRecord));
  const preferredRecord = shouldUseCandidate ? candidateRecord : currentRecord;
  const fallbackRecord = shouldUseCandidate ? currentRecord : candidateRecord;

  return {
    ...preferredRecord,
    student_id: preferredRecord.student_id || fallbackRecord.student_id,
    name: preferredRecord.name || fallbackRecord.name,
    year_level: preferredRecord.year_level || fallbackRecord.year_level,
    college: preferredRecord.college || fallbackRecord.college,
    program: preferredRecord.program || fallbackRecord.program,
    institution: preferredRecord.institution || fallbackRecord.institution,
    remarks: preferredRecord.remarks || fallbackRecord.remarks,
    no_of_absences: Math.max(currentAbsences, candidateAbsences),
  };
}

function getDeduplicatedAttendanceSearchRecords(records: AttendanceRecord[]) {
  const deduplicatedRecords = new Map<string, AttendanceRecord>();

  records.forEach((record) => {
    const key = getAttendanceSearchRecordDeduplicationKey(record);
    const currentRecord = deduplicatedRecords.get(key);

    if (!currentRecord) {
      deduplicatedRecords.set(key, record);
      return;
    }

    deduplicatedRecords.set(
      key,
      getPreferredDeduplicatedAttendanceRecord(currentRecord, record),
    );
  });

  return Array.from(deduplicatedRecords.values());
}

function getAttendanceRecordSearchText(record: AttendanceRecord) {
  return [
    record.student_id,
    record.name,
    record.year_level,
    record.college,
    record.program,
    record.institution,
    record.remarks,
    getManualRecordSource(record),
  ]
    .map((value) => cleanImportValue(value))
    .join(" ")
    .toLowerCase();
}

function getAttendanceStudentRecordSummaries(
  records: AttendanceRecord[],
  allRecords: AttendanceRecord[] = records,
) {
  const summaries = new Map<string, AttendanceStudentRecordSummary>();

  records.forEach((record) => {
    const key = getRecordStudentProfileKey(record);
    const recordTime = getRecordTimestamp(record);
    const currentSummary = summaries.get(key);

    if (!currentSummary) {
      summaries.set(key, {
        key,
        studentId: cleanImportValue(record.student_id),
        name: cleanImportValue(record.name),
        yearLevel: cleanImportValue(record.year_level),
        college: cleanImportValue(record.college),
        program: cleanImportValue(record.program),
        institution: cleanImportValue(record.institution),
        records: [record],
        totalAbsences: getEffectiveAttendanceRecordAbsenceCount(record),
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
      });
      return;
    }

    const latestTime = currentSummary.latestScannedAt
      ? new Date(currentSummary.latestScannedAt).getTime()
      : 0;

    currentSummary.records.push(record);
    currentSummary.totalAbsences = Math.max(
      currentSummary.totalAbsences,
      getEffectiveAttendanceRecordAbsenceCount(record),
    );

    if (recordTime > (Number.isNaN(latestTime) ? 0 : latestTime)) {
      currentSummary.latestScannedAt =
        record.scanned_at ??
        record.created_at ??
        currentSummary.latestScannedAt;
      if (record.student_id)
        currentSummary.studentId = cleanImportValue(record.student_id);
      if (record.name) currentSummary.name = cleanImportValue(record.name);
      if (record.year_level)
        currentSummary.yearLevel = cleanImportValue(record.year_level);
      if (record.college)
        currentSummary.college = cleanImportValue(record.college);
      if (record.program)
        currentSummary.program = cleanImportValue(record.program);
      if (record.institution)
        currentSummary.institution = cleanImportValue(record.institution);
    }

    if (!currentSummary.studentId && record.student_id)
      currentSummary.studentId = cleanImportValue(record.student_id);
    if (!currentSummary.name && record.name)
      currentSummary.name = cleanImportValue(record.name);
    if (!currentSummary.yearLevel && record.year_level)
      currentSummary.yearLevel = cleanImportValue(record.year_level);
    if (!currentSummary.college && record.college)
      currentSummary.college = cleanImportValue(record.college);
    if (!currentSummary.program && record.program)
      currentSummary.program = cleanImportValue(record.program);
    if (!currentSummary.institution && record.institution)
      currentSummary.institution = cleanImportValue(record.institution);
  });

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
      }),
      totalAbsences: getAttendanceRecordTotalAbsences(
        summary.records,
        allRecords,
      ),
    }))
    .sort((leftSummary, rightSummary) => {
      const leftTime = leftSummary.latestScannedAt
        ? new Date(leftSummary.latestScannedAt).getTime()
        : 0;
      const rightTime = rightSummary.latestScannedAt
        ? new Date(rightSummary.latestScannedAt).getTime()
        : 0;

      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    });
}

function getAttendanceStudentEventSummaries(
  records: AttendanceRecord[],
  events: AttendanceEvent[],
) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const summaries = new Map<string, AttendanceStudentEventSummary>();

  records.forEach((record) => {
    if (isEventlessAttendanceRecord(record) || isExplicitAbsentAttendanceRecord(record)) {
      return;
    }

    const event = record.event_id
      ? (eventById.get(record.event_id) ?? null)
      : null;
    const eventName = event?.name ?? getManualRecordSource(record);
    const eventKey =
      getAttendanceEventIdentityKey(eventName, record.event_id) ||
      `student-event:${record.id}`;
    const collegeKey =
      normalizeImportHeader(record.college) || NO_COLLEGE_SELECT_VALUE;
    const key = `${eventKey}:college:${collegeKey}`;
    const currentSummary = summaries.get(key);
    const recordTime = getRecordTimestamp(record);
    const schedule =
      event && (event.event_start_at || event.event_end_at)
        ? formatEventSchedule(event)
        : formatDateTime(record.scanned_at ?? record.created_at ?? null);

    if (!currentSummary) {
      summaries.set(key, {
        key,
        eventName,
        schedule,
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
        records: [record],
        totalAbsences: getEffectiveAttendanceRecordAbsenceCount(record),
      });
      return;
    }

    const latestTime = currentSummary.latestScannedAt
      ? new Date(currentSummary.latestScannedAt).getTime()
      : 0;

    currentSummary.records.push(record);
    currentSummary.totalAbsences = Math.max(
      currentSummary.totalAbsences,
      getEffectiveAttendanceRecordAbsenceCount(record),
    );

    if (recordTime > (Number.isNaN(latestTime) ? 0 : latestTime)) {
      currentSummary.latestScannedAt =
        record.scanned_at ??
        record.created_at ??
        currentSummary.latestScannedAt;
    }
  });

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
      }),
    }))
    .sort((leftSummary, rightSummary) => {
      const eventCompare = compareAttendanceEventLabels(
        leftSummary.eventName,
        rightSummary.eventName,
      );

      if (eventCompare !== 0) return eventCompare;

      const leftTime = leftSummary.latestScannedAt
        ? new Date(leftSummary.latestScannedAt).getTime()
        : 0;
      const rightTime = rightSummary.latestScannedAt
        ? new Date(rightSummary.latestScannedAt).getTime()
        : 0;

      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    });
}

function formatEventGroupSchedule(group: AttendanceEventRecordGroup) {
  const start = formatDateTime(group.eventStartAt);
  const end = formatDateTime(group.eventEndAt);

  if (start !== "—" && end !== "—") return `${start} - ${end}`;
  if (start !== "—") return `Starts ${start}`;
  if (end !== "—") return `Ends ${end}`;

  return "No schedule set";
}

function getSaveProgressPercent(
  progress: AttendanceImportProgress | null,
  isSaving: boolean,
) {
  if (!progress) return isSaving ? 1 : 0;
  return Math.max(0, Math.min(100, Math.round(progress.percent)));
}

function getSaveProgressRowText(progress: AttendanceImportProgress | null) {
  if (!progress) return "Preparing rows...";
  if (progress.totalRows > 0)
    return `${progress.processedRows}/${progress.totalRows} row/s processed`;
  return "Preparing rows...";
}

function getSaveProgressMessage(progress: AttendanceImportProgress | null) {
  return progress?.message || "Preparing attendance import...";
}

function getManualUpdateProgressMessage(
  progress: AttendanceImportProgress | null,
) {
  return progress?.message || "Preparing attendance update...";
}

function getManualUpdateProgressRowText(
  progress: AttendanceImportProgress | null,
) {
  if (!progress) return "Preparing record updates...";
  if (progress.totalRows > 0)
    return `${progress.processedRows}/${progress.totalRows} record/s processed`;
  return "Preparing record updates...";
}

function getManualUpdateProgressDetailText(
  progress: AttendanceImportProgress | null,
) {
  if (!progress) return "Waiting for update result...";
  if (progress.stage === "completed") {
    return `${progress.savedRecords || progress.processedRows} record/s updated`;
  }
  if (progress.savedRecords > 0) {
    return `${progress.savedRecords} record/s updated`;
  }
  if (progress.totalRows > 0) {
    return `${progress.totalRows} record/s selected`;
  }

  return "Waiting for database response";
}

function getAttendanceFileSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createResumableImportId() {
  return `attendance-import:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function readResumableAttendanceImportSnapshot() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(
      ATTENDANCE_RESUMABLE_IMPORT_STORAGE_KEY,
    );
    if (!value) return null;

    const snapshot = JSON.parse(value) as AttendanceResumableImportSnapshot;
    if (!snapshot?.id || !snapshot.preview || !Array.isArray(snapshot.rows))
      return null;

    return snapshot;
  } catch {
    return null;
  }
}

function writeResumableAttendanceImportSnapshot(
  snapshot: AttendanceResumableImportSnapshot | null,
) {
  if (typeof window === "undefined") return;

  try {
    if (!snapshot) {
      window.localStorage.removeItem(ATTENDANCE_RESUMABLE_IMPORT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      ATTENDANCE_RESUMABLE_IMPORT_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Ignore storage failures so importing can still continue in the current browser session.
  }
}

function getValidAttendanceRows(previewResult: AttendancePreviewResult) {
  return previewResult.rows.filter((row) => row.errors.length === 0);
}

function normalizeImportOptionValue(value?: string | null) {
  return cleanImportValue(value);
}

function areAttendanceImportOptionsEqual(
  left: AttendanceImportOptionsSnapshot,
  right: AttendanceImportOptionsSnapshot,
) {
  return (
    normalizeImportOptionValue(left.eventId) ===
      normalizeImportOptionValue(right.eventId) &&
    normalizeImportOptionValue(left.eventName) ===
      normalizeImportOptionValue(right.eventName) &&
    normalizeImportOptionValue(left.eventStartAt) ===
      normalizeImportOptionValue(right.eventStartAt) &&
    normalizeImportOptionValue(left.eventEndAt) ===
      normalizeImportOptionValue(right.eventEndAt) &&
    normalizeImportOptionValue(left.eventDescription) ===
      normalizeImportOptionValue(right.eventDescription)
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function waitForNextPaint() {
  if (typeof window === "undefined") return Promise.resolve();

  const browserDocument = window.document;

  if (browserDocument.visibilityState === "hidden") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let isResolved = false;
    let timeoutId: number | null = null;

    const resolveOnce = () => {
      if (isResolved) return;

      isResolved = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve();
    };

    timeoutId = window.setTimeout(resolveOnce, 120);
    window.requestAnimationFrame(resolveOnce);
  });
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "0s";

  const seconds = milliseconds / 1000;
  if (seconds < 1) return `${Math.max(1, Math.round(milliseconds))}ms`;

  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

function useAttendanceMobilePanel() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);

    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);

    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  return isMobile;
}

function AttendanceResponsivePanel(props: {
  title: string;
  summary?: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  const isMobile = useAttendanceMobilePanel();
  const summaryText = props.summary ? props.summary : "Open section";

  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="flex min-h-16 w-full items-center justify-between gap-3 rounded-3xl border bg-card px-4 py-4 text-left shadow-sm"
          >
            <span className="min-w-0">
              <span className="block wrap-break-word text-base font-black">
                {props.title}
              </span>
              <span className="mt-1 block wrap-break-word text-xs font-bold text-muted-foreground">
                {summaryText}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">
              Open
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="max-h-[95svh] overflow-y-auto sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          <div className={`mt-4 min-w-0 ${props.contentClassName ?? ""}`}>
            {props.children}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <details className="group min-w-0 max-w-full self-start overflow-hidden rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
      <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="min-w-0">
          <span className="block wrap-break-word text-xl font-black">
            {props.title}
          </span>
          <span className="mt-1 block wrap-break-word text-sm font-bold text-muted-foreground">
            {summaryText}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">
          <span className="group-open:hidden">Open</span>
          <span className="hidden group-open:inline">Close</span>
        </span>
      </summary>
      <div className={`mt-4 min-w-0 ${props.contentClassName ?? ""}`}>
        {props.children}
      </div>
    </details>
  );
}

function FileDropZone(props: {
  file: File | null;
  isDragging: boolean;
  onFileChange: (file: File | null) => void;
  onDragStateChange: (isDragging: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [props.file]);

  function selectFile(fileList: FileList | null) {
    props.onFileChange(fileList?.[0] ?? null);
  }

  function clearSelectedFile(event: SyntheticEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    props.onFileChange(null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(false);
    selectFile(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onDragStateChange(false);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files);
  }

  return (
    <Label
      htmlFor="attendance-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`box-border flex min-h-64 w-full min-w-0 max-w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed bg-card p-4 text-center shadow-sm transition sm:p-8 ${
        props.isDragging
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/70 hover:bg-accent/40"
      }`}
    >
      <Input
        ref={inputRef}
        id="attendance-upload"
        type="file"
        accept={getAttendanceUploadAccept()}
        onChange={handleInputChange}
        className="sr-only"
      />

      <div className="max-w-full min-w-0 wrap-break-word rounded-full border bg-background px-3 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground sm:px-4">
        Excel all sheets, CSV, TXT, DOCX, DOC
      </div>
      <h2 className="mt-4 max-w-full min-w-0 wrap-break-word text-xl font-black sm:text-2xl">
        Upload attendance file
      </h2>

      {props.file ? (
        <div className="mt-5 box-border flex w-full max-w-full min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-background p-4 text-left sm:max-w-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="w-full max-w-full min-w-0 break-all text-sm font-black leading-relaxed">
              {props.file.name}
            </p>
            <p className="mt-1 w-full max-w-full min-w-0 wrap-break-word text-xs text-muted-foreground">
              {(props.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={clearSelectedFile}
            className="shrink-0 rounded-xl"
          >
            Clear
          </Button>
        </div>
      ) : null}
    </Label>
  );
}

function EventFields(props: {
  events: AttendanceEvent[];
  fileEventNames: string[];
  eventId: string;
  eventName: string;
  eventStartAt: string;
  eventEndAt: string;
  eventDescription: string;
  onEventIdChange: (value: string) => void;
  onEventNameChange: (value: string) => void;
  onEventStartAtChange: (value: string) => void;
  onEventEndAtChange: (value: string) => void;
  onEventDescriptionChange: (value: string) => void;
}) {
  const isUsingFileEvents = !props.eventId && props.fileEventNames.length > 0;
  const compactFieldClassName =
    "mt-1 h-9 min-h-9 w-full min-w-0 max-w-full overflow-hidden rounded-xl px-3 text-left text-sm";
  const compactLabelClassName =
    "text-xs font-bold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <Label htmlFor="upload-event-id" className={compactLabelClassName}>
          Event
        </Label>
        <Select
          value={props.eventId || UPLOAD_FILE_EVENTS_SELECT_VALUE}
          onValueChange={(value) => {
            props.onEventIdChange(
              value === UPLOAD_FILE_EVENTS_SELECT_VALUE ? "" : value,
            );
          }}
        >
          <SelectTrigger id="upload-event-id" className={compactFieldClassName}>
            <SelectValue placeholder="Use file event" className="truncate" />
          </SelectTrigger>
          <SelectContent className="max-h-72 max-w-72">
            <SelectItem
              value={UPLOAD_FILE_EVENTS_SELECT_VALUE}
              className="max-w-full truncate text-sm"
            >
              {isUsingFileEvents
                ? "Use detected file event/s"
                : "Use file event or create new"}
            </SelectItem>
            {props.events.map((item) => (
              <SelectItem
                key={item.id}
                value={item.id}
                className="max-w-full truncate text-sm"
              >
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        <Label htmlFor="upload-event-name" className={compactLabelClassName}>
          Event name
        </Label>
        <Input
          id="upload-event-name"
          value={props.eventName}
          onChange={(event) => props.onEventNameChange(event.target.value)}
          disabled={Boolean(props.eventId) || isUsingFileEvents}
          className={compactFieldClassName}
          placeholder={
            isUsingFileEvents
              ? "Using detected event/s"
              : "Required if file has no event"
          }
        />
      </div>

      <div className="min-w-0">
        <Label
          htmlFor="upload-event-start-at"
          className={compactLabelClassName}
        >
          Event start at
        </Label>
        <Input
          id="upload-event-start-at"
          type="datetime-local"
          value={props.eventStartAt}
          onChange={(event) => props.onEventStartAtChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className={compactFieldClassName}
        />
      </div>

      <div className="min-w-0">
        <Label htmlFor="upload-event-end-at" className={compactLabelClassName}>
          Event end at
        </Label>
        <Input
          id="upload-event-end-at"
          type="datetime-local"
          value={props.eventEndAt}
          onChange={(event) => props.onEventEndAtChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className={compactFieldClassName}
        />
      </div>

      <div className="min-w-0 sm:col-span-2">
        <Label
          htmlFor="upload-event-description"
          className={compactLabelClassName}
        >
          Description
        </Label>
        <Input
          id="upload-event-description"
          value={props.eventDescription}
          onChange={(event) =>
            props.onEventDescriptionChange(event.target.value)
          }
          disabled={Boolean(props.eventId)}
          className={compactFieldClassName}
          placeholder={
            isUsingFileEvents ? "Optional for detected event/s" : "Optional"
          }
        />
      </div>

      {isUsingFileEvents ? (
        <p className="min-w-0 wrap-break-word text-xs font-semibold text-muted-foreground sm:col-span-2">
          Detected event/s: {props.fileEventNames.slice(0, 5).join(", ")}
          {props.fileEventNames.length > 5
            ? ` +${props.fileEventNames.length - 5} more`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function DeleteAttendanceConfirmation(props: {
  record: AttendanceRecord;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.isDeleting}
          className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}
        >
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the attendance record for{" "}
            {props.record.name}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => props.onConfirm(props.record.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Record
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAttendanceRecordsConfirmation(props: {
  label: string;
  title: string;
  description: string;
  isDeleting: boolean;
  disabled: boolean;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled || props.isDeleting}
          className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}
        >
          {props.isDeleting ? "Deleting..." : props.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.isDeleting}
            onClick={() => {
              void props.onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Confirm Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteEventConfirmation(props: {
  event: AttendanceEvent;
  isDeleting: boolean;
  disabled?: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled || props.isDeleting}
          className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}
        >
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete event?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {props.event.name} and its linked
            attendance records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.disabled || props.isDeleting}
            onClick={() => props.onConfirm(props.event.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Event
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


function BulkEventAttendeesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: AttendanceEvent[];
  zeroAttendanceAttendees: AttendanceZeroAttendanceAttendeeOption[];
  form: AttendanceBulkEventAttendeesFormState;
  isSaving: boolean;
  progress: AttendanceImportProgress | null;
  progressPercent: number;
  progressMessage: string;
  progressRowText: string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof AttendanceBulkEventAttendeesFormState>(
    key: K,
    value: AttendanceBulkEventAttendeesFormState[K],
  ) => void;
}) {
  const [selectedZeroAttendanceAttendeeKey, setSelectedZeroAttendanceAttendeeKey] =
    useState("");
  const programOptions = getQrCodeProgramOptions(props.form.college);
  const selectedEvent = props.events.find(
    (event) => event.id === props.form.eventId,
  );
  const filteredZeroAttendanceAttendees = useMemo(
    () =>
      getFilteredZeroAttendanceAttendees(
        props.zeroAttendanceAttendees,
        props.form,
      ),
    [props.form, props.zeroAttendanceAttendees],
  );
  const parsedAttendees = useMemo(
    () =>
      getBulkAttendanceEventAttendeeRows(
        props.form,
        filteredZeroAttendanceAttendees,
      ),
    [filteredZeroAttendanceAttendees, props.form],
  );
  const shouldShowProgress = props.isSaving || Boolean(props.progress);
  const handleCollegeChange = (value: string) => {
    props.onChange("college", value);
    props.onChange("program", "");
  };
  const handleZeroAttendanceAttendeeSelect = (attendeeKey: string) => {
    const attendee = props.zeroAttendanceAttendees.find(
      (option) => option.key === attendeeKey,
    );

    if (!attendee) return;

    const nextAttendees = appendBulkAttendanceAttendeeName(
      props.form.attendees,
      attendee.name,
    );

    if (nextAttendees === props.form.attendees) {
      toast.info("Selected attendee is already listed.");
    } else {
      props.onChange("attendees", nextAttendees);
    }

    setSelectedZeroAttendanceAttendeeKey(attendeeKey);
    window.setTimeout(() => setSelectedZeroAttendanceAttendeeKey(""), 0);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={!props.events.length || props.isSaving}
          className="min-h-11 rounded-xl px-5 py-2"
        >
          Add Attendees
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>Add multiple attendees to an event</DialogTitle>
          <DialogDescription className="sr-only">
            Select one attendance event and add multiple attendee records.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 lg:col-span-2">
            <Label htmlFor="bulk-event-id">Event</Label>
            <Select
              value={props.form.eventId}
              onValueChange={(value) => props.onChange("eventId", value)}
            >
              <SelectTrigger
                id="bulk-event-id"
                className={manualSelectTriggerClassName}
              >
                <SelectValue placeholder="Select event" className="truncate" />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {props.events.map((event) => (
                  <SelectItem
                    key={event.id}
                    value={event.id}
                    className="max-w-full truncate"
                  >
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bulk-scanned-at">Scanned at</Label>
            <Input
              id="bulk-scanned-at"
              type="datetime-local"
              value={props.form.scannedAt}
              onChange={(event) =>
                props.onChange("scannedAt", event.target.value)
              }
              className="mt-2"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="bulk-year-level">Year level</Label>
            <Select
              value={props.form.yearLevel}
              onValueChange={(value) => props.onChange("yearLevel", value)}
            >
              <SelectTrigger
                id="bulk-year-level"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select year level"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_YEAR_LEVEL_OPTIONS,
                  props.form.yearLevel,
                )}
                {QR_CODE_YEAR_LEVEL_OPTIONS.map((yearLevel) => (
                  <SelectItem
                    key={yearLevel}
                    value={yearLevel}
                    className="max-w-full truncate"
                  >
                    {yearLevel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="bulk-year-level-custom"
              value={props.form.yearLevel}
              onChange={(event) =>
                props.onChange("yearLevel", event.target.value)
              }
              className={manualCustomInputClassName}
              placeholder="Type custom year level if not listed"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="bulk-college">College</Label>
            <Select
              value={props.form.college}
              onValueChange={handleCollegeChange}
            >
              <SelectTrigger
                id="bulk-college"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select college"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_COLLEGE_OPTIONS,
                  props.form.college,
                )}
                {QR_CODE_COLLEGE_OPTIONS.map((college) => (
                  <SelectItem
                    key={college}
                    value={college}
                    className="max-w-full truncate"
                  >
                    {college}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="bulk-college-custom"
              value={props.form.college}
              onChange={(event) => handleCollegeChange(event.target.value)}
              className={manualCustomInputClassName}
              placeholder="Type custom college if not listed"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="bulk-program">Program</Label>
            <Select
              value={props.form.program}
              onValueChange={(value) => props.onChange("program", value)}
              disabled={!props.form.college}
            >
              <SelectTrigger
                id="bulk-program"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder={
                    props.form.college
                      ? "Select program"
                      : "Select college first"
                  }
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  programOptions,
                  props.form.program,
                )}
                {programOptions.map((program) => (
                  <SelectItem
                    key={program}
                    value={program}
                    className="max-w-full truncate"
                  >
                    {program}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="bulk-program-custom"
              value={props.form.program}
              onChange={(event) =>
                props.onChange("program", event.target.value)
              }
              disabled={!props.form.college}
              className={manualCustomInputClassName}
              placeholder={
                props.form.college
                  ? "Type custom program if not listed"
                  : "Select college before typing program"
              }
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="bulk-institution">Institution</Label>
            <Select
              value={props.form.institution}
              onValueChange={(value) => props.onChange("institution", value)}
            >
              <SelectTrigger
                id="bulk-institution"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select institution"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_INSTITUTION_OPTIONS,
                  props.form.institution,
                )}
                {QR_CODE_INSTITUTION_OPTIONS.map((institution) => (
                  <SelectItem
                    key={institution}
                    value={institution}
                    className="max-w-full truncate"
                  >
                    {institution}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="bulk-institution-custom"
              value={props.form.institution}
              onChange={(event) =>
                props.onChange("institution", event.target.value)
              }
              className={manualCustomInputClassName}
              placeholder="Type custom institution if not listed"
            />
          </div>

          <div className="min-w-0 lg:col-span-2">
            <Label htmlFor="bulk-zero-attendance-attendees">
              Zero attendance attendees
            </Label>
            <Select
              value={selectedZeroAttendanceAttendeeKey}
              onValueChange={handleZeroAttendanceAttendeeSelect}
              disabled={!filteredZeroAttendanceAttendees.length}
            >
              <SelectTrigger
                id="bulk-zero-attendance-attendees"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder={
                    filteredZeroAttendanceAttendees.length
                      ? "Select attendee from landing page registration"
                      : "No zero attendance registration found"
                  }
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {filteredZeroAttendanceAttendees.map((attendee) => (
                  <SelectItem
                    key={attendee.key}
                    value={attendee.key}
                    className="max-w-full truncate"
                  >
                    {getZeroAttendanceAttendeeSelectLabel(attendee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="bulk-attendees">Attendee names</Label>
            <Textarea
              id="bulk-attendees"
              value={props.form.attendees}
              onChange={(event) =>
                props.onChange("attendees", event.target.value)
              }
              className="mt-2 min-h-32"
              placeholder="Name per line"
              required
            />
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="bulk-remarks">Remarks</Label>
            <Textarea
              id="bulk-remarks"
              value={props.form.remarks}
              onChange={(event) =>
                props.onChange("remarks", event.target.value)
              }
              className="mt-2"
            />
          </div>

          <div className="rounded-2xl border bg-muted/40 p-4 text-sm font-semibold text-muted-foreground lg:col-span-2">
            {selectedEvent?.name ?? "No event selected"} •{" "}
            {parsedAttendees.length} attendee/s ready
          </div>

          {shouldShowProgress ? (
            <section
              className="min-w-0 rounded-3xl border bg-card p-4 shadow-sm lg:col-span-2"
              aria-live="polite"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                    Add attendees progress
                  </p>
                  <p className="mt-1 wrap-break-word text-sm font-semibold">
                    {props.progressMessage}
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full border bg-background px-3 py-1 text-sm font-black">
                  {props.progressPercent}%
                </span>
              </div>
              <Progress
                value={props.progressPercent}
                className="mt-4 h-3 w-full min-w-0"
              />
              <div className="mt-3 grid min-w-0 gap-1 text-xs font-bold text-muted-foreground sm:grid-cols-2 sm:items-center">
                <span className="wrap-break-word">
                  {props.progressRowText}
                </span>
                <span className="wrap-break-word sm:text-right">
                  {props.progress?.savedRecords ?? 0} attendee/s added
                </span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Button
              type="submit"
              disabled={props.isSaving || !props.events.length}
              className="min-h-12 rounded-2xl"
            >
              {props.isSaving
                ? `Saving ${props.progressPercent}%`
                : "Save Attendees"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={props.onClear}
              className="min-h-12 rounded-2xl"
            >
              Clear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAttendanceImportConfirmation(props: {
  attendanceImport: AttendanceImportRecord;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={props.isDeleting}
          className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}
        >
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete imported file?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {props.attendanceImport.file_name} and
            all attendance records and fines created from this import.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => props.onConfirm(props.attendanceImport.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Import
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ManualAttendanceDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: AttendanceEvent[];
  form: ManualAttendanceFormState;
  editingRecordId: string;
  isSaving: boolean;
  updateProgress: AttendanceImportProgress | null;
  updateProgressPercent: number;
  updateProgressMessage: string;
  updateProgressRowText: string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof ManualAttendanceFormState>(
    key: K,
    value: ManualAttendanceFormState[K],
  ) => void;
}) {
  const programOptions = getQrCodeProgramOptions(props.form.college);
  const handleCollegeChange = (value: string) => {
    props.onChange("college", value);
    props.onChange("program", "");
  };
  const selectedManualEventIds = getManualAttendanceSelectedEventIds(props.form);
  const selectedManualEventIdsSet = new Set(selectedManualEventIds);
  const shouldShowNoEventOption = !props.editingRecordId || !props.events.length;
  const handleNoEventChange = (checked: boolean | "indeterminate") => {
    if (checked === true) props.onChange("eventIds", []);
  };
  const handleEventChange = (
    eventId: string,
    checked: boolean | "indeterminate",
  ) => {
    const nextEventIds =
      checked === true
        ? Array.from(new Set([...selectedManualEventIds, eventId]))
        : selectedManualEventIds.filter((selectedEventId) => selectedEventId !== eventId);

    props.onChange("eventIds", nextEventIds);
  };
  const shouldShowManualProgress =
    props.isSaving || Boolean(props.updateProgress);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11 rounded-xl px-5 py-2">
          Add Attendance
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>
            {props.editingRecordId ? "Edit attendance" : "Add attendance"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Add or update an attendance record with student details, event
            assignment, count, and remarks.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 lg:col-span-2">
            <Label htmlFor="manual-event-id">Event/s</Label>
            <div
              id="manual-event-id"
              className="mt-2 grid max-h-72 gap-2 overflow-y-auto rounded-2xl border bg-background p-3 sm:grid-cols-2"
            >
              {shouldShowNoEventOption ? (
                <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm font-semibold">
                  <Checkbox
                    checked={selectedManualEventIds.length === 0}
                    onCheckedChange={handleNoEventChange}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 wrap-break-word">No event</span>
                </label>
              ) : null}
              {props.events.map((item) => (
                <label
                  key={item.id}
                  className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm font-semibold"
                >
                  <Checkbox
                    checked={selectedManualEventIdsSet.has(item.id)}
                    onCheckedChange={(checked) =>
                      handleEventChange(item.id, checked)
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 wrap-break-word">{item.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="manual-scanned-at">Scanned at</Label>
            <Input
              id="manual-scanned-at"
              type="text"
              value={props.form.scannedAt}
              onChange={(event) =>
                props.onChange("scannedAt", event.target.value)
              }
              className="mt-2"
              placeholder="Optional date and time"
            />
          </div>

          <div>
            <Label htmlFor="manual-student-id">Student ID</Label>
            <Input
              id="manual-student-id"
              value={props.form.studentId}
              onChange={(event) =>
                props.onChange("studentId", event.target.value)
              }
              className="mt-2"
              required
            />
          </div>

          <div>
            <Label htmlFor="manual-name">Name</Label>
            <Input
              id="manual-name"
              value={props.form.name}
              onChange={(event) => props.onChange("name", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="manual-year-level">Year level</Label>
            <Select
              value={props.form.yearLevel}
              onValueChange={(value) => props.onChange("yearLevel", value)}
            >
              <SelectTrigger
                id="manual-year-level"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select year level"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_YEAR_LEVEL_OPTIONS,
                  props.form.yearLevel,
                )}
                {QR_CODE_YEAR_LEVEL_OPTIONS.map((yearLevel) => (
                  <SelectItem
                    key={yearLevel}
                    value={yearLevel}
                    className="max-w-full truncate"
                  >
                    {yearLevel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="manual-year-level-custom"
              value={props.form.yearLevel}
              onChange={(event) =>
                props.onChange("yearLevel", event.target.value)
              }
              className={manualCustomInputClassName}
              placeholder="Type custom year level if not listed"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="manual-college">College</Label>
            <Select
              value={props.form.college}
              onValueChange={handleCollegeChange}
            >
              <SelectTrigger
                id="manual-college"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select college"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_COLLEGE_OPTIONS,
                  props.form.college,
                )}
                {QR_CODE_COLLEGE_OPTIONS.map((college) => (
                  <SelectItem
                    key={college}
                    value={college}
                    className="max-w-full truncate"
                  >
                    {college}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="manual-college-custom"
              value={props.form.college}
              onChange={(event) => handleCollegeChange(event.target.value)}
              className={manualCustomInputClassName}
              placeholder="Type custom college if not listed"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="manual-program">Program</Label>
            <Select
              value={props.form.program}
              onValueChange={(value) => props.onChange("program", value)}
              disabled={!props.form.college}
            >
              <SelectTrigger
                id="manual-program"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder={
                    props.form.college
                      ? "Select program"
                      : "Select college first"
                  }
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  programOptions,
                  props.form.program,
                )}
                {programOptions.map((program) => (
                  <SelectItem
                    key={program}
                    value={program}
                    className="max-w-full truncate"
                  >
                    {program}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="manual-program-custom"
              value={props.form.program}
              onChange={(event) =>
                props.onChange("program", event.target.value)
              }
              disabled={!props.form.college}
              className={manualCustomInputClassName}
              placeholder={
                props.form.college
                  ? "Type custom program if not listed"
                  : "Select college before typing program"
              }
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor="manual-institution">Institution</Label>
            <Select
              value={props.form.institution}
              onValueChange={(value) => props.onChange("institution", value)}
            >
              <SelectTrigger
                id="manual-institution"
                className={manualSelectTriggerClassName}
              >
                <SelectValue
                  placeholder="Select institution"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-80">
                {renderCurrentQrCodeSelectOption(
                  QR_CODE_INSTITUTION_OPTIONS,
                  props.form.institution,
                )}
                {QR_CODE_INSTITUTION_OPTIONS.map((institution) => (
                  <SelectItem
                    key={institution}
                    value={institution}
                    className="max-w-full truncate"
                  >
                    {institution}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="manual-institution-custom"
              value={props.form.institution}
              onChange={(event) =>
                props.onChange("institution", event.target.value)
              }
              className={manualCustomInputClassName}
              placeholder="Type custom institution if not listed"
            />
          </div>

          <div>
            <Label htmlFor="manual-absences">Count</Label>
            <Input
              id="manual-absences"
              type="number"
              min="0"
              value={props.form.noOfAbsences}
              onChange={(event) =>
                props.onChange("noOfAbsences", event.target.value)
              }
              className="mt-2"
              required
            />
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="manual-remarks">Remarks</Label>
            <Textarea
              id="manual-remarks"
              value={props.form.remarks}
              onChange={(event) =>
                props.onChange("remarks", event.target.value)
              }
              className="mt-2"
            />
          </div>

          {shouldShowManualProgress ? (
            <section
              className="min-w-0 rounded-3xl border bg-card p-4 shadow-sm lg:col-span-2"
              aria-live="polite"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                    {props.editingRecordId
                      ? "Update attendance progress"
                      : "Saving attendance progress"}
                  </p>
                  <p className="mt-1 wrap-break-word text-sm font-semibold">
                    {props.updateProgressMessage}
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full border bg-background px-3 py-1 text-sm font-black">
                  {props.updateProgressPercent}%
                </span>
              </div>
              <Progress
                value={props.updateProgressPercent}
                className="mt-4 h-3 w-full min-w-0"
              />
              <div className="mt-3 grid min-w-0 gap-1 text-xs font-bold text-muted-foreground sm:grid-cols-2 sm:items-center">
                <span className="wrap-break-word">
                  {props.updateProgressRowText}
                </span>
                <span className="wrap-break-word sm:text-right">
                  {getManualUpdateProgressDetailText(props.updateProgress)}
                </span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Button
              type="submit"
              disabled={props.isSaving}
              className="min-h-12 rounded-2xl"
            >
              {props.isSaving
                ? props.editingRecordId
                  ? `Updating ${props.updateProgressPercent}%`
                  : `Saving ${props.updateProgressPercent}%`
                : props.editingRecordId
                  ? "Update Attendance"
                  : "Save Attendance"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={props.onClear}
              className="min-h-12 rounded-2xl"
            >
              {props.editingRecordId ? "Cancel Edit" : "Clear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceEventDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AttendanceEventFormState;
  editingEventId: string;
  isSaving: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof AttendanceEventFormState>(
    key: K,
    value: AttendanceEventFormState[K],
  ) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl px-5 py-2"
        >
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>
            {props.editingEventId ? "Edit event" : "Add event"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Add or update an attendance event with schedule and description
            details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4">
          <div>
            <Label htmlFor="event-name">Event name</Label>
            <Input
              id="event-name"
              value={props.form.name}
              onChange={(event) => props.onChange("name", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="event-start-at">Event start at</Label>
              <Input
                id="event-start-at"
                type="datetime-local"
                value={props.form.eventStartAt}
                onChange={(event) =>
                  props.onChange("eventStartAt", event.target.value)
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="event-end-at">Event end at</Label>
              <Input
                id="event-end-at"
                type="datetime-local"
                value={props.form.eventEndAt}
                onChange={(event) =>
                  props.onChange("eventEndAt", event.target.value)
                }
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={props.form.description}
              onChange={(event) =>
                props.onChange("description", event.target.value)
              }
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="submit"
              disabled={props.isSaving}
              className="min-h-12 rounded-2xl"
            >
              {props.isSaving
                ? "Saving..."
                : props.editingEventId
                  ? "Update Event"
                  : "Save Event"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={props.onClear}
              className="min-h-12 rounded-2xl"
            >
              {props.editingEventId ? "Cancel Edit" : "Clear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceEventGroupTriggerContent(props: {
  group: AttendanceEventRecordGroup;
  selectedGroupRecordCount: number;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block wrap-break-word font-black">
          {props.group.eventName}
        </span>
        <span className="mt-1 block wrap-break-word text-sm text-muted-foreground">
          {getAttendanceGroupCollegeLabel(props.group)} •{" "}
          {formatEventGroupSchedule(props.group)}
        </span>
        {props.group.eventDescription ? (
          <span className="mt-1 block wrap-break-word text-xs font-semibold text-muted-foreground">
            {props.group.eventDescription}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border bg-muted px-3 py-1 font-bold text-muted-foreground">
          {props.group.attendees.length} attendee/s
        </span>
        {props.selectedGroupRecordCount ? (
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-black uppercase tracking-wide text-muted-foreground">
            {props.selectedGroupRecordCount} selected
          </span>
        ) : null}
      </span>
    </span>
  );
}

function AttendanceEventAttendeesDialog(props: {
  group: AttendanceEventRecordGroup;
  events: AttendanceEvent[];
  selectedEventIdsSet: Set<string>;
  selectedEventCount: number;
  selectedRecordIdsSet: Set<string>;
  deletingRecordId: string;
  isDeletingBulk: boolean;
  isAddingSelectedToEvents: boolean;
  addProgress: AttendanceSelectedRecordsAddProgress | null;
  addProgressPercent: number;
  onToggleEventSelected: (
    id: string,
    checked: boolean | "indeterminate",
  ) => void;
  onToggleAllEvents: (checked: boolean | "indeterminate") => void;
  onToggleRecordSelected: (
    id: string,
    checked: boolean | "indeterminate",
  ) => void;
  onToggleAttendeeRecordsSelected: (
    records: AttendanceRecord[],
    checked: boolean | "indeterminate",
  ) => void;
  onAddSelectedRecordsToEvents: (recordIds: string[]) => void | Promise<void>;
  onDeleteSelectedRecords: (recordIds: string[]) => void | Promise<void>;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
}) {
  const selectedGroupRecordIds = props.group.records
    .filter((record) => props.selectedRecordIdsSet.has(record.id))
    .map((record) => record.id);
  const selectedGroupRecordCount = selectedGroupRecordIds.length;
  const selectedDialogEventCount = props.events.filter((event) =>
    props.selectedEventIdsSet.has(event.id),
  ).length;
  const allDialogEventsSelected =
    props.events.length > 0 && selectedDialogEventCount === props.events.length;
  const eventSelectorHeaderChecked = allDialogEventsSelected
    ? true
    : selectedDialogEventCount > 0
      ? "indeterminate"
      : false;
  const canAddSelectedToEvents =
    props.group.key === NO_EVENT_FILTER_SELECT_VALUE &&
    selectedGroupRecordCount > 0 &&
    props.selectedEventCount > 0;
  const shouldShowAddProgress =
    props.group.key === NO_EVENT_FILTER_SELECT_VALUE &&
    (props.isAddingSelectedToEvents || Boolean(props.addProgress));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
        >
          Attendees
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-5xl"
      >
        <DialogHeader>
          <DialogTitle>{props.group.eventName} attendees</DialogTitle>
          <DialogDescription className="sr-only">
            View attendees, selected records, and record actions for this
            attendance event.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                College
              </p>
              <p className="mt-1 wrap-break-word font-semibold">
                {getCollegeLabel(props.group.college)}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Schedule
              </p>
              <p className="mt-1 wrap-break-word font-semibold">
                {formatEventGroupSchedule(props.group)}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Attendees
              </p>
              <p className="mt-1 wrap-break-word font-semibold">
                {props.group.attendees.length}
              </p>
            </div>
          </div>

          {props.group.key === NO_EVENT_FILTER_SELECT_VALUE ? (
            <div className="space-y-3 rounded-2xl border bg-background p-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-black">Event/s</p>
                  <p className="wrap-break-word text-xs font-semibold text-muted-foreground">
                    {props.events.length} existing event/s shown • {props.selectedEventCount} selected
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                  <Checkbox
                    checked={eventSelectorHeaderChecked}
                    onCheckedChange={props.onToggleAllEvents}
                    disabled={props.isAddingSelectedToEvents}
                    aria-label="Select all existing attendance events"
                    className="shrink-0"
                  />
                  <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    Select all
                  </span>
                </div>
              </div>

              {props.events.length ? (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {props.events.map((event) => (
                    <div
                      key={event.id}
                      className="flex min-w-0 items-start gap-3 rounded-xl border bg-muted/30 p-3"
                    >
                      <Checkbox
                        checked={props.selectedEventIdsSet.has(event.id)}
                        onCheckedChange={(checked) =>
                          props.onToggleEventSelected(event.id, checked)
                        }
                        disabled={props.isAddingSelectedToEvents}
                        aria-label={`Select ${event.name}`}
                        className="mt-1 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block wrap-break-word text-sm font-black">
                          {event.name}
                        </span>
                        <span className="mt-1 block wrap-break-word text-xs font-semibold text-muted-foreground">
                          {formatEventSchedule(event)} • {event.attendees_count}{" "}
                          attendee/s
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-center text-sm font-semibold text-muted-foreground">
                  No existing events available.
                </div>
              )}
            </div>
          ) : null}

          {selectedGroupRecordCount ? (
            <div className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
              <DeleteAttendanceRecordsConfirmation
                label="Delete Selected"
                title="Delete selected attendance records?"
                description={`This will permanently delete ${selectedGroupRecordCount} selected attendance record/s.`}
                isDeleting={props.isDeletingBulk}
                disabled={!selectedGroupRecordCount}
                onConfirm={() =>
                  props.onDeleteSelectedRecords(selectedGroupRecordIds)
                }
                className="min-h-10 w-full rounded-xl px-4 py-2 text-xs font-black"
              />
              {props.group.key === NO_EVENT_FILTER_SELECT_VALUE ? (
                <Button
                  type="button"
                  disabled={
                    !canAddSelectedToEvents || props.isAddingSelectedToEvents
                  }
                  onClick={() => {
                    void props.onAddSelectedRecordsToEvents(
                      selectedGroupRecordIds,
                    );
                  }}
                  className="min-h-10 w-full rounded-xl px-4 py-2 text-xs font-black"
                >
                  {props.isAddingSelectedToEvents
                    ? `Adding ${props.addProgressPercent}%`
                    : props.selectedEventCount
                      ? `Add Selected to ${props.selectedEventCount} Event/s`
                      : "Add Selected to Event/s"}
                </Button>
              ) : null}
            </div>
          ) : null}

          {shouldShowAddProgress ? (
            <section
              className="rounded-2xl border bg-background px-4 py-3"
              aria-live="polite"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    Adding attendees
                  </p>
                  <p className="mt-1 wrap-break-word text-sm font-semibold">
                    {props.addProgress?.message ??
                      "Preparing selected attendee/s..."}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs font-black">
                  {props.addProgressPercent}%
                </span>
              </div>
              <Progress
                value={props.addProgressPercent}
                className="mt-3 h-3 w-full min-w-0"
              />
              <div className="mt-2 flex min-w-0 flex-col gap-1 text-xs font-bold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="wrap-break-word">
                  {props.addProgress
                    ? `${props.addProgress.savedRecords}/${props.addProgress.totalRecords} attendee record/s added`
                    : "Preparing attendee record/s..."}
                </span>
                {props.addProgress?.currentEventName ? (
                  <span className="wrap-break-word sm:text-right">
                    {props.addProgress.currentEventName}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          <AttendanceEventAttendeesList
            group={props.group}
            selectedRecordIdsSet={props.selectedRecordIdsSet}
            deletingRecordId={props.deletingRecordId}
            isDeletingBulk={
              props.isDeletingBulk || props.isAddingSelectedToEvents
            }
            onToggleRecordSelected={props.onToggleRecordSelected}
            onToggleAttendeeRecordsSelected={
              props.onToggleAttendeeRecordsSelected
            }
            onEditRecord={props.onEditRecord}
            onDeleteRecord={props.onDeleteRecord}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceEventAttendeesList(props: {
  group: AttendanceEventRecordGroup;
  selectedRecordIdsSet: Set<string>;
  deletingRecordId: string;
  isDeletingBulk: boolean;
  onToggleRecordSelected: (
    id: string,
    checked: boolean | "indeterminate",
  ) => void;
  onToggleAttendeeRecordsSelected: (
    records: AttendanceRecord[],
    checked: boolean | "indeterminate",
  ) => void;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4 text-sm md:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            Event
          </p>
          <p className="mt-1 wrap-break-word font-semibold">
            {props.group.eventName}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            College
          </p>
          <p className="mt-1 wrap-break-word font-semibold">
            {getCollegeLabel(props.group.college)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            Schedule
          </p>
          <p className="mt-1 wrap-break-word font-semibold">
            {formatEventGroupSchedule(props.group)}
          </p>
        </div>
      </div>

      {props.group.attendees.map((attendee) => {
        const selectedAttendeeRecordCount = attendee.records.filter((record) =>
          props.selectedRecordIdsSet.has(record.id),
        ).length;
        const allAttendeeRecordsSelected =
          attendee.records.length > 0 &&
          selectedAttendeeRecordCount === attendee.records.length;
        const attendeeRecordChecked = allAttendeeRecordsSelected
          ? true
          : selectedAttendeeRecordCount > 0
            ? "indeterminate"
            : false;

        return (
          <article
            key={attendee.key}
            className="min-w-0 rounded-2xl border bg-card p-4 wrap-break-word"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Checkbox
                  checked={attendeeRecordChecked}
                  onCheckedChange={(checked) =>
                    props.onToggleAttendeeRecordsSelected(
                      attendee.records,
                      checked,
                    )
                  }
                  aria-label={`Select attendance records for ${attendee.name}`}
                  className="mt-1 shrink-0"
                />
                <div className="grid min-w-0 flex-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Attendee
                    </p>
                    <p className="mt-1 wrap-break-word font-black">
                      {attendee.studentId} - {attendee.name}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Latest Scan
                    </p>
                    <p className="mt-1 wrap-break-word font-semibold">
                      {formatDateTime(attendee.latestScannedAt)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Year Level
                    </p>
                    <p className="mt-1 wrap-break-word font-semibold">
                      {attendee.yearLevel || "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      College
                    </p>
                    <p className="mt-1 wrap-break-word font-semibold">
                      {getCollegeLabel(attendee.college)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Program
                    </p>
                    <p className="mt-1 wrap-break-word font-semibold">
                      {attendee.program || "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Institution
                    </p>
                    <p className="mt-1 wrap-break-word font-semibold">
                      {attendee.institution || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                {attendee.records.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Checkbox
                          checked={props.selectedRecordIdsSet.has(record.id)}
                          onCheckedChange={(checked) =>
                            props.onToggleRecordSelected(record.id, checked)
                          }
                          aria-label={`Select attendance record for ${attendee.name}`}
                          className="mt-1 shrink-0"
                        />
                        <div className="grid min-w-0 flex-1 gap-3 text-sm sm:grid-cols-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                              Scanned At
                            </p>
                            <p className="mt-1 wrap-break-word font-semibold">
                              {formatDateTime(record.scanned_at)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                              Remarks
                            </p>
                            <p className="mt-1 wrap-break-word font-semibold text-muted-foreground">
                              {record.remarks || "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => props.onEditRecord(record)}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                        >
                          Edit
                        </Button>
                        <DeleteAttendanceConfirmation
                          record={record}
                          isDeleting={
                            props.deletingRecordId === record.id ||
                            props.isDeletingBulk
                          }
                          onConfirm={props.onDeleteRecord}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AttendanceStudentEventsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: AttendanceStudentEventsDialogState;
  events: AttendanceEvent[];
}) {
  const attendedEvents = useMemo(() => {
    return props.student
      ? getAttendanceStudentEventSummaries(props.student.records, props.events)
      : [];
  }, [props.events, props.student]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>
            Events attended
            {props.student
              ? ` by ${props.student.name || props.student.studentId}`
              : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the events attended by the selected student and their
            attendance records.
          </DialogDescription>
        </DialogHeader>

        {props.student ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4 text-sm sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  Student ID
                </p>
                <p className="mt-1 wrap-break-word font-semibold">
                  {props.student.studentId || "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  Name
                </p>
                <p className="mt-1 wrap-break-word font-semibold">
                  {props.student.name || "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  Events
                </p>
                <p className="mt-1 wrap-break-word font-semibold">
                  {attendedEvents.length}
                </p>
              </div>
            </div>

            {attendedEvents.length ? (
              <div className="space-y-3">
                {attendedEvents.map((eventSummary) => (
                  <article
                    key={eventSummary.key}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="wrap-break-word font-black">
                          {eventSummary.eventName}
                        </p>
                        <p className="mt-1 wrap-break-word text-sm text-muted-foreground">
                          {eventSummary.schedule} •{" "}
                          {eventSummary.records.length} record/s • Total:{" "}
                          {eventSummary.totalAbsences}
                        </p>
                      </div>
                      <span className="rounded-full border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                        Latest {formatDateTime(eventSummary.latestScannedAt)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {eventSummary.records.map((record) => (
                        <div
                          key={record.id}
                          className="rounded-xl border bg-card px-3 py-2 text-sm"
                        >
                          <p className="font-semibold">
                            {formatDateTime(
                              record.scanned_at ?? record.created_at,
                            )}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {record.remarks || "No remarks"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                No attended events found for this student.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
            No student selected.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttendanceRecordSearchDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  records: AttendanceRecord[];
  allRecords: AttendanceRecord[];
  studentSummaries: AttendanceStudentRecordSummary[];
  deletingRecordId: string;
  isDeletingBulk: boolean;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
  onOpenStudentEvents: (summary: AttendanceStudentRecordSummary) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[95svh] flex-col overflow-hidden sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            Search records{props.query ? ` for “${props.query}”` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            View matching attendance records, grouped student summaries, and
            attendance record actions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Matched records
              </p>
              <p className="mt-1 text-2xl font-black">{props.records.length}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Matched students
              </p>
              <p className="mt-1 text-2xl font-black">
                {props.studentSummaries.length}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Total count
              </p>
              <p className="mt-1 text-2xl font-black">
                {getAttendanceRecordTotalAbsences(
                  props.records,
                  props.allRecords,
                )}
              </p>
            </div>
          </div>

          {props.studentSummaries.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {props.studentSummaries.map((summary) => (
                <article
                  key={summary.key}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="wrap-break-word font-black">
                        {summary.studentId || "No Student ID"} -{" "}
                        {summary.name || "No name"}
                      </p>
                      <p className="mt-1 wrap-break-word text-sm text-muted-foreground">
                        {summary.program || "No program"} •{" "}
                        {getCollegeLabel(summary.college)} •{" "}
                        {summary.records.length} record/s • Total:{" "}
                        {summary.totalAbsences}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onOpenStudentEvents(summary)}
                      className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                    >
                      Events
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {props.records.length ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-background text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Student ID</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Event</th>
                    <th className="px-3 py-3">Remarks</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.records.map((record) => (
                    <tr key={record.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3 font-semibold">
                        {formatDateTime(record.scanned_at ?? record.created_at)}
                      </td>
                      <td className="px-3 py-3">{record.student_id || "—"}</td>
                      <td className="px-3 py-3">{record.name || "—"}</td>
                      <td className="px-3 py-3">
                        {getManualRecordSource(record)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {record.remarks || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => props.onEditRecord(record)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeleteAttendanceConfirmation
                            record={record}
                            isDeleting={
                              props.deletingRecordId === record.id ||
                              props.isDeletingBulk
                            }
                            onConfirm={props.onDeleteRecord}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
              No attendance records matched this search.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [saveProgress, setSaveProgress] =
    useState<AttendanceImportProgress | null>(null);
  const [displaySaveProgressPercent, setDisplaySaveProgressPercent] =
    useState(0);
  const [resumableImportSnapshot, setResumableImportSnapshot] =
    useState<AttendanceResumableImportSnapshot | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [transferTargetSchoolYearId, setTransferTargetSchoolYearId] = useState("");
  const [yearFilter, setYearFilter] = useState(ALL_YEARS_SELECT_VALUE);
  const [eventFilter, setEventFilter] = useState(ALL_EVENTS_SELECT_VALUE);
  const [collegeFilter, setCollegeFilter] = useState(ALL_COLLEGES_SELECT_VALUE);
  const [manualForm, setManualForm] = useState<ManualAttendanceFormState>(
    emptyManualAttendanceForm,
  );
  const [bulkAttendeesForm, setBulkAttendeesForm] =
    useState<AttendanceBulkEventAttendeesFormState>(
      emptyBulkEventAttendeesForm,
    );
  const [eventForm, setEventForm] = useState<AttendanceEventFormState>(
    emptyAttendanceEventForm,
  );
  const [uploadEventId, setUploadEventId] = useState("");
  const [uploadEventName, setUploadEventName] = useState("");
  const [uploadEventStartAt, setUploadEventStartAt] = useState("");
  const [uploadEventEndAt, setUploadEventEndAt] = useState("");
  const [uploadEventDescription, setUploadEventDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualSaveProgress, setManualSaveProgress] =
    useState<AttendanceImportProgress | null>(null);
  const [
    displayManualSaveProgressPercent,
    setDisplayManualSaveProgressPercent,
  ] = useState(0);
  const [isSavingBulkAttendees, setIsSavingBulkAttendees] = useState(false);
  const [bulkAttendeesSaveProgress, setBulkAttendeesSaveProgress] =
    useState<AttendanceImportProgress | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [recordLoadProgress, setRecordLoadProgress] =
    useState<ProgressiveLoadProgress>(INITIAL_PROGRESSIVE_LOAD_PROGRESS);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isAddingSelectedRecordsToEvents, setIsAddingSelectedRecordsToEvents] =
    useState(false);
  const [selectedRecordsAddProgress, setSelectedRecordsAddProgress] =
    useState<AttendanceSelectedRecordsAddProgress | null>(null);
  const [isDeletingEvents, setIsDeletingEvents] = useState(false);
  const [isTransferringSchoolYearRecords, setIsTransferringSchoolYearRecords] = useState(false);
  const [eventDeleteProgress, setEventDeleteProgress] =
    useState<AttendanceEventDeleteProgress | null>(null);
  const [isDeletingImports, setIsDeletingImports] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState("");
  const [editingRecordScope, setEditingRecordScope] =
    useState<AttendanceRecordEditScope>("event-attendee");
  const [editingEventId, setEditingEventId] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [deletingEventId, setDeletingEventId] = useState("");
  const [deletingImportId, setDeletingImportId] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [bulkAttendeesDialogOpen, setBulkAttendeesDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [recordSearchDialogOpen, setRecordSearchDialogOpen] = useState(false);
  const [studentEventsDialogState, setStudentEventsDialogState] =
    useState<AttendanceStudentEventsDialogState>(null);
  const [studentEventsDialogOpen, setStudentEventsDialogOpen] = useState(false);
  const [error, setError] = useState("");

  const invalidRows = useMemo(
    () => preview?.rows.filter((row) => row.errors.length > 0) ?? [],
    [preview],
  );
  const previewEventNames = useMemo(
    () => getAttendancePreviewEventNames(preview),
    [preview],
  );
  const displayEvents = useMemo(
    () => getDeduplicatedAttendanceEvents(events),
    [events],
  );
  const normalizedRecords = useMemo<AttendanceRecord[]>(
    () => normalizeManualAttendanceRecords(records, events),
    [events, records],
  );
  const mergedRecords = useMemo<AttendanceRecord[]>(
    () => mergeAttendanceRecordsByStudentId(normalizedRecords),
    [normalizedRecords],
  );
  const manualDialogEvents = useMemo(() => {
    if (!editingRecordId) return events;

    const editingRecord =
      normalizedRecords.find((record) => record.id === editingRecordId) ?? null;

    return getAttendancePresentEventsForAttendee(
      normalizedRecords,
      editingRecord,
      events,
    );
  }, [editingRecordId, events, normalizedRecords]);
  const zeroAttendanceAttendeeOptions = useMemo(
    () => getZeroAttendanceRegistrationAttendeeOptions(mergedRecords),
    [mergedRecords],
  );
  const yearFilterOptions = useMemo(
    () => getAttendanceYearOptions(mergedRecords, schoolYears),
    [mergedRecords, schoolYears],
  );
  const yearFilteredRecords = useMemo<AttendanceRecord[]>(() => {
    return mergedRecords.filter((record) =>
      recordMatchesSelectedYear(record, yearFilter),
    );
  }, [mergedRecords, yearFilter]);
  const selectedYearLabel = getSchoolYearLabel(schoolYears, yearFilter);
  const eventFilterOptions = useMemo<
    Array<{ value: string; label: string }>
  >(() => {
    const eventById = new Map<string, string>(
      displayEvents.map((event) => [event.id, event.name]),
    );
    const options = new Map<string, string>();

    displayEvents.forEach((event) =>
      options.set(getAttendanceEventFilterValue(event), event.name),
    );
    yearFilteredRecords.forEach((record) => {
      const value = getRecordEventFilterValue(record);
      const label = record.event_id
        ? (eventById.get(record.event_id) ?? getManualRecordSource(record))
        : "No event";
      options.set(value, label);
    });

    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => compareAttendanceLabels(left.label, right.label));
  }, [displayEvents, yearFilteredRecords]);
  const eventFilteredRecords = useMemo<AttendanceRecord[]>(() => {
    if (eventFilter === ALL_EVENTS_SELECT_VALUE) return yearFilteredRecords;

    return yearFilteredRecords.filter(
      (record) => getRecordEventFilterValue(record) === eventFilter,
    );
  }, [eventFilter, yearFilteredRecords]);
  const collegeFilterOptions = useMemo<string[]>(() => {
    return Array.from<string>(
      new Set(
        eventFilteredRecords.map((record) =>
          getCollegeFilterValue(record.college),
        ),
      ),
    ).sort((left, right) => {
      return compareAttendanceLabels(
        getCollegeLabel(left === NO_COLLEGE_SELECT_VALUE ? "" : left),
        getCollegeLabel(right === NO_COLLEGE_SELECT_VALUE ? "" : right),
      );
    });
  }, [eventFilteredRecords]);
  const filteredRecords = useMemo<AttendanceRecord[]>(() => {
    if (collegeFilter === ALL_COLLEGES_SELECT_VALUE)
      return eventFilteredRecords;

    return eventFilteredRecords.filter(
      (record) => getCollegeFilterValue(record.college) === collegeFilter,
    );
  }, [collegeFilter, eventFilteredRecords]);
  const attendanceEventGroups = useMemo(
    () => getAttendanceEventGroups(filteredRecords, events),
    [events, filteredRecords],
  );
  const recordSearchResults = useMemo<AttendanceRecord[]>(() => {
    const query = recordSearchQuery.trim().toLowerCase();
    if (!query) return [];

    return getDeduplicatedAttendanceSearchRecords(
      yearFilteredRecords.filter((record) =>
        getAttendanceRecordSearchText(record).includes(query),
      ),
    ).sort(compareAttendanceRecordsByEventSequence);
  }, [recordSearchQuery, yearFilteredRecords]);
  const recordSearchStudentSummaries = useMemo(() => {
    return getAttendanceStudentRecordSummaries(
      recordSearchResults,
      yearFilteredRecords,
    );
  }, [recordSearchResults, yearFilteredRecords]);
  const selectedEventIdsSet = useMemo(
    () => new Set(selectedEventIds),
    [selectedEventIds],
  );
  const selectedEventCount = selectedEventIds.length;
  const visibleSelectedEventCount = displayEvents.filter((event) =>
    selectedEventIdsSet.has(event.id),
  ).length;
  const allVisibleEventsSelected =
    displayEvents.length > 0 &&
    visibleSelectedEventCount === displayEvents.length;
  const eventHeaderChecked = allVisibleEventsSelected
    ? true
    : visibleSelectedEventCount > 0
      ? "indeterminate"
      : false;
  const selectedRecordIdsSet = useMemo(
    () => new Set(selectedRecordIds),
    [selectedRecordIds],
  );
  const selectedRecordCount = selectedRecordIds.length;
  const filteredRecordCount = filteredRecords.length;
  const visibleSelectedRecordCount = filteredRecords.filter((record) =>
    selectedRecordIdsSet.has(record.id),
  ).length;
  const allVisibleRecordsSelected =
    filteredRecordCount > 0 &&
    visibleSelectedRecordCount === filteredRecordCount;
  const recordHeaderChecked = allVisibleRecordsSelected
    ? true
    : visibleSelectedRecordCount > 0
      ? "indeterminate"
      : false;
  const uploadEventReady = Boolean(file || resumableImportSnapshot);
  const targetSaveProgressPercent = getSaveProgressPercent(
    saveProgress,
    isSaving,
  );
  const saveProgressPercent = isSaving
    ? Math.max(displaySaveProgressPercent, targetSaveProgressPercent)
    : targetSaveProgressPercent;
  const saveProgressMessage = getSaveProgressMessage(saveProgress);
  const saveProgressRowText = getSaveProgressRowText(saveProgress);
  const targetManualSaveProgressPercent = getSaveProgressPercent(
    manualSaveProgress,
    isSavingManual,
  );
  const manualSaveProgressPercent = isSavingManual
    ? Math.max(
        displayManualSaveProgressPercent,
        targetManualSaveProgressPercent,
      )
    : targetManualSaveProgressPercent;
  const manualSaveProgressMessage =
    manualSaveProgress?.message ||
    (editingRecordId
      ? getManualUpdateProgressMessage(manualSaveProgress)
      : "Preparing attendance save...");
  const manualSaveProgressRowText = manualSaveProgress
    ? getManualUpdateProgressRowText(manualSaveProgress)
    : editingRecordId
      ? "Preparing record updates..."
      : "Preparing attendance record...";
  const bulkAttendeesSaveProgressPercent = useProgressivePercent(
    isSavingBulkAttendees,
    getSaveProgressPercent(bulkAttendeesSaveProgress, isSavingBulkAttendees),
  );
  const bulkAttendeesSaveProgressMessage =
    bulkAttendeesSaveProgress?.message || "Preparing attendees...";
  const bulkAttendeesSaveProgressRowText = getManualUpdateProgressRowText(
    bulkAttendeesSaveProgress,
  );
  const scrollRestorePositionRef = useRef<{ left: number; top: number } | null>(
    null,
  );
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const saveAbortControllerRef = useRef<AbortController | null>(null);
  const recordLoadProgressPercent = useProgressivePercent(
    isLoadingRecords,
    recordLoadProgress.percent,
  );
  const eventDeleteProgressPercent = useProgressivePercent(
    isDeletingEvents,
    eventDeleteProgress?.percent ?? 0,
  );
  const selectedRecordsAddProgressPercent = useProgressivePercent(
    isAddingSelectedRecordsToEvents,
    selectedRecordsAddProgress?.percent ?? 0,
  );

  function captureScrollPosition() {
    if (typeof window === "undefined") return;

    scrollRestorePositionRef.current = {
      left: window.scrollX,
      top: window.scrollY,
    };
  }

  function restoreCapturedScrollPosition() {
    if (typeof window === "undefined" || !scrollRestorePositionRef.current)
      return;

    const position = scrollRestorePositionRef.current;

    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
    }

    scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      window.scrollTo({
        left: position.left,
        top: position.top,
        behavior: "auto",
      });

      scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
        window.scrollTo({
          left: position.left,
          top: position.top,
          behavior: "auto",
        });
        scrollRestoreFrameRef.current = null;
      });
    });
  }

  function updateManualForm<K extends keyof ManualAttendanceFormState>(
    key: K,
    value: ManualAttendanceFormState[K],
  ) {
    setManualForm((current) => {
      if (key === "eventId") {
        const eventId = cleanImportValue(value as string);

        return {
          ...current,
          eventId,
          eventIds: eventId ? [eventId] : [],
        };
      }

      if (key === "eventIds") {
        const eventIds = Array.from(
          new Set((value as string[]).map(cleanImportValue).filter(Boolean)),
        );

        return {
          ...current,
          eventId: eventIds[0] ?? "",
          eventIds,
        };
      }

      return {
        ...current,
        [key]: value,
        ...(key === "college" ? { program: "" } : {}),
      };
    });
  }

  function updateBulkAttendeesForm<
    K extends keyof AttendanceBulkEventAttendeesFormState,
  >(key: K, value: AttendanceBulkEventAttendeesFormState[K]) {
    setBulkAttendeesForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "college" ? { program: "" } : {}),
    }));
  }

  function updateEventForm<K extends keyof AttendanceEventFormState>(
    key: K,
    value: AttendanceEventFormState[K],
  ) {
    setEventForm((current) => ({ ...current, [key]: value }));
  }

  function handleToggleEventSelected(
    id: string,
    checked: boolean | "indeterminate",
  ) {
    setSelectedEventIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((eventId) => eventId !== id);
    });
  }

  function handleToggleAllEvents(checked: boolean | "indeterminate") {
    const visibleEventIds = displayEvents.map((event) => event.id);
    const visibleEventIdsSet = new Set(visibleEventIds);

    setSelectedEventIds((current) => {
      if (checked === true) {
        return Array.from(new Set([...current, ...visibleEventIds]));
      }

      return current.filter((eventId) => !visibleEventIdsSet.has(eventId));
    });
  }

  function handleToggleRecordSelected(
    id: string,
    checked: boolean | "indeterminate",
  ) {
    setSelectedRecordIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((recordId) => recordId !== id);
    });
  }

  function handleToggleAllRecords(checked: boolean | "indeterminate") {
    const filteredRecordIds = filteredRecords.map((record) => record.id);
    const filteredRecordIdsSet = new Set(filteredRecordIds);

    setSelectedRecordIds((current) => {
      if (checked === true) {
        return Array.from(new Set([...current, ...filteredRecordIds]));
      }

      return current.filter((recordId) => !filteredRecordIdsSet.has(recordId));
    });
  }

  function handleToggleGroupedRecordsSelected(
    groupRecords: AttendanceRecord[],
    checked: boolean | "indeterminate",
  ) {
    const groupRecordIds = groupRecords.map((record) => record.id);
    const groupRecordIdsSet = new Set(groupRecordIds);

    setSelectedRecordIds((current) => {
      if (checked === true) {
        return Array.from(new Set([...current, ...groupRecordIds]));
      }

      return current.filter((recordId) => !groupRecordIdsSet.has(recordId));
    });
  }

  function handleSearchRecords(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = recordSearch.trim();
    if (!query) {
      toast.error(
        "Please enter a Student ID, name, event, college, or program to search.",
      );
      return;
    }

    setRecordSearchQuery(query);
    setRecordSearchDialogOpen(true);
  }

  function handleOpenStudentEvents(summary: AttendanceStudentRecordSummary) {
    setStudentEventsDialogState({
      studentId: summary.studentId,
      name: summary.name,
      records: summary.records,
    });
    setStudentEventsDialogOpen(true);
  }

  function clearResumableImportSnapshot() {
    writeResumableAttendanceImportSnapshot(null);
    setResumableImportSnapshot(null);
  }

  function clearUploadedAttendanceFile(
    options: {
      completedResult?: SavedAttendanceImportResult | null;
    } = {},
  ) {
    setFile(null);
    setPreview(options.completedResult ?? null);
    setSaved(options.completedResult ?? null);
    setSaveProgress(null);
    setDisplaySaveProgressPercent(0);
    setIsDragging(false);
    setError("");
    setUploadEventId("");
    setUploadEventName("");
    setUploadEventStartAt("");
    setUploadEventEndAt("");
    setUploadEventDescription("");
    clearResumableImportSnapshot();
  }

  function saveResumableImportSnapshot(
    snapshot: AttendanceResumableImportSnapshot | null,
  ) {
    writeResumableAttendanceImportSnapshot(snapshot);
    setResumableImportSnapshot(snapshot);
  }

  function handleUploadFileChange(selectedFile: File | null) {
    const selectedFileSignature = selectedFile
      ? getAttendanceFileSignature(selectedFile)
      : "";
    const canReuseResumableSnapshot = Boolean(
      selectedFileSignature &&
      resumableImportSnapshot?.fileSignature === selectedFileSignature,
    );

    if (!selectedFile) {
      clearUploadedAttendanceFile();
      return;
    }

    setFile(selectedFile);
    setPreview(
      canReuseResumableSnapshot
        ? (resumableImportSnapshot?.preview ?? null)
        : null,
    );
    setSaved(null);
    setSaveProgress(null);
    setError("");

    if (!canReuseResumableSnapshot && selectedFileSignature) {
      clearResumableImportSnapshot();
    }

    if (selectedFile && canReuseResumableSnapshot && resumableImportSnapshot) {
      setUploadEventId(resumableImportSnapshot.options.eventId);
      setUploadEventName(resumableImportSnapshot.options.eventName);
      setUploadEventStartAt(resumableImportSnapshot.options.eventStartAt);
      setUploadEventEndAt(resumableImportSnapshot.options.eventEndAt);
      setUploadEventDescription(
        resumableImportSnapshot.options.eventDescription,
      );
      return;
    }

    setUploadEventId("");
    setUploadEventName("");
    setUploadEventStartAt("");
    setUploadEventEndAt("");
    setUploadEventDescription("");
  }

  function handleUploadEventIdChange(value: string) {
    setUploadEventId(value);

    if (value) {
      setUploadEventName("");
      setUploadEventStartAt("");
      setUploadEventEndAt("");
      setUploadEventDescription("");
    }
  }

  async function loadRecords(options: { preserveScroll?: boolean } = {}) {
    if (options.preserveScroll) {
      captureScrollPosition();
    }

    let completedWeight = 0;
    let recordWeight = 0;

    const updateProgress = (
      percent: number,
      message: string,
      detail: string,
    ) => {
      setRecordLoadProgress({
        percent: Math.max(1, Math.min(100, Math.round(percent))),
        message,
        detail,
      });
    };

    const markProgressStepComplete = (
      weight: number,
      message: string,
      detail: string,
    ) => {
      completedWeight = Math.min(100, completedWeight + weight);
      updateProgress(Math.min(96, 2 + completedWeight * 0.94), message, detail);
    };

    const updateRecordPageProgress = (
      progress: AttendanceRecordsPageProgress,
    ) => {
      const recordRowsProgressTarget = progress.isComplete
        ? Math.max(progress.loadedRows, 1)
        : Math.min(
            ATTENDANCE_RECORDS_MAX_ROWS,
            Math.max(progress.loadedRows, ATTENDANCE_RECORDS_PAGE_SIZE),
          );
      const nextRecordWeight = progress.isComplete
        ? 70
        : Math.min(
            66,
            Math.max(
              recordWeight,
              Math.round(
                (progress.loadedRows / recordRowsProgressTarget) * 66,
              ),
            ),
          );

      if (nextRecordWeight <= recordWeight) return;

      completedWeight += nextRecordWeight - recordWeight;
      recordWeight = nextRecordWeight;

      updateProgress(
        Math.min(92, 2 + completedWeight * 0.94),
        "Loading attendance records...",
        `${progress.loadedRows.toLocaleString()} record/s loaded from ${progress.pageCount} page/s.`,
      );
    };

    setIsLoadingRecords(true);
    setError("");
    updateProgress(
      2,
      "Starting attendance data load...",
      "Connecting to the server and preparing attendance data.",
    );

    try {
      await waitForNextPaint();

      const recordsPromise = listAttendanceRecordsWithProgress(
        updateRecordPageProgress,
      ).then((rows) => {
        if (recordWeight < 70) {
          markProgressStepComplete(
            70 - recordWeight,
            "Attendance records loaded...",
            `${rows.length.toLocaleString()} attendance record/s received.`,
          );
          recordWeight = 70;
        }

        return rows;
      });
      const eventsPromise = listAttendanceEvents({
        limit: 500,
        offset: 0,
      }).then((eventRows) => {
        markProgressStepComplete(
          15,
          "Attendance events loaded...",
          `${eventRows.length.toLocaleString()} event/s received from the server.`,
        );

        return eventRows;
      });
      const importsPromise = listAttendanceImports({
        limit: 500,
        offset: 0,
      }).then((importRows) => {
        markProgressStepComplete(
          15,
          "Import history loaded...",
          `${importRows.length.toLocaleString()} import history item/s received.`,
        );

        return importRows;
      });
      const schoolYearsPromise = listSchoolYears().then((schoolYearRows) => {
        markProgressStepComplete(
          5,
          "School years loaded...",
          `${schoolYearRows.length.toLocaleString()} school year/s received.`,
        );

        return schoolYearRows;
      });

      const [rows, eventRows, importRows, schoolYearRows] = await Promise.all([
        recordsPromise,
        eventsPromise,
        importsPromise,
        schoolYearsPromise,
      ]);

      const rowIds = new Set(rows.map((record) => record.id));

      updateProgress(
        98,
        "Updating attendance table...",
        "Applying filters and selected records.",
      );

      setRecords(rows);
      setEvents(eventRows);
      setImports(importRows);
      setSchoolYears(schoolYearRows);
      setTransferTargetSchoolYearId((current) => current || schoolYearRows[0]?.id || "");
      setSelectedRecordIds((current) => current.filter((id) => rowIds.has(id)));
      updateProgress(
        100,
        "Attendance data loaded.",
        `${rows.length.toLocaleString()} records, ${eventRows.length.toLocaleString()} events, and ${importRows.length.toLocaleString()} import history item/s are ready.`,
      );
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load attendance records.";
      setError(message);
      toast.error(message);
    } finally {
      await waitForNextPaint();
      setIsLoadingRecords(false);
      setRecordLoadProgress(INITIAL_PROGRESSIVE_LOAD_PROGRESS);

      if (options.preserveScroll) {
        restoreCapturedScrollPosition();
      }
    }
  }

  async function handlePreview() {
    if (!file) {
      setError("Please choose or drop a file first.");
      toast.error("Please choose or drop a file first.");
      return;
    }

    setIsPreviewing(true);
    setError("");
    setSaved(null);
    setSaveProgress(null);

    try {
      const upload = await getAttendanceUploadFile(file);
      const result = await previewAttendanceFile(upload.file);
      const detectedEventNames = getAttendancePreviewEventNames(result ?? null);

      setPreview(result ?? null);

      if (!uploadEventId && detectedEventNames.length) {
        setUploadEventName("");
        setUploadEventStartAt("");
        setUploadEventEndAt("");
        setUploadEventDescription("");
      }

      toast.success(
        upload.normalizedRowsCount
          ? `Attendance preview generated from ${upload.normalizedRowsCount} extracted student row/s across the workbook.${
              detectedEventNames.length
                ? ` Detected ${detectedEventNames.length} event/s.`
                : ""
            }`
          : "Attendance file preview generated.",
      );
    } catch (previewError) {
      const message =
        previewError instanceof Error
          ? previewError.message
          : "Unable to preview attendance file.";
      setPreview(null);
      setError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  function buildAttendanceImportOptionsSnapshot(
    shouldUseDetectedFileEvents: boolean,
  ): AttendanceImportOptionsSnapshot {
    const eventName = uploadEventName.trim();

    return {
      eventId: uploadEventId || "",
      eventName: uploadEventId || shouldUseDetectedFileEvents ? "" : eventName,
      eventStartAt: uploadEventId ? "" : uploadEventStartAt || "",
      eventEndAt: uploadEventId ? "" : uploadEventEndAt || "",
      eventDescription:
        uploadEventId || shouldUseDetectedFileEvents
          ? ""
          : uploadEventDescription.trim(),
    };
  }

  async function prepareResumableAttendanceImportSnapshot() {
    if (!file) {
      if (resumableImportSnapshot) return resumableImportSnapshot;

      throw new Error("Please choose or drop a file first.");
    }

    const upload = await getAttendanceUploadFile(file);
    const result =
      preview && preview.fileName === upload.file.name
        ? preview
        : await previewAttendanceFile(upload.file);
    if (!result) {
      throw new Error("Unable to preview attendance file.");
    }

    const uploadEventNames = upload.normalizedEventNames.length
      ? upload.normalizedEventNames
      : getAttendancePreviewEventNames(result);
    const fileHasDetectedEvents = uploadEventNames.length > 0;
    const eventName = uploadEventName.trim();

    if (!uploadEventId && !eventName && !fileHasDetectedEvents) {
      throw new Error(
        "Please select an existing event, enter a new event name, or upload a file that includes event names.",
      );
    }

    const shouldUseDetectedFileEvents = !uploadEventId && fileHasDetectedEvents;
    const options = buildAttendanceImportOptionsSnapshot(
      shouldUseDetectedFileEvents,
    );
    const fileSignature = getAttendanceFileSignature(file);
    const canReuseCurrentSnapshot = Boolean(
      resumableImportSnapshot?.fileSignature === fileSignature &&
      areAttendanceImportOptionsEqual(resumableImportSnapshot.options, options),
    );

    if (canReuseCurrentSnapshot && resumableImportSnapshot) {
      setPreview(resumableImportSnapshot.preview);
      return resumableImportSnapshot;
    }

    const rows = getValidAttendanceRows(result);

    if (!rows.length) {
      throw new Error("No valid attendance rows are available to save.");
    }

    const snapshot: AttendanceResumableImportSnapshot = {
      id: createResumableImportId(),
      fileName: result.fileName,
      fileType: result.fileType,
      fileSignature,
      preview: result,
      rows,
      processedRows: 0,
      savedRecordsCount: 0,
      createdFinesCount: 0,
      importId: "",
      options,
      updatedAt: new Date().toISOString(),
    };

    saveResumableImportSnapshot(snapshot);
    setPreview(result);

    return snapshot;
  }

  function getResumableProgress(
    snapshot: AttendanceResumableImportSnapshot,
    processedRows: number,
    savedRecordsCount: number,
    createdFinesCount: number,
    message = "Saving attendance records...",
  ): AttendanceImportProgress {
    const totalRows = snapshot.rows.length;
    const percent = totalRows
      ? Math.min(99, Math.round((processedRows / totalRows) * 100))
      : 100;

    return {
      stage: percent >= 100 ? "completed" : "saving",
      percent,
      message,
      processedRows,
      totalRows,
      savedRecords: savedRecordsCount,
      createdFines: createdFinesCount,
    };
  }

  async function saveResumableAttendanceImport(
    snapshot: AttendanceResumableImportSnapshot,
    signal: AbortSignal,
  ) {
    let workingSnapshot = snapshot;
    let processedRows = Math.min(snapshot.processedRows, snapshot.rows.length);
    let savedRecordsCount = snapshot.savedRecordsCount;
    let createdFinesCount = snapshot.createdFinesCount;
    const savedRecords: SavedAttendanceImportResult["savedRecords"] = [];
    const createdFines: SavedAttendanceImportResult["createdFines"] = [];
    let lastResult: SavedAttendanceImportResult | null = null;

    setSaveProgress(
      getResumableProgress(
        workingSnapshot,
        processedRows,
        savedRecordsCount,
        createdFinesCount,
        processedRows
          ? "Resuming attendance import..."
          : "Starting attendance import...",
      ),
    );

    while (processedRows < workingSnapshot.rows.length) {
      if (signal.aborted) {
        throw new DOMException(
          "Attendance import was cancelled.",
          "AbortError",
        );
      }

      const processedRowsBeforeChunk = processedRows;
      const chunk = workingSnapshot.rows.slice(
        processedRows,
        processedRows + ATTENDANCE_RESUMABLE_IMPORT_CHUNK_SIZE,
      );

      const result = await saveAttendanceRows({
        ...workingSnapshot.options,
        resumeImportId: workingSnapshot.importId || undefined,
        fileName: workingSnapshot.fileName,
        fileType: workingSnapshot.fileType,
        rows: chunk,
        signal,
        onProgress: (progress) => {
          const chunkProcessedRows = Math.min(
            chunk.length,
            progress.processedRows || 0,
          );
          const nextProcessedRows = Math.min(
            workingSnapshot.rows.length,
            processedRowsBeforeChunk + chunkProcessedRows,
          );

          setSaveProgress({
            ...progress,
            percent: workingSnapshot.rows.length
              ? Math.min(
                  99,
                  Math.round(
                    (nextProcessedRows / workingSnapshot.rows.length) * 100,
                  ),
                )
              : progress.percent,
            processedRows: nextProcessedRows,
            totalRows: workingSnapshot.rows.length,
            savedRecords: savedRecordsCount + progress.savedRecords,
            createdFines: createdFinesCount + progress.createdFines,
          });
        },
      });

      lastResult = result ?? null;
      savedRecords.push(...(result?.savedRecords ?? []));
      createdFines.push(...(result?.createdFines ?? []));
      processedRows += chunk.length;
      savedRecordsCount += result?.savedRecords.length ?? 0;
      createdFinesCount += result?.createdFines.length ?? 0;
      workingSnapshot = {
        ...workingSnapshot,
        importId: result?.importId ?? workingSnapshot.importId,
        processedRows,
        savedRecordsCount,
        createdFinesCount,
        updatedAt: new Date().toISOString(),
      };
      saveResumableImportSnapshot(workingSnapshot);
      setSaveProgress(
        getResumableProgress(
          workingSnapshot,
          processedRows,
          savedRecordsCount,
          createdFinesCount,
          "Attendance import progress saved.",
        ),
      );
    }

    const completedResult: SavedAttendanceImportResult = {
      ...workingSnapshot.preview,
      importId: workingSnapshot.importId || lastResult?.importId || "",
      event: lastResult?.event ?? null,
      savedRecords,
      createdFines,
    };

    setSaveProgress({
      stage: "completed",
      percent: 100,
      message: "Attendance import completed.",
      processedRows: workingSnapshot.rows.length,
      totalRows: workingSnapshot.rows.length,
      savedRecords: savedRecordsCount,
      createdFines: createdFinesCount,
    });
    clearResumableImportSnapshot();

    return { result: completedResult, savedRecordsCount, createdFinesCount };
  }

  function handleCancelSave() {
    saveAbortControllerRef.current?.abort();
    setIsSaving(false);
    setSaveProgress((current) =>
      current
        ? {
            ...current,
            stage: "cancelled",
            message:
              "Attendance import cancelled. Press Resume Import to continue where it left off.",
          }
        : current,
    );
    toast.info("Attendance import cancelled. You can resume it anytime.");
  }

  async function handleSave() {
    if (!file && !resumableImportSnapshot) {
      setError("Please choose or drop a file first.");
      toast.error("Please choose or drop a file first.");
      return;
    }

    const abortController = new AbortController();
    saveAbortControllerRef.current = abortController;
    setIsSaving(true);
    setError("");
    setSaved(null);

    try {
      const snapshot = await prepareResumableAttendanceImportSnapshot();
      const { result, savedRecordsCount, createdFinesCount } =
        await saveResumableAttendanceImport(snapshot, abortController.signal);

      setSaved(result ?? null);
      setPreview(result ?? null);
      await loadRecords({ preserveScroll: true });
      clearUploadedAttendanceFile({ completedResult: result ?? null });
      toast.success(
        `Attendance imported successfully. Saved ${savedRecordsCount} record/s and created ${createdFinesCount} fine record/s.`,
      );
    } catch (saveError) {
      if (isAbortError(saveError)) {
        setSaveProgress((current) =>
          current
            ? {
                ...current,
                stage: "cancelled",
                message:
                  "Attendance import cancelled. Press Resume Import to continue where it left off.",
              }
            : current,
        );
        return;
      }

      const message =
        saveError instanceof Error
          ? saveError.message
          : "Unable to save attendance file.";
      setError(message);
      toast.error(message);
    } finally {
      saveAbortControllerRef.current = null;
      setIsSaving(false);
    }
  }

  async function updateAttendanceRecordsWithProgress(
    recordIds: string[],
    payload: ManualAttendanceInput,
  ) {
    const uniqueRecordIds = Array.from(new Set(recordIds.filter(Boolean)));
    const totalRecords = uniqueRecordIds.length;

    if (!totalRecords) return [];

    setManualSaveProgress({
      stage: "preparing",
      percent: 8,
      message: `Preparing ${totalRecords} attendance record/s for one bulk update...`,
      processedRows: 0,
      totalRows: totalRecords,
      savedRecords: 0,
      createdFines: 0,
    });
    await waitForNextPaint();

    const startedAt = performance.now();

    setManualSaveProgress({
      stage: "saving",
      percent: 35,
      message: `Sending one bulk update for ${totalRecords} attendance record/s...`,
      processedRows: 0,
      totalRows: totalRecords,
      savedRecords: 0,
      createdFines: 0,
    });
    await waitForNextPaint();

    const result = await updateAttendanceRecords(uniqueRecordIds, payload);
    const updatedRecords = getAttendanceBulkUpdatedRecords(
      result,
      uniqueRecordIds,
    );
    const updatedCount = getAttendanceBulkUpdatedCount(result, uniqueRecordIds);
    const elapsedTime = formatDuration(performance.now() - startedAt);
    const fineCount = getAttendanceBulkFineCount(result);

    setManualSaveProgress({
      stage: "syncing",
      percent: 96,
      message: `Database updated ${updatedCount} record/s in ${elapsedTime}. Applying refreshed records...`,
      processedRows: updatedCount,
      totalRows: totalRecords,
      savedRecords: updatedRecords.length || updatedCount,
      createdFines: fineCount,
    });
    await waitForNextPaint();

    return updatedRecords;
  }

  async function saveManualAttendanceEventsWithProgress(
    eventIds: string[],
    payload: ManualAttendanceInput,
  ) {
    const uniqueEventIds = Array.from(
      new Set(eventIds.map((eventId) => cleanImportValue(eventId)).filter(Boolean)),
    );
    const totalEvents = uniqueEventIds.length;
    const savedRecords: AttendanceRecord[] = [];

    if (!totalEvents) {
      setManualSaveProgress({
        stage: "completed",
        percent: 100,
        message: "Selected attended event/s are already recorded.",
        processedRows: 0,
        totalRows: 0,
        savedRecords: 0,
        createdFines: 0,
      });
      setDisplayManualSaveProgressPercent(100);
      await waitForNextPaint();

      return savedRecords;
    }

    setManualSaveProgress({
      stage: "preparing",
      percent: 8,
      message: `Preparing ${totalEvents} manual attended event record/s...`,
      processedRows: 0,
      totalRows: totalEvents,
      savedRecords: 0,
      createdFines: 0,
    });
    await waitForNextPaint();

    for (const [index, eventId] of uniqueEventIds.entries()) {
      const currentRecordNumber = index + 1;
      const startPercent = Math.min(90, 12 + (index / totalEvents) * 78);

      setManualSaveProgress({
        stage: "saving",
        percent: startPercent,
        message: `Adding attended event ${currentRecordNumber}/${totalEvents}...`,
        processedRows: index,
        totalRows: totalEvents,
        savedRecords: savedRecords.length,
        createdFines: 0,
      });
      await waitForNextPaint();

      const result = await saveManualAttendanceRecord({
        ...payload,
        eventId,
        noOfAbsences: 0,
      });

      savedRecords.push(...getManualAttendanceSavedRecords(result));

      setManualSaveProgress({
        stage: "syncing",
        percent: Math.min(98, 20 + (currentRecordNumber / totalEvents) * 78),
        message: `Added ${currentRecordNumber}/${totalEvents} attended event record/s. Applying refreshed records...`,
        processedRows: currentRecordNumber,
        totalRows: totalEvents,
        savedRecords: savedRecords.length,
        createdFines: 0,
      });
      await waitForNextPaint();
    }

    return savedRecords;
  }


  function handleOpenBulkAttendeesDialog(event?: AttendanceEvent) {
    setBulkAttendeesForm({
      ...emptyBulkEventAttendeesForm,
      eventId: event?.id ?? "",
      scannedAt: "",
    });
    setBulkAttendeesSaveProgress(null);
    setBulkAttendeesDialogOpen(true);
    setError("");
  }

  function handleClearBulkAttendeesForm() {
    setBulkAttendeesForm(emptyBulkEventAttendeesForm);
    setBulkAttendeesSaveProgress(null);
    setError("");
  }

  async function handleBulkAttendeesSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const eventId = cleanImportValue(bulkAttendeesForm.eventId);
    const selectedEvent = getAttendanceEventById(displayEvents, eventId);
    const attendeeRows = getBulkAttendanceEventAttendeeRows(
      bulkAttendeesForm,
      zeroAttendanceAttendeeOptions,
    );
    const scannedAt =
      normalizeAttendanceDateTimeValue(bulkAttendeesForm.scannedAt) ||
      undefined;

    if (!selectedEvent) {
      setError("Please select an event.");
      toast.error("Please select an event.");
      return;
    }

    if (!attendeeRows.length) {
      setError("Please enter at least one valid attendee.");
      toast.error("Please enter at least one valid attendee.");
      return;
    }

    const existingAttendeeKeys = new Set(
      normalizedRecords
        .filter((record) =>
          recordMatchesAttendanceEventId(record, eventId, displayEvents),
        )
        .map((record) =>
          getBulkAttendanceEventAttendeeKey(record.student_id, record.college),
        ),
    );
    const attendeeRowsToSave = attendeeRows.filter((attendee) => {
      return !existingAttendeeKeys.has(
        getBulkAttendanceEventAttendeeKey(attendee.studentId, attendee.college),
      );
    });
    const skippedExistingCount = attendeeRows.length - attendeeRowsToSave.length;

    if (!attendeeRowsToSave.length) {
      toast.info("Selected attendee/s are already recorded for this event.");
      return;
    }

    setIsSavingBulkAttendees(true);
    setBulkAttendeesSaveProgress({
      stage: "preparing",
      percent: 8,
      message: `Preparing ${attendeeRowsToSave.length} attendee/s...`,
      processedRows: 0,
      totalRows: attendeeRowsToSave.length,
      savedRecords: 0,
      createdFines: 0,
    });
    setError("");

    try {
      const savedRecords: AttendanceRecord[] = [];

      await waitForNextPaint();

      for (const [index, attendee] of attendeeRowsToSave.entries()) {
        const currentRow = index + 1;

        setBulkAttendeesSaveProgress({
          stage: "saving",
          percent: Math.min(
            95,
            12 + Math.round((index / attendeeRowsToSave.length) * 80),
          ),
          message: `Adding attendee ${currentRow}/${attendeeRowsToSave.length}...`,
          processedRows: index,
          totalRows: attendeeRowsToSave.length,
          savedRecords: savedRecords.length,
          createdFines: 0,
        });
        await waitForNextPaint();

        const result = await saveManualAttendanceRecord({
          eventId,
          scannedAt,
          studentId: attendee.studentId,
          name: attendee.name,
          yearLevel: attendee.yearLevel,
          college: attendee.college,
          program: attendee.program,
          institution: attendee.institution,
          noOfAbsences: 0,
          remarks: attendee.remarks,
        });

        savedRecords.push(...getManualAttendanceSavedRecords(result));

        setBulkAttendeesSaveProgress({
          stage: "syncing",
          percent: Math.min(
            98,
            20 + Math.round((currentRow / attendeeRowsToSave.length) * 78),
          ),
          message: `Added ${currentRow}/${attendeeRowsToSave.length} attendee/s. Applying refreshed records...`,
          processedRows: currentRow,
          totalRows: attendeeRowsToSave.length,
          savedRecords: savedRecords.length,
          createdFines: 0,
        });
        await waitForNextPaint();
      }

      const noEventSourceRecordIdsToDelete =
        getAttendanceNoEventSourceRecordIdsForAttendees(
          normalizedRecords,
          attendeeRowsToSave,
        );

      if (noEventSourceRecordIdsToDelete.length) {
        setBulkAttendeesSaveProgress({
          stage: "syncing",
          percent: 99,
          message: `Removing ${noEventSourceRecordIdsToDelete.length} copied no event attendee record/s...`,
          processedRows: attendeeRowsToSave.length,
          totalRows: attendeeRowsToSave.length,
          savedRecords: savedRecords.length || attendeeRowsToSave.length,
          createdFines: 0,
        });
        await waitForNextPaint();

        await Promise.all(
          noEventSourceRecordIdsToDelete.map((recordId) =>
            deleteAttendanceRecord(recordId),
          ),
        );
      }

      const deletedSourceRecordIds = new Set(noEventSourceRecordIdsToDelete);

      if (savedRecords.length || deletedSourceRecordIds.size) {
        setRecords((current) =>
          mergeAttendanceSavedRecords(
            current.filter((record) => !deletedSourceRecordIds.has(record.id)),
            savedRecords,
          ),
        );
        setSelectedRecordIds((current) =>
          current.filter((recordId) => !deletedSourceRecordIds.has(recordId)),
        );
      }

      setBulkAttendeesSaveProgress({
        stage: "completed",
        percent: 100,
        message: "Attendees added successfully.",
        processedRows: attendeeRowsToSave.length,
        totalRows: attendeeRowsToSave.length,
        savedRecords: savedRecords.length || attendeeRowsToSave.length,
        createdFines: 0,
      });
      await waitForNextPaint();
      await loadRecords({ preserveScroll: true });

      setBulkAttendeesDialogOpen(false);
      handleClearBulkAttendeesForm();
      restoreCapturedScrollPosition();
      toast.success(
        `Added ${attendeeRowsToSave.length} attendee/s to ${selectedEvent.name}${
          noEventSourceRecordIdsToDelete.length
            ? `; removed ${noEventSourceRecordIdsToDelete.length} no event record/s`
            : ""
        }${
          skippedExistingCount
            ? `; ${skippedExistingCount} already recorded`
            : ""
        }.`,
      );
    } catch (bulkError) {
      const message =
        bulkError instanceof Error
          ? bulkError.message
          : "Unable to add attendees.";
      setBulkAttendeesSaveProgress((currentProgress) =>
        currentProgress
          ? {
              ...currentProgress,
              stage: "cancelled",
              message: "Adding attendees failed.",
            }
          : currentProgress,
      );
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingBulkAttendees(false);
    }
  }

  async function handleManualSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const studentId = manualForm.studentId.trim();
    const name = manualForm.name.trim();
    const noOfAbsences = Number(manualForm.noOfAbsences);
    const selectedManualEventIds =
      getManualAttendanceSelectedEventIds(manualForm);

    if (!studentId) {
      setError("Student ID is required.");
      toast.error("Student ID is required.");
      return;
    }

    if (!name) {
      setError("Name is required.");
      toast.error("Name is required.");
      return;
    }

    if (!Number.isInteger(noOfAbsences) || noOfAbsences < 0) {
      setError("Count must be zero or a positive whole number.");
      toast.error("Count must be zero or a positive whole number.");
      return;
    }

    const payload: ManualAttendanceInput = {
      schoolYearId: yearFilter !== ALL_YEARS_SELECT_VALUE ? yearFilter : undefined,
      eventId: selectedManualEventIds[0] || undefined,
      scannedAt:
        normalizeAttendanceDateTimeValue(manualForm.scannedAt) || undefined,
      studentId,
      name,
      yearLevel: manualForm.yearLevel.trim(),
      college: manualForm.college.trim(),
      program: manualForm.program.trim(),
      institution: manualForm.institution.trim(),
      noOfAbsences,
      remarks: manualForm.remarks.trim(),
    };
    const now = new Date().toISOString();
    const draftRecord: AttendanceRecord = {
      id: editingRecordId || "manual-attendance-draft",
      school_year_id: payload.schoolYearId ?? null,
      import_id: null,
      event_id: payload.eventId ?? null,
      event_name: null,
      student_id: payload.studentId,
      name: payload.name,
      year_level: payload.yearLevel ?? null,
      college: payload.college ?? null,
      program: payload.program ?? null,
      institution: payload.institution ?? null,
      no_of_absences: payload.noOfAbsences ?? 0,
      remarks: payload.remarks ?? null,
      scanned_at: payload.scannedAt ?? null,
      created_at: now,
      updated_at: now,
    };
    const calculatedZeroAttendanceAbsences = selectedManualEventIds.length
      ? null
      : getManualZeroAttendanceCalculatedAbsenceCount(
          draftRecord,
          normalizedRecords,
        );

    if (calculatedZeroAttendanceAbsences !== null) {
      payload.eventId = undefined;
      payload.noOfAbsences = calculatedZeroAttendanceAbsences;
    }

    setIsSavingManual(true);
    setDisplayManualSaveProgressPercent(0);
    setManualSaveProgress({
      stage: "preparing",
      percent: 8,
      message: editingRecordId
        ? "Preparing attendance update..."
        : "Preparing attendance save...",
      processedRows: 0,
      totalRows: Math.max(1, selectedManualEventIds.length || 1),
      savedRecords: 0,
      createdFines: 0,
    });
    setError("");

    try {
      await waitForNextPaint();
      let affectedRecordCount = 0;
      let savedRecords: AttendanceRecord[] = [];
      let appendedManualEventRecords = false;
      let skippedExistingEventCount = 0;

      if (editingRecordId) {
        const editingRecord = normalizedRecords.find(
          (record) => record.id === editingRecordId,
        );
        const shouldAppendManualEventRecords = Boolean(
          editingRecord &&
            selectedManualEventIds.length &&
            isEventlessAttendanceRecord(editingRecord),
        );

        if (shouldAppendManualEventRecords && editingRecord) {
          appendedManualEventRecords = true;

          const missingEventIds = getMissingAttendanceEventIdsForAttendee(
            normalizedRecords,
            editingRecord,
            selectedManualEventIds,
            events,
          );

          skippedExistingEventCount =
            selectedManualEventIds.length - missingEventIds.length;
          savedRecords = await saveManualAttendanceEventsWithProgress(
            missingEventIds,
            {
              ...payload,
              noOfAbsences: 0,
            },
          );

          const noEventSourceRecordIdsToDelete =
            getAttendanceNoEventSourceRecordIdsForRecords(normalizedRecords, [
              editingRecord,
            ]);

          if (missingEventIds.length && noEventSourceRecordIdsToDelete.length) {
            setManualSaveProgress({
              stage: "syncing",
              percent: 99,
              message: `Removing ${noEventSourceRecordIdsToDelete.length} copied no event attendee record/s...`,
              processedRows: missingEventIds.length,
              totalRows:
                missingEventIds.length + noEventSourceRecordIdsToDelete.length,
              savedRecords: savedRecords.length || missingEventIds.length,
              createdFines: 0,
            });
            await waitForNextPaint();

            await Promise.all(
              noEventSourceRecordIdsToDelete.map((recordId) =>
                deleteAttendanceRecord(recordId),
              ),
            );

            const deletedSourceRecordIds = new Set(noEventSourceRecordIdsToDelete);

            setRecords((current) =>
              current.filter((record) => !deletedSourceRecordIds.has(record.id)),
            );
            setSelectedRecordIds((current) =>
              current.filter((recordId) => !deletedSourceRecordIds.has(recordId)),
            );

            if (noEventSourceRecordIdsToDelete.includes(editingRecord.id)) {
              handleCancelEdit();
            }
          }

          affectedRecordCount = missingEventIds.length;
        } else if (!selectedManualEventIds.length || !editingRecord) {
          const matchingEditRecords = getMatchingAttendanceEditRecords(
            normalizedRecords,
            editingRecordId,
            editingRecordScope,
          );
          const editRecordIds = Array.from(
            new Set([
              editingRecordId,
              ...matchingEditRecords.map((record) => record.id),
            ]),
          );

          savedRecords = await updateAttendanceRecordsWithProgress(
            editRecordIds,
            {
              ...payload,
              eventId: undefined,
            },
          );
          affectedRecordCount = editRecordIds.length;
        } else {
          const usedRecordIds = new Set<string>();

          for (const [index, selectedEventId] of selectedManualEventIds.entries()) {
            const matchingEventRecords =
              getMatchingAttendanceEventRecordsForAttendee(
                normalizedRecords,
                editingRecord,
                selectedEventId,
                events,
              );
            const editRecordIds = matchingEventRecords
              .map((record) => record.id)
              .filter((recordId) => !usedRecordIds.has(recordId));

            if (!editRecordIds.length && !usedRecordIds.has(editingRecord.id)) {
              editRecordIds.push(editingRecord.id);
            }

            if (editRecordIds.length) {
              editRecordIds.forEach((recordId) => usedRecordIds.add(recordId));
              const updatedRecords = await updateAttendanceRecordsWithProgress(
                editRecordIds,
                {
                  ...payload,
                  eventId: selectedEventId,
                  noOfAbsences: 0,
                },
              );

              savedRecords.push(...updatedRecords);
              affectedRecordCount += editRecordIds.length;
              continue;
            }

            const currentEventNumber = affectedRecordCount + 1;

            setManualSaveProgress({
              stage: "saving",
              percent: Math.min(
                95,
                12 + Math.round((index / selectedManualEventIds.length) * 80),
              ),
              message: `Adding attended event ${index + 1}/${selectedManualEventIds.length}...`,
              processedRows: index,
              totalRows: selectedManualEventIds.length,
              savedRecords: savedRecords.length,
              createdFines: 0,
            });
            await waitForNextPaint();

            const result = await saveManualAttendanceRecord({
              ...payload,
              eventId: selectedEventId,
              noOfAbsences: 0,
            });

            const manualSavedRecords =
              getManualAttendanceSavedRecords(result);

            savedRecords.push(...manualSavedRecords);
            if (manualSavedRecords.length) affectedRecordCount += 1;

            setManualSaveProgress({
              stage: "syncing",
              percent: Math.min(
                98,
                20 +
                  Math.round(((index + 1) / selectedManualEventIds.length) * 78),
              ),
              message: `Added attended event ${index + 1}/${selectedManualEventIds.length}. Applying refreshed records...`,
              processedRows: index + 1,
              totalRows: selectedManualEventIds.length,
              savedRecords: savedRecords.length || currentEventNumber,
              createdFines: 0,
            });
            await waitForNextPaint();
          }
        }
      } else if (selectedManualEventIds.length) {
        savedRecords = await saveManualAttendanceEventsWithProgress(
          selectedManualEventIds,
          {
            ...payload,
            noOfAbsences: 0,
          },
        );
        affectedRecordCount = selectedManualEventIds.length;
      } else {
        setManualSaveProgress({
          stage: "saving",
          percent: 45,
          message: "Saving attendance record...",
          processedRows: 0,
          totalRows: 1,
          savedRecords: 0,
          createdFines: 0,
        });
        await waitForNextPaint();

        const result = await saveManualAttendanceRecord({
          ...payload,
          eventId: undefined,
        });
        savedRecords = getManualAttendanceSavedRecords(result);
        affectedRecordCount = savedRecords.length;

        setManualSaveProgress({
          stage: "syncing",
          percent: 96,
          message: "Attendance record saved. Applying refreshed record...",
          processedRows: 1,
          totalRows: 1,
          savedRecords: savedRecords.length || 1,
          createdFines: 0,
        });
        await waitForNextPaint();
      }

      if (savedRecords.length) {
        setRecords((current) => mergeAttendanceSavedRecords(current, savedRecords));
      }

      const shouldRefreshRecords =
        selectedManualEventIds.length > 0 ||
        calculatedZeroAttendanceAbsences !== null ||
        (!savedRecords.length &&
          !(appendedManualEventRecords && skippedExistingEventCount > 0)) ||
        (!appendedManualEventRecords &&
          Boolean(editingRecordId) &&
          selectedManualEventIds.length > 1 &&
          savedRecords.length < affectedRecordCount);

      const completedRecordCount = Math.max(
        affectedRecordCount,
        savedRecords.length,
        selectedManualEventIds.length ? selectedManualEventIds.length : 1,
      );

      setManualSaveProgress({
        stage: "completed",
        percent: 100,
        message: editingRecordId
          ? "Attendance update completed."
          : "Attendance save completed.",
        processedRows: completedRecordCount,
        totalRows: completedRecordCount,
        savedRecords: completedRecordCount,
        createdFines: 0,
      });
      setDisplayManualSaveProgressPercent(100);
      await waitForNextPaint();

      const successMessage = editingRecordId
        ? appendedManualEventRecords
          ? affectedRecordCount > 0
            ? `Attendance attendee linked to ${affectedRecordCount} new event/s and removed from no event${
                skippedExistingEventCount
                  ? `; ${skippedExistingEventCount} already recorded`
                  : ""
              }.`
            : "Selected event/s are already recorded for this attendee."
          : selectedManualEventIds.length
            ? `Attendance attendee linked to ${selectedManualEventIds.length} event/s across ${affectedRecordCount} record/s.`
            : `Attendance attendee updated as no event attended across ${affectedRecordCount} record/s.`
        : selectedManualEventIds.length > 1
          ? `Attendance attendee linked to ${selectedManualEventIds.length} event/s.`
          : "Attendance record saved successfully.";

      handleCancelEdit();
      setManualDialogOpen(false);
      setIsSavingManual(false);
      restoreCapturedScrollPosition();
      toast.success(successMessage);

      if (shouldRefreshRecords) {
        void loadRecords({ preserveScroll: true });
      }
    } catch (manualError) {
      const message =
        manualError instanceof Error
          ? manualError.message
          : "Unable to save attendance record.";
      if (editingRecordId) {
        setManualSaveProgress((currentProgress) =>
          currentProgress
            ? {
                ...currentProgress,
                stage: "cancelled",
                message: "Attendance update failed.",
              }
            : currentProgress,
        );
      }
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingManual(false);
    }
  }

  async function handleEventSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = eventForm.name.trim();
    if (!name) {
      setError("Event name is required.");
      toast.error("Event name is required.");
      return;
    }

    const payload: AttendanceEventInput = {
      schoolYearId: yearFilter !== ALL_YEARS_SELECT_VALUE ? yearFilter : undefined,
      name,
      eventStartAt: eventForm.eventStartAt || undefined,
      eventEndAt: eventForm.eventEndAt || undefined,
      description: eventForm.description.trim(),
    };

    const successMessage = editingEventId
      ? "Event updated successfully."
      : "Event saved successfully.";

    setIsSavingEvent(true);
    setError("");

    try {
      if (editingEventId) {
        await updateAttendanceEvent(editingEventId, payload);
      } else {
        await saveAttendanceEvent(payload);
      }

      await loadRecords({ preserveScroll: true });
      handleCancelEventEdit();
      setEventDialogOpen(false);
      restoreCapturedScrollPosition();
      toast.success(successMessage);
    } catch (eventError) {
      const message =
        eventError instanceof Error
          ? eventError.message
          : "Unable to save event.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingEvent(false);
    }
  }

  function handleEditRecord(
    record: AttendanceRecord,
    scope: AttendanceRecordEditScope = "event-attendee",
  ) {
    const calculatedZeroAttendanceAbsences =
      getManualZeroAttendanceCalculatedAbsenceCount(record, normalizedRecords);
    const recordEventIds = getAttendancePresentEventIdsForAttendee(
      normalizedRecords,
      record,
      events,
    );

    setEditingRecordId(record.id);
    setEditingRecordScope(scope);
    setManualForm({
      eventId: recordEventIds[0] ?? "",
      eventIds: recordEventIds,
      scannedAt: toDateTimeLocalValue(record.scanned_at),
      studentId: record.student_id,
      name: record.name,
      yearLevel: record.year_level ?? "",
      college: record.college ?? "",
      program: record.program ?? "",
      institution: record.institution ?? DEFAULT_STUDENT_INSTITUTION,
      noOfAbsences: String(
        calculatedZeroAttendanceAbsences ?? record.no_of_absences ?? 0,
      ),
      remarks: record.remarks ?? "",
    });
    setManualDialogOpen(true);
    setManualSaveProgress(null);
    setDisplayManualSaveProgressPercent(0);
    setError("");
  }

  function handleCancelEdit() {
    setEditingRecordId("");
    setEditingRecordScope("event-attendee");
    setManualForm(emptyManualAttendanceForm);
    setManualSaveProgress(null);
    setDisplayManualSaveProgressPercent(0);
    setError("");
  }

  function handleEditEvent(record: AttendanceEvent) {
    setEditingEventId(record.id);
    setEventForm({
      name: record.name,
      eventStartAt: toDateTimeLocalValue(record.event_start_at),
      eventEndAt: toDateTimeLocalValue(record.event_end_at),
      description: record.description ?? "",
    });
    setEventDialogOpen(true);
    setError("");
  }

  function handleCancelEventEdit() {
    setEditingEventId("");
    setEventForm(emptyAttendanceEventForm);
    setError("");
  }

  async function handleAddSelectedRecordsToSelectedEvents(recordIds: string[]) {
    const selectedRecordIdSet = new Set(
      recordIds.map((recordId) => cleanImportValue(recordId)).filter(Boolean),
    );
    const targetEventIds: string[] = Array.from(
      new Set(
        selectedEventIds
          .map((eventId) => cleanImportValue(eventId))
          .filter((eventId): eventId is string =>
            Boolean(eventId) && displayEvents.some((event) => event.id === eventId),
          ),
      ),
    );

    if (!selectedRecordIdSet.size) {
      toast.error("Please select no event attendee/s to add.");
      return;
    }

    if (!targetEventIds.length) {
      toast.error("Please select target event/s first.");
      return;
    }

    const selectedNoEventRecords = mergedRecords
      .filter((record) => selectedRecordIdSet.has(record.id))
      .filter(isEventlessAttendanceRecord)
      .filter((record) => {
        return cleanImportValue(record.student_id) && cleanImportValue(record.name);
      })
      .sort((leftRecord, rightRecord) =>
        getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord),
      );
    const attendeeRecordsByKey = new Map<string, AttendanceRecord>();

    selectedNoEventRecords.forEach((record) => {
      const attendeeKey = getBulkAttendanceEventAttendeeKey(
        record.student_id,
        record.college,
      );

      if (!attendeeRecordsByKey.has(attendeeKey)) {
        attendeeRecordsByKey.set(attendeeKey, record);
      }
    });

    const attendeeRecords = Array.from(attendeeRecordsByKey.values());

    if (!attendeeRecords.length) {
      toast.error("Selected record/s cannot be added to events.");
      return;
    }

    const recordsToSave = attendeeRecords.flatMap((record) => {
      return targetEventIds
        .filter((eventId) => {
          return !getMatchingAttendanceEventRecordsForAttendee(
            normalizedRecords,
            record,
            eventId,
            displayEvents,
          ).length;
        })
        .map((eventId) => ({ eventId, record }));
    });
    const skippedExistingCount =
      attendeeRecords.length * targetEventIds.length - recordsToSave.length;

    if (!recordsToSave.length) {
      toast.info(
        "Selected attendee/s are already recorded for the selected event/s.",
      );
      return;
    }

    const noEventSourceRecordIdsToDelete =
      getAttendanceNoEventSourceRecordIdsForRecords(
        normalizedRecords,
        recordsToSave.map((item) => item.record),
      );
    const totalAddSteps =
      recordsToSave.length + noEventSourceRecordIdsToDelete.length + 1;
    let processedAddSteps = 0;
    let savedRecordSteps = 0;
    let deletedSourceRecordSteps = 0;

    const updateSelectedRecordsAddProgress = (
      message: string,
      currentEventName = "",
    ) => {
      setSelectedRecordsAddProgress({
        processedSteps: processedAddSteps,
        totalSteps: totalAddSteps,
        totalRecords: recordsToSave.length,
        savedRecords: savedRecordSteps,
        deletedSourceRecords: deletedSourceRecordSteps,
        percent: totalAddSteps
          ? Math.min(
              100,
              Math.max(0, Math.round((processedAddSteps / totalAddSteps) * 100)),
            )
          : 0,
        message,
        currentEventName,
      });
    };

    setIsAddingSelectedRecordsToEvents(true);
    setSelectedRecordsAddProgress(null);
    setError("");
    updateSelectedRecordsAddProgress(
      `Preparing to add ${recordsToSave.length} attendee record/s...`,
    );

    try {
      const savedRecords: AttendanceRecord[] = [];

      for (const [index, item] of recordsToSave.entries()) {
        const targetEvent = getAttendanceEventById(displayEvents, item.eventId);
        const currentEventName = targetEvent?.name ?? "Selected event";

        updateSelectedRecordsAddProgress(
          `Adding attendee ${index + 1}/${recordsToSave.length}...`,
          currentEventName,
        );

        const scannedAt =
          normalizeAttendanceDateTimeValue(
            item.record.scanned_at ?? item.record.created_at,
          ) || undefined;
        const result = await saveManualAttendanceRecord({
          schoolYearId:
            yearFilter !== ALL_YEARS_SELECT_VALUE ? yearFilter : undefined,
          eventId: String(item.eventId),
          scannedAt,
          studentId: cleanImportValue(item.record.student_id).toUpperCase(),
          name: cleanImportValue(item.record.name),
          yearLevel: cleanImportValue(item.record.year_level),
          college: cleanImportValue(item.record.college),
          program: cleanImportValue(item.record.program),
          institution:
            cleanImportValue(item.record.institution) ||
            DEFAULT_STUDENT_INSTITUTION,
          noOfAbsences: 0,
          remarks: cleanImportValue(item.record.remarks),
        });

        savedRecords.push(...getManualAttendanceSavedRecords(result));
        processedAddSteps += 1;
        savedRecordSteps += 1;
        updateSelectedRecordsAddProgress(
          `Added attendee ${savedRecordSteps}/${recordsToSave.length}.`,
          currentEventName,
        );
      }

      for (const [index, recordId] of noEventSourceRecordIdsToDelete.entries()) {
        updateSelectedRecordsAddProgress(
          `Removing no event source ${index + 1}/${noEventSourceRecordIdsToDelete.length}...`,
        );
        await deleteAttendanceRecord(recordId);
        processedAddSteps += 1;
        deletedSourceRecordSteps += 1;
        updateSelectedRecordsAddProgress(
          `Removed no event source ${deletedSourceRecordSteps}/${noEventSourceRecordIdsToDelete.length}.`,
        );
      }

      const deletedSourceRecordIds = new Set(noEventSourceRecordIdsToDelete);

      if (savedRecords.length || deletedSourceRecordIds.size) {
        setRecords((current) =>
          mergeAttendanceSavedRecords(
            current.filter((record) => !deletedSourceRecordIds.has(record.id)),
            savedRecords,
          ),
        );
        setSelectedRecordIds((current) =>
          current.filter((recordId) => !deletedSourceRecordIds.has(recordId)),
        );
      }

      updateSelectedRecordsAddProgress("Refreshing attendance records...");
      await loadRecords({ preserveScroll: true });
      processedAddSteps = totalAddSteps;
      updateSelectedRecordsAddProgress("Finished adding selected attendee/s.");
      restoreCapturedScrollPosition();
      toast.success(
        `Added ${recordsToSave.length} selected attendee record/s to selected event/s${
          noEventSourceRecordIdsToDelete.length
            ? `; removed ${noEventSourceRecordIdsToDelete.length} no event record/s`
            : ""
        }${
          skippedExistingCount
            ? `; ${skippedExistingCount} already recorded`
            : ""
        }.`,
      );
    } catch (addError) {
      const message =
        addError instanceof Error
          ? addError.message
          : "Unable to add selected attendee/s to event/s.";
      setError(message);
      toast.error(message);
      updateSelectedRecordsAddProgress("Reloading attendance records...");
      await loadRecords({ preserveScroll: true });
    } finally {
      setIsAddingSelectedRecordsToEvents(false);

      if (typeof window === "undefined") {
        setSelectedRecordsAddProgress(null);
      } else {
        window.setTimeout(() => setSelectedRecordsAddProgress(null), 600);
      }
    }
  }

  async function handleDeleteRecord(id: string) {
    setDeletingRecordId(id);
    setError("");

    try {
      await deleteAttendanceRecord(id);
      await loadRecords({ preserveScroll: true });

      if (editingRecordId === id) {
        handleCancelEdit();
      }

      toast.success("Attendance record deleted successfully.");
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete attendance record.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingRecordId("");
    }
  }

  async function handleDeleteEvents(ids: string[]) {
    const idsToDelete = Array.from(new Set(ids)).filter(Boolean);

    if (!idsToDelete.length) {
      toast.error("Please select event/s to delete.");
      return;
    }

    const eventNameById = new Map(
      displayEvents.map((event) => [event.id, event.name]),
    );
    const totalEvents = idsToDelete.length;
    let deletedEvents = 0;

    setIsDeletingEvents(true);
    setDeletingEventId("");
    setEventDeleteProgress({
      processedEvents: 0,
      totalEvents,
      percent: 1,
      message: `Preparing to delete ${totalEvents} event/s...`,
      currentEventName: "",
    });
    setError("");

    try {
      await waitForNextPaint();

      for (const id of idsToDelete) {
        const eventName = eventNameById.get(id) ?? "Selected event";
        const startingPercent = Math.max(
          1,
          Math.round((deletedEvents / totalEvents) * 100),
        );

        setDeletingEventId(id);
        setEventDeleteProgress({
          processedEvents: deletedEvents,
          totalEvents,
          percent: startingPercent,
          message: `Deleting ${eventName}...`,
          currentEventName: eventName,
        });
        await waitForNextPaint();

        await deleteAttendanceEvent(id);
        deletedEvents += 1;

        setEventDeleteProgress({
          processedEvents: deletedEvents,
          totalEvents,
          percent: Math.round((deletedEvents / totalEvents) * 100),
          message:
            deletedEvents === totalEvents
              ? "Finalizing event deletion..."
              : `Deleted ${deletedEvents} of ${totalEvents} event/s.`,
          currentEventName: eventName,
        });
        await waitForNextPaint();
      }

      await loadRecords({ preserveScroll: true });

      if (editingEventId && idsToDelete.includes(editingEventId)) {
        handleCancelEventEdit();
      }

      if (uploadEventId && idsToDelete.includes(uploadEventId)) {
        setUploadEventId("");
      }

      setSelectedEventIds((current) =>
        current.filter((eventId) => !idsToDelete.includes(eventId)),
      );
      setEventDeleteProgress({
        processedEvents: deletedEvents,
        totalEvents,
        percent: 100,
        message: "Event deletion completed.",
        currentEventName: "",
      });

      toast.success(`${deletedEvents} event/s deleted successfully.`);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete event/s.";
      setEventDeleteProgress({
        processedEvents: deletedEvents,
        totalEvents,
        percent: Math.round((deletedEvents / totalEvents) * 100),
        message: "Event deletion failed.",
        currentEventName: "",
      });
      setError(message);
      toast.error(message);
      await loadRecords({ preserveScroll: true });
    } finally {
      setIsDeletingEvents(false);
      setDeletingEventId("");
      setEventDeleteProgress(null);
    }
  }

  async function handleDeleteEvent(id: string) {
    await handleDeleteEvents([id]);
  }

  async function handleDeleteImport(id: string) {
    setDeletingImportId(id);
    setError("");

    try {
      await deleteAttendanceImport(id);
      await loadRecords({ preserveScroll: true });

      if (saved?.importId === id) {
        setSaved(null);
      }

      toast.success("Attendance import deleted successfully.");
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete attendance import.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingImportId("");
    }
  }

  async function handleDeleteAllImports() {
    if (!imports.length) {
      toast.error("No attendance imports to delete.");
      return;
    }

    setIsDeletingImports(true);
    setError("");

    try {
      const result = await deleteAllAttendanceImports();
      await loadRecords({ preserveScroll: true });
      setSaved(null);
      toast.success(
        `${result?.deletedCount ?? imports.length} attendance import/s deleted successfully.`,
      );
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete attendance imports.";
      setError(message);
      toast.error(message);
      await loadRecords({ preserveScroll: true });
    } finally {
      setIsDeletingImports(false);
    }
  }

  async function handleDeleteRecords(ids: string[]) {
    const idsToDelete = Array.from(new Set(ids)).filter(Boolean);

    if (!idsToDelete.length) {
      toast.error("Please select attendance record/s to delete.");
      return;
    }

    setIsDeletingBulk(true);
    setError("");

    try {
      await Promise.all(idsToDelete.map((id) => deleteAttendanceRecord(id)));
      await loadRecords({ preserveScroll: true });

      if (editingRecordId && idsToDelete.includes(editingRecordId)) {
        handleCancelEdit();
      }

      setSelectedRecordIds((current) =>
        current.filter((recordId) => !idsToDelete.includes(recordId)),
      );

      toast.success(
        `${idsToDelete.length} attendance record/s deleted successfully.`,
      );
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete attendance records.";
      setError(message);
      toast.error(message);
      await loadRecords({ preserveScroll: true });
    } finally {
      setIsDeletingBulk(false);
    }
  }

  async function handleTransferSelectedSchoolYearRecords() {
    if (!selectedRecordIds.length && !selectedEventIds.length) {
      toast.error("Please select attendance record/s or event/s to transfer.");
      return;
    }

    if (!transferTargetSchoolYearId) {
      toast.error("Please select a target school year.");
      return;
    }

    setIsTransferringSchoolYearRecords(true);
    setError("");

    try {
      await transferSchoolYearRecords({
        targetSchoolYearId: transferTargetSchoolYearId,
        eventIds: selectedEventIds,
        attendanceRecordIds: selectedRecordIds,
      });
      setSelectedEventIds([]);
      setSelectedRecordIds([]);
      await loadRecords({ preserveScroll: true });
      toast.success("Selected record/s transferred successfully.");
    } catch (transferError) {
      const message =
        transferError instanceof Error
          ? transferError.message
          : "Unable to transfer selected records.";
      setError(message);
      toast.error(message);
    } finally {
      setIsTransferringSchoolYearRecords(false);
    }
  }

  useEffect(() => {
    const visibleEventIds = new Set(displayEvents.map((event) => event.id));

    setSelectedEventIds((current) => {
      const nextSelectedEventIds = current.filter((eventId) =>
        visibleEventIds.has(eventId),
      );

      return nextSelectedEventIds.length === current.length
        ? current
        : nextSelectedEventIds;
    });
  }, [displayEvents]);

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        scrollRestoreFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      }

      saveAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const snapshot = readResumableAttendanceImportSnapshot();
    if (!snapshot) return;

    setResumableImportSnapshot(snapshot);
    setPreview(snapshot.preview);
    setUploadEventId(snapshot.options.eventId);
    setUploadEventName(snapshot.options.eventName);
    setUploadEventStartAt(snapshot.options.eventStartAt);
    setUploadEventEndAt(snapshot.options.eventEndAt);
    setUploadEventDescription(snapshot.options.eventDescription);
    setSaveProgress({
      stage: "cancelled",
      percent: snapshot.rows.length
        ? Math.round((snapshot.processedRows / snapshot.rows.length) * 100)
        : 0,
      message: "Attendance import can be resumed where it left off.",
      processedRows: snapshot.processedRows,
      totalRows: snapshot.rows.length,
      savedRecords: snapshot.savedRecordsCount,
      createdFines: snapshot.createdFinesCount,
    });
  }, []);

  useEffect(() => {
    if (
      yearFilter !== ALL_YEARS_SELECT_VALUE &&
      !yearFilterOptions.includes(yearFilter)
    ) {
      setYearFilter(ALL_YEARS_SELECT_VALUE);
    }
  }, [yearFilter, yearFilterOptions]);

  useEffect(() => {
    if (
      eventFilter !== ALL_EVENTS_SELECT_VALUE &&
      !eventFilterOptions.some((option) => option.value === eventFilter)
    ) {
      setEventFilter(ALL_EVENTS_SELECT_VALUE);
    }
  }, [eventFilter, eventFilterOptions]);

  useEffect(() => {
    if (
      collegeFilter !== ALL_COLLEGES_SELECT_VALUE &&
      !collegeFilterOptions.includes(collegeFilter)
    ) {
      setCollegeFilter(ALL_COLLEGES_SELECT_VALUE);
    }
  }, [collegeFilter, collegeFilterOptions]);

  useEffect(() => {
    const targetPercent = getSaveProgressPercent(saveProgress, isSaving);

    setDisplaySaveProgressPercent((currentPercent) => {
      if (!isSaving && !saveProgress) return 0;
      if (targetPercent >= 100) return 100;
      return Math.max(currentPercent, targetPercent);
    });

    if (!isSaving || targetPercent >= 100 || typeof window === "undefined")
      return;

    const intervalId = window.setInterval(() => {
      setDisplaySaveProgressPercent((currentPercent) => {
        const latestPercent = getSaveProgressPercent(saveProgress, isSaving);
        const nextBasePercent = Math.max(currentPercent, latestPercent);
        const ceilingPercent =
          saveProgress?.stage === "syncing"
            ? 98
            : Math.min(95, latestPercent + 3);

        if (nextBasePercent >= ceilingPercent) return nextBasePercent;
        return Math.min(ceilingPercent, nextBasePercent + 1);
      });
    }, 700);

    return () => window.clearInterval(intervalId);
  }, [isSaving, saveProgress]);

  useEffect(() => {
    const targetPercent = getSaveProgressPercent(
      manualSaveProgress,
      isSavingManual,
    );

    setDisplayManualSaveProgressPercent((currentPercent) => {
      if (!isSavingManual && !manualSaveProgress) return 0;
      if (targetPercent >= 100) return 100;
      return Math.max(currentPercent, targetPercent);
    });

    if (
      !isSavingManual ||
      targetPercent >= 100 ||
      typeof window === "undefined"
    )
      return;

    const intervalId = window.setInterval(() => {
      setDisplayManualSaveProgressPercent((currentPercent) => {
        const latestPercent = getSaveProgressPercent(
          manualSaveProgress,
          isSavingManual,
        );
        const nextBasePercent = Math.max(currentPercent, latestPercent);
        const ceilingPercent =
          manualSaveProgress?.stage === "saving"
            ? 90
            : manualSaveProgress?.stage === "syncing"
              ? 98
              : Math.min(95, latestPercent + 10);

        if (nextBasePercent >= ceilingPercent) return nextBasePercent;
        return Math.min(ceilingPercent, nextBasePercent + 2);
      });
    }, 350);

    return () => window.clearInterval(intervalId);
  }, [isSavingManual, manualSaveProgress]);

  useEffect(() => {
    void loadRecords();
  }, []);

  return (
    <main className="min-h-screen min-w-0 max-w-full overflow-x-hidden wrap-break-word bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-full min-w-0">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Attendance
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Upload and manage attendance
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AttendanceEventDialog
              open={eventDialogOpen}
              onOpenChange={(open) => {
                setEventDialogOpen(open);
                if (!open) handleCancelEventEdit();
              }}
              form={eventForm}
              editingEventId={editingEventId}
              isSaving={isSavingEvent}
              onSubmit={handleEventSubmit}
              onClear={handleCancelEventEdit}
              onChange={updateEventForm}
            />
            <BulkEventAttendeesDialog
              open={bulkAttendeesDialogOpen}
              onOpenChange={(open) => {
                if (isSavingBulkAttendees) return;

                setBulkAttendeesDialogOpen(open);
                if (!open) handleClearBulkAttendeesForm();
              }}
              events={displayEvents}
              zeroAttendanceAttendees={zeroAttendanceAttendeeOptions}
              form={bulkAttendeesForm}
              isSaving={isSavingBulkAttendees}
              progress={bulkAttendeesSaveProgress}
              progressPercent={bulkAttendeesSaveProgressPercent}
              progressMessage={bulkAttendeesSaveProgressMessage}
              progressRowText={bulkAttendeesSaveProgressRowText}
              onSubmit={handleBulkAttendeesSubmit}
              onClear={handleClearBulkAttendeesForm}
              onChange={updateBulkAttendeesForm}
            />
            <ManualAttendanceDialog
              open={manualDialogOpen}
              onOpenChange={(open) => {
                if (isSavingManual) return;

                setManualDialogOpen(open);
                if (!open) handleCancelEdit();
              }}
              events={manualDialogEvents}
              form={manualForm}
              editingRecordId={editingRecordId}
              isSaving={isSavingManual}
              updateProgress={manualSaveProgress}
              updateProgressPercent={manualSaveProgressPercent}
              updateProgressMessage={manualSaveProgressMessage}
              updateProgressRowText={manualSaveProgressRowText}
              onSubmit={handleManualSubmit}
              onClear={handleCancelEdit}
              onChange={updateManualForm}
            />
            <AttendanceRecordSearchDialog
              open={recordSearchDialogOpen}
              onOpenChange={setRecordSearchDialogOpen}
              query={recordSearchQuery}
              records={recordSearchResults}
              allRecords={yearFilteredRecords}
              studentSummaries={recordSearchStudentSummaries}
              deletingRecordId={deletingRecordId}
              isDeletingBulk={isDeletingBulk}
              onEditRecord={(record) => {
                setRecordSearchDialogOpen(false);
                handleEditRecord(record, "search-student-college");
              }}
              onDeleteRecord={handleDeleteRecord}
              onOpenStudentEvents={handleOpenStudentEvents}
            />
            <AttendanceStudentEventsDialog
              open={studentEventsDialogOpen}
              onOpenChange={(open) => {
                setStudentEventsDialogOpen(open);
                if (!open) setStudentEventsDialogState(null);
              }}
              student={studentEventsDialogState}
              events={events}
            />
            <div className="flex min-w-0 flex-col gap-1 sm:items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadRecords({ preserveScroll: true })}
                disabled={isLoadingRecords}
                className="min-h-11 rounded-xl px-5 py-2"
              >
                {isLoadingRecords ? "Loading..." : "Refresh"}
              </Button>
              {isLoadingRecords ? (
                <div className="w-full max-w-sm space-y-2 rounded-2xl border bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 text-xs font-black text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {recordLoadProgress.message ||
                        "Loading attendance records..."}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {recordLoadProgressPercent}%
                    </span>
                  </div>
                  <Progress value={recordLoadProgressPercent} />
                  <p className="text-xs font-semibold leading-5 text-muted-foreground sm:text-right">
                    {recordLoadProgress.detail ||
                      "Loading attendance records, events, and import history from the server. This may take a few seconds when there are many saved records."}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 max-w-full items-start gap-6 xl:grid-cols-2">
          <section className="min-w-0 max-w-full space-y-4">
            <FileDropZone
              file={file}
              isDragging={isDragging}
              onFileChange={handleUploadFileChange}
              onDragStateChange={setIsDragging}
            />

            {file ? (
              <section className="min-w-0 max-w-full overflow-hidden rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-black">Upload event</h2>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Use the event/s detected in the file, select an existing
                    event, or enter a new event name only when the file has no
                    event column.
                  </p>
                </div>
                <div className="mt-5">
                  <EventFields
                    events={displayEvents}
                    fileEventNames={previewEventNames}
                    eventId={uploadEventId}
                    eventName={uploadEventName}
                    eventStartAt={uploadEventStartAt}
                    eventEndAt={uploadEventEndAt}
                    eventDescription={uploadEventDescription}
                    onEventIdChange={handleUploadEventIdChange}
                    onEventNameChange={setUploadEventName}
                    onEventStartAtChange={setUploadEventStartAt}
                    onEventEndAtChange={setUploadEventEndAt}
                    onEventDescriptionChange={setUploadEventDescription}
                  />
                </div>
              </section>
            ) : null}

            {resumableImportSnapshot ? (
              <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                      Resumable import
                    </p>
                    <p className="mt-1 wrap-break-word text-sm font-semibold">
                      {resumableImportSnapshot.fileName}
                    </p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">
                      {resumableImportSnapshot.processedRows}/
                      {resumableImportSnapshot.rows.length} row/s saved
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearResumableImportSnapshot}
                    disabled={isSaving}
                    className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
                  >
                    Discard
                  </Button>
                </div>
              </section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={!file || isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isPreviewing ? "Previewing..." : "Preview File"}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!uploadEventReady || isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isSaving
                  ? `Saving ${saveProgressPercent}%`
                  : resumableImportSnapshot
                    ? "Resume Import"
                    : "Save Import"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelSave}
                disabled={!isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                Cancel Import
              </Button>
            </div>

            {isSaving || saveProgress ? (
              <section
                className="min-w-0 rounded-3xl border bg-card p-4 shadow-sm sm:p-6"
                aria-live="polite"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                      Saving progress
                    </p>
                    <p className="mt-1 wrap-break-word text-sm font-semibold">
                      {saveProgressMessage}
                    </p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full border bg-background px-3 py-1 text-sm font-black">
                    {saveProgressPercent}%
                  </span>
                </div>
                <Progress
                  value={saveProgressPercent}
                  className="mt-4 h-3 w-full min-w-0"
                />
                <div className="mt-3 grid min-w-0 gap-1 text-xs font-bold text-muted-foreground sm:grid-cols-2 sm:items-center">
                  <span className="wrap-break-word">{saveProgressRowText}</span>
                  <span className="wrap-break-word sm:text-right">
                    {saveProgress?.savedRecords ?? 0} record/s saved
                  </span>
                </div>
              </section>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Attendance imported successfully. Created{" "}
                {saveProgress?.createdFines ?? saved.createdFines.length} fine
                record/s.
              </div>
            ) : null}

            <AttendanceResponsivePanel
              title="Events"
              summary={`${displayEvents.length} event/s${
                selectedEventCount ? ` • ${selectedEventCount} selected` : ""
              }`}
              description="View, edit, select, and delete attendance events."
            >
              {displayEvents.length ? (
                <div className="space-y-3">
                  <div className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        checked={eventHeaderChecked}
                        onCheckedChange={handleToggleAllEvents}
                        aria-label="Select attendance events"
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="wrap-break-word text-sm font-black">
                          Select attendance events
                        </p>
                        <p className="wrap-break-word text-xs font-semibold text-muted-foreground">
                          {displayEvents.length} event/s shown
                          {selectedEventCount
                            ? ` • ${selectedEventCount} selected`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <DeleteAttendanceRecordsConfirmation
                      label="Delete Selected"
                      title="Delete selected events?"
                      description={`This will permanently delete ${selectedEventCount} selected event/s and their linked attendance records.`}
                      isDeleting={isDeletingEvents}
                      disabled={!selectedEventCount}
                      onConfirm={() => handleDeleteEvents(selectedEventIds)}
                      className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
                    />
                  </div>

                  {isDeletingEvents || eventDeleteProgress ? (
                    <section
                      className="rounded-2xl border bg-background px-4 py-3"
                      aria-live="polite"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                            Deleting events
                          </p>
                          <p className="mt-1 wrap-break-word text-sm font-semibold">
                            {eventDeleteProgress?.message ??
                              "Preparing event deletion..."}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs font-black">
                          {eventDeleteProgressPercent}%
                        </span>
                      </div>
                      <Progress
                        value={eventDeleteProgressPercent}
                        className="mt-3 h-3 w-full min-w-0"
                      />
                      <div className="mt-2 flex min-w-0 flex-col gap-1 text-xs font-bold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span className="wrap-break-word">
                          {eventDeleteProgress
                            ? `${eventDeleteProgress.processedEvents}/${eventDeleteProgress.totalEvents} event/s deleted`
                            : "Preparing event/s..."}
                        </span>
                        {eventDeleteProgress?.currentEventName ? (
                          <span className="wrap-break-word sm:text-right">
                            {eventDeleteProgress.currentEventName}
                          </span>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  {displayEvents.map((event) => (
                    <article
                      key={event.id}
                      className="min-w-0 rounded-2xl border bg-background p-4 wrap-break-word"
                    >
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <Checkbox
                            checked={selectedEventIdsSet.has(event.id)}
                            onCheckedChange={(checked) =>
                              handleToggleEventSelected(event.id, checked)
                            }
                            aria-label={`Select ${event.name}`}
                            className="mt-1 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="wrap-break-word font-black">
                              {event.name}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatEventSchedule(event)} •{" "}
                              {event.attendees_count} attendee/s
                            </p>
                            {event.description ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                {event.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenBulkAttendeesDialog(event)}
                            disabled={isDeletingEvents}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Add Attendees
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditEvent(event)}
                            disabled={isDeletingEvents}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeleteEventConfirmation
                            event={event}
                            isDeleting={deletingEventId === event.id}
                            disabled={isDeletingEvents && deletingEventId !== event.id}
                            onConfirm={handleDeleteEvent}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No events yet.
                </div>
              )}
            </AttendanceResponsivePanel>

            <AttendanceResponsivePanel
              title="Imported files"
              summary={`${imports.length} imported file/s`}
              description="View imported files and delete imports with their linked attendance records and fines."
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-muted-foreground">
                  Delete imported files and the attendance records created from
                  them.
                </p>
                <DeleteAttendanceRecordsConfirmation
                  label="Delete All Imports"
                  title="Delete all imported files?"
                  description={`This will permanently delete all ${imports.length} imported file/s and their linked attendance records and fines.`}
                  isDeleting={isDeletingImports}
                  disabled={!imports.length}
                  onConfirm={handleDeleteAllImports}
                  className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
                />
              </div>

              {imports.length ? (
                <div className="space-y-3">
                  {imports.map((attendanceImport) => (
                    <article
                      key={attendanceImport.id}
                      className="min-w-0 rounded-2xl border bg-background p-4 wrap-break-word"
                    >
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all font-black">
                            {attendanceImport.file_name}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {attendanceImport.rows_valid} valid row/s •{" "}
                            {attendanceImport.rows_invalid} invalid row/s •{" "}
                            {formatDate(attendanceImport.created_at)}
                          </p>
                          {attendanceImport.event_name ? (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {attendanceImport.event_name}
                            </p>
                          ) : null}
                        </div>
                        <DeleteAttendanceImportConfirmation
                          attendanceImport={attendanceImport}
                          isDeleting={
                            deletingImportId === attendanceImport.id ||
                            isDeletingImports
                          }
                          onConfirm={handleDeleteImport}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No imported files yet.
                </div>
              )}
            </AttendanceResponsivePanel>
          </section>

          <AttendanceResponsivePanel
            title="Preview result"
            summary={
              preview
                ? `${preview.rowsValid} valid / ${preview.rowsInvalid} invalid`
                : "No preview yet"
            }
            description="View the parsed attendance file preview, row counts, and validation status."
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              {preview ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">
                      Total
                    </p>
                    <p className="font-black">{preview.rowsTotal}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">
                      Valid
                    </p>
                    <p className="font-black">{preview.rowsValid}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">
                      Invalid
                    </p>
                    <p className="font-black">{preview.rowsInvalid}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {preview ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Row</th>
                      <th className="px-3 py-3">Event</th>
                      <th className="px-3 py-3">Event Start At</th>
                      <th className="px-3 py-3">Event End At</th>
                      <th className="px-3 py-3">Scanned At</th>
                      <th className="px-3 py-3">Student ID</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Total</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 30).map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.studentId}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-3 py-3 font-semibold">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-3">
                          {row.eventName || uploadEventName || "—"}
                        </td>
                        <td className="px-3 py-3">
                          {formatDateTime(
                            row.eventStartAt || uploadEventStartAt,
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {formatDateTime(row.eventEndAt || uploadEventEndAt)}
                        </td>
                        <td className="px-3 py-3">
                          {formatDateTime(row.scannedAt)}
                        </td>
                        <td className="px-3 py-3">{row.studentId || "—"}</td>
                        <td className="px-3 py-3">{row.name || "—"}</td>
                        <td className="px-3 py-3">{row.noOfAbsences ?? 0}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {row.remarks || "—"}
                        </td>
                        <td className="px-3 py-3">
                          {row.errors.length ? (
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                              {row.errors.join(" ")}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 30 ? (
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">
                    Showing first 30 rows only.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-8 text-center text-sm font-semibold text-muted-foreground">
                No preview yet.
              </div>
            )}

            {invalidRows.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-black">Rows that need review</p>
                <p className="mt-1">
                  {invalidRows.length} invalid row/s will not be saved.
                </p>
              </div>
            ) : null}
          </AttendanceResponsivePanel>
        </div>

        <div className="mt-6">
          <AttendanceResponsivePanel
            title="Attendance records by year"
            summary={`${filteredRecordCount} shown from ${yearFilteredRecords.length} ${selectedYearLabel.toLowerCase()} record/s`}
            description="Search, filter by year, event, and college, then select, edit, or delete attendance records."
          >
            <div className="mb-4 grid gap-3 lg:grid-cols-3 lg:items-start">
              <form
                onSubmit={handleSearchRecords}
                className="flex min-w-0 flex-col gap-2"
              >
                <Label htmlFor="attendance-record-search" className="sr-only">
                  Search attendance records
                </Label>
                <Input
                  id="attendance-record-search"
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="Search Student ID or name"
                  className="min-h-10 rounded-2xl"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="min-h-10 w-full rounded-2xl px-4 py-2 text-xs font-black"
                >
                  Search Records
                </Button>
              </form>

              <div className="grid min-w-0 gap-2">
                <div className="w-full">
                  <Label htmlFor="attendance-year-filter" className="sr-only">
                    Year filter
                  </Label>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger
                      id="attendance-year-filter"
                      className={tableFilterSelectTriggerClassName}
                    >
                      <SelectValue
                        placeholder="Filter by school year"
                        className="truncate"
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 max-w-80">
                      <SelectItem
                        value={ALL_YEARS_SELECT_VALUE}
                        className="max-w-full truncate"
                      >
                        All school years
                      </SelectItem>
                      {yearFilterOptions.map((year) => (
                        <SelectItem
                          key={year}
                          value={year}
                          className="max-w-full truncate"
                        >
                          {getSchoolYearLabel(schoolYears, year)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full">
                  <Label htmlFor="attendance-event-filter" className="sr-only">
                    Event filter
                  </Label>
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger
                      id="attendance-event-filter"
                      className={tableFilterSelectTriggerClassName}
                    >
                      <SelectValue
                        placeholder="Switch event"
                        className="truncate"
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 max-w-80">
                      <SelectItem
                        value={ALL_EVENTS_SELECT_VALUE}
                        className="max-w-full truncate"
                      >
                        All events
                      </SelectItem>
                      {eventFilterOptions.map((eventOption) => (
                        <SelectItem
                          key={eventOption.value}
                          value={eventOption.value}
                          className="max-w-full truncate"
                        >
                          {eventOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full">
                  <Label
                    htmlFor="attendance-college-filter"
                    className="sr-only"
                  >
                    College filter
                  </Label>
                  <Select
                    value={collegeFilter}
                    onValueChange={setCollegeFilter}
                  >
                    <SelectTrigger
                      id="attendance-college-filter"
                      className={tableFilterSelectTriggerClassName}
                    >
                      <SelectValue
                        placeholder="Filter by college"
                        className="truncate"
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 max-w-80">
                      <SelectItem
                        value={ALL_COLLEGES_SELECT_VALUE}
                        className="max-w-full truncate"
                      >
                        All colleges
                      </SelectItem>
                      {collegeFilterOptions.map((college) => (
                        <SelectItem
                          key={college}
                          value={college}
                          className="max-w-full truncate"
                        >
                          {college === NO_COLLEGE_SELECT_VALUE
                            ? "No college"
                            : college}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                {selectedRecordCount || selectedEventCount ? (
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    {selectedRecordCount} record/s, {selectedEventCount} event/s selected
                  </p>
                ) : null}
                <Select
                  value={transferTargetSchoolYearId}
                  onValueChange={setTransferTargetSchoolYearId}
                >
                  <SelectTrigger className="min-h-10 w-full rounded-2xl px-4 py-2 text-xs font-black">
                    <SelectValue placeholder="Target school year" />
                  </SelectTrigger>
                  <SelectContent>
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
                  disabled={
                    (!selectedRecordCount && !selectedEventCount) ||
                    !transferTargetSchoolYearId ||
                    isTransferringSchoolYearRecords
                  }
                  onClick={handleTransferSelectedSchoolYearRecords}
                  className="min-h-10 w-full rounded-2xl px-4 py-2 text-xs font-black"
                >
                  {isTransferringSchoolYearRecords
                    ? "Transferring..."
                    : "Transfer Selected"}
                </Button>
                <DeleteAttendanceRecordsConfirmation
                  label="Delete Selected"
                  title="Delete selected attendance records?"
                  description={`This will permanently delete ${selectedRecordCount} selected attendance record/s.`}
                  isDeleting={isDeletingBulk}
                  disabled={!selectedRecordCount}
                  onConfirm={() => handleDeleteRecords(selectedRecordIds)}
                  className="min-h-10 w-full rounded-2xl px-4 py-2 text-xs font-black"
                />
                <DeleteAttendanceRecordsConfirmation
                  label="Delete All"
                  title="Delete all attendance records?"
                  description={`This will permanently delete all ${records.length} loaded attendance record/s.`}
                  isDeleting={isDeletingBulk}
                  disabled={!records.length}
                  onConfirm={() =>
                    handleDeleteRecords(records.map((record) => record.id))
                  }
                  className="min-h-10 w-full rounded-2xl px-4 py-2 text-xs font-black"
                />
              </div>
            </div>

            {records.length ? (
              <div className="space-y-4">
                <div className="flex min-w-0 items-center gap-3 rounded-2xl border bg-background px-4 py-3">
                  <Checkbox
                    checked={recordHeaderChecked}
                    onCheckedChange={handleToggleAllRecords}
                    aria-label="Select filtered attendance records"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="wrap-break-word text-sm font-black">
                      Select filtered attendance records
                    </p>
                    <p className="wrap-break-word text-xs font-semibold text-muted-foreground">
                      {filteredRecordCount} shown from {mergedRecords.length}{" "}
                      loaded record/s
                    </p>
                  </div>
                </div>

                {attendanceEventGroups.length ? (
                  <div className="space-y-3">
                    {attendanceEventGroups.map((group) => {
                      const selectedGroupRecordCount = group.records.filter(
                        (record) => selectedRecordIdsSet.has(record.id),
                      ).length;
                      const allGroupRecordsSelected =
                        group.records.length > 0 &&
                        selectedGroupRecordCount === group.records.length;
                      const eventRecordChecked = allGroupRecordsSelected
                        ? true
                        : selectedGroupRecordCount > 0
                          ? "indeterminate"
                          : false;

                      return (
                        <article
                          key={group.key}
                          className="rounded-2xl border bg-background px-4 py-4"
                        >
                          <div className="flex min-w-0 w-full flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <Checkbox
                                checked={eventRecordChecked}
                                onCheckedChange={(checked) =>
                                  handleToggleGroupedRecordsSelected(
                                    group.records,
                                    checked,
                                  )
                                }
                                aria-label={`Select attendance records for ${group.eventName}`}
                                className="mt-1 shrink-0"
                              />
                              <AttendanceEventGroupTriggerContent
                                group={group}
                                selectedGroupRecordCount={
                                  selectedGroupRecordCount
                                }
                              />
                            </div>
                            <div className="flex shrink-0 justify-start lg:justify-end">
                              <AttendanceEventAttendeesDialog
                                group={group}
                                events={displayEvents}
                                selectedEventIdsSet={selectedEventIdsSet}
                                selectedEventCount={selectedEventCount}
                                selectedRecordIdsSet={selectedRecordIdsSet}
                                deletingRecordId={deletingRecordId}
                                isDeletingBulk={isDeletingBulk}
                                isAddingSelectedToEvents={
                                  isAddingSelectedRecordsToEvents
                                }
                                addProgress={selectedRecordsAddProgress}
                                addProgressPercent={
                                  selectedRecordsAddProgressPercent
                                }
                                onToggleEventSelected={handleToggleEventSelected}
                                onToggleAllEvents={handleToggleAllEvents}
                                onToggleRecordSelected={
                                  handleToggleRecordSelected
                                }
                                onToggleAttendeeRecordsSelected={
                                  handleToggleGroupedRecordsSelected
                                }
                                onAddSelectedRecordsToEvents={
                                  handleAddSelectedRecordsToSelectedEvents
                                }
                                onDeleteSelectedRecords={handleDeleteRecords}
                                onEditRecord={handleEditRecord}
                                onDeleteRecord={handleDeleteRecord}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                    No attendance records matched this college filter.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                No attendance records loaded yet.
              </div>
            )}
          </AttendanceResponsivePanel>
        </div>
      </div>
    </main>
  );
}