import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStudentAttendanceRecords } from "../api/attendance";
import type { AttendanceRecord } from "../api/attendance";
import { getStudentFines, matchPenalty, registerZeroAttendanceFine } from "../api/fines";
import type { FineRecord, PenaltyRecord, ZeroAttendanceFinePayload } from "../api/fines";
import { LogoMark } from "../components/layout";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

type LookupState = {
  attendance: AttendanceRecord[];
  fines: FineRecord[];
  fallbackFine: FineRecord | null;
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
  "accessToken"
];

const LANDING_RESOURCE_LINKS = [
  {
    audience: "SSG Officers",
    title: "Download QR Scanner",
    description: "Download the scanner for checking student QR codes during attendance and monitoring.",
    href: "https://drive.google.com/file/d/19vu1IvWgpmASxRWUVDjIpe9ql6kbqrPw/view?usp=sharing",
    cta: "Download Scanner"
  },
  {
    audience: "Students",
    title: "Generate Student QR Code",
    description: "Create your QR code using your student details before presenting it for scanning.",
    href: "https://ssg-qrcode-generator.vercel.app/",
    cta: "Generate QR Code"
  },
  {
    audience: "Researchers",
    title: "Survey and Statistics Support",
    description: "Access external services for thesis Chapter IV survey and statistics needs.",
    href: "https://surveystat.jrmsu-tc.online/",
    cta: "Visit SurveyStat"
  }
] as const;

const ZERO_ATTENDANCE_REMARK = "Zero attendance registration from landing page.";
const ALL_YEARS_VALUE = "__all_years__";

const emptyZeroAttendanceForm: ZeroAttendanceFormState = {
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: ""
};

const textInputClassName =
  "min-h-12 w-full rounded-2xl border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20";

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
      return parsedNumericValue < 1_000_000_000_000 ? parsedNumericValue * 1000 : parsedNumericValue;
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
      payload.id
  );
}

function hasStoredSessionValue(value: string | null) {
  if (!value) return false;

  const cleanValue = value.trim();
  if (!cleanValue || cleanValue === "null" || cleanValue === "undefined") return false;

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
      return AUTH_STORAGE_KEYS.some((key) => hasStoredSessionValue(storageArea.getItem(key)));
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
    day: "2-digit"
  }).format(date);
}

function statusBadge(status: FineRecord["status"]) {
  const styles: Record<FineRecord["status"], string> = {
    unpaid: "border-red-200 bg-red-50 text-red-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    waived: "border-blue-200 bg-blue-50 text-blue-700"
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatAbsenceCount(value: number, forceTenPlus = false) {
  const numericValue = Number(value || 0);

  if (forceTenPlus || numericValue >= 10) return "10+";

  return String(numericValue);
}

function getTotalAbsences(attendance: AttendanceRecord[], fines: FineRecord[] = []) {
  const attendanceAbsences = attendance.map((row) => Number(row.no_of_absences || 0));
  const fineAbsences = fines.map((fine) => Number(fine.no_of_absences || 0));

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

function getAttendanceRecordYear(record: AttendanceRecord) {
  return getDateYear(record.scanned_at ?? record.created_at ?? null);
}

function getFineRecordYear(fine: FineRecord) {
  return getDateYear(fine.created_at ?? null);
}

function getLookupYearOptions(attendance: AttendanceRecord[], fines: FineRecord[]) {
  return Array.from(
    new Set([
      ...attendance.map(getAttendanceRecordYear),
      ...fines.map(getFineRecordYear)
    ].filter(Boolean))
  ).sort((left, right) => Number(right) - Number(left));
}

function matchesSelectedYear(recordYear: string, selectedYear: string) {
  return selectedYear === ALL_YEARS_VALUE || recordYear === selectedYear;
}

function getRecordEventName(record: AttendanceRecord) {
  if (record.event_name) return record.event_name;
  return record.import_id ? "File import" : "Manual attendance";
}

function normalizeEventKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const eventNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function parseEventSequence(value?: string | null) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return null;

  const sequencePatterns = [
    /^#?0*(\d+)\s*(?:[.)-]|$)/,
    /\b(?:event|activity|program|attendance|attended|day|no\.?)[\s_-]*#?0*(\d+)\b/i,
    /\b0*(\d+)\s*(?:st|nd|rd|th)?\s*(?:event|activity|program|attendance|day)\b/i
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
    record.remarks
  ];

  for (const candidate of candidates) {
    const sequence = parseEventSequence(candidate);
    if (sequence !== null) return sequence;
  }

  return null;
}

function getSummaryEventSequence(summary: StudentAttendedEventSummary) {
  const directSequence = parseEventSequence(summary.eventName) ?? parseEventSequence(summary.key);
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
  rightSummary: StudentAttendedEventSummary
) {
  const leftSequence = getSummaryEventSequence(leftSummary);
  const rightSequence = getSummaryEventSequence(rightSummary);

  if (leftSequence !== null || rightSequence !== null) {
    if (leftSequence === null) return 1;
    if (rightSequence === null) return -1;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  }

  const timeDifference = getSummaryEarliestTime(leftSummary) - getSummaryEarliestTime(rightSummary);
  if (timeDifference !== 0) return timeDifference;

  return eventNameCollator.compare(leftSummary.eventName, rightSummary.eventName);
}

function isZeroAttendanceRecord(record: AttendanceRecord) {
  return !record.event_id && String(record.remarks ?? "").toLowerCase().includes("zero attendance");
}

function isZeroAttendanceFine(fine: FineRecord) {
  return (
    !fine.attendance_event_id &&
    String(fine.attendance_remarks ?? "").toLowerCase().includes("zero attendance")
  );
}

function hasZeroAttendanceResult(attendance: AttendanceRecord[], fines: FineRecord[]) {
  return attendance.some(isZeroAttendanceRecord) || fines.some(isZeroAttendanceFine);
}

function getStudentDisplayName(attendance: AttendanceRecord[], fines: FineRecord[], fallbackId: string) {
  return attendance.find((record) => record.name)?.name || fines.find((fine) => fine.name)?.name || fallbackId;
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
    normalizeDisplayValue(record.remarks)
  ].join("::");
}

function getUniqueDisplayAttendance(attendance: AttendanceRecord[]) {
  const uniqueAttendance = new Map<string, AttendanceRecord>();

  attendance.forEach((record) => {
    const key = getAttendanceDisplayKey(record);
    const savedRecord = uniqueAttendance.get(key);

    if (!savedRecord || getRecordTimestamp(record) > getRecordTimestamp(savedRecord)) {
      uniqueAttendance.set(key, record);
    }
  });

  return Array.from(uniqueAttendance.values()).sort((leftRecord, rightRecord) => {
    return getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord);
  });
}

function getStudentAttendedEventSummaries(attendance: AttendanceRecord[]) {
  const summaries = new Map<string, StudentAttendedEventSummary>();

  getUniqueDisplayAttendance(attendance)
    .filter((record) => !isZeroAttendanceRecord(record) && (record.event_id || record.event_name || record.import_id))
    .forEach((record) => {
      const eventName = getRecordEventName(record);
      const key = record.event_id || normalizeEventKey(eventName) || `attendance-event-${record.id}`;
      const currentSummary = summaries.get(key);
      const recordTime = getRecordTimestamp(record);

      if (!currentSummary) {
        summaries.set(key, {
          key,
          eventName,
          latestScannedAt: record.scanned_at ?? record.created_at ?? null,
          records: [record],
          totalAbsences: 0
        });
        return;
      }

      const latestTime = currentSummary.latestScannedAt ? new Date(currentSummary.latestScannedAt).getTime() : 0;

      currentSummary.records.push(record);

      if (recordTime > (Number.isNaN(latestTime) ? 0 : latestTime)) {
        currentSummary.latestScannedAt = record.scanned_at ?? record.created_at ?? currentSummary.latestScannedAt;
      }
    });

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(leftRecord) - getRecordTimestamp(rightRecord);
      })
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

function isFineLinkedToAttendanceRecord(fine: FineRecord, record: AttendanceRecord) {
  const fineAttendanceRecordId = getFineAttendanceRecordId(fine);
  const fineAttendanceEventId = getFineAttendanceEventId(fine);

  return Boolean(
    (fineAttendanceRecordId && fineAttendanceRecordId === String(record.id ?? "")) ||
      (fineAttendanceEventId && fineAttendanceEventId === String(record.event_id ?? ""))
  );
}

function isExplicitAbsentAttendanceRecord(record: AttendanceRecord) {
  const recordData = record as Record<string, unknown>;
  const statusValues = [
    recordData.status,
    recordData.attendance_status,
    recordData.classification,
    recordData.result,
    record.remarks
  ]
    .map(normalizeDisplayValue)
    .filter(Boolean);

  return statusValues.some((value) => /(^|\s)(absent|absence|missed|not attended|unattended|no show)(\s|$)/.test(value));
}

function getFineAbsentEventName(fine: FineRecord) {
  const remarks = String(fine.attendance_remarks ?? "").trim();
  if (remarks) return remarks;

  const eventId = getFineAttendanceEventId(fine);
  if (eventId) return `Event ${eventId}`;

  return "Absence record";
}

function getSummaryAbsentEventRemarks(summary: StudentAbsentEventSummary) {
  const remarks = Array.from(
    new Set([
      ...summary.records.map((record) => String(record.remarks ?? "").trim()),
      ...summary.remarks
    ].filter(Boolean))
  );

  return remarks.length ? remarks.join(" • ") : "—";
}

function getAbsentEventSequence(summary: StudentAbsentEventSummary) {
  const directSequence = parseEventSequence(summary.eventName) ?? parseEventSequence(summary.key);
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

  const latestTime = summary.latestScannedAt ? new Date(summary.latestScannedAt).getTime() : 0;

  return Number.isNaN(latestTime) ? 0 : latestTime;
}

function compareStudentAbsentEventSummaries(
  leftSummary: StudentAbsentEventSummary,
  rightSummary: StudentAbsentEventSummary
) {
  const leftSequence = getAbsentEventSequence(leftSummary);
  const rightSequence = getAbsentEventSequence(rightSummary);

  if (leftSequence !== null || rightSequence !== null) {
    if (leftSequence === null) return 1;
    if (rightSequence === null) return -1;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  }

  const timeDifference = getAbsentSummaryEarliestTime(leftSummary) - getAbsentSummaryEarliestTime(rightSummary);
  if (timeDifference !== 0) return timeDifference;

  return eventNameCollator.compare(leftSummary.eventName, rightSummary.eventName);
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
  }
) {
  const currentSummary = summaries.get(props.key);
  const nextRecords = props.records ?? [];
  const nextRemarks = props.remarks ?? [];
  const nextTotalAbsences = Math.max(1, Number(props.totalAbsences ?? nextRecords.length ?? 1));
  const nextTime = props.latestScannedAt ? new Date(props.latestScannedAt).getTime() : 0;

  if (!currentSummary) {
    summaries.set(props.key, {
      key: props.key,
      eventName: props.eventName,
      latestScannedAt: props.latestScannedAt,
      records: nextRecords,
      remarks: nextRemarks,
      totalAbsences: nextTotalAbsences
    });
    return;
  }

  const currentTime = currentSummary.latestScannedAt ? new Date(currentSummary.latestScannedAt).getTime() : 0;

  currentSummary.records.push(...nextRecords);
  currentSummary.remarks.push(...nextRemarks);
  currentSummary.totalAbsences = Math.max(currentSummary.totalAbsences, nextTotalAbsences);

  if (nextTime > (Number.isNaN(currentTime) ? 0 : currentTime)) {
    currentSummary.latestScannedAt = props.latestScannedAt ?? currentSummary.latestScannedAt;
  }
}

function getStudentAbsentEventSummaries(attendance: AttendanceRecord[], fines: FineRecord[] = []) {
  const summaries = new Map<string, StudentAbsentEventSummary>();
  const uniqueAttendance = getUniqueDisplayAttendance(attendance).filter((record) => !isZeroAttendanceRecord(record));
  const explicitAbsentRecords = uniqueAttendance.filter(isExplicitAbsentAttendanceRecord);
  const absenceFines = fines.filter(
    (fine) => !isFallbackFine(fine) && !isZeroAttendanceFine(fine) && getFineAbsenceCount(fine) > 0
  );
  const usedAbsentRecordIds = new Set<string>();

  absenceFines.forEach((fine) => {
    const matchingRecords = uniqueAttendance.filter((record) => isFineLinkedToAttendanceRecord(fine, record));
    const remarks = String(fine.attendance_remarks ?? "").trim();

    matchingRecords.forEach((record) => {
      usedAbsentRecordIds.add(record.id);

      const eventName = getRecordEventName(record);
      const key = record.event_id || normalizeEventKey(eventName) || `absent-event-${record.id}`;

      addAbsentEventSummary(summaries, {
        key,
        eventName,
        latestScannedAt: record.scanned_at ?? record.created_at ?? fine.created_at ?? fine.updated_at ?? null,
        records: [record],
        remarks: remarks ? [remarks] : [],
        totalAbsences: getFineAbsenceCount(fine) || getRecordAbsenceCount(record) || 1
      });
    });

    if (!matchingRecords.length) {
      const fineRecordId = getFineAttendanceRecordId(fine);
      const fineEventId = getFineAttendanceEventId(fine);
      const key = fineRecordId || fineEventId || fine.id;

      addAbsentEventSummary(summaries, {
        key: `fine-absent-event-${key}`,
        eventName: getFineAbsentEventName(fine),
        latestScannedAt: fine.created_at ?? fine.updated_at ?? null,
        remarks: remarks ? [remarks] : [],
        totalAbsences: getFineAbsenceCount(fine)
      });
    }
  });

  explicitAbsentRecords
    .filter((record) => !usedAbsentRecordIds.has(record.id))
    .forEach((record) => {
      const eventName = getRecordEventName(record);
      const key = record.event_id || normalizeEventKey(eventName) || `absent-event-${record.id}`;

      addAbsentEventSummary(summaries, {
        key,
        eventName,
        latestScannedAt: record.scanned_at ?? record.created_at ?? null,
        records: [record],
        totalAbsences: getRecordAbsenceCount(record) || 1
      });
    });

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      remarks: Array.from(new Set(summary.remarks)),
      records: [...summary.records].sort((leftRecord, rightRecord) => {
        return getRecordTimestamp(leftRecord) - getRecordTimestamp(rightRecord);
      })
    }))
    .sort(compareStudentAbsentEventSummaries);
}

function getFallbackAbsenceCount(attendance: AttendanceRecord[]) {
  if (attendance.some(isZeroAttendanceRecord)) return getTotalAbsences(attendance);

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
}) {
  if (hasZeroAttendanceResult(props.attendance, props.fines)) {
    return getTotalAbsences(props.attendance, props.fines);
  }

  if (!props.absentEvents.length) return 0;

  return Math.max(
    props.absentEvents.length,
    ...props.absentEvents.map((eventSummary) => eventSummary.totalAbsences)
  );
}

function shouldDisplayFine(fine: FineRecord, absentEvents: StudentAbsentEventSummary[], hasZeroAttendance: boolean) {
  if (hasZeroAttendance || isZeroAttendanceFine(fine)) return true;
  if (isFallbackFine(fine)) return absentEvents.length > 0;

  return getFineAbsenceCount(fine) > 0;
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
    Number(fine.no_of_absences || 0),
    normalizeFineDisplayValue(fine.prescribed_penalty)
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
  penalty: PenaltyRecord | null
): FineRecord {
  const latestAttendance = attendance[0];
  const now = new Date().toISOString();

  return {
    id: `fallback-fine-${studentId}-${noOfAbsences}`,
    attendance_record_id: latestAttendance?.id ?? null,
    penalty_id: penalty?.id ?? null,
    student_id: latestAttendance?.student_id ?? studentId,
    name: latestAttendance?.name ?? "Student record pending",
    no_of_absences: noOfAbsences,
    prescribed_penalty: penalty?.prescribed_penalty ?? "No prescribed penalty configured.",
    status: "unpaid",
    attendance_event_id: latestAttendance?.event_id ?? null,
    attendance_remarks: latestAttendance?.remarks ?? null,
    created_at: String(latestAttendance?.created_at ?? now),
    updated_at: String(latestAttendance?.updated_at ?? latestAttendance?.created_at ?? now)
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
    props.lookup.attendance.some(isZeroAttendanceRecord) || props.displayedFines.some(isZeroAttendanceFine);

  if (hasZeroAttendanceRecord) return "Zero attendance";
  if (props.attendedEvents.length > 0 && props.totalAbsences === 0 && props.displayedFines.length === 0) {
    return "Perfect attendance";
  }

  if (props.totalAbsences > 0 || props.displayedFines.length > 0) return "With absences";

  return "No attendance record";
}

function getClassificationStyle(classification: string) {
  if (classification === "Perfect attendance") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (classification === "Zero attendance") return "border-red-200 bg-red-50 text-red-700";
  if (classification === "With absences") return "border-amber-200 bg-amber-50 text-amber-800";
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
          <DialogTitle>Events attended by {props.studentName || props.studentId}</DialogTitle>
        </DialogHeader>

        {props.events.length ? (
          <div className="space-y-3">
            {props.events.map((eventSummary, index) => (
              <article key={eventSummary.key} className="rounded-2xl border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-black">{eventSummary.eventName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Latest {formatDate(eventSummary.latestScannedAt)} • {eventSummary.records.length} record/s
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {eventSummary.records.map((record) => (
                    <div key={record.id} className="rounded-xl border bg-card px-3 py-2 text-sm">
                      <p className="font-semibold">{formatDate(record.scanned_at ?? record.created_at)}</p>
                      <p className="mt-1 text-muted-foreground">{record.remarks || "No remarks"}</p>
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
  error: string;
  isSaving: boolean;
  onFieldChange: (field: keyof ZeroAttendanceFormState, value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
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
            This Student ID has no saved attendance or fine record. Fill out the attendee details to register the
            student as zero attendance and create the related fine record.
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
                onChange={(event) => props.onFieldChange("studentId", event.target.value)}
                placeholder="Student ID"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Name</span>
              <input
                value={props.form.name}
                onChange={(event) => props.onFieldChange("name", event.target.value)}
                placeholder="Full name"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Year Level</span>
              <input
                value={props.form.yearLevel}
                onChange={(event) => props.onFieldChange("yearLevel", event.target.value)}
                placeholder="Year level"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>College</span>
              <input
                value={props.form.college}
                onChange={(event) => props.onFieldChange("college", event.target.value)}
                placeholder="College"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Program</span>
              <input
                value={props.form.program}
                onChange={(event) => props.onFieldChange("program", event.target.value)}
                placeholder="Program"
                className={textInputClassName}
              />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Institution</span>
              <input
                value={props.form.institution}
                onChange={(event) => props.onFieldChange("institution", event.target.value)}
                placeholder="Institution"
                className={textInputClassName}
              />
            </label>
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
            <Button type="submit" disabled={props.isSaving} className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black">
              {props.isSaving ? "Saving..." : "Save Zero Attendance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [searchedId, setSearchedId] = useState("");
  const [resultYearFilter, setResultYearFilter] = useState(ALL_YEARS_VALUE);
  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [zeroAttendanceDialogOpen, setZeroAttendanceDialogOpen] = useState(false);
  const [zeroAttendanceForm, setZeroAttendanceForm] = useState<ZeroAttendanceFormState>(emptyZeroAttendanceForm);
  const [isSavingZeroAttendance, setIsSavingZeroAttendance] = useState(false);
  const [zeroAttendanceError, setZeroAttendanceError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasCurrentSession()) {
      navigate("/dashboard", { replace: true });
      return;
    }

    setIsCheckingSession(false);
  }, [navigate]);

  const lookupFines = useMemo(() => {
    if (!lookup) return [];
    return lookup.fallbackFine ? [lookup.fallbackFine] : lookup.fines;
  }, [lookup]);
  const yearOptions = useMemo(() => {
    return lookup ? getLookupYearOptions(lookup.attendance, lookupFines) : [];
  }, [lookup, lookupFines]);
  const selectedYearLabel = resultYearFilter === ALL_YEARS_VALUE ? "All years" : resultYearFilter;

  useEffect(() => {
    if (resultYearFilter !== ALL_YEARS_VALUE && !yearOptions.includes(resultYearFilter)) {
      setResultYearFilter(ALL_YEARS_VALUE);
    }
  }, [resultYearFilter, yearOptions]);

  const displayedAttendance = useMemo(() => {
    if (!lookup) return [];

    return getUniqueDisplayAttendance(
      lookup.attendance.filter((record) =>
        matchesSelectedYear(getAttendanceRecordYear(record), resultYearFilter),
      ),
    );
  }, [lookup, resultYearFilter]);

  const allDisplayedFines = useMemo(() => {
    return getUniqueDisplayFines(
      lookupFines.filter((fine) => matchesSelectedYear(getFineRecordYear(fine), resultYearFilter)),
    );
  }, [lookupFines, resultYearFilter]);

  const fallbackFineActive = Boolean(lookup?.fallbackFine);
  const attendedEvents = useMemo(() => {
    return getStudentAttendedEventSummaries(displayedAttendance);
  }, [displayedAttendance]);
  const absentEvents = useMemo(() => {
    return getStudentAbsentEventSummaries(displayedAttendance, allDisplayedFines);
  }, [displayedAttendance, allDisplayedFines]);
  const hasZeroAttendanceForDisplay = useMemo(() => {
    return hasZeroAttendanceResult(displayedAttendance, allDisplayedFines);
  }, [displayedAttendance, allDisplayedFines]);
  const displayedFines = useMemo(() => {
    return allDisplayedFines.filter((fine) => shouldDisplayFine(fine, absentEvents, hasZeroAttendanceForDisplay));
  }, [allDisplayedFines, absentEvents, hasZeroAttendanceForDisplay]);
  const totalAbsences = useMemo(() => {
    return getVerifiedTotalAbsences({
      attendance: displayedAttendance,
      fines: displayedFines,
      absentEvents
    });
  }, [displayedAttendance, displayedFines, absentEvents]);

  const unpaidFines = useMemo(() => {
    return displayedFines.filter((fine) => fine.status === "unpaid").length;
  }, [displayedFines]);

  const studentDisplayName = useMemo(() => {
    return lookup ? getStudentDisplayName(displayedAttendance, allDisplayedFines, searchedId) : searchedId;
  }, [lookup, displayedAttendance, allDisplayedFines, searchedId]);
  const totalAbsencesLabel = formatAbsenceCount(totalAbsences);
  const resultClassification = useMemo(
    () => getResultClassification({ lookup, displayedFines, totalAbsences, attendedEvents }),
    [lookup, displayedFines, totalAbsences, attendedEvents]
  );
  const resultClassificationClassName = getClassificationStyle(resultClassification);

  function openZeroAttendanceRegistration(cleanStudentId: string) {
    setLookup(null);
    setResultDialogOpen(false);
    setEventsDialogOpen(false);
    setZeroAttendanceError("");
    setResultYearFilter(ALL_YEARS_VALUE);
    setZeroAttendanceForm({ ...emptyZeroAttendanceForm, studentId: cleanStudentId });
    setZeroAttendanceDialogOpen(true);
  }

  function handleZeroAttendanceFieldChange(field: keyof ZeroAttendanceFormState, value: string) {
    setZeroAttendanceForm((current) => ({ ...current, [field]: value }));
  }

  async function handleZeroAttendanceSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: ZeroAttendanceFinePayload = {
      studentId: zeroAttendanceForm.studentId.trim(),
      name: zeroAttendanceForm.name.trim(),
      yearLevel: zeroAttendanceForm.yearLevel.trim(),
      college: zeroAttendanceForm.college.trim(),
      program: zeroAttendanceForm.program.trim(),
      institution: zeroAttendanceForm.institution.trim()
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
      const result = await registerZeroAttendanceFine(payload);
      const attendanceRecord = {
        ...result.attendanceRecord,
        remarks: result.attendanceRecord.remarks || ZERO_ATTENDANCE_REMARK
      };

      setStudentId(result.attendanceRecord.student_id);
      setSearchedId(result.attendanceRecord.student_id);
      setResultYearFilter(ALL_YEARS_VALUE);
      setLookup({
        attendance: [attendanceRecord],
        fines: result.fine ? [result.fine] : [],
        fallbackFine: null
      });
      setZeroAttendanceDialogOpen(false);
      setResultDialogOpen(true);
    } catch (saveError) {
      setZeroAttendanceError(saveError instanceof Error ? saveError.message : "Unable to save zero attendance record.");
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

    setIsSearching(true);
    setError("");
    setZeroAttendanceError("");
    setSearchedId(cleanStudentId);

    try {
      const [attendance, fines] = await Promise.all([
        getStudentAttendanceRecords(cleanStudentId),
        getStudentFines(cleanStudentId)
      ]);

      if (!attendance.length && !fines.length) {
        openZeroAttendanceRegistration(cleanStudentId);
        return;
      }

      const fallbackAbsenceCount = getFallbackAbsenceCount(attendance);
      const shouldBuildFallbackFine = fines.length === 0 && fallbackAbsenceCount > 0;
      const fallbackFine = shouldBuildFallbackFine
        ? buildFallbackFine(
            cleanStudentId,
            attendance,
            fallbackAbsenceCount,
            await resolveFallbackPenalty(fallbackAbsenceCount)
          )
        : null;

      setResultYearFilter(ALL_YEARS_VALUE);
      setLookup({ attendance, fines, fallbackFine });
      setResultDialogOpen(true);
      setZeroAttendanceDialogOpen(false);
    } catch (searchError) {
      setLookup(null);
      setResultDialogOpen(false);
      setEventsDialogOpen(false);
      setZeroAttendanceDialogOpen(false);
      setError(searchError instanceof Error ? searchError.message : "Unable to search student records.");
    } finally {
      setIsSearching(false);
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
            <Button asChild variant="outline" className="min-h-11 rounded-xl px-5 py-2 text-sm font-bold">
              <Link to="/login">SSG Login</Link>
            </Button>
          </header>

          <div className="mx-auto w-full max-w-4xl py-10 text-center lg:py-14">
            <p className="mx-auto mb-4 inline-flex rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
              Attendance and fines lookup by year for students
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Search your Student ID and view attendance records by year instantly.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Students can check perfect attendance, zero attendance, recorded absences, and penalty status without
              logging in. Enter your Student ID to see attendance entries and related fines separated by year.
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
              <Button type="submit" disabled={isSearching} className="min-h-12 w-full rounded-2xl px-6 py-3 text-sm font-black sm:w-auto">
                {isSearching ? "Searching..." : "Search Records"}
              </Button>
            </form>

            {error ? (
              <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">Fast lookup</p>
                <p className="mt-2 text-3xl font-black">Student ID</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">Segregated status</p>
                <p className="mt-2 text-3xl font-black">Perfect / Zero</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">Yearly records</p>
                <p className="mt-2 text-3xl font-black">Attendance</p>
              </div>
            </div>

            <div className="mx-auto mt-8 w-full max-w-5xl rounded-3xl border bg-card/80 p-4 text-left shadow-xl shadow-black/5 sm:p-6">
              <div className="flex flex-col gap-2 text-center sm:text-left">
                <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Quick access services</p>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Helpful links for officers, students, and researchers</h2>
                <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                  Access the scanner, generate student QR codes, or open the thesis survey and statistics service.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {LANDING_RESOURCE_LINKS.map((resource) => (
                  <article key={resource.href} className="flex h-full flex-col rounded-2xl border bg-background p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{resource.audience}</p>
                    <h3 className="mt-2 text-lg font-black">{resource.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{resource.description}</p>
                    <Button asChild className="mt-5 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-black">
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

      <Dialog open={Boolean(lookup) && resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="max-h-[95svh] overflow-y-auto sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle>Search result for Student ID: {searchedId}</DialogTitle>
          </DialogHeader>

          {lookup ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Search result / {selectedYearLabel}</p>
                  <h2 className="text-2xl font-black sm:text-3xl">Student ID: {searchedId}</h2>
                  <p className="mt-2 text-base font-semibold text-muted-foreground">Name: {studentDisplayName || "—"}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                  <label className="sr-only" htmlFor="student-result-year-filter">
                    Year filter
                  </label>
                  <select
                    id="student-result-year-filter"
                    value={resultYearFilter}
                    onChange={(event) => setResultYearFilter(event.target.value)}
                    className="min-h-11 rounded-2xl border bg-background px-4 text-sm font-black outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                  >
                    <option value={ALL_YEARS_VALUE}>All years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:w-auto">
                  <div className={`rounded-2xl border px-5 py-4 ${resultClassificationClassName}`}>
                    <p className="text-xs font-bold uppercase">Classification</p>
                    <p className="text-2xl font-black">{resultClassification}</p>
                  </div>
                  <div className="rounded-2xl border bg-card px-5 py-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Total absences</p>
                    <p className="text-2xl font-black">{totalAbsencesLabel}</p>
                    {fallbackFineActive ? (
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        Computed from the configured penalty table.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border bg-card px-5 py-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Unpaid fines</p>
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
                  Perfect attendance record found. Use the attended events button to view the events this student attended.
                </div>
              ) : null}

              {resultClassification === "Zero attendance" ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
                  Zero attendance record found. This student has been recorded with no attended events and the related fine is shown below.
                </div>
              ) : null}

              {fallbackFineActive ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
                  No saved fine record was returned. A computed unpaid fine is shown using the configured penalty table.
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
                        <article key={eventSummary.key} className="rounded-2xl border bg-background p-4">
                          <div className="flex gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="wrap-break-word font-black">{eventSummary.eventName}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatDate(eventSummary.latestScannedAt)} • Total:{" "}
                                {formatAbsenceCount(eventSummary.totalAbsences)}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">{getSummaryAbsentEventRemarks(eventSummary)}</p>
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
                            <th className="px-3 py-3">Date</th>
                            <th className="px-3 py-3">Absences</th>
                            <th className="px-3 py-3">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absentEvents.map((eventSummary, index) => (
                            <tr key={eventSummary.key} className="border-b last:border-b-0">
                              <td className="px-3 py-3 font-black">{index + 1}</td>
                              <td className="px-3 py-3 font-semibold">{eventSummary.eventName}</td>
                              <td className="px-3 py-3">{formatDate(eventSummary.latestScannedAt)}</td>
                              <td className="px-3 py-3">{formatAbsenceCount(eventSummary.totalAbsences)}</td>
                              <td className="px-3 py-3 text-muted-foreground">{getSummaryAbsentEventRemarks(eventSummary)}</td>
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
                        <article key={fine.id} className="rounded-2xl border bg-background p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black">{fine.prescribed_penalty}</p>
                                {isZeroAttendanceFine(fine) ? (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                                    Zero attendance
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Total: {formatAbsenceCount(fine.no_of_absences, isFallbackFine(fine) && fine.no_of_absences >= 10)} •{" "}
                                {formatDate(fine.created_at)}
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