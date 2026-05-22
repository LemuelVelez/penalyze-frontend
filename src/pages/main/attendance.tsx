import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, SyntheticEvent } from "react";
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
  saveAttendanceFile,
  saveManualAttendanceRecord,
  updateAttendanceEvent,
  updateAttendanceRecord
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceEventInput,
  AttendanceImportRecord,
  AttendancePreviewResult,
  SavedAttendanceImportResult,
  AttendanceRecord,
  ManualAttendanceInput
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
  AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../../components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

type ManualAttendanceFormState = {
  eventId: string;
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

const emptyManualAttendanceForm: ManualAttendanceFormState = {
  eventId: "",
  scannedAt: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: "",
  noOfAbsences: "0",
  remarks: ""
};

const emptyAttendanceEventForm: AttendanceEventFormState = {
  name: "",
  eventStartAt: "",
  eventEndAt: "",
  description: ""
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
  xlw: "application/vnd.ms-excel"
};

const ATTENDANCE_EXCEL_FILE_TYPES = Array.from(
  new Set([
    ...Object.keys(ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
    ...Object.values(ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION),
    "application/msexcel",
    "application/vnd.ms-office",
    "application/x-excel",
    "application/x-msexcel",
    "application/x-ms-excel",
    "application/xls",
    "application/x-xls",
    "application/octet-stream"
  ])
);

const ATTENDANCE_TEXT_FILE_TYPES = [".csv", ".txt", "text/csv", "text/plain"];
const NO_EVENT_SELECT_VALUE = "__no_event__";
const UPLOAD_FILE_EVENTS_SELECT_VALUE = "__upload_file_events__";

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
  "Remarks"
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

type BrowserDecompressionStreamConstructor = new (format: string) => TransformStream<Uint8Array, Uint8Array>;

type AttendanceWorkbookSheet = {
  name: string;
  path: string;
};

type AttendanceHeaderKey = keyof NormalizedAttendanceImportRow;

type AttendanceStudentRecordGroup = {
  key: string;
  studentId: string;
  name: string;
  records: AttendanceRecord[];
  events: string[];
  scannedAtValues: Array<string | null>;
  totalAbsences: number;
  latestScannedAt: string | null;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
};

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
    "started at"
  ],
  eventEndAt: [
    "event end at",
    "event end",
    "eventend",
    "eventendat",
    "end at",
    "end date",
    "end time",
    "ended at"
  ],
  scannedAt: ["scanned at", "scanned", "scannedat", "scan time", "scan date", "date scanned", "time scanned", "timestamp"],
  studentId: [
    "student id",
    "studentid",
    "student no",
    "student number",
    "student id no",
    "student id number",
    "id number",
    "id no"
  ],
  name: ["name", "full name", "fullname", "student name", "complete name"],
  yearLevel: ["year level", "yearlevel", "year", "level", "grade level"],
  college: ["college", "department", "school college"],
  program: ["program", "course", "degree", "section program"],
  institution: ["institution", "school", "campus", "university"],
  noOfAbsences: ["no of absences", "no. of absences", "number of absences", "absences", "absence", "total absences"],
  remarks: ["remarks", "remark", "notes", "note", "status"]
};

const ATTENDANCE_OPEN_XML_EXCEL_EXTENSIONS = new Set(["xlsx", "xlsm", "xltx", "xltm"]);
const ATTENDANCE_ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ATTENDANCE_ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ATTENDANCE_ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function getAttendanceUploadAccept() {
  const configuredTypes = getAcceptedAttendanceFileTypes()
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  return Array.from(new Set([...configuredTypes, ...ATTENDANCE_EXCEL_FILE_TYPES, ...ATTENDANCE_TEXT_FILE_TYPES])).join(",");
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
  return ATTENDANCE_EXCEL_MIME_TYPES_BY_EXTENSION[getFileExtension(fileName)] ?? "application/vnd.ms-excel";
}

function getAttendanceUploadFileWithNormalizedType(file: File) {
  if (!isExcelBasedAttendanceFile(file)) return file;

  const normalizedType = getAttendanceExcelMimeType(file.name);
  if (file.type === normalizedType) return file;

  return new File([file], file.name, {
    type: normalizedType,
    lastModified: file.lastModified
  });
}

function isTextBasedAttendanceFile(file: File) {
  const extension = getFileExtension(file.name);
  const type = file.type.toLowerCase();

  return extension === "csv" || extension === "txt" || type.includes("csv") || type.includes("text");
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
  const sampleLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? "";

  const delimiters = [",", "\t", ";", "|"];

  return delimiters.reduce(
    (selected, delimiter) => {
      const count = sampleLine.split(delimiter).length;
      return count > selected.count ? { delimiter, count } : selected;
    },
    { delimiter: ",", count: 0 }
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
  const normalizedAliases = ATTENDANCE_HEADER_ALIASES[key].map(normalizeImportHeader);

  return headers.findIndex((header) => normalizedAliases.includes(normalizeImportHeader(header)));
}

function getHeaderValue(row: string[], headers: string[], key: AttendanceHeaderKey) {
  const index = getHeaderIndex(headers, key);
  return index >= 0 ? cleanImportValue(row[index]) : "";
}

function getLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[:=\\-]\\s*([^\\n\\r]+)`, "i");
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanImportValue(match[1]);
    }
  }

  return "";
}

function getNumericAbsenceValue(value: string) {
  const numericValue = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numericValue) && numericValue >= 0 ? String(numericValue) : "0";
}

function isNumericSpreadsheetDate(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value.trim());
}

function getDateFromExcelSerial(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 100000) return null;

  const wholeDays = Math.floor(serial);
  const timeFraction = serial - wholeDays;
  const milliseconds = Math.round((wholeDays - 25569) * 86400000 + timeFraction * 86400000);
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAttendanceDateTimeValue(value?: string | number | null) {
  const text = cleanImportValue(value);
  if (!text) return "";

  const serialDate = isNumericSpreadsheetDate(text) ? getDateFromExcelSerial(text) : null;
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
      row.remarks
    ])
  ];

  return csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function getUniqueAttendanceEventNames(rows: NormalizedAttendanceImportRow[]) {
  return Array.from(new Set(rows.map((row) => cleanImportValue(row.eventName)).filter(Boolean)));
}

function getAttendancePreviewEventNames(previewResult: AttendancePreviewResult | null) {
  return Array.from(new Set(previewResult?.rows.map((row) => cleanImportValue(row.eventName)).filter(Boolean) ?? []));
}

function countHeaderAliasMatches(row: AttendanceSpreadsheetRow) {
  return (Object.keys(ATTENDANCE_HEADER_ALIASES) as AttendanceHeaderKey[]).reduce((count, key) => {
    return getHeaderIndex(row.map(cleanImportValue), key) >= 0 ? count + 1 : count;
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
  fallbackEventName = ""
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
    getLabeledValue(metadataText, ATTENDANCE_HEADER_ALIASES.eventName) || cleanImportValue(fallbackEventName);
  const normalizedRows: NormalizedAttendanceImportRow[] = [];
  const latestRecordByImportKey = new Map<string, NormalizedAttendanceImportRow>();

  cleanedRows.slice(headerRowIndex + 1).forEach((row, index) => {
    const searchableText = row.join("\n");
    const studentId =
      getHeaderValue(row, headers, "studentId") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.studentId);
    const name = getHeaderValue(row, headers, "name") || getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.name);

    if (!studentId || !name) return;

    const normalizedStudentId = cleanImportValue(studentId).toUpperCase();
    const rowEventName =
      getHeaderValue(row, headers, "eventName") ||
      getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventName) ||
      metadataEventName;
    const importKey = `${normalizeImportHeader(rowEventName) || "no-event"}:${normalizedStudentId}`;
    const currentRecord = latestRecordByImportKey.get(importKey);

    const eventStartAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "eventStartAt") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventStartAt) ||
        currentRecord?.eventStartAt ||
        ""
    );
    const eventEndAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "eventEndAt") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.eventEndAt) ||
        currentRecord?.eventEndAt ||
        ""
    );
    const scannedAt = normalizeAttendanceDateTimeValue(
      getHeaderValue(row, headers, "scannedAt") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.scannedAt) ||
        currentRecord?.scannedAt ||
        ""
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
      college:
        getHeaderValue(row, headers, "college") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.college) ||
        currentRecord?.college ||
        "",
      program:
        getHeaderValue(row, headers, "program") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.program) ||
        currentRecord?.program ||
        "",
      institution:
        getHeaderValue(row, headers, "institution") ||
        getLabeledValue(searchableText, ATTENDANCE_HEADER_ALIASES.institution) ||
        currentRecord?.institution ||
        "",
      noOfAbsences: getNumericAbsenceValue(
        getHeaderValue(row, headers, "noOfAbsences") || currentRecord?.noOfAbsences || "0"
      ),
      remarks:
        getHeaderValue(row, headers, "remarks") ||
        currentRecord?.remarks ||
        `Imported from ${fileName} row ${headerRowIndex + index + 2}`
    };

    normalizedRows.push(normalizedRow);
    latestRecordByImportKey.set(importKey, normalizedRow);
  });

  return normalizedRows;
}

function getNormalizedAttendanceRowsFromText(text: string, fileName: string) {
  return getNormalizedAttendanceRowsFromTabularRows(parseDelimitedText(text), fileName);
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

  for (let offset = view.byteLength - 22; offset >= minimumSearchOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ATTENDANCE_ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOfCentralDirectoryOffset = offset;
      break;
    }
  }

  if (endOfCentralDirectoryOffset < 0) return entries;

  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  let centralDirectoryOffset = view.getUint32(endOfCentralDirectoryOffset + 16, true);

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralDirectoryOffset, true) !== ATTENDANCE_ZIP_CENTRAL_DIRECTORY_SIGNATURE) break;

    const compressionMethod = view.getUint16(centralDirectoryOffset + 10, true);
    const compressedSize = view.getUint32(centralDirectoryOffset + 20, true);
    const fileNameLength = view.getUint16(centralDirectoryOffset + 28, true);
    const extraFieldLength = view.getUint16(centralDirectoryOffset + 30, true);
    const fileCommentLength = view.getUint16(centralDirectoryOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralDirectoryOffset + 42, true);
    const fileNameBytes = bytes.slice(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength);
    const name = normalizeZipPath(new TextDecoder().decode(fileNameBytes));

    if (name && !name.endsWith("/")) {
      entries.set(name, {
        name,
        compressionMethod,
        compressedSize,
        localHeaderOffset
      });
    }

    centralDirectoryOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
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
    globalThis as typeof globalThis & { DecompressionStream?: BrowserDecompressionStreamConstructor }
  ).DecompressionStream;

  if (!DecompressionStreamConstructor) return null;

  for (const format of ["deflate-raw", "deflate"]) {
    try {
      const decompressedStream = new Blob([getUint8ArrayBlobPart(data)]).stream().pipeThrough(
        new DecompressionStreamConstructor(format)
      );
      return new Uint8Array(await new Response(decompressedStream).arrayBuffer());
    } catch {
      // Try the next browser-supported deflate format.
    }
  }

  return null;
}

async function getZipEntryBytes(bytes: Uint8Array, entries: Map<string, AttendanceZipEntry>, path: string) {
  const entry = entries.get(normalizeZipPath(path));
  if (!entry) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localHeaderOffset = entry.localHeaderOffset;

  if (view.getUint32(localHeaderOffset, true) !== ATTENDANCE_ZIP_LOCAL_FILE_HEADER_SIGNATURE) return null;

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod !== 8) return null;

  return decompressZipDeflate(compressedData);
}

async function getZipEntryText(bytes: Uint8Array, entries: Map<string, AttendanceZipEntry>, path: string) {
  const entryBytes = await getZipEntryBytes(bytes, entries, path);
  return entryBytes ? new TextDecoder().decode(entryBytes) : "";
}

function parseXmlDocument(text: string) {
  if (!text.trim()) return null;

  const document = new DOMParser().parseFromString(text, "application/xml");
  return document.getElementsByTagName("parsererror").length ? null : document;
}

function getElementsByLocalName(parent: Document | Element, localName: string) {
  return Array.from(parent.getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function getFirstElementTextByLocalName(parent: Document | Element, localName: string) {
  return getElementsByLocalName(parent, localName)[0]?.textContent ?? "";
}

function getWorkbookTargetPath(target: string) {
  if (!target) return "";

  return target.startsWith("/") ? normalizeZipPath(target) : normalizeZipPath(`xl/${target}`);
}

function getWorkbookSheets(workbookDocument: Document, workbookRelationshipsDocument: Document | null) {
  const relationships = new Map<string, string>();

  if (workbookRelationshipsDocument) {
    getElementsByLocalName(workbookRelationshipsDocument, "Relationship").forEach((relationship) => {
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
        sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
        "";
      const name = cleanImportValue(sheet.getAttribute("name") ?? `Sheet ${index + 1}`);
      const path = relationships.get(relationshipId) ?? normalizeZipPath(`xl/worksheets/sheet${index + 1}.xml`);

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

  return columnLetters.split("").reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
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
    return Number.isFinite(sharedStringIndex) ? sharedStrings[sharedStringIndex] ?? "" : "";
  }

  return rawValue;
}

function getWorksheetRows(worksheetDocument: Document, sharedStrings: string[]) {
  return getElementsByLocalName(worksheetDocument, "row")
    .map<AttendanceSpreadsheetRow>((row) => {
      const rowValues: string[] = [];

      getElementsByLocalName(row, "c").forEach((cell, fallbackIndex) => {
        const columnIndex = getColumnIndexFromCellReference(cell.getAttribute("r") ?? "");
        rowValues[columnIndex >= 0 ? columnIndex : fallbackIndex] = getWorksheetCellValue(cell, sharedStrings);
      });

      return rowValues;
    })
    .filter((row) => row.some((value) => cleanImportValue(value).length > 0));
}

async function getNormalizedAttendanceRowsFromOpenXmlWorkbook(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  if (!entries.size) return [];

  const workbookDocument = parseXmlDocument(await getZipEntryText(bytes, entries, "xl/workbook.xml"));
  if (!workbookDocument) return [];

  const workbookRelationshipsDocument = parseXmlDocument(
    await getZipEntryText(bytes, entries, "xl/_rels/workbook.xml.rels")
  );
  const sharedStringsDocument = parseXmlDocument(await getZipEntryText(bytes, entries, "xl/sharedStrings.xml"));
  const sharedStrings = getSharedStrings(sharedStringsDocument);
  const sheets = getWorkbookSheets(workbookDocument, workbookRelationshipsDocument);
  const normalizedRows: NormalizedAttendanceImportRow[] = [];

  for (const sheet of sheets) {
    const worksheetDocument = parseXmlDocument(await getZipEntryText(bytes, entries, sheet.path));
    if (!worksheetDocument) continue;

    const fallbackEventName =
      sheets.length > 1 || !isGenericSpreadsheetSheetName(sheet.name) ? cleanImportValue(sheet.name) : "";
    const rows = getNormalizedAttendanceRowsFromTabularRows(
      getWorksheetRows(worksheetDocument, sharedStrings),
      `${file.name} ${sheet.name}`,
      fallbackEventName
    );

    normalizedRows.push(...rows);
  }

  return normalizedRows;
}

async function getAttendanceUploadFile(file: File): Promise<AttendancePreparedUpload> {
  const uploadFile = getAttendanceUploadFileWithNormalizedType(file);

  if (isOpenXmlBasedAttendanceFile(uploadFile)) {
    try {
      const normalizedRows = await getNormalizedAttendanceRowsFromOpenXmlWorkbook(uploadFile);

      if (normalizedRows.length) {
        const normalizedCsv = toNormalizedAttendanceCsv(normalizedRows);
        const normalizedFileName = uploadFile.name.replace(/\.[^.]+$/, "") || "attendance-import";

        return {
          file: new File([normalizedCsv], `${normalizedFileName}-normalized.csv`, { type: "text/csv" }),
          normalizedRowsCount: normalizedRows.length,
          normalizedEventNames: getUniqueAttendanceEventNames(normalizedRows)
        };
      }
    } catch {
      // Keep the original Excel file so the API can still try to parse it.
    }
  }

  if (!isTextBasedAttendanceFile(uploadFile)) {
    return { file: uploadFile, normalizedRowsCount: 0, normalizedEventNames: [] };
  }

  const fileText = await uploadFile.text();
  const normalizedRows = getNormalizedAttendanceRowsFromText(fileText, file.name);

  if (!normalizedRows.length) {
    return { file, normalizedRowsCount: 0, normalizedEventNames: [] };
  }

  const normalizedCsv = toNormalizedAttendanceCsv(normalizedRows);
  const normalizedFileName = uploadFile.name.replace(/\.[^.]+$/, "") || "attendance-import";

  return {
    file: new File([normalizedCsv], `${normalizedFileName}-normalized.csv`, { type: "text/csv" }),
    normalizedRowsCount: normalizedRows.length,
    normalizedEventNames: getUniqueAttendanceEventNames(normalizedRows)
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
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
    minute: "2-digit"
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
  if (record.event_name) return record.event_name;
  return record.import_id ? "File import" : "Manual";
}

function getAttendanceStudentGroupKey(record: AttendanceRecord) {
  const studentId = cleanImportValue(record.student_id).toUpperCase();

  return studentId || `unknown-student:${record.id}`;
}

function getAttendanceStudentGroups(records: AttendanceRecord[]) {
  const groups = new Map<string, AttendanceStudentRecordGroup>();

  records.forEach((record) => {
    const key = getAttendanceStudentGroupKey(record);
    const currentGroup = groups.get(key);
    const scannedAtDate = record.scanned_at ? new Date(record.scanned_at) : null;
    const scannedAtTime = scannedAtDate && !Number.isNaN(scannedAtDate.getTime()) ? scannedAtDate.getTime() : 0;

    if (!currentGroup) {
      groups.set(key, {
        key,
        studentId: record.student_id,
        name: record.name,
        records: [record],
        events: [getManualRecordSource(record)],
        scannedAtValues: [record.scanned_at ?? null],
        totalAbsences: record.no_of_absences ?? 0,
        latestScannedAt: record.scanned_at ?? null,
        yearLevel: record.year_level ?? "",
        college: record.college ?? "",
        program: record.program ?? "",
        institution: record.institution ?? ""
      });
      return;
    }

    const latestScannedAtDate = currentGroup.latestScannedAt ? new Date(currentGroup.latestScannedAt) : null;
    const latestScannedAtTime =
      latestScannedAtDate && !Number.isNaN(latestScannedAtDate.getTime()) ? latestScannedAtDate.getTime() : 0;

    currentGroup.records.push(record);
    currentGroup.events.push(getManualRecordSource(record));
    currentGroup.scannedAtValues.push(record.scanned_at ?? null);
    currentGroup.totalAbsences += record.no_of_absences ?? 0;

    if (scannedAtTime > latestScannedAtTime) {
      currentGroup.latestScannedAt = record.scanned_at ?? currentGroup.latestScannedAt;
      if (record.name) currentGroup.name = record.name;
    }

    if (!currentGroup.name && record.name) currentGroup.name = record.name;
    if (!currentGroup.yearLevel && record.year_level) currentGroup.yearLevel = record.year_level;
    if (!currentGroup.college && record.college) currentGroup.college = record.college;
    if (!currentGroup.program && record.program) currentGroup.program = record.program;
    if (!currentGroup.institution && record.institution) currentGroup.institution = record.institution;
  });

  return Array.from(groups.values()).map((group) => {
    const sortedRecords = [...group.records].sort((leftRecord, rightRecord) => {
      const leftTime = leftRecord.scanned_at ? new Date(leftRecord.scanned_at).getTime() : 0;
      const rightTime = rightRecord.scanned_at ? new Date(rightRecord.scanned_at).getTime() : 0;

      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    });

    return {
      ...group,
      records: sortedRecords,
      events: sortedRecords.map(getManualRecordSource),
      scannedAtValues: sortedRecords.map((record) => record.scanned_at ?? null)
    };
  });
}

function FileDropZone(props: {
  file: File | null;
  isDragging: boolean;
  onFileChange: (file: File | null) => void;
  onDragStateChange: (isDragging: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function selectFile(fileList: FileList | null) {
    props.onFileChange(fileList?.[0] ?? null);
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
      className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card p-6 text-center shadow-sm transition sm:p-8 ${
        props.isDragging ? "border-primary bg-accent" : "border-border hover:border-primary/70 hover:bg-accent/40"
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

      <div className="rounded-full border bg-background px-4 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
        Excel all sheets, CSV, TXT, DOCX, DOC
      </div>
      <h2 className="mt-4 text-2xl font-black">Upload attendance file</h2>

      {props.file ? (
        <div className="mt-5 w-full max-w-xl rounded-2xl border bg-background p-4 text-left">
          <p className="truncate text-sm font-black">{props.file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{(props.file.size / 1024).toFixed(1)} KB</p>
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Label htmlFor="upload-event-id">Event</Label>
        <Select
          value={props.eventId || UPLOAD_FILE_EVENTS_SELECT_VALUE}
          onValueChange={(value) => {
            props.onEventIdChange(value === UPLOAD_FILE_EVENTS_SELECT_VALUE ? "" : value);
          }}
        >
          <SelectTrigger id="upload-event-id" className="mt-2 min-h-10 w-full max-w-xs">
            <SelectValue placeholder="Use event from file or create a new event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UPLOAD_FILE_EVENTS_SELECT_VALUE}>
              {isUsingFileEvents ? "Use event/s detected in the uploaded file" : "Use event from file or create a new event"}
            </SelectItem>
            {props.events.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="upload-event-name">Event name</Label>
        <Input
          id="upload-event-name"
          value={props.eventName}
          onChange={(event) => props.onEventNameChange(event.target.value)}
          disabled={Boolean(props.eventId) || isUsingFileEvents}
          className="mt-2"
          placeholder={isUsingFileEvents ? "Using detected file event/s" : "Required only when the file has no event"}
        />
      </div>

      <div>
        <Label htmlFor="upload-event-start-at">Event start at</Label>
        <Input
          id="upload-event-start-at"
          type="datetime-local"
          value={props.eventStartAt}
          onChange={(event) => props.onEventStartAtChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="upload-event-end-at">Event end at</Label>
        <Input
          id="upload-event-end-at"
          type="datetime-local"
          value={props.eventEndAt}
          onChange={(event) => props.onEventEndAtChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
        />
      </div>

      <div className="lg:col-span-2">
        <Label htmlFor="upload-event-description">Description</Label>
        <Input
          id="upload-event-description"
          value={props.eventDescription}
          onChange={(event) => props.onEventDescriptionChange(event.target.value)}
          disabled={Boolean(props.eventId)}
          className="mt-2"
          placeholder={isUsingFileEvents ? "Optional for detected file event/s" : "Optional"}
        />
      </div>

      {isUsingFileEvents ? (
        <p className="text-sm font-semibold text-muted-foreground lg:col-span-2">
          Detected event/s: {props.fileEventNames.slice(0, 5).join(", ")}
          {props.fileEventNames.length > 5 ? ` +${props.fileEventNames.length - 5} more` : ""}
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
        <Button type="button" variant="outline" disabled={props.isDeleting} className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the attendance record for {props.record.name}.
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
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={props.isDeleting} className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete event?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {props.event.name} and its linked attendance records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
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

function DeleteAttendanceImportConfirmation(props: {
  attendanceImport: AttendanceImportRecord;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={props.isDeleting} className={`border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/50 focus-visible:ring-destructive/30 ${props.className ?? ""}`}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete imported file?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {props.attendanceImport.file_name} and all attendance records and fines created
            from this import.
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
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: <K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11 rounded-xl px-5 py-2">
          Add Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{props.editingRecordId ? "Edit attendance" : "Add attendance"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="manual-event-id">Event</Label>
            <Select
              value={props.form.eventId || NO_EVENT_SELECT_VALUE}
              onValueChange={(value) => props.onChange("eventId", value === NO_EVENT_SELECT_VALUE ? "" : value)}
            >
              <SelectTrigger id="manual-event-id" className="mt-2 min-h-10">
                <SelectValue placeholder="No event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EVENT_SELECT_VALUE}>No event</SelectItem>
                {props.events.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="manual-scanned-at">Scanned at</Label>
            <Input
              id="manual-scanned-at"
              type="text"
              value={props.form.scannedAt}
              onChange={(event) => props.onChange("scannedAt", event.target.value)}
              className="mt-2"
              placeholder="Optional date and time"
            />
          </div>

          <div>
            <Label htmlFor="manual-student-id">Student ID</Label>
            <Input
              id="manual-student-id"
              value={props.form.studentId}
              onChange={(event) => props.onChange("studentId", event.target.value)}
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

          <div>
            <Label htmlFor="manual-year-level">Year level</Label>
            <Input
              id="manual-year-level"
              value={props.form.yearLevel}
              onChange={(event) => props.onChange("yearLevel", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-college">College</Label>
            <Input
              id="manual-college"
              value={props.form.college}
              onChange={(event) => props.onChange("college", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-program">Program</Label>
            <Input
              id="manual-program"
              value={props.form.program}
              onChange={(event) => props.onChange("program", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-institution">Institution</Label>
            <Input
              id="manual-institution"
              value={props.form.institution}
              onChange={(event) => props.onChange("institution", event.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="manual-absences">No. of Absences</Label>
            <Input
              id="manual-absences"
              type="number"
              min="0"
              value={props.form.noOfAbsences}
              onChange={(event) => props.onChange("noOfAbsences", event.target.value)}
              className="mt-2"
              required
            />
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="manual-remarks">Remarks</Label>
            <Textarea
              id="manual-remarks"
              value={props.form.remarks}
              onChange={(event) => props.onChange("remarks", event.target.value)}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Button type="submit" disabled={props.isSaving} className="min-h-12 rounded-2xl">
              {props.isSaving ? "Saving..." : props.editingRecordId ? "Update Attendance" : "Save Attendance"}
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
  onChange: <K extends keyof AttendanceEventFormState>(key: K, value: AttendanceEventFormState[K]) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 rounded-xl px-5 py-2">
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.editingEventId ? "Edit event" : "Add event"}</DialogTitle>
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
                onChange={(event) => props.onChange("eventStartAt", event.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="event-end-at">Event end at</Label>
              <Input
                id="event-end-at"
                type="datetime-local"
                value={props.form.eventEndAt}
                onChange={(event) => props.onChange("eventEndAt", event.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={props.form.description}
              onChange={(event) => props.onChange("description", event.target.value)}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="submit" disabled={props.isSaving} className="min-h-12 rounded-2xl">
              {props.isSaving ? "Saving..." : props.editingEventId ? "Update Event" : "Save Event"}
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


function AttendanceStudentGroupTriggerContent(props: {
  group: AttendanceStudentRecordGroup;
  selectedGroupRecordCount: number;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block wrap-break-word font-black">
          {props.group.studentId} - {props.group.name}
        </span>
        <span className="mt-1 block wrap-break-word text-sm text-muted-foreground">
          {props.group.events.length} attendance scan/s across {props.group.records.length} event record/s
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border bg-muted px-3 py-1 font-bold text-muted-foreground">
          {props.group.totalAbsences} absence/s
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

function AttendanceStudentRecordsList(props: {
  group: AttendanceStudentRecordGroup;
  selectedRecordIdsSet: Set<string>;
  deletingRecordId: string;
  isDeletingBulk: boolean;
  onToggleRecordSelected: (id: string, checked: boolean | "indeterminate") => void;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4 text-sm md:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Events attended</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.group.events.map((eventName, index) => (
              <span key={`${eventName}-${index}`} className="rounded-full border bg-background px-3 py-1 font-bold">
                {eventName}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Scanned at</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.group.scannedAtValues.map((scannedAt, index) => (
              <span key={`${scannedAt ?? "no-scan"}-${index}`} className="rounded-full border bg-background px-3 py-1 font-bold">
                {formatDateTime(scannedAt)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {props.group.records.map((record) => (
        <article key={record.id} className="min-w-0 rounded-2xl border bg-card p-4 wrap-break-word">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Checkbox
                checked={props.selectedRecordIdsSet.has(record.id)}
                onCheckedChange={(checked) => props.onToggleRecordSelected(record.id, checked)}
                aria-label={`Select attendance event ${getManualRecordSource(record)} for ${props.group.name}`}
                className="mt-1 shrink-0"
              />
              <div className="grid min-w-0 flex-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Event</p>
                  <p className="mt-1 wrap-break-word font-semibold">{getManualRecordSource(record)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Scanned At</p>
                  <p className="mt-1 wrap-break-word font-semibold">{formatDateTime(record.scanned_at)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Absences</p>
                  <p className="mt-1 wrap-break-word font-semibold">{record.no_of_absences}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Year Level</p>
                  <p className="mt-1 wrap-break-word font-semibold">{record.year_level || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">College</p>
                  <p className="mt-1 wrap-break-word font-semibold">{record.college || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Program</p>
                  <p className="mt-1 wrap-break-word font-semibold">{record.program || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Institution</p>
                  <p className="mt-1 wrap-break-word font-semibold">{record.institution || "—"}</p>
                </div>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Remarks</p>
                  <p className="mt-1 wrap-break-word font-semibold text-muted-foreground">{record.remarks || "—"}</p>
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
                isDeleting={props.deletingRecordId === record.id || props.isDeletingBulk}
                onConfirm={props.onDeleteRecord}
                className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AttendancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [saved, setSaved] = useState<SavedAttendanceImportResult | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [openStudentGroupKeys, setOpenStudentGroupKeys] = useState<string[]>([]);
  const [manualForm, setManualForm] = useState<ManualAttendanceFormState>(emptyManualAttendanceForm);
  const [eventForm, setEventForm] = useState<AttendanceEventFormState>(emptyAttendanceEventForm);
  const [uploadEventId, setUploadEventId] = useState("");
  const [uploadEventName, setUploadEventName] = useState("");
  const [uploadEventStartAt, setUploadEventStartAt] = useState("");
  const [uploadEventEndAt, setUploadEventEndAt] = useState("");
  const [uploadEventDescription, setUploadEventDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isDeletingImports, setIsDeletingImports] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState("");
  const [editingEventId, setEditingEventId] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [deletingEventId, setDeletingEventId] = useState("");
  const [deletingImportId, setDeletingImportId] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [error, setError] = useState("");

  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0) ?? [], [preview]);
  const previewEventNames = useMemo(() => getAttendancePreviewEventNames(preview), [preview]);
  const attendanceStudentGroups = useMemo(() => getAttendanceStudentGroups(records), [records]);
  const selectedRecordIdsSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const selectedRecordCount = selectedRecordIds.length;
  const allRecordsSelected = records.length > 0 && selectedRecordCount === records.length;
  const recordHeaderChecked = allRecordsSelected ? true : selectedRecordCount > 0 ? "indeterminate" : false;
  const uploadEventReady = Boolean(file);

  function updateManualForm<K extends keyof ManualAttendanceFormState>(key: K, value: ManualAttendanceFormState[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function updateEventForm<K extends keyof AttendanceEventFormState>(key: K, value: AttendanceEventFormState[K]) {
    setEventForm((current) => ({ ...current, [key]: value }));
  }

  function handleToggleRecordSelected(id: string, checked: boolean | "indeterminate") {
    setSelectedRecordIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((recordId) => recordId !== id);
    });
  }

  function handleToggleAllRecords(checked: boolean | "indeterminate") {
    setSelectedRecordIds(checked === true ? records.map((record) => record.id) : []);
  }

  function handleToggleStudentRecordsSelected(groupRecords: AttendanceRecord[], checked: boolean | "indeterminate") {
    const groupRecordIds = groupRecords.map((record) => record.id);
    const groupRecordIdsSet = new Set(groupRecordIds);

    setSelectedRecordIds((current) => {
      if (checked === true) {
        return Array.from(new Set([...current, ...groupRecordIds]));
      }

      return current.filter((recordId) => !groupRecordIdsSet.has(recordId));
    });
  }

  function handleUploadFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setPreview(null);
    setSaved(null);
    setError("");

    if (selectedFile) {
      setUploadEventId("");
      setUploadEventName("");
      setUploadEventStartAt("");
      setUploadEventEndAt("");
      setUploadEventDescription("");
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

  async function loadRecords() {
    setIsLoadingRecords(true);
    setError("");

    try {
      const [rows, eventRows, importRows] = await Promise.all([
        listAttendanceRecords({ limit: 100, offset: 0 }),
        listAttendanceEvents({ limit: 100, offset: 0 }),
        listAttendanceImports({ limit: 100, offset: 0 })
      ]);
      const rowIds = new Set(rows.map((record) => record.id));

      const studentGroupKeys = new Set(rows.map(getAttendanceStudentGroupKey));

      setRecords(rows);
      setEvents(eventRows);
      setImports(importRows);
      setSelectedRecordIds((current) => current.filter((id) => rowIds.has(id)));
      setOpenStudentGroupKeys((current) => current.filter((key) => studentGroupKeys.has(key)));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load attendance records.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingRecords(false);
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
              detectedEventNames.length ? ` Detected ${detectedEventNames.length} event/s.` : ""
            }`
          : "Attendance file preview generated."
      );
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Unable to preview attendance file.";
      setPreview(null);
      setError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    if (!file) {
      setError("Please choose or drop a file first.");
      toast.error("Please choose or drop a file first.");
      return;
    }

    const eventName = uploadEventName.trim();

    setIsSaving(true);
    setError("");

    try {
      const upload = await getAttendanceUploadFile(file);
      const uploadEventNames = upload.normalizedEventNames.length ? upload.normalizedEventNames : previewEventNames;
      const fileHasDetectedEvents = uploadEventNames.length > 0;
      const canLetApiDetectFileEvents = !upload.normalizedRowsCount && isExcelBasedAttendanceFile(upload.file);

      if (!uploadEventId && !eventName && !fileHasDetectedEvents && !canLetApiDetectFileEvents) {
        const message = "Please select an existing event, enter a new event name, or upload a file that includes event names.";
        setError(message);
        toast.error(message);
        return;
      }

      const shouldUseDetectedFileEvents = !uploadEventId && fileHasDetectedEvents;
      const result = await saveAttendanceFile(upload.file, {
        eventId: uploadEventId || undefined,
        eventName: uploadEventId || shouldUseDetectedFileEvents ? undefined : eventName || undefined,
        eventStartAt: uploadEventId ? undefined : uploadEventStartAt || undefined,
        eventEndAt: uploadEventId ? undefined : uploadEventEndAt || undefined,
        eventDescription:
          uploadEventId || shouldUseDetectedFileEvents ? undefined : uploadEventDescription.trim() || undefined
      });
      setSaved(result ?? null);
      setPreview(result ?? null);
      await loadRecords();
      toast.success(
        `Attendance imported successfully. Created ${result?.createdFines.length ?? 0} fine record/s.${
          shouldUseDetectedFileEvents ? " Used event/s from the uploaded file." : ""
        }`
      );
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save attendance file.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleManualSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const studentId = manualForm.studentId.trim();
    const name = manualForm.name.trim();
    const noOfAbsences = Number(manualForm.noOfAbsences);

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
      setError("No. of Absences must be zero or a positive whole number.");
      toast.error("No. of Absences must be zero or a positive whole number.");
      return;
    }

    const payload: ManualAttendanceInput = {
      eventId: manualForm.eventId || undefined,
      scannedAt: normalizeAttendanceDateTimeValue(manualForm.scannedAt) || undefined,
      studentId,
      name,
      yearLevel: manualForm.yearLevel.trim(),
      college: manualForm.college.trim(),
      program: manualForm.program.trim(),
      institution: manualForm.institution.trim(),
      noOfAbsences,
      remarks: manualForm.remarks.trim()
    };

    setIsSavingManual(true);
    setError("");

    try {
      const result = editingRecordId
        ? await updateAttendanceRecord(editingRecordId, payload)
        : await saveManualAttendanceRecord(payload);

      if (result?.record) {
        setRecords((current) => {
          if (editingRecordId) {
            return current.map((record) => (record.id === result.record.id ? result.record : record));
          }

          return [result.record, ...current.filter((record) => record.id !== result.record.id)];
        });
      } else {
        await loadRecords();
      }

      await loadRecords();
      handleCancelEdit();
      setManualDialogOpen(false);
      toast.success(editingRecordId ? "Attendance record updated successfully." : "Attendance record saved successfully.");
    } catch (manualError) {
      const message = manualError instanceof Error ? manualError.message : "Unable to save attendance record.";
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
      name,
      eventStartAt: eventForm.eventStartAt || undefined,
      eventEndAt: eventForm.eventEndAt || undefined,
      description: eventForm.description.trim()
    };

    setIsSavingEvent(true);
    setError("");

    try {
      if (editingEventId) {
        await updateAttendanceEvent(editingEventId, payload);
        toast.success("Event updated successfully.");
      } else {
        await saveAttendanceEvent(payload);
        toast.success("Event saved successfully.");
      }

      await loadRecords();
      handleCancelEventEdit();
      setEventDialogOpen(false);
    } catch (eventError) {
      const message = eventError instanceof Error ? eventError.message : "Unable to save event.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSavingEvent(false);
    }
  }

  function handleEditRecord(record: AttendanceRecord) {
    setEditingRecordId(record.id);
    setManualForm({
      eventId: record.event_id ?? "",
      scannedAt: toDateTimeLocalValue(record.scanned_at),
      studentId: record.student_id,
      name: record.name,
      yearLevel: record.year_level ?? "",
      college: record.college ?? "",
      program: record.program ?? "",
      institution: record.institution ?? "",
      noOfAbsences: String(record.no_of_absences ?? 0),
      remarks: record.remarks ?? ""
    });
    setManualDialogOpen(true);
    setError("");
  }

  function handleCancelEdit() {
    setEditingRecordId("");
    setManualForm(emptyManualAttendanceForm);
    setError("");
  }

  function handleEditEvent(record: AttendanceEvent) {
    setEditingEventId(record.id);
    setEventForm({
      name: record.name,
      eventStartAt: toDateTimeLocalValue(record.event_start_at),
      eventEndAt: toDateTimeLocalValue(record.event_end_at),
      description: record.description ?? ""
    });
    setEventDialogOpen(true);
    setError("");
  }

  function handleCancelEventEdit() {
    setEditingEventId("");
    setEventForm(emptyAttendanceEventForm);
    setError("");
  }

  async function handleDeleteRecord(id: string) {
    setDeletingRecordId(id);
    setError("");

    try {
      await deleteAttendanceRecord(id);
      await loadRecords();

      if (editingRecordId === id) {
        handleCancelEdit();
      }

      toast.success("Attendance record deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance record.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingRecordId("");
    }
  }

  async function handleDeleteEvent(id: string) {
    setDeletingEventId(id);
    setError("");

    try {
      await deleteAttendanceEvent(id);
      await loadRecords();

      if (editingEventId === id) {
        handleCancelEventEdit();
      }

      if (uploadEventId === id) {
        setUploadEventId("");
      }

      toast.success("Event deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete event.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingEventId("");
    }
  }

  async function handleDeleteImport(id: string) {
    setDeletingImportId(id);
    setError("");

    try {
      await deleteAttendanceImport(id);
      await loadRecords();

      if (saved?.importId === id) {
        setSaved(null);
      }

      toast.success("Attendance import deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance import.";
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
      await loadRecords();
      setSaved(null);
      toast.success(`${result?.deletedCount ?? imports.length} attendance import/s deleted successfully.`);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance imports.";
      setError(message);
      toast.error(message);
      await loadRecords();
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
      await loadRecords();

      if (editingRecordId && idsToDelete.includes(editingRecordId)) {
        handleCancelEdit();
      }

      toast.success(`${idsToDelete.length} attendance record/s deleted successfully.`);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete attendance records.";
      setError(message);
      toast.error(message);
      await loadRecords();
    } finally {
      setIsDeletingBulk(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  return (
    <main className="min-h-screen min-w-0 wrap-break-word bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl min-w-0">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Attendance</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Upload and manage attendance</h1>
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
            <ManualAttendanceDialog
              open={manualDialogOpen}
              onOpenChange={(open) => {
                setManualDialogOpen(open);
                if (!open) handleCancelEdit();
              }}
              events={events}
              form={manualForm}
              editingRecordId={editingRecordId}
              isSaving={isSavingManual}
              onSubmit={handleManualSubmit}
              onClear={handleCancelEdit}
              onChange={updateManualForm}
            />
            <Button
              type="button"
              variant="outline"
              onClick={loadRecords}
              disabled={isLoadingRecords}
              className="min-h-11 rounded-xl px-5 py-2"
            >
              {isLoadingRecords ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-4">
            <FileDropZone
              file={file}
              isDragging={isDragging}
              onFileChange={handleUploadFileChange}
              onDragStateChange={setIsDragging}
            />

            {file ? (
              <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-black">Upload event</h2>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Use the event/s detected in the file, select an existing event, or enter a new event name only when
                    the file has no event column.
                  </p>
                </div>
                <div className="mt-5">
                  <EventFields
                    events={events}
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

            <div className="grid gap-3 sm:grid-cols-2">
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
                disabled={!file || !uploadEventReady || isPreviewing || isSaving}
                className="min-h-12 rounded-2xl px-5 py-3"
              >
                {isSaving ? "Saving..." : "Save Import"}
              </Button>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Attendance imported successfully. Created {saved.createdFines.length} fine record/s.
              </div>
            ) : null}

            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-black">Events</h2>
                <p className="text-sm font-bold text-muted-foreground">{events.length} event/s</p>
              </div>

              {events.length ? (
                <div className="space-y-3">
                  {events.map((event) => (
                    <article key={event.id} className="min-w-0 rounded-2xl border bg-background p-4 wrap-break-word">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="wrap-break-word font-black">{event.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatEventSchedule(event)} • {event.attendees_count} attendee/s
                          </p>
                          {event.description ? <p className="mt-2 text-sm text-muted-foreground">{event.description}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditEvent(event)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeleteEventConfirmation
                            event={event}
                            isDeleting={deletingEventId === event.id}
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
            </section>

            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black">Imported files</h2>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    Delete imported files and the attendance records created from them.
                  </p>
                </div>
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
                    <article key={attendanceImport.id} className="min-w-0 rounded-2xl border bg-background p-4 wrap-break-word">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all font-black">{attendanceImport.file_name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {attendanceImport.rows_valid} valid row/s • {attendanceImport.rows_invalid} invalid row/s •{" "}
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
                          isDeleting={deletingImportId === attendanceImport.id || isDeletingImports}
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
            </section>
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-xl font-black">Preview result</h2>
              {preview ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Total</p>
                    <p className="font-black">{preview.rowsTotal}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Valid</p>
                    <p className="font-black">{preview.rowsValid}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-xs font-bold text-muted-foreground">Invalid</p>
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
                      <th className="px-3 py-3">Absences</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 30).map((row) => (
                      <tr key={`${row.rowNumber}-${row.studentId}`} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-semibold">{row.rowNumber}</td>
                        <td className="px-3 py-3">{row.eventName || uploadEventName || "—"}</td>
                        <td className="px-3 py-3">{formatDateTime(row.eventStartAt || uploadEventStartAt)}</td>
                        <td className="px-3 py-3">{formatDateTime(row.eventEndAt || uploadEventEndAt)}</td>
                        <td className="px-3 py-3">{formatDateTime(row.scannedAt)}</td>
                        <td className="px-3 py-3">{row.studentId || "—"}</td>
                        <td className="px-3 py-3">{row.name || "—"}</td>
                        <td className="px-3 py-3">{row.noOfAbsences ?? 0}</td>
                        <td className="px-3 py-3 text-muted-foreground">{row.remarks || "—"}</td>
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
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">Showing first 30 rows only.</p>
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
                <p className="mt-1">{invalidRows.length} invalid row/s will not be saved.</p>
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Recent attendance records</h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {selectedRecordCount ? (
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  {selectedRecordCount} selected
                </p>
              ) : null}
              <DeleteAttendanceRecordsConfirmation
                label="Delete Selected"
                title="Delete selected attendance records?"
                description={`This will permanently delete ${selectedRecordCount} selected attendance record/s.`}
                isDeleting={isDeletingBulk}
                disabled={!selectedRecordCount}
                onConfirm={() => handleDeleteRecords(selectedRecordIds)}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
              <DeleteAttendanceRecordsConfirmation
                label="Delete All"
                title="Delete all attendance records?"
                description={`This will permanently delete all ${records.length} loaded attendance record/s.`}
                isDeleting={isDeletingBulk}
                disabled={!records.length}
                onConfirm={() => handleDeleteRecords(records.map((record) => record.id))}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
            </div>
          </div>

          {records.length ? (
            <div className="space-y-4">
              <div className="flex min-w-0 items-center gap-3 rounded-2xl border bg-background px-4 py-3">
                <Checkbox
                  checked={recordHeaderChecked}
                  onCheckedChange={handleToggleAllRecords}
                  aria-label="Select all attendance records"
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-black">Select all attendance records</p>
                  <p className="wrap-break-word text-xs font-semibold text-muted-foreground">
                    {records.length} loaded record/s
                  </p>
                </div>
              </div>

              <Accordion
                type="multiple"
                value={openStudentGroupKeys}
                onValueChange={setOpenStudentGroupKeys}
                className="space-y-3"
              >
                {attendanceStudentGroups.map((group) => {
                  const selectedGroupRecordCount = group.records.filter((record) =>
                    selectedRecordIdsSet.has(record.id)
                  ).length;
                  const allStudentRecordsSelected =
                    group.records.length > 0 && selectedGroupRecordCount === group.records.length;
                  const studentRecordChecked =
                    allStudentRecordsSelected ? true : selectedGroupRecordCount > 0 ? "indeterminate" : false;

                  return (
                    <AccordionItem
                      key={group.key}
                      value={group.key}
                      className="rounded-2xl border bg-background px-0"
                    >
                      <div className="flex min-w-0 w-full items-start gap-3 px-4 py-4">
                        <Checkbox
                          checked={studentRecordChecked}
                          onCheckedChange={(checked) => handleToggleStudentRecordsSelected(group.records, checked)}
                          aria-label={`Select attendance records for ${group.name}`}
                          className="mt-1 shrink-0"
                        />
                        <AccordionTrigger className="relative min-h-0 min-w-0 flex-1 justify-start gap-3 py-0 pr-10 text-left hover:no-underline [&>svg]:absolute [&>svg]:right-0 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:shrink-0">
                          <AttendanceStudentGroupTriggerContent
                            group={group}
                            selectedGroupRecordCount={selectedGroupRecordCount}
                          />
                        </AccordionTrigger>
                      </div>

                      <AccordionContent className="border-t px-4 pb-4 pt-4">
                        <AttendanceStudentRecordsList
                          group={group}
                          selectedRecordIdsSet={selectedRecordIdsSet}
                          deletingRecordId={deletingRecordId}
                          isDeletingBulk={isDeletingBulk}
                          onToggleRecordSelected={handleToggleRecordSelected}
                          onEditRecord={handleEditRecord}
                          onDeleteRecord={handleDeleteRecord}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
              No attendance records loaded yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}