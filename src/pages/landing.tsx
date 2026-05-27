import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getStudentAttendanceRecords,
  listAttendanceEvents,
  listAttendanceFinalResults,
  saveManualAttendanceRecord,
} from "../api/attendance";
import type {
  AttendanceEvent,
  AttendanceFinalResultRecord,
  AttendanceRecord,
  ManualAttendanceInput,
} from "../api/attendance";
import { getStudentFines, matchPenalty } from "../api/fines";
import type { FineRecord, PenaltyRecord } from "../api/fines";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  getSelectableSchoolYears,
  listSchoolYears,
} from "../api/schoolYears";
import type { SchoolYearRecord } from "../api/schoolYears";
import { LogoMark } from "../components/layout";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Progress } from "../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

type LookupState = {
  attendance: AttendanceRecord[];
  attendanceEvents: AttendanceEvent[];
  attendanceRecords: AttendanceRecord[];
  schoolYears: SchoolYearRecord[];
  fines: FineRecord[];
  fallbackFine: FineRecord | null;
};

type DisplayFineRecord = FineRecord & {
  merged_fine_ids?: string[];
  merged_record_count?: number;
};

type ProgressiveLoadProgress = {
  percent: number;
  message: string;
  detail: string;
};

type LandingAttendanceRecordsPageProgress = {
  loadedRows: number;
  pageCount: number;
  isComplete: boolean;
};

const INITIAL_PROGRESSIVE_LOAD_PROGRESS: ProgressiveLoadProgress = {
  percent: 0,
  message: "",
  detail: "",
};

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

type CollegeLinkedAttendanceScope = {
  hasScope: boolean;
  eventKeys: Set<string>;
  recordIds: Set<string>;
};

type StudentAttendedEventSummary = {
  key: string;
  eventName: string;
  latestScannedAt: string | null;
  records: AttendanceRecord[];
  totalAbsences: number;
};

type StudentAbsentEventSummary = {
  key: string;
  eventName: string;
  latestScannedAt: string | null;
  records: AttendanceRecord[];
  remarks: string[];
  totalAbsences: number;
};

type ZeroAttendanceFormState = {
  studentId: string;
  schoolYearId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
};

const AUTH_STORAGE_KEYS = [
  "penalyze.auth.session",
  "penalyze.auth.token",
  "penalyze.session",
  "penalyze.token",
  "auth.session",
  "auth.token",
  "session",
  "token",
  "accessToken",
];

const LANDING_RESOURCE_LINKS = [
  {
    audience: "SSG Officers",
    title: "Download QR Scanner",
    description:
      "Download the scanner for checking student QR codes during attendance and monitoring.",
    href: "https://drive.google.com/uc?export=download&id=19vu1IvWgpmASxRWUVDjIpe9ql6kbqrPw",
    cta: "Download Scanner",
  },
  {
    audience: "Students",
    title: "Generate Student QR Code",
    description:
      "Create your QR code using your student details before presenting it for scanning.",
    href: "https://ssg-qrcode-generator.vercel.app/",
    cta: "Generate QR Code",
  },
  {
    audience: "Researchers",
    title: "Survey and Statistics Support",
    description:
      "Access external services for thesis Chapter IV survey and statistics needs.",
    href: "https://surveystat.jrmsu-tc.online/",
    cta: "Visit SurveyStat",
  },
] as const;

const ZERO_ATTENDANCE_REMARK =
  "Zero attendance registration from landing page.";
const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;
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

const emptyZeroAttendanceForm: ZeroAttendanceFormState = {
  studentId: "",
  schoolYearId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: DEFAULT_STUDENT_INSTITUTION,
};

const textInputClassName =
  "min-h-12 w-full rounded-2xl border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20";

const selectTriggerClassName =
  "min-h-12 w-full min-w-0 max-w-72 overflow-hidden rounded-2xl border bg-background px-4 text-left text-base font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20";

const customSelectInputClassName =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20";

function getStudentProgramOptions(college: string) {
  return QR_CODE_COLLEGE_PROGRAM_OPTIONS[college] ?? [];
}

function hasStudentSelectOption(
  options: readonly string[],
  value?: string | null,
) {
  const cleanValue = String(value ?? "").trim();

  return Boolean(cleanValue) && options.includes(cleanValue);
}

function renderCurrentStudentSelectOption(
  options: readonly string[],
  value?: string | null,
) {
  const cleanValue = String(value ?? "").trim();

  if (!cleanValue || hasStudentSelectOption(options, cleanValue)) return null;

  return (
    <SelectItem value={cleanValue} className="max-w-full truncate">
      {cleanValue}
    </SelectItem>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getExpiryTime(value: unknown) {
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedNumericValue = Number(value);
    if (!Number.isNaN(parsedNumericValue)) {
      return parsedNumericValue < 1_000_000_000_000
        ? parsedNumericValue * 1000
        : parsedNumericValue;
    }

    const parsedDateValue = new Date(value).getTime();
    if (!Number.isNaN(parsedDateValue)) return parsedDateValue;
  }

  return null;
}

function hasUsableSessionPayload(payload: Record<string, unknown>) {
  const expiresAt = payload.expiresAt ?? payload.expires_at ?? payload.exp;
  const expiryTime = getExpiryTime(expiresAt);

  if (expiryTime !== null && expiryTime <= Date.now()) return false;

  return Boolean(
    payload.token ||
    payload.accessToken ||
    payload.access_token ||
    payload.jwt ||
    payload.user ||
    payload.email ||
    payload.id,
  );
}

function hasStoredSessionValue(value: string | null) {
  if (!value) return false;

  const cleanValue = value.trim();
  if (!cleanValue || cleanValue === "null" || cleanValue === "undefined")
    return false;

  try {
    const parsedValue: unknown = JSON.parse(cleanValue);

    if (typeof parsedValue === "string") return parsedValue.trim().length > 0;
    if (!isRecord(parsedValue)) return Boolean(parsedValue);

    return hasUsableSessionPayload(parsedValue);
  } catch {
    return true;
  }
}

function hasCurrentSession() {
  if (typeof window === "undefined") return false;

  const storageAreas: Storage[] = [window.localStorage, window.sessionStorage];

  return storageAreas.some((storageArea) => {
    try {
      return AUTH_STORAGE_KEYS.some((key) =>
        hasStoredSessionValue(storageArea.getItem(key)),
      );
    } catch {
      return false;
    }
  });
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

function statusBadge(status: FineRecord["status"]) {
  const styles: Record<FineRecord["status"], string> = {
    unpaid: "border-red-200 bg-red-50 text-red-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    waived: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function formatAbsenceCount(value: number, forceTenPlus = false) {
  const numericValue = Number(value || 0);

  if (forceTenPlus || numericValue >= 10) return "10+";

  return String(numericValue);
}

function getTotalAbsences(
  attendance: AttendanceRecord[],
  fines: FineRecord[] = [],
) {
  const attendanceAbsences = attendance.map(getRecordAbsenceCount);
  const fineAbsences = fines.map(getFineAbsenceCount);

  return Math.max(0, ...attendanceAbsences, ...fineAbsences);
}

function getRecordTimestamp(record: AttendanceRecord) {
  const value = record.scanned_at ?? record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getDateYear(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return String(date.getFullYear());
}

function getAttendanceRecordYear(
  record: AttendanceRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  const linkedEvent = record.event_id
    ? (eventById?.get(String(record.event_id)) ?? null)
    : null;

  return (
    record.school_year_id ||
    getAttendanceEventYear(linkedEvent) ||
    getDateYear(record.scanned_at ?? record.created_at ?? null)
  );
}

function getAttendanceEventById(attendanceEvents: AttendanceEvent[]) {
  return new Map(attendanceEvents.map((event) => [String(event.id), event]));
}

function getAttendanceEventDateValue(event?: AttendanceEvent | null) {
  return event?.event_start_at ?? event?.event_end_at ?? null;
}

function getAttendanceEventYear(event?: AttendanceEvent | null) {
  return (
    event?.school_year_id || getDateYear(getAttendanceEventDateValue(event))
  );
}

function getFineAttendanceRecordDateValue(
  fine: FineRecord,
  attendanceRecordById?: Map<string, AttendanceRecord>,
) {
  const linkedRecord =
    attendanceRecordById?.get(getFineAttendanceRecordId(fine)) ?? null;

  return linkedRecord?.scanned_at ?? linkedRecord?.created_at ?? null;
}

function getFineRecordYear(
  fine: FineRecord,
  eventById?: Map<string, AttendanceEvent>,
  attendanceRecordById?: Map<string, AttendanceRecord>,
) {
  const linkedEvent = eventById?.get(getFineAttendanceEventId(fine)) ?? null;

  return (
    fine.school_year_id ||
    getAttendanceEventYear(linkedEvent) ||
    getDateYear(getFineAttendanceRecordDateValue(fine, attendanceRecordById)) ||
    getDateYear(fine.created_at ?? null)
  );
}

function getLookupYearOptions(
  attendance: AttendanceRecord[],
  fines: FineRecord[],
  schoolYears: SchoolYearRecord[],
  eventById?: Map<string, AttendanceEvent>,
  attendanceRecordById?: Map<string, AttendanceRecord>,
) {
  return Array.from(
    new Set(
      [
        ...schoolYears.map((schoolYear) => schoolYear.id),
        ...attendance.map((record) =>
          getAttendanceRecordYear(record, eventById),
        ),
        ...fines.map((fine) =>
          getFineRecordYear(fine, eventById, attendanceRecordById),
        ),
      ].filter(Boolean),
    ),
  );
}

function matchesSelectedYear(recordYear: string, selectedYear: string) {
  return selectedYear === ALL_YEARS_VALUE || recordYear === selectedYear;
}

function getRecordEventName(
  record: AttendanceRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  const eventId = String(record.event_id ?? "").trim();
  const linkedEvent = eventId ? (eventById?.get(eventId) ?? null) : null;

  if (linkedEvent?.name) return linkedEvent.name;
  if (record.event_name) return record.event_name;
  if (eventId) return `Event ${eventId}`;

  return record.import_id ? "File import" : "Manual attendance";
}

function normalizeEventKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const eventNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function parseEventSequence(value?: string | null) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return null;

  const sequencePatterns = [
    /^#?0*(\d+)\s*(?:[.)-]|$)/,
    /\b(?:event|activity|program|attendance|attended|day|no\.?)[\s_-]*#?0*(\d+)\b/i,
    /\b0*(\d+)\s*(?:st|nd|rd|th)?\s*(?:event|activity|program|attendance|day)\b/i,
  ];

  for (const pattern of sequencePatterns) {
    const match = cleanValue.match(pattern);
    const parsedValue = match ? Number(match[1]) : Number.NaN;

    if (Number.isFinite(parsedValue)) return parsedValue;
  }

  return null;
}

function getAttendanceEventSequence(record: AttendanceRecord) {
  const candidates = [
    record.event_name,
    record.event_id,
    record.import_id,
    record.remarks,
  ];

  for (const candidate of candidates) {
    const sequence = parseEventSequence(candidate);
    if (sequence !== null) return sequence;
  }

  return null;
}

function getSummaryEventSequence(summary: StudentAttendedEventSummary) {
  const directSequence =
    parseEventSequence(summary.eventName) ?? parseEventSequence(summary.key);
  if (directSequence !== null) return directSequence;

  for (const record of summary.records) {
    const recordSequence = getAttendanceEventSequence(record);
    if (recordSequence !== null) return recordSequence;
  }

  return null;
}

function getSummaryEarliestTime(summary: StudentAttendedEventSummary) {
  const validTimes = summary.records
    .map(getRecordTimestamp)
    .filter((time) => time > 0);

  if (!validTimes.length) return 0;

  return Math.min(...validTimes);
}

function compareStudentAttendedEventSummaries(
  leftSummary: StudentAttendedEventSummary,
  rightSummary: StudentAttendedEventSummary,
) {
  const leftSequence = getSummaryEventSequence(leftSummary);
  const rightSequence = getSummaryEventSequence(rightSummary);

  if (leftSequence !== null || rightSequence !== null) {
    if (leftSequence === null) return 1;
    if (rightSequence === null) return -1;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  }

  const timeDifference =
    getSummaryEarliestTime(leftSummary) - getSummaryEarliestTime(rightSummary);
  if (timeDifference !== 0) return timeDifference;

  return eventNameCollator.compare(
    leftSummary.eventName,
    rightSummary.eventName,
  );
}

function hasZeroAttendanceMarker(...values: unknown[]) {
  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes("zero attendance"),
  );
}

function isZeroAttendanceRecord(record: AttendanceRecord) {
  const recordData = record as Record<string, unknown>;

  return hasZeroAttendanceMarker(
    record.remarks,
    recordData.attendance_remarks,
    recordData.classification,
    recordData.status,
    recordData.result,
  );
}

function isZeroAttendanceFine(fine: FineRecord) {
  const fineData = fine as Record<string, unknown>;

  return hasZeroAttendanceMarker(
    fine.attendance_remarks,
    fineData.remarks,
    fineData.classification,
    fineData.status,
    fineData.result,
  );
}

function hasZeroAttendanceResult(
  attendance: AttendanceRecord[],
  fines: FineRecord[],
) {
  return (
    attendance.some(isZeroAttendanceRecord) || fines.some(isZeroAttendanceFine)
  );
}

function getStudentDisplayName(
  attendance: AttendanceRecord[],
  fines: FineRecord[],
  fallbackId: string,
) {
  return (
    attendance.find((record) => record.name)?.name ||
    fines.find((fine) => fine.name)?.name ||
    fallbackId
  );
}

function normalizeDisplayValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getAttendanceDisplayKey(record: AttendanceRecord) {
  return [
    normalizeDisplayValue(record.student_id),
    normalizeDisplayValue(record.event_id || getRecordEventName(record)),
    normalizeDisplayValue(record.import_id),
    normalizeDisplayValue(formatDate(record.scanned_at ?? record.created_at)),
    Number(record.no_of_absences || 0),
    normalizeDisplayValue(record.remarks),
  ].join("::");
}

function getUniqueDisplayAttendance(attendance: AttendanceRecord[]) {
  const uniqueAttendance = new Map<string, AttendanceRecord>();

  attendance.forEach((record) => {
    const key = getAttendanceDisplayKey(record);
    const savedRecord = uniqueAttendance.get(key);

    if (
      !savedRecord ||
      getRecordTimestamp(record) > getRecordTimestamp(savedRecord)
    ) {
      uniqueAttendance.set(key, record);
    }
  });

  return Array.from(uniqueAttendance.values()).sort(
    (leftRecord, rightRecord) => {
      return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
    },
  );
}

function getAttendanceRecordId(record: AttendanceRecord) {
  return String(record.id ?? "").trim();
}

function getAttendanceRecordById(attendanceRecords: AttendanceRecord[]) {
  const recordsById = new Map<string, AttendanceRecord>();

  attendanceRecords.forEach((record) => {
    const recordId = getAttendanceRecordId(record);
    if (recordId) recordsById.set(recordId, record);
  });

  return recordsById;
}

function getAttendanceRecordCollegeKey(record: AttendanceRecord) {
  return normalizeDisplayValue(record.college);
}

function getStudentCollegeKey(attendance: AttendanceRecord[]) {
  const latestRecordWithCollege = getUniqueDisplayAttendance(attendance).find(
    (record) => getAttendanceRecordCollegeKey(record),
  );

  return latestRecordWithCollege
    ? getAttendanceRecordCollegeKey(latestRecordWithCollege)
    : "";
}

function getAttendanceEventSummaryKey(
  record: AttendanceRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  if (isZeroAttendanceRecord(record)) return "";

  const eventId = String(record.event_id ?? "").trim();
  if (eventId) return `event-id:${eventId}`;

  const eventName = getRecordEventName(record, eventById);
  const normalizedEventName = normalizeEventKey(eventName);
  if (normalizedEventName) return `event-name:${normalizedEventName}`;

  const importId = String(record.import_id ?? "").trim();
  if (importId)
    return `import-event:${normalizeEventKey(importId) || importId}`;

  return "";
}

function hasAttendanceEventIdentity(
  record: AttendanceRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  return Boolean(getAttendanceEventSummaryKey(record, eventById));
}

function getAttendanceEventSummaryDateValue(
  record: AttendanceRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  const eventId = String(record.event_id ?? "").trim();
  const linkedEvent = eventId ? (eventById?.get(eventId) ?? null) : null;

  return (
    getAttendanceEventDateValue(linkedEvent) ??
    record.scanned_at ??
    record.created_at ??
    null
  );
}

function getCollegeLinkedEventSummaryMap(
  attendance: AttendanceRecord[],
  allAttendanceRecords: AttendanceRecord[] = [],
  attendanceEvents: AttendanceEvent[] = [],
) {
  const studentCollegeKey = getStudentCollegeKey(attendance);

  if (!studentCollegeKey || !allAttendanceRecords.length) return null;

  const eventById = getAttendanceEventById(attendanceEvents);
  const summaries = new Map<string, StudentAbsentEventSummary>();

  getUniqueDisplayAttendance(allAttendanceRecords)
    .filter(
      (record) =>
        !isZeroAttendanceRecord(record) &&
        getAttendanceRecordCollegeKey(record) === studentCollegeKey &&
        hasAttendanceEventIdentity(record, eventById),
    )
    .forEach((record) => {
      const eventName = getRecordEventName(record, eventById);
      const key = getAttendanceEventSummaryKey(record, eventById);

      if (!key) return;

      addAbsentEventSummary(summaries, {
        key,
        eventName,
        latestScannedAt: getAttendanceEventSummaryDateValue(record, eventById),
        remarks: ["No attendance record found for this college-linked event."],
        totalAbsences: 1,
      });
    });

  return summaries.size ? summaries : null;
}

function getCollegeLinkedAbsentEventSummaries(
  attendance: AttendanceRecord[],
  allAttendanceRecords: AttendanceRecord[] = [],
  attendanceEvents: AttendanceEvent[] = [],
) {
  const collegeLinkedEvents = getCollegeLinkedEventSummaryMap(
    attendance,
    allAttendanceRecords,
    attendanceEvents,
  );

  if (!collegeLinkedEvents) return null;

  const attendedEventKeys = new Set(
    getStudentAttendedEventSummaries(attendance, attendanceEvents).map(
      (eventSummary) => eventSummary.key,
    ),
  );

  return Array.from(collegeLinkedEvents.values())
    .filter((eventSummary) => !attendedEventKeys.has(eventSummary.key))
    .map((summary) => ({
      ...summary,
      remarks: Array.from(new Set(summary.remarks)),
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(leftRecord) - getRecordTimestamp(rightRecord);
      }),
    }))
    .sort(compareStudentAbsentEventSummaries);
}

function getCollegeLinkedAttendanceScope(
  attendance: AttendanceRecord[],
  allAttendanceRecords: AttendanceRecord[] = [],
  attendanceEvents: AttendanceEvent[] = [],
): CollegeLinkedAttendanceScope {
  const collegeLinkedEvents = getCollegeLinkedEventSummaryMap(
    attendance,
    allAttendanceRecords,
    attendanceEvents,
  );
  const eventKeys = new Set<string>();
  const recordIds = new Set<string>();

  if (!collegeLinkedEvents) {
    return { hasScope: false, eventKeys, recordIds };
  }

  collegeLinkedEvents.forEach((_summary, key) => eventKeys.add(key));

  const studentCollegeKey = getStudentCollegeKey(attendance);
  const eventById = getAttendanceEventById(attendanceEvents);

  getUniqueDisplayAttendance(allAttendanceRecords).forEach((record) => {
    const recordId = getAttendanceRecordId(record);
    const recordEventKey = getAttendanceEventSummaryKey(record, eventById);

    if (
      recordId &&
      recordEventKey &&
      eventKeys.has(recordEventKey) &&
      getAttendanceRecordCollegeKey(record) === studentCollegeKey
    ) {
      recordIds.add(recordId);
    }
  });

  return { hasScope: true, eventKeys, recordIds };
}

function getStudentAttendedEventSummaries(
  attendance: AttendanceRecord[],
  attendanceEvents: AttendanceEvent[] = [],
) {
  const summaries = new Map<string, StudentAttendedEventSummary>();
  const eventById = getAttendanceEventById(attendanceEvents);

  getUniqueDisplayAttendance(attendance)
    .filter(
      (record) =>
        !isZeroAttendanceRecord(record) &&
        !isExplicitAbsentAttendanceRecord(record) &&
        (record.event_id || record.event_name || record.import_id),
    )
    .forEach((record) => {
      const eventName = getRecordEventName(record, eventById);
      const key =
        getAttendanceEventSummaryKey(record, eventById) ||
        `attendance-event-${record.id}`;
      const currentSummary = summaries.get(key);
      const recordTime = getRecordTimestamp(record);

      if (!currentSummary) {
        summaries.set(key, {
          key,
          eventName,
          latestScannedAt: record.scanned_at ?? record.created_at ?? null,
          records: [record],
          totalAbsences: 0,
        });
        return;
      }

      const latestTime = currentSummary.latestScannedAt
        ? new Date(currentSummary.latestScannedAt).getTime()
        : 0;

      currentSummary.records.push(record);

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
        return getRecordTimestamp(leftRecord) - getRecordTimestamp(rightRecord);
      }),
    }))
    .sort(compareStudentAttendedEventSummaries);
}

function getRecordAbsenceCount(record: AttendanceRecord) {
  const numericValue = Number(record.no_of_absences ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function getFineAbsenceCount(fine: FineRecord) {
  const numericValue = Number(fine.no_of_absences ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function getFineAttendanceRecordId(fine: FineRecord) {
  return String(fine.attendance_record_id ?? "").trim();
}

function getFineAttendanceEventId(fine: FineRecord) {
  return String(fine.attendance_event_id ?? "").trim();
}

function isFineLinkedToAttendanceRecord(
  fine: FineRecord,
  record: AttendanceRecord,
) {
  const fineAttendanceRecordId = getFineAttendanceRecordId(fine);
  const fineAttendanceEventId = getFineAttendanceEventId(fine);

  return Boolean(
    (fineAttendanceRecordId &&
      fineAttendanceRecordId === String(record.id ?? "")) ||
    (fineAttendanceEventId &&
      fineAttendanceEventId === String(record.event_id ?? "")),
  );
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
    .map(normalizeDisplayValue)
    .filter(Boolean);

  return statusValues.some((value) =>
    /(^|\s)(absent|absence|missed|not attended|unattended|no show)(\s|$)/.test(
      value,
    ),
  );
}

function getFineAbsentEventName(
  fine: FineRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  const eventId = getFineAttendanceEventId(fine);
  const linkedEvent = eventId ? (eventById?.get(eventId) ?? null) : null;

  if (linkedEvent?.name) return linkedEvent.name;
  if (eventId) return `Event ${eventId}`;

  return "Absence record";
}

function getFineAbsentEventDateValue(
  fine: FineRecord,
  eventById?: Map<string, AttendanceEvent>,
) {
  const linkedEvent = eventById?.get(getFineAttendanceEventId(fine)) ?? null;

  return (
    getAttendanceEventDateValue(linkedEvent) ??
    fine.created_at ??
    fine.updated_at ??
    null
  );
}

function hasFineLinkedAttendanceEvent(fine: FineRecord) {
  return Boolean(getFineAttendanceEventId(fine));
}

function getPositiveAttendanceEventSequence(record: AttendanceRecord) {
  const sequence = getAttendanceEventSequence(record);

  return sequence !== null && sequence > 0 ? sequence : null;
}

function getAttendanceEventSequenceSet(attendance: AttendanceRecord[]) {
  const sequenceSet = new Set<number>();

  attendance.forEach((record) => {
    if (isZeroAttendanceRecord(record)) return;

    const sequence = getPositiveAttendanceEventSequence(record);
    if (sequence !== null) sequenceSet.add(sequence);
  });

  return sequenceSet;
}

function getInferredMissingAttendanceSequences(
  attendance: AttendanceRecord[],
  totalAbsences: number,
) {
  const sequenceSet = getAttendanceEventSequenceSet(attendance);
  const sequences = Array.from(sequenceSet).sort(
    (leftSequence, rightSequence) => leftSequence - rightSequence,
  );

  if (!sequences.length || totalAbsences <= 0) return [];

  const latestSequence = Math.max(...sequences);
  const missingSequences: number[] = [];

  for (let sequence = 1; sequence <= latestSequence; sequence += 1) {
    if (!sequenceSet.has(sequence)) missingSequences.push(sequence);
  }

  return missingSequences.length <= totalAbsences
    ? missingSequences
    : missingSequences.slice(-totalAbsences);
}

function getAbsentSummaryAbsenceCount(summary: StudentAbsentEventSummary) {
  return summary.records.length > 0 ? 1 : Math.max(1, summary.totalAbsences);
}

function getAbsentSummariesAbsenceCount(
  summaries: Map<string, StudentAbsentEventSummary>,
) {
  return Array.from(summaries.values()).reduce(
    (total, summary) => total + getAbsentSummaryAbsenceCount(summary),
    0,
  );
}

function hasAbsentSummarySequence(
  summaries: Map<string, StudentAbsentEventSummary>,
  sequence: number,
) {
  return Array.from(summaries.values()).some(
    (summary) => getAbsentEventSequence(summary) === sequence,
  );
}

function getFineAbsentEventRemarks(fine: FineRecord) {
  return String(fine.attendance_remarks ?? "").trim();
}

function getAbsentEventSequence(summary: StudentAbsentEventSummary) {
  const directSequence =
    parseEventSequence(summary.eventName) ?? parseEventSequence(summary.key);
  if (directSequence !== null) return directSequence;

  for (const record of summary.records) {
    const recordSequence = getAttendanceEventSequence(record);
    if (recordSequence !== null) return recordSequence;
  }

  return null;
}

function getAbsentSummaryEarliestTime(summary: StudentAbsentEventSummary) {
  const recordTimes = summary.records
    .map(getRecordTimestamp)
    .filter((time) => time > 0);

  if (recordTimes.length) return Math.min(...recordTimes);

  const latestTime = summary.latestScannedAt
    ? new Date(summary.latestScannedAt).getTime()
    : 0;

  return Number.isNaN(latestTime) ? 0 : latestTime;
}

function compareStudentAbsentEventSummaries(
  leftSummary: StudentAbsentEventSummary,
  rightSummary: StudentAbsentEventSummary,
) {
  const leftSequence = getAbsentEventSequence(leftSummary);
  const rightSequence = getAbsentEventSequence(rightSummary);

  if (leftSequence !== null || rightSequence !== null) {
    if (leftSequence === null) return 1;
    if (rightSequence === null) return -1;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  }

  const timeDifference =
    getAbsentSummaryEarliestTime(leftSummary) -
    getAbsentSummaryEarliestTime(rightSummary);
  if (timeDifference !== 0) return timeDifference;

  return eventNameCollator.compare(
    leftSummary.eventName,
    rightSummary.eventName,
  );
}

function addAbsentEventSummary(
  summaries: Map<string, StudentAbsentEventSummary>,
  props: {
    key: string;
    eventName: string;
    latestScannedAt: string | null;
    records?: AttendanceRecord[];
    remarks?: string[];
    totalAbsences?: number;
  },
) {
  const currentSummary = summaries.get(props.key);
  const nextRecords = props.records ?? [];
  const nextRemarks = props.remarks ?? [];
  const nextTotalAbsences = Math.max(
    1,
    Number(props.totalAbsences ?? nextRecords.length ?? 1),
  );
  const nextTime = props.latestScannedAt
    ? new Date(props.latestScannedAt).getTime()
    : 0;

  if (!currentSummary) {
    summaries.set(props.key, {
      key: props.key,
      eventName: props.eventName,
      latestScannedAt: props.latestScannedAt,
      records: nextRecords,
      remarks: nextRemarks,
      totalAbsences: nextTotalAbsences,
    });
    return;
  }

  const currentTime = currentSummary.latestScannedAt
    ? new Date(currentSummary.latestScannedAt).getTime()
    : 0;

  currentSummary.records.push(...nextRecords);
  currentSummary.remarks.push(...nextRemarks);
  currentSummary.totalAbsences = Math.max(
    currentSummary.totalAbsences,
    nextTotalAbsences,
  );

  if (nextTime > (Number.isNaN(currentTime) ? 0 : currentTime)) {
    currentSummary.latestScannedAt =
      props.latestScannedAt ?? currentSummary.latestScannedAt;
  }
}

function getStudentAbsentEventSummaries(
  attendance: AttendanceRecord[],
  fines: FineRecord[] = [],
  attendanceEvents: AttendanceEvent[] = [],
  allAttendanceRecords: AttendanceRecord[] = [],
) {
  const collegeLinkedAbsentEvents = getCollegeLinkedAbsentEventSummaries(
    attendance,
    allAttendanceRecords,
    attendanceEvents,
  );

  if (collegeLinkedAbsentEvents !== null) return collegeLinkedAbsentEvents;

  const summaries = new Map<string, StudentAbsentEventSummary>();
  const eventById = getAttendanceEventById(attendanceEvents);
  const uniqueAttendance = getUniqueDisplayAttendance(attendance).filter(
    (record) => !isZeroAttendanceRecord(record),
  );
  const explicitAbsentRecords = uniqueAttendance.filter(
    isExplicitAbsentAttendanceRecord,
  );
  const absenceFines = fines.filter(
    (fine) =>
      !isFallbackFine(fine) &&
      !isZeroAttendanceFine(fine) &&
      getFineAbsenceCount(fine) > 0,
  );
  const usedAbsentRecordIds = new Set<string>();
  const hasLinkedFineEvent = absenceFines.some(hasFineLinkedAttendanceEvent);
  const verifiedAbsenceCount = getTotalAbsences(uniqueAttendance, absenceFines);

  absenceFines.forEach((fine) => {
    const matchingRecords = explicitAbsentRecords.filter((record) =>
      isFineLinkedToAttendanceRecord(fine, record),
    );
    const remarks = getFineAbsentEventRemarks(fine);
    const fineEventId = getFineAttendanceEventId(fine);

    matchingRecords.forEach((record) => {
      usedAbsentRecordIds.add(record.id);

      const eventName = getRecordEventName(record, eventById);
      const key =
        getAttendanceEventSummaryKey(record, eventById) ||
        `absent-event-${record.id}`;

      addAbsentEventSummary(summaries, {
        key,
        eventName,
        latestScannedAt:
          record.scanned_at ??
          record.created_at ??
          getFineAbsentEventDateValue(fine, eventById),
        records: [record],
        remarks: remarks ? [remarks] : [],
        totalAbsences: 1,
      });
    });

    if (!matchingRecords.length && fineEventId) {
      addAbsentEventSummary(summaries, {
        key: `fine-absent-event-${fineEventId}`,
        eventName: getFineAbsentEventName(fine, eventById),
        latestScannedAt: getFineAbsentEventDateValue(fine, eventById),
        remarks: remarks ? [remarks] : [],
        totalAbsences: 1,
      });
    }
  });

  explicitAbsentRecords
    .filter((record) => !usedAbsentRecordIds.has(record.id))
    .forEach((record) => {
      const eventName = getRecordEventName(record, eventById);
      const key =
        getAttendanceEventSummaryKey(record, eventById) ||
        `absent-event-${record.id}`;

      addAbsentEventSummary(summaries, {
        key,
        eventName,
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
        records: [record],
        totalAbsences: 1,
      });
    });

  if (!hasLinkedFineEvent) {
    getInferredMissingAttendanceSequences(
      uniqueAttendance,
      verifiedAbsenceCount,
    ).forEach((sequence) => {
      if (getAbsentSummariesAbsenceCount(summaries) >= verifiedAbsenceCount)
        return;
      if (hasAbsentSummarySequence(summaries, sequence)) return;

      addAbsentEventSummary(summaries, {
        key: `inferred-absent-event-${sequence}`,
        eventName: `Event ${sequence}`,
        latestScannedAt: null,
        remarks: ["No attendance record found for this event sequence."],
        totalAbsences: 1,
      });
    });

    const unresolvedAbsenceCount =
      verifiedAbsenceCount - getAbsentSummariesAbsenceCount(summaries);

    if (unresolvedAbsenceCount > 0) {
      const representativeFine = absenceFines[0];
      const remarks = representativeFine
        ? getFineAbsentEventRemarks(representativeFine)
        : "";

      addAbsentEventSummary(summaries, {
        key: `unresolved-absent-event-${representativeFine?.id ?? "attendance-record"}`,
        eventName: representativeFine
          ? getFineAbsentEventName(representativeFine, eventById)
          : "Absence record",
        latestScannedAt: representativeFine
          ? getFineAbsentEventDateValue(representativeFine, eventById)
          : null,
        remarks: remarks ? [remarks] : [],
        totalAbsences: unresolvedAbsenceCount,
      });
    }
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      remarks: Array.from(new Set(summary.remarks)),
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(leftRecord) - getRecordTimestamp(rightRecord);
      }),
    }))
    .sort(compareStudentAbsentEventSummaries);
}
function getFallbackAbsenceCount(
  attendance: AttendanceRecord[],
  allAttendanceRecords: AttendanceRecord[] = [],
  attendanceEvents: AttendanceEvent[] = [],
) {
  const collegeLinkedAbsentEvents = getCollegeLinkedAbsentEventSummaries(
    attendance,
    allAttendanceRecords,
    attendanceEvents,
  );

  if (collegeLinkedAbsentEvents !== null)
    return collegeLinkedAbsentEvents.length;

  if (attendance.some(isZeroAttendanceRecord))
    return getTotalAbsences(attendance);

  const explicitAbsenceCounts = getUniqueDisplayAttendance(attendance)
    .filter(isExplicitAbsentAttendanceRecord)
    .map(getRecordAbsenceCount);

  if (!explicitAbsenceCounts.length) return 0;

  return Math.max(0, ...explicitAbsenceCounts);
}

function getVerifiedTotalAbsences(props: {
  attendance: AttendanceRecord[];
  fines: FineRecord[];
  absentEvents: StudentAbsentEventSummary[];
  hasCollegeAttendanceScope?: boolean;
}) {
  const recordedAbsenceCount = getTotalAbsences(props.attendance, props.fines);

  if (hasZeroAttendanceResult(props.attendance, props.fines)) {
    return Math.max(
      recordedAbsenceCount,
      getAbsentEventsAbsenceCount(props.absentEvents),
    );
  }

  if (props.hasCollegeAttendanceScope) {
    return props.absentEvents.reduce((total, eventSummary) => {
      return total + getAbsentSummaryAbsenceCount(eventSummary);
    }, 0);
  }

  if (!props.absentEvents.length) return recordedAbsenceCount;

  return props.absentEvents.reduce((total, eventSummary) => {
    return total + getAbsentSummaryAbsenceCount(eventSummary);
  }, 0);
}

function getAbsentEventKeySet(absentEvents: StudentAbsentEventSummary[]) {
  return new Set(absentEvents.map((eventSummary) => eventSummary.key));
}

function getAbsentAttendanceRecordIdSet(
  absentEvents: StudentAbsentEventSummary[],
) {
  return new Set(
    absentEvents
      .flatMap((eventSummary) =>
        eventSummary.records.map(getAttendanceRecordId),
      )
      .filter(Boolean),
  );
}

function shouldDisplayFine(
  fine: FineRecord,
  absentEvents: StudentAbsentEventSummary[],
  hasZeroAttendance: boolean,
  collegeAttendanceScope?: CollegeLinkedAttendanceScope,
) {
  if (hasZeroAttendance || isZeroAttendanceFine(fine)) return true;
  if (isFallbackFine(fine)) return absentEvents.length > 0;
  if (getFineAbsenceCount(fine) <= 0) return false;

  const absentEventKeys = getAbsentEventKeySet(absentEvents);
  const absentRecordIds = getAbsentAttendanceRecordIdSet(absentEvents);
  const fineAttendanceEventId = getFineAttendanceEventId(fine);
  const fineAttendanceRecordId = getFineAttendanceRecordId(fine);

  if (fineAttendanceEventId) {
    return absentEventKeys.has(`event-id:${fineAttendanceEventId}`);
  }

  if (fineAttendanceRecordId) {
    if (absentRecordIds.has(fineAttendanceRecordId)) return true;

    return Boolean(
      collegeAttendanceScope?.hasScope &&
      collegeAttendanceScope.recordIds.has(fineAttendanceRecordId) &&
      absentEvents.length > 0,
    );
  }

  if (collegeAttendanceScope?.hasScope) return absentEvents.length > 0;

  return getFineAbsenceCount(fine) > 0;
}

function getDisplayedFineAbsenceCount(
  fine: FineRecord,
  totalAbsences: number,
  hasZeroAttendance: boolean,
) {
  const fineAbsenceCount = getFineAbsenceCount(fine);

  if (hasZeroAttendance || isZeroAttendanceFine(fine) || isFallbackFine(fine))
    return fineAbsenceCount;
  if (totalAbsences > 0)
    return Math.min(Math.max(1, fineAbsenceCount), totalAbsences);

  return fineAbsenceCount;
}

function getAbsentEventsAbsenceCount(
  absentEvents: StudentAbsentEventSummary[],
) {
  return absentEvents.reduce((total, eventSummary) => {
    return total + getAbsentSummaryAbsenceCount(eventSummary);
  }, 0);
}

function getFirstAbsentEventDateValue(
  absentEvents: StudentAbsentEventSummary[],
) {
  return (
    absentEvents.find((eventSummary) => eventSummary.latestScannedAt)
      ?.latestScannedAt ?? null
  );
}

function buildDisplayedAbsentEventFallbackFine(props: {
  baseFine: FineRecord | null;
  studentId: string;
  attendance: AttendanceRecord[];
  absentEvents: StudentAbsentEventSummary[];
}) {
  const absenceCount = Math.max(
    1,
    getAbsentEventsAbsenceCount(props.absentEvents),
  );
  const baseFine =
    props.baseFine ??
    buildFallbackFine(props.studentId, props.attendance, absenceCount, null);
  const displayDate =
    getFirstAbsentEventDateValue(props.absentEvents) ??
    baseFine.created_at ??
    new Date().toISOString();
  const studentAttendanceRecord = props.attendance.find((record) => {
    return (
      normalizeDisplayValue(record.student_id) ===
      normalizeDisplayValue(props.studentId)
    );
  });
  const eventKey =
    normalizeEventKey(
      props.absentEvents.map((eventSummary) => eventSummary.key).join(" "),
    ) || "absent";

  return {
    ...baseFine,
    id: `${baseFine.id}-display-${eventKey}`,
    attendance_record_id: studentAttendanceRecord?.id ?? null,
    attendance_event_id: studentAttendanceRecord?.event_id ?? null,
    student_id: props.studentId || baseFine.student_id,
    name:
      baseFine.name ||
      studentAttendanceRecord?.name ||
      props.studentId ||
      "Student record pending",
    no_of_absences: absenceCount,
    status: "unpaid" as const,
    created_at: String(displayDate),
    updated_at: String(baseFine.updated_at ?? displayDate),
  } satisfies FineRecord;
}

function isFallbackFine(fine: FineRecord) {
  return fine.id.startsWith("fallback-fine-");
}

function normalizeFineDisplayValue(value: unknown) {
  return normalizeDisplayValue(value);
}

function getFineDisplayKey(fine: FineRecord) {
  return [
    normalizeFineDisplayValue(fine.student_id),
    normalizeFineDisplayValue(fine.attendance_event_id),
    normalizeFineDisplayValue(fine.attendance_record_id),
    getFineAbsenceCount(fine),
    normalizeFineDisplayValue(fine.prescribed_penalty),
    normalizeFineDisplayValue(fine.created_at),
    normalizeFineDisplayValue(fine.status),
  ].join("::");
}

function getUniqueDisplayFines(fines: FineRecord[]) {
  const uniqueFines = new Map<string, FineRecord>();

  fines.forEach((fine) => {
    const key = getFineDisplayKey(fine);

    if (!uniqueFines.has(key)) {
      uniqueFines.set(key, fine);
    }
  });

  return Array.from(uniqueFines.values());
}

function getFineTimestamp(fine: FineRecord) {
  const value = fine.created_at ?? fine.updated_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getMergedFineStatus(fines: FineRecord[]): FineRecord["status"] {
  if (fines.some((fine) => fine.status === "unpaid")) return "unpaid";
  if (fines.length && fines.every((fine) => fine.status === "paid"))
    return "paid";
  if (fines.length && fines.every((fine) => fine.status === "waived"))
    return "waived";

  return fines[0]?.status ?? "unpaid";
}

function getStudentMergedFineKey(fine: FineRecord) {
  if (isFallbackFine(fine)) return `fallback:${fine.id}`;

  const cleanStudentId = normalizeFineDisplayValue(fine.student_id);

  return cleanStudentId || getFineDisplayKey(fine);
}

function getMergedFineIds(fines: FineRecord[]) {
  return Array.from(new Set(fines.map((fine) => fine.id).filter(Boolean)));
}

function mergeStudentFineRecords(fines: FineRecord[]): DisplayFineRecord[] {
  const fineGroups = new Map<string, FineRecord[]>();

  fines.forEach((fine) => {
    const key = getStudentMergedFineKey(fine);
    const currentGroup = fineGroups.get(key) ?? [];

    currentGroup.push(fine);
    fineGroups.set(key, currentGroup);
  });

  return Array.from(fineGroups.values()).map((group) => {
    if (group.length === 1) {
      return {
        ...group[0],
        merged_fine_ids: getMergedFineIds(group),
        merged_record_count: 1,
      };
    }

    const sortedGroup = [...group].sort((leftFine, rightFine) => {
      const absenceDifference =
        getFineAbsenceCount(rightFine) - getFineAbsenceCount(leftFine);

      if (absenceDifference !== 0) return absenceDifference;

      return getFineTimestamp(rightFine) - getFineTimestamp(leftFine);
    });
    const baseFine = sortedGroup[0];
    const mergedAbsenceCount = group.reduce((highestCount, fine) => {
      return Math.max(highestCount, getFineAbsenceCount(fine));
    }, 0);

    return {
      ...baseFine,
      no_of_absences: mergedAbsenceCount,
      status: getMergedFineStatus(group),
      merged_fine_ids: getMergedFineIds(group),
      merged_record_count: group.length,
    };
  });
}

async function resolveFallbackPenalty(noOfAbsences: number) {
  try {
    return await matchPenalty(noOfAbsences);
  } catch {
    return null;
  }
}

function buildFallbackFine(
  studentId: string,
  attendance: AttendanceRecord[],
  noOfAbsences: number,
  penalty: PenaltyRecord | null,
): FineRecord {
  const latestAttendance = [...attendance].sort((leftRecord, rightRecord) => {
    return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
  })[0];
  const now = new Date().toISOString();

  return {
    id: `fallback-fine-${studentId}-${noOfAbsences}`,
    school_year_id: latestAttendance?.school_year_id ?? null,
    attendance_record_id: latestAttendance?.id ?? null,
    penalty_id: penalty?.id ?? null,
    student_id: latestAttendance?.student_id ?? studentId,
    name: latestAttendance?.name ?? "Student record pending",
    no_of_absences: noOfAbsences,
    prescribed_penalty:
      penalty?.prescribed_penalty ?? "No prescribed penalty configured.",
    status: "unpaid",
    attendance_event_id: latestAttendance?.event_id ?? null,
    attendance_remarks: latestAttendance?.remarks ?? null,
    created_at: String(latestAttendance?.created_at ?? now),
    updated_at: String(
      latestAttendance?.updated_at ?? latestAttendance?.created_at ?? now,
    ),
  };
}

function normalizeManualAttendanceFineForDisplay(
  fine: unknown,
  attendanceRecord: AttendanceRecord,
): FineRecord | null {
  const fineRecord = fine as Partial<FineRecord> | null | undefined;

  if (!fineRecord?.id) return null;

  const createdAt = String(
    fineRecord.created_at ??
      attendanceRecord.created_at ??
      new Date().toISOString(),
  );
  const updatedAt = String(
    fineRecord.updated_at ?? attendanceRecord.updated_at ?? createdAt,
  );
  const status =
    fineRecord.status === "paid" || fineRecord.status === "waived"
      ? fineRecord.status
      : "unpaid";

  return {
    id: String(fineRecord.id),
    school_year_id:
      fineRecord.school_year_id ?? attendanceRecord.school_year_id ?? null,
    attendance_record_id:
      fineRecord.attendance_record_id ?? attendanceRecord.id,
    penalty_id: fineRecord.penalty_id ?? null,
    student_id: fineRecord.student_id ?? attendanceRecord.student_id,
    name: fineRecord.name ?? attendanceRecord.name,
    no_of_absences: Number(
      fineRecord.no_of_absences ?? attendanceRecord.no_of_absences ?? 0,
    ),
    prescribed_penalty:
      fineRecord.prescribed_penalty ?? "No prescribed penalty configured.",
    status,
    attendance_event_id:
      fineRecord.attendance_event_id ?? attendanceRecord.event_id ?? null,
    attendance_remarks:
      fineRecord.attendance_remarks ?? attendanceRecord.remarks ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function getResultClassification(props: {
  lookup: LookupState | null;
  displayedFines: FineRecord[];
  totalAbsences: number;
  attendedEvents: StudentAttendedEventSummary[];
}) {
  if (!props.lookup) return "Search result";

  const hasZeroAttendanceRecord =
    props.lookup.attendance.some(isZeroAttendanceRecord) ||
    props.displayedFines.some(isZeroAttendanceFine);

  if (hasZeroAttendanceRecord) return "Zero attendance";
  if (
    props.attendedEvents.length > 0 &&
    props.totalAbsences === 0 &&
    props.displayedFines.length === 0
  ) {
    return "Perfect attendance";
  }

  if (props.totalAbsences > 0 || props.displayedFines.length > 0)
    return "With absences";

  return "No attendance record";
}

function getClassificationStyle(classification: string) {
  if (classification === "Perfect attendance")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (classification === "Zero attendance")
    return "border-red-200 bg-red-50 text-red-700";
  if (classification === "With absences")
    return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StudentAttendedEventsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  events: StudentAttendedEventSummary[];
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>
            Events attended by {props.studentName || props.studentId}
          </DialogTitle>
        </DialogHeader>

        {props.events.length ? (
          <div className="space-y-3">
            {props.events.map((eventSummary, index) => (
              <article
                key={eventSummary.key}
                className="rounded-2xl border bg-background p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-black">{eventSummary.eventName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Latest {formatDate(eventSummary.latestScannedAt)} •{" "}
                        {eventSummary.records.length} record/s
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {eventSummary.records.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-xl border bg-card px-3 py-2 text-sm"
                    >
                      <p className="font-semibold">
                        {formatDate(record.scanned_at ?? record.created_at)}
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
      </DialogContent>
    </Dialog>
  );
}

function ZeroAttendanceRegistrationDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ZeroAttendanceFormState;
  schoolYears: SchoolYearRecord[];
  error: string;
  isSaving: boolean;
  onFieldChange: (field: keyof ZeroAttendanceFormState, value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const programOptions = getStudentProgramOptions(props.form.college);
  const schoolYearOptions = getSelectableSchoolYears(props.schoolYears);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[95svh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Student ID not found</DialogTitle>
        </DialogHeader>

        <form onSubmit={props.onSubmit} className="space-y-5">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-800">
            This Student ID has no saved attendance or fine record. Fill out the
            attendee details to register the student as zero attendance and
            create the related fine record.
          </div>

          {props.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {props.error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold">
              <span>Student ID</span>
              <input
                value={props.form.studentId}
                onChange={(event) =>
                  props.onFieldChange("studentId", event.target.value)
                }
                placeholder="Student ID"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Name</span>
              <input
                value={props.form.name}
                onChange={(event) =>
                  props.onFieldChange("name", event.target.value)
                }
                placeholder="Full name"
                className={textInputClassName}
              />
            </label>
            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>School Year</span>
              <Select
                value={props.form.schoolYearId}
                onValueChange={(value) =>
                  props.onFieldChange("schoolYearId", value)
                }
                disabled={!schoolYearOptions.length}
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue
                    placeholder={
                      schoolYearOptions.length
                        ? "Select active school year"
                        : "Current school year"
                    }
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72 max-w-80">
                  {schoolYearOptions.map((schoolYear) => (
                    <SelectItem
                      key={schoolYear.id}
                      value={schoolYear.id}
                      className="max-w-full truncate"
                    >
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>Year Level</span>
              <Select
                value={props.form.yearLevel}
                onValueChange={(value) =>
                  props.onFieldChange("yearLevel", value)
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue
                    placeholder="Select year level"
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72 max-w-80">
                  {renderCurrentStudentSelectOption(
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
              <input
                value={props.form.yearLevel}
                onChange={(event) =>
                  props.onFieldChange("yearLevel", event.target.value)
                }
                placeholder="Type custom year level if not listed"
                className={customSelectInputClassName}
              />
            </div>
            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>College</span>
              <Select
                value={props.form.college}
                onValueChange={(value) => props.onFieldChange("college", value)}
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue
                    placeholder="Select college"
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72 max-w-80">
                  {renderCurrentStudentSelectOption(
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
              <input
                value={props.form.college}
                onChange={(event) =>
                  props.onFieldChange("college", event.target.value)
                }
                placeholder="Type custom college if not listed"
                className={customSelectInputClassName}
              />
            </div>
            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>Program</span>
              <Select
                value={props.form.program}
                onValueChange={(value) => props.onFieldChange("program", value)}
                disabled={!props.form.college}
              >
                <SelectTrigger className={selectTriggerClassName}>
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
                  {renderCurrentStudentSelectOption(
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
              <input
                value={props.form.program}
                onChange={(event) =>
                  props.onFieldChange("program", event.target.value)
                }
                placeholder={
                  props.form.college
                    ? "Type custom program if not listed"
                    : "Select college before typing program"
                }
                disabled={!props.form.college}
                className={customSelectInputClassName}
              />
            </div>
            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>Institution</span>
              <Select
                value={props.form.institution}
                onValueChange={(value) =>
                  props.onFieldChange("institution", value)
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue
                    placeholder="Select institution"
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72 max-w-80">
                  {renderCurrentStudentSelectOption(
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
              <input
                value={props.form.institution}
                onChange={(event) =>
                  props.onFieldChange("institution", event.target.value)
                }
                placeholder="Type custom institution if not listed"
                className={customSelectInputClassName}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={props.isSaving}
              onClick={() => props.onOpenChange(false)}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={props.isSaving}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black"
            >
              {props.isSaving ? "Saving..." : "Save Zero Attendance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function finalResultToAttendanceRecord(
  row: AttendanceFinalResultRecord,
): AttendanceRecord {
  return {
    id: row.id,
    school_year_id: row.school_year_id,
    import_id: row.import_id,
    event_id: null,
    event_name: "Final attendance result",
    student_id: row.student_id,
    name: row.name,
    year_level: row.year_level,
    college: row.college,
    program: row.program,
    institution: row.institution,
    no_of_absences: row.total_absences,
    remarks: row.attendance_status,
    scanned_at: row.latest_scanned_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listLandingAttendanceRecords(
  onProgress?: (progress: LandingAttendanceRecordsPageProgress) => void,
) {
  const rows = await listAttendanceFinalResults({
    limit: 5000,
    offset: 0,
  });

  onProgress?.({
    loadedRows: rows.length,
    pageCount: 1,
    isComplete: true,
  });

  return rows.map(finalResultToAttendanceRecord);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [searchedId, setSearchedId] = useState("");
  const [resultYearFilter, setResultYearFilter] = useState(ALL_YEARS_VALUE);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<ProgressiveLoadProgress>(
    INITIAL_PROGRESSIVE_LOAD_PROGRESS,
  );
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [zeroAttendanceDialogOpen, setZeroAttendanceDialogOpen] =
    useState(false);
  const [zeroAttendanceForm, setZeroAttendanceForm] =
    useState<ZeroAttendanceFormState>(emptyZeroAttendanceForm);
  const [isSavingZeroAttendance, setIsSavingZeroAttendance] = useState(false);
  const [zeroAttendanceError, setZeroAttendanceError] = useState("");
  const [error, setError] = useState("");
  const searchProgressPercent = useProgressivePercent(
    isSearching,
    searchProgress.percent,
  );

  async function loadLandingSchoolYears() {
    try {
      const rows = await listSchoolYears({ activeOnly: true });
      setSchoolYears(rows);
      setZeroAttendanceForm((current) => ({
        ...current,
        schoolYearId: current.schoolYearId || getActiveSchoolYearId(rows),
      }));
      return rows;
    } catch {
      return [] as SchoolYearRecord[];
    }
  }

  useEffect(() => {
    if (hasCurrentSession()) {
      navigate("/dashboard", { replace: true });
      return;
    }

    setIsCheckingSession(false);
  }, [navigate]);

  useEffect(() => {
    if (isCheckingSession) return;
    void loadLandingSchoolYears();
  }, [isCheckingSession]);

  const lookupFines = useMemo(() => {
    if (!lookup) return [];
    return lookup.fallbackFine ? [lookup.fallbackFine] : lookup.fines;
  }, [lookup]);
  const attendanceEventById = useMemo(() => {
    return lookup
      ? getAttendanceEventById(lookup.attendanceEvents)
      : new Map<string, AttendanceEvent>();
  }, [lookup]);
  const attendanceRecordById = useMemo(() => {
    return lookup
      ? getAttendanceRecordById([
          ...lookup.attendanceRecords,
          ...lookup.attendance,
        ])
      : new Map<string, AttendanceRecord>();
  }, [lookup]);
  const yearOptions = useMemo(() => {
    return lookup
      ? getLookupYearOptions(
          lookup.attendance,
          lookupFines,
          lookup.schoolYears,
          attendanceEventById,
          attendanceRecordById,
        )
      : schoolYears.map((schoolYear) => schoolYear.id);
  }, [
    lookup,
    lookupFines,
    schoolYears,
    attendanceEventById,
    attendanceRecordById,
  ]);
  const selectedYearLabel = getSchoolYearLabel(
    lookup?.schoolYears ?? schoolYears,
    resultYearFilter,
  );

  useEffect(() => {
    if (
      resultYearFilter !== ALL_YEARS_VALUE &&
      !yearOptions.includes(resultYearFilter)
    ) {
      setResultYearFilter(ALL_YEARS_VALUE);
    }
  }, [resultYearFilter, yearOptions]);

  const displayedAttendance = useMemo(() => {
    if (!lookup) return [];

    return getUniqueDisplayAttendance(
      lookup.attendance.filter((record) =>
        matchesSelectedYear(
          getAttendanceRecordYear(record, attendanceEventById),
          resultYearFilter,
        ),
      ),
    );
  }, [lookup, resultYearFilter, attendanceEventById]);

  const displayedCollegeAttendanceRecords = useMemo(() => {
    if (!lookup) return [];

    return lookup.attendanceRecords.filter((record) =>
      matchesSelectedYear(
        getAttendanceRecordYear(record, attendanceEventById),
        resultYearFilter,
      ),
    );
  }, [lookup, resultYearFilter, attendanceEventById]);

  const allDisplayedFines = useMemo(() => {
    return getUniqueDisplayFines(
      lookupFines.filter((fine) =>
        matchesSelectedYear(
          getFineRecordYear(fine, attendanceEventById, attendanceRecordById),
          resultYearFilter,
        ),
      ),
    );
  }, [
    lookupFines,
    resultYearFilter,
    attendanceEventById,
    attendanceRecordById,
  ]);

  const collegeAttendanceScope = useMemo(() => {
    return getCollegeLinkedAttendanceScope(
      displayedAttendance,
      displayedCollegeAttendanceRecords,
      lookup?.attendanceEvents ?? [],
    );
  }, [displayedAttendance, displayedCollegeAttendanceRecords, lookup]);
  const attendedEvents = useMemo(() => {
    return getStudentAttendedEventSummaries(
      displayedAttendance,
      lookup?.attendanceEvents ?? [],
    );
  }, [displayedAttendance, lookup]);
  const absentEvents = useMemo(() => {
    return getStudentAbsentEventSummaries(
      displayedAttendance,
      allDisplayedFines,
      lookup?.attendanceEvents ?? [],
      displayedCollegeAttendanceRecords,
    );
  }, [
    displayedAttendance,
    allDisplayedFines,
    displayedCollegeAttendanceRecords,
    lookup,
  ]);
  const hasZeroAttendanceForDisplay = useMemo(() => {
    return hasZeroAttendanceResult(displayedAttendance, allDisplayedFines);
  }, [displayedAttendance, allDisplayedFines]);
  const displayedFines = useMemo(() => {
    const visibleFines = mergeStudentFineRecords(
      allDisplayedFines.filter((fine) =>
        shouldDisplayFine(
          fine,
          absentEvents,
          hasZeroAttendanceForDisplay,
          collegeAttendanceScope,
        ),
      ),
    );

    if (visibleFines.length || !lookup || !absentEvents.length)
      return visibleFines;

    return [
      buildDisplayedAbsentEventFallbackFine({
        baseFine: lookup.fallbackFine,
        studentId: searchedId,
        attendance: displayedAttendance,
        absentEvents,
      }),
    ];
  }, [
    allDisplayedFines,
    absentEvents,
    hasZeroAttendanceForDisplay,
    collegeAttendanceScope,
    lookup,
    searchedId,
    displayedAttendance,
  ]);
  const fallbackFineActive = displayedFines.some(isFallbackFine);
  const totalAbsences = useMemo(() => {
    return getVerifiedTotalAbsences({
      attendance: displayedAttendance,
      fines: displayedFines,
      absentEvents,
      hasCollegeAttendanceScope: collegeAttendanceScope.hasScope,
    });
  }, [
    displayedAttendance,
    displayedFines,
    absentEvents,
    collegeAttendanceScope,
  ]);

  const unpaidFines = useMemo(() => {
    return displayedFines.filter((fine) => fine.status === "unpaid").length;
  }, [displayedFines]);

  const studentDisplayName = useMemo(() => {
    return lookup
      ? getStudentDisplayName(
          displayedAttendance,
          allDisplayedFines,
          searchedId,
        )
      : searchedId;
  }, [lookup, displayedAttendance, allDisplayedFines, searchedId]);
  const totalAbsencesLabel = formatAbsenceCount(totalAbsences);
  const resultClassification = useMemo(
    () =>
      getResultClassification({
        lookup,
        displayedFines,
        totalAbsences,
        attendedEvents,
      }),
    [lookup, displayedFines, totalAbsences, attendedEvents],
  );
  const resultClassificationClassName =
    getClassificationStyle(resultClassification);

  function openZeroAttendanceRegistration(
    cleanStudentId: string,
    availableSchoolYears: SchoolYearRecord[] = schoolYears,
  ) {
    setLookup(null);
    setResultDialogOpen(false);
    setEventsDialogOpen(false);
    setZeroAttendanceError("");
    setResultYearFilter(ALL_YEARS_VALUE);
    setZeroAttendanceForm({
      ...emptyZeroAttendanceForm,
      studentId: cleanStudentId,
      schoolYearId: getActiveSchoolYearId(getSelectableSchoolYears(availableSchoolYears)),
    });
    setZeroAttendanceDialogOpen(true);
  }

  function handleZeroAttendanceFieldChange(
    field: keyof ZeroAttendanceFormState,
    value: string,
  ) {
    setZeroAttendanceForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "college" ? { program: "" } : {}),
    }));
  }

  async function handleZeroAttendanceSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const payload: ManualAttendanceInput = {
      studentId: zeroAttendanceForm.studentId.trim(),
      schoolYearId:
        zeroAttendanceForm.schoolYearId ||
        getActiveSchoolYearId(getSelectableSchoolYears(schoolYears)) ||
        undefined,
      name: zeroAttendanceForm.name.trim(),
      yearLevel: zeroAttendanceForm.yearLevel.trim(),
      college: zeroAttendanceForm.college.trim(),
      program: zeroAttendanceForm.program.trim(),
      institution: zeroAttendanceForm.institution.trim(),
      noOfAbsences: 0,
      remarks: ZERO_ATTENDANCE_REMARK,
      attendanceType: "zero_attendance",
    };

    if (!payload.studentId) {
      setZeroAttendanceError("Student ID is required.");
      return;
    }

    if (!payload.name) {
      setZeroAttendanceError("Name is required.");
      return;
    }

    setIsSavingZeroAttendance(true);
    setZeroAttendanceError("");

    try {
      const result = await saveManualAttendanceRecord(payload);

      if (!result?.record) {
        throw new Error("Unable to save zero attendance record.");
      }

      const savedZeroAttendanceRecord = {
        ...result.record,
        import_id: null,
        event_id: null,
        event_name: null,
        remarks: result.record.remarks || ZERO_ATTENDANCE_REMARK,
      } satisfies AttendanceRecord;
      const fine = normalizeManualAttendanceFineForDisplay(
        result.fine,
        savedZeroAttendanceRecord,
      );
      const attendanceRecord = {
        ...savedZeroAttendanceRecord,
        no_of_absences: Math.max(
          getRecordAbsenceCount(savedZeroAttendanceRecord),
          fine ? getFineAbsenceCount(fine) : 0,
        ),
      };

      setStudentId(attendanceRecord.student_id);
      setSearchedId(attendanceRecord.student_id);
      setResultYearFilter(
        attendanceRecord.school_year_id ||
          payload.schoolYearId ||
          ALL_YEARS_VALUE,
      );
      setLookup({
        attendance: [attendanceRecord],
        attendanceEvents: [],
        attendanceRecords: [attendanceRecord],
        schoolYears,
        fines: fine ? [fine] : [],
        fallbackFine: null,
      });
      setZeroAttendanceDialogOpen(false);
      setResultDialogOpen(true);
    } catch (saveError) {
      setZeroAttendanceError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save zero attendance record.",
      );
    } finally {
      setIsSavingZeroAttendance(false);
    }
  }

  async function handleSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanStudentId = studentId.trim();
    if (!cleanStudentId) {
      setError("Please enter your Student ID.");
      setLookup(null);
      setResultDialogOpen(false);
      setEventsDialogOpen(false);
      setZeroAttendanceDialogOpen(false);
      return;
    }

    let completedWeight = 0;
    let attendanceRecordsWeight = 0;

    const updateProgress = (
      percent: number,
      message: string,
      detail: string,
    ) => {
      setSearchProgress({
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

    const updateAttendanceRecordsProgress = (
      progress: LandingAttendanceRecordsPageProgress,
    ) => {
      const nextRecordsWeight = progress.isComplete
        ? 40
        : Math.min(
            36,
            Math.max(
              attendanceRecordsWeight,
              Math.round((progress.loadedRows / 50000) * 36),
            ),
          );

      if (nextRecordsWeight <= attendanceRecordsWeight) return;

      completedWeight += nextRecordsWeight - attendanceRecordsWeight;
      attendanceRecordsWeight = nextRecordsWeight;

      updateProgress(
        Math.min(92, 2 + completedWeight * 0.94),
        "Loading attendance history...",
        `${progress.loadedRows.toLocaleString()} attendance record/s checked from ${progress.pageCount} page/s.`,
      );
    };

    setIsSearching(true);
    setError("");
    setZeroAttendanceError("");
    setSearchedId(cleanStudentId);
    updateProgress(
      2,
      "Searching student records...",
      "Checking attendance, fines, events, and import history from the server.",
    );

    try {
      const attendancePromise = getStudentAttendanceRecords(
        cleanStudentId,
      ).then((attendance) => {
        markProgressStepComplete(
          25,
          "Student attendance loaded...",
          `${attendance.length.toLocaleString()} attendance record/s matched this Student ID.`,
        );

        return attendance;
      });
      const finesPromise = getStudentFines(cleanStudentId).then((fines) => {
        markProgressStepComplete(
          20,
          "Student fines loaded...",
          `${fines.length.toLocaleString()} fine record/s matched this Student ID.`,
        );

        return fines;
      });
      const schoolYearsPromise = listSchoolYears()
        .then((schoolYearRows) => {
          markProgressStepComplete(
            5,
            "School years loaded...",
            `${schoolYearRows.length.toLocaleString()} school year/s checked for record segregation.`,
          );

          return schoolYearRows;
        })
        .catch(() => {
          markProgressStepComplete(
            5,
            "School years skipped...",
            "The search will continue using saved record dates.",
          );

          return [] as SchoolYearRecord[];
        });
      const attendanceEventsPromise = listAttendanceEvents({
        limit: 500,
        offset: 0,
      })
        .then((attendanceEvents) => {
          markProgressStepComplete(
            10,
            "Attendance events loaded...",
            `${attendanceEvents.length.toLocaleString()} event/s checked for matching records.`,
          );

          return attendanceEvents;
        })
        .catch(() => {
          markProgressStepComplete(
            10,
            "Attendance events skipped...",
            "The search will continue using the student attendance records.",
          );

          return [] as AttendanceEvent[];
        });
      const attendanceRecordsPromise = listLandingAttendanceRecords(
        updateAttendanceRecordsProgress,
      )
        .then((attendanceRecords) => {
          if (attendanceRecordsWeight < 40) {
            markProgressStepComplete(
              40 - attendanceRecordsWeight,
              "Attendance history loaded...",
              `${attendanceRecords.length.toLocaleString()} total attendance record/s checked for college-linked events.`,
            );
            attendanceRecordsWeight = 40;
          }

          return attendanceRecords;
        })
        .catch(() => {
          markProgressStepComplete(
            40 - attendanceRecordsWeight,
            "Attendance history skipped...",
            "The search will continue without the full attendance history.",
          );
          attendanceRecordsWeight = 40;

          return [] as AttendanceRecord[];
        });

      const [
        attendance,
        fines,
        schoolYearRows,
        attendanceEvents,
        attendanceRecords,
      ] = await Promise.all([
        attendancePromise,
        finesPromise,
        schoolYearsPromise,
        attendanceEventsPromise,
        attendanceRecordsPromise,
      ]);

      setSchoolYears(schoolYearRows);

      updateProgress(
        98,
        "Preparing search result...",
        "Classifying attendance status and checking related fines.",
      );

      if (!attendance.length && !fines.length) {
        updateProgress(
          100,
          "No saved student record found.",
          "Opening the zero-attendance registration form.",
        );
        openZeroAttendanceRegistration(cleanStudentId, schoolYearRows);
        return;
      }

      const fallbackAbsenceCount = getFallbackAbsenceCount(
        attendance,
        attendanceRecords,
        attendanceEvents,
      );
      const shouldBuildFallbackFine =
        fines.length === 0 && fallbackAbsenceCount > 0;
      const fallbackFine = shouldBuildFallbackFine
        ? buildFallbackFine(
            cleanStudentId,
            attendance,
            fallbackAbsenceCount,
            await resolveFallbackPenalty(fallbackAbsenceCount),
          )
        : null;

      setResultYearFilter(ALL_YEARS_VALUE);
      setLookup({
        attendance,
        attendanceEvents,
        attendanceRecords,
        schoolYears: schoolYearRows,
        fines,
        fallbackFine,
      });
      setResultDialogOpen(true);
      setZeroAttendanceDialogOpen(false);
      updateProgress(
        100,
        "Search complete.",
        "Attendance result is ready to review.",
      );
    } catch (searchError) {
      setLookup(null);
      setResultDialogOpen(false);
      setEventsDialogOpen(false);
      setZeroAttendanceDialogOpen(false);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Unable to search student records.",
      );
    } finally {
      setIsSearching(false);
      setSearchProgress(INITIAL_PROGRESSIVE_LOAD_PROGRESS);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <LogoMark textClassName="text-2xl" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b bg-linear-to-b from-muted/80 to-background">
        <div className="mx-auto min-h-screen px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <a href="/" className="inline-flex">
              <LogoMark textClassName="text-2xl" />
            </a>
            <Button
              asChild
              variant="outline"
              className="min-h-11 rounded-xl px-5 py-2 text-sm font-bold"
            >
              <Link to="/login">SSG Login</Link>
            </Button>
          </header>

          <div className="mx-auto w-full max-w-4xl py-10 text-center lg:py-14">
            <p className="mx-auto mb-4 inline-flex rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
              Attendance and fines lookup by school year for students
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Search your Student ID and view attendance records by school year
              instantly.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Students can check perfect attendance, zero attendance, recorded
              absences, and penalty status without logging in. Enter your
              Student ID to see attendance entries and related fines separated
              by school year.
            </p>

            <form
              onSubmit={handleSearch}
              className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-3 rounded-3xl border bg-card p-3 text-left shadow-xl shadow-black/5 sm:flex-row sm:items-center"
            >
              <label className="sr-only" htmlFor="student-id-search">
                Student ID
              </label>
              <input
                id="student-id-search"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder="Enter Student ID"
                className={`${textInputClassName} sm:flex-1`}
              />
              <Button
                type="submit"
                disabled={isSearching}
                className="min-h-12 w-full rounded-2xl px-6 py-3 text-sm font-black sm:w-auto"
              >
                {isSearching ? "Searching..." : "Search Records"}
              </Button>
            </form>

            {isSearching ? (
              <div className="mx-auto mt-4 w-full max-w-3xl space-y-2 rounded-2xl border bg-card p-4 text-left shadow-sm">
                <div className="flex items-center justify-between gap-3 text-xs font-black text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {searchProgress.message || "Searching student records..."}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {searchProgressPercent}%
                  </span>
                </div>
                <Progress value={searchProgressPercent} />
                <p className="text-xs font-semibold leading-5 text-muted-foreground">
                  {searchProgress.detail ||
                    "Checking attendance records, events, and fines from the server."}
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">
                  Fast lookup
                </p>
                <p className="mt-2 text-3xl font-black">Student ID</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">
                  Segregated status
                </p>
                <p className="mt-2 text-3xl font-black">Perfect / Zero</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">
                  School-year records
                </p>
                <p className="mt-2 text-3xl font-black">Attendance</p>
              </div>
            </div>

            <div className="mx-auto mt-8 w-full max-w-5xl rounded-3xl border bg-card/80 p-4 text-left shadow-xl shadow-black/5 sm:p-6">
              <div className="flex flex-col gap-2 text-center sm:text-left">
                <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Quick access services
                </p>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                  Helpful links for officers, students, and researchers
                </h2>
                <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                  Access the scanner, generate student QR codes, or open the
                  thesis survey and statistics service.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {LANDING_RESOURCE_LINKS.map((resource) => (
                  <article
                    key={resource.href}
                    className="flex h-full flex-col rounded-2xl border bg-background p-5 shadow-sm"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {resource.audience}
                    </p>
                    <h3 className="mt-2 text-lg font-black">
                      {resource.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {resource.description}
                    </p>
                    <Button
                      asChild
                      className="mt-5 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-black"
                    >
                      <a href={resource.href} target="_blank" rel="noreferrer">
                        {resource.cta}
                      </a>
                    </Button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Dialog
        open={Boolean(lookup) && resultDialogOpen}
        onOpenChange={setResultDialogOpen}
      >
        <DialogContent
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="max-h-[95svh] overflow-y-auto sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle>
              Search result for Student ID: {searchedId}
            </DialogTitle>
          </DialogHeader>

          {lookup ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Search result / {selectedYearLabel}
                  </p>
                  <h2 className="text-2xl font-black sm:text-3xl">
                    Student ID: {searchedId}
                  </h2>
                  <p className="mt-2 text-base font-semibold text-muted-foreground">
                    Name: {studentDisplayName || "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                  <label
                    className="sr-only"
                    htmlFor="student-result-year-filter"
                  >
                    Year filter
                  </label>
                  <select
                    id="student-result-year-filter"
                    value={resultYearFilter}
                    onChange={(event) =>
                      setResultYearFilter(event.target.value)
                    }
                    className="min-h-11 rounded-2xl border bg-background px-4 text-sm font-black outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                  >
                    <option value={ALL_YEARS_VALUE}>All school years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {getSchoolYearLabel(lookup.schoolYears, year)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:w-auto">
                <div
                  className={`rounded-2xl border px-5 py-4 ${resultClassificationClassName}`}
                >
                  <p className="text-xs font-bold uppercase">Classification</p>
                  <p className="text-2xl font-black">{resultClassification}</p>
                </div>
                <div className="rounded-2xl border bg-card px-5 py-4">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Total absences
                  </p>
                  <p className="text-2xl font-black">{totalAbsencesLabel}</p>
                  {fallbackFineActive ? (
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      Computed from the configured penalty table.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl border bg-card px-5 py-4">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Unpaid fines
                  </p>
                  <p className="text-2xl font-black">{unpaidFines}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!attendedEvents.length}
                  onClick={() => setEventsDialogOpen(true)}
                  className="min-h-24 rounded-2xl px-5 py-4 text-sm font-black"
                >
                  View Attended Events
                </Button>
              </div>

              {resultClassification === "Perfect attendance" ? (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-700">
                  Perfect attendance record found. Use the attended events
                  button to view the events this student attended.
                </div>
              ) : null}

              {resultClassification === "Zero attendance" ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
                  Zero attendance record found. This student has been recorded
                  with no attended events and the related fine is shown below.
                </div>
              ) : null}

              {fallbackFineActive ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
                  No saved fine record was returned. A computed unpaid fine is
                  shown using the configured penalty table.
                </div>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black">Absent Events</h3>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                      {absentEvents.length} event/s
                    </span>
                  </div>

                  {absentEvents.length ? (
                    <div className="space-y-3 lg:hidden">
                      {absentEvents.map((eventSummary, index) => (
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
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {absentEvents.length ? (
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full min-w-max text-left text-sm">
                        <thead className="border-b text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-3">No.</th>
                            <th className="px-3 py-3">Absent Event</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absentEvents.map((eventSummary, index) => (
                            <tr
                              key={eventSummary.key}
                              className="border-b last:border-b-0"
                            >
                              <td className="px-3 py-3 font-black">
                                {index + 1}
                              </td>
                              <td className="px-3 py-3 font-semibold">
                                {eventSummary.eventName}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                      No absent events found for this Student ID.
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black">Fines</h3>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                      {displayedFines.length} record/s
                    </span>
                  </div>

                  {displayedFines.length ? (
                    <div className="space-y-3">
                      {displayedFines.map((fine) => (
                        <article
                          key={fine.id}
                          className="rounded-2xl border bg-background p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black">
                                  {fine.prescribed_penalty}
                                </p>
                                {isZeroAttendanceFine(fine) ? (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                                    Zero attendance
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Total:{" "}
                                {formatAbsenceCount(
                                  getDisplayedFineAbsenceCount(
                                    fine,
                                    totalAbsences,
                                    hasZeroAttendanceForDisplay,
                                  ),
                                  isFallbackFine(fine) &&
                                    getFineAbsenceCount(fine) >= 10,
                                )}{" "}
                                • {formatDate(fine.created_at)}
                                {isFallbackFine(fine) ? " • computed" : ""}
                              </p>
                            </div>
                            {statusBadge(fine.status)}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                      No fine record found.
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </DialogContent>
      </Dialog>

      <ZeroAttendanceRegistrationDialog
        open={zeroAttendanceDialogOpen}
        onOpenChange={setZeroAttendanceDialogOpen}
        form={zeroAttendanceForm}
        schoolYears={schoolYears}
        error={zeroAttendanceError}
        isSaving={isSavingZeroAttendance}
        onFieldChange={handleZeroAttendanceFieldChange}
        onSubmit={handleZeroAttendanceSubmit}
      />

      <StudentAttendedEventsDialog
        open={eventsDialogOpen}
        onOpenChange={setEventsDialogOpen}
        studentId={searchedId}
        studentName={studentDisplayName}
        events={attendedEvents}
      />
    </main>
  );
}