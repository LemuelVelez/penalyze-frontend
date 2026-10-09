import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceRecord,
  deleteManualAttendanceRecordsByIds,
  listAllAttendanceRecords,
  listAllManualAttendanceRecords,
  listAttendanceEvents,
  listAttendanceFinalResults,
  saveManualAttendanceRecord,
  updateAttendanceRecord,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceFinalResultRecord,
  AttendanceRecord,
  ManualAttendanceInput,
  ManualAttendanceRecord,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { ActionMenu } from "../../components/action-menu";
import { ProtectedDeleteDialog } from "../../components/protected-delete-dialog";
import { SortSelect } from "../../components/sort-select";
import { LoadingStatus } from "../../components/loading-status";
import type { LoadingStatusStep } from "../../components/loading-status";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { DateTimePicker } from "../../components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { sortByDate, useSortOrderSearchParam } from "../../lib/sort";
import {
  QR_CODE_COLLEGE_OPTIONS,
  getStudentProgramOptions,
} from "../../lib/colleges";
import {
  QR_CODE_YEAR_LEVEL_OPTIONS,
  isStudentExemptFromEvent,
} from "../../lib/year-levels";

type ManualAttendanceFormState = {
  schoolYearId: string;
  eventIds: string[];
  scannedAt: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
};

type ManualAttendanceStudentGroup = {
  key: string;
  studentId: string;
  name: string;
  yearLevel: string;
  college: string;
  program: string;
  institution: string;
  remarks: string;
  latestChangedAt: string | null;
  attendanceType: ManualAttendanceRecord["attendance_type"];
  records: ManualAttendanceRecord[];
  events: ManualAttendanceRecord[];
};

type ManualPageLoadProgress = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
};

type ManualAttendanceSaveProgress = ManualPageLoadProgress & {
  title: string;
};


type CalculatedEventDetail = NonNullable<
  AttendanceFinalResultRecord["event_details"]
>[number];

type StudentCalculatedEventsEntry = {
  finalResult: AttendanceFinalResultRecord | null;
  attendedEvents: CalculatedEventDetail[];
};

type CombinedAttendedEvent = {
  id: string;
  name: string;
  event_order: number | null;
  scanned_at: string | null;
  remarks: string | null;
  source: "Uploaded" | "Manual";
};

const DEFAULT_STUDENT_INSTITUTION =
  "Jose Rizal Memorial State University - Tampilisan Campus";
const ZERO_ATTENDANCE_REMARK =
  "Zero attendance registration from landing page.";

const QR_CODE_INSTITUTION_OPTIONS = [DEFAULT_STUDENT_INSTITUTION] as const;

const customSelectInputClassName = "min-h-12 rounded-2xl";

const emptyForm: ManualAttendanceFormState = {
  schoolYearId: "",
  eventIds: [],
  scannedAt: "",
  studentId: "",
  name: "",
  yearLevel: "",
  college: "",
  program: "",
  institution: DEFAULT_STUDENT_INSTITUTION,
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

function matchesDateRange(
  value: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  if (!fromDate && !toDate) return true;
  if (!value) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const localDate = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");

  return (!fromDate || localDate >= fromDate) && (!toDate || localDate <= toDate);
}

function formatDateTimeInputValue(value = new Date()) {
  const offset = value.getTimezoneOffset();
  const localDate = new Date(value.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function normalizeStudentId(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function getStudentCalculatedEventsCacheKey(
  studentId: unknown,
  schoolYearId: unknown,
) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const normalizedSchoolYearId = String(schoolYearId ?? "").trim();

  return normalizedStudentId && normalizedSchoolYearId
    ? `${normalizedStudentId}|${normalizedSchoolYearId}`
    : "";
}

function useStudentCalculatedEvents(studentId: string, schoolYearId: string) {
  const cacheRef = useRef(new Map<string, StudentCalculatedEventsEntry>());
  const errorsRef = useRef(new Map<string, string>());
  const loadingKeysRef = useRef(new Set<string>());
  const inFlightRef = useRef(
    new Map<string, Promise<StudentCalculatedEventsEntry | null>>(),
  );
  const [, setCacheVersion] = useState(0);

  const refresh = useCallback(() => {
    setCacheVersion((version) => version + 1);
  }, []);

  const getCached = useCallback(
    (targetStudentId: string, targetSchoolYearId: string) => {
      const key = getStudentCalculatedEventsCacheKey(
        targetStudentId,
        targetSchoolYearId,
      );
      return key ? cacheRef.current.get(key) : undefined;
    },
    [],
  );

  const getError = useCallback(
    (targetStudentId: string, targetSchoolYearId: string) => {
      const key = getStudentCalculatedEventsCacheKey(
        targetStudentId,
        targetSchoolYearId,
      );
      return key ? errorsRef.current.get(key) ?? "" : "";
    },
    [],
  );

  const isLoading = useCallback(
    (targetStudentId: string, targetSchoolYearId: string) => {
      const key = getStudentCalculatedEventsCacheKey(
        targetStudentId,
        targetSchoolYearId,
      );
      return Boolean(key && loadingKeysRef.current.has(key));
    },
    [],
  );

  const load = useCallback(
    async (
      targetStudentId = studentId,
      targetSchoolYearId = schoolYearId,
    ): Promise<StudentCalculatedEventsEntry | null> => {
      const normalizedStudentId = normalizeStudentId(targetStudentId);
      const normalizedSchoolYearId = String(targetSchoolYearId ?? "").trim();
      const key = getStudentCalculatedEventsCacheKey(
        normalizedStudentId,
        normalizedSchoolYearId,
      );

      if (!key) return null;

      const cached = cacheRef.current.get(key);
      if (cached) return cached;

      const inFlight = inFlightRef.current.get(key);
      if (inFlight) return inFlight;

      const request = (async () => {
        loadingKeysRef.current.add(key);
        errorsRef.current.delete(key);
        refresh();

        try {
          const results = await listAttendanceFinalResults({
            studentId: normalizedStudentId,
            schoolYearId: normalizedSchoolYearId,
            includeEventDetails: true,
          });
          const finalResult =
            results.find(
              (result) =>
                normalizeStudentId(result.student_id) === normalizedStudentId &&
                result.school_year_id === normalizedSchoolYearId,
            ) ?? null;
          const entry: StudentCalculatedEventsEntry = {
            finalResult,
            attendedEvents: (finalResult?.event_details ?? []).filter(
              (event) => event.attended === true,
            ),
          };

          cacheRef.current.set(key, entry);
          return entry;
        } catch (error) {
          errorsRef.current.set(
            key,
            error instanceof Error
              ? error.message
              : "Unable to load calculated attendance events.",
          );
          return null;
        } finally {
          loadingKeysRef.current.delete(key);
          inFlightRef.current.delete(key);
          refresh();
        }
      })();

      inFlightRef.current.set(key, request);
      return request;
    },
    [refresh, schoolYearId, studentId],
  );

  const invalidate = useCallback(
    (targetStudentId: string, targetSchoolYearId: string) => {
      const key = getStudentCalculatedEventsCacheKey(
        targetStudentId,
        targetSchoolYearId,
      );
      if (!key) return;

      cacheRef.current.delete(key);
      errorsRef.current.delete(key);
      refresh();
    },
    [refresh],
  );

  return { getCached, getError, isLoading, load, invalidate };
}

function normalizeManualValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isZeroManualAttendanceRecord(
  record: Partial<ManualAttendanceRecord> | Partial<AttendanceRecord>,
) {
  const recordData = record as Record<string, unknown>;

  return (
    recordData.attendance_type === "zero_attendance" ||
    normalizeManualValue(record.remarks).includes("zero attendance") ||
    normalizeManualValue(record.remarks).includes(
      ZERO_ATTENDANCE_REMARK.toLowerCase(),
    )
  );
}

function mergeUniqueManualAttendanceRecords(
  manualRows: ManualAttendanceRecord[],
  zeroAttendanceRows: AttendanceRecord[],
) {
  const rowsById = new Map<string, ManualAttendanceRecord>();

  [...manualRows, ...zeroAttendanceRows].forEach((record) => {
    const recordId = String(record.id ?? "").trim();
    if (!recordId) return;

    rowsById.set(recordId, record as ManualAttendanceRecord);
  });

  return Array.from(rowsById.values());
}

function getManualRecordEventDeduplicationKey(record: ManualAttendanceRecord) {
  const eventId = String(record.event_id ?? "").trim();
  if (eventId) return `event-id:${eventId}`;

  const eventName = normalizeManualValue(record.event_name).replace(
    /[^a-z0-9]+/g,
    " ",
  );

  return eventName ? `event-name:${eventName}` : "";
}

function getUniqueManualEventRecords(records: ManualAttendanceRecord[]) {
  const eventsByKey = new Map<string, ManualAttendanceRecord>();

  records.forEach((record) => {
    const key = getManualRecordEventDeduplicationKey(record);
    if (!key) return;

    const savedRecord = eventsByKey.get(key);

    if (
      !savedRecord ||
      getRecordTimestamp(record) > getRecordTimestamp(savedRecord)
    ) {
      eventsByKey.set(key, record);
    }
  });

  return sortByBackendEventOrder(Array.from(eventsByKey.values()));
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

type BackendEventOrderedRecord = {
  id?: string | null;
  event_order?: number | string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  scanned_at?: string | null;
  created_at?: string | null;
  event_name?: string | null;
  name?: string | null;
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
    leftRecord.event_name ?? leftRecord.name ?? leftRecord.id ?? "",
    rightRecord.event_name ?? rightRecord.name ?? rightRecord.id ?? "",
  );
}

function sortByBackendEventOrder<T extends BackendEventOrderedRecord>(
  records: T[],
) {
  return [...records].sort(compareByBackendEventOrder);
}

function getRecordTimestamp(record: ManualAttendanceRecord) {
  const value = record.updated_at ?? record.created_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function getLatestRecord(records: ManualAttendanceRecord[]) {
  return [...records].sort(
    (leftRecord, rightRecord) =>
      getRecordTimestamp(rightRecord) - getRecordTimestamp(leftRecord),
  )[0];
}

function getEventLabel(event: AttendanceEvent) {
  const eventOrder = getBackendEventOrder(event);

  if (eventOrder !== Number.MAX_SAFE_INTEGER) {
    return `#${eventOrder} • ${event.name || `Event ${event.id}`}`;
  }

  return event.name || `Event ${event.id}`;
}

function getRecordEventLabel(record: ManualAttendanceRecord) {
  if (record.event_name) return record.event_name;
  if (record.event_id) return `Event ${record.event_id}`;
  return "No event assigned";
}

function mergeManualAttendanceByStudent(
  records: ManualAttendanceRecord[],
): ManualAttendanceStudentGroup[] {
  const groups = new Map<string, ManualAttendanceRecord[]>();

  records.forEach((record) => {
    const key = normalizeStudentId(record.student_id) || record.id;
    const current = groups.get(key) ?? [];

    current.push(record);
    groups.set(key, current);
  });

  return Array.from(groups.entries())
    .map(([key, groupRecords]) => {
      const sortedRecords = sortByBackendEventOrder(groupRecords);
      const latestRecord = getLatestRecord(groupRecords) ?? sortedRecords[0];
      const eventRecords = getUniqueManualEventRecords(sortedRecords);

      return {
        key,
        studentId: latestRecord?.student_id ?? key,
        name: latestRecord?.name ?? key,
        yearLevel: latestRecord?.year_level ?? "",
        college: latestRecord?.college ?? "",
        program: latestRecord?.program ?? "",
        institution: latestRecord?.institution ?? "",
        remarks: latestRecord?.remarks ?? "",
        latestChangedAt:
          latestRecord?.updated_at ?? latestRecord?.created_at ?? null,
        attendanceType:
          eventRecords.length > 0 ||
          groupRecords.some((record) => record.attendance_type === "manual")
            ? "manual"
            : "zero_attendance",
        records: sortedRecords,
        events: eventRecords,
      } satisfies ManualAttendanceStudentGroup;
    })
    .sort((leftGroup, rightGroup) => {
      const collegeCompare = leftGroup.college.localeCompare(
        rightGroup.college,
      );
      if (collegeCompare !== 0) return collegeCompare;
      return leftGroup.studentId.localeCompare(rightGroup.studentId);
    });
}

function getSelectedEventRecords(
  records: ManualAttendanceRecord[],
  eventIds: string[],
) {
  const selectedEventIds = new Set(eventIds);

  return records.filter((record) =>
    record.event_id ? selectedEventIds.has(record.event_id) : false,
  );
}

function getManualGroupSchoolYearId(group: ManualAttendanceStudentGroup) {
  return String(
    getLatestRecord(group.records)?.school_year_id ??
      group.records.find((record) => record.school_year_id)?.school_year_id ??
      "",
  ).trim();
}

function mergeCalculatedAndManualEvents(
  calculatedEntry: StudentCalculatedEventsEntry | undefined,
  manualRecords: ManualAttendanceRecord[],
) {
  const combined = new Map<string, CombinedAttendedEvent>();
  const uniqueManualRecords = getUniqueManualEventRecords(manualRecords);
  const manualEventIds = new Set(
    uniqueManualRecords
      .map((record) => String(record.event_id ?? "").trim())
      .filter(Boolean),
  );

  calculatedEntry?.attendedEvents.forEach((event) => {
    combined.set(`event-id:${event.id}`, {
      id: event.id,
      name: event.name || `Event ${event.id}`,
      event_order: event.event_order,
      scanned_at: event.scanned_at,
      remarks: event.remarks,
      source:
        event.source === "Manual" ||
        (event.source === null && manualEventIds.has(event.id))
          ? "Manual"
          : "Uploaded",
    });
  });

  uniqueManualRecords.forEach((record) => {
    const eventId = String(record.event_id ?? "").trim();
    const key = eventId ? `event-id:${eventId}` : `manual-record:${record.id}`;
    const existing = combined.get(key);

    if (existing) {
      if (existing.source === "Manual") {
        combined.set(key, {
          ...existing,
          scanned_at: record.scanned_at ?? record.created_at ?? existing.scanned_at,
          remarks: record.remarks ?? existing.remarks,
        });
      }
      return;
    }

    combined.set(key, {
      id: eventId || record.id,
      name: getRecordEventLabel(record),
      event_order: record.event_order ?? null,
      scanned_at: record.scanned_at ?? record.created_at ?? null,
      remarks: record.remarks ?? null,
      source: "Manual",
    });
  });

  return sortByBackendEventOrder(Array.from(combined.values()));
}

function SchoolYearBadge(props: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] min-h-12 items-center rounded-2xl border bg-background px-4 text-sm font-black ${props.className ?? ""}`}
    >
      {props.label}
    </span>
  );
}

function getManualAttendanceSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("on conflict do update command cannot affect row a second time") ||
    normalized.includes("21000") ||
    normalized.includes("cardinality violation")
  ) {
    return "Unable to save manual attendance because duplicate student records were detected. Please refresh and try again.";
  }

  const looksLikeDatabaseError =
    normalized.includes("duplicate key value") ||
    normalized.includes("constraint matching the on conflict") ||
    normalized.includes("sqlstate") ||
    normalized.includes("postgres") ||
    normalized.includes("syntax error at or near") ||
    (normalized.includes("violates") && normalized.includes("constraint"));

  if (looksLikeDatabaseError) {
    return "Unable to save manual attendance. Please refresh and try again.";
  }

  return message || "Unable to save manual attendance. Please try again.";
}

export default function ManualAttendancePage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [records, setRecords] = useState<ManualAttendanceRecord[]>([]);
  const [selectedManualRecordIds, setSelectedManualRecordIds] = useState<
    string[]
  >([]);
  const [form, setForm] = useState<ManualAttendanceFormState>({
    ...emptyForm,
    scannedAt: formatDateTimeInputValue(),
  });
  const [editingGroupKey, setEditingGroupKey] = useState("");
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [sortOrder, setSortOrder] = useSortOrderSearchParam();
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pageLoadProgress, setPageLoadProgress] =
    useState<ManualPageLoadProgress | null>(null);
  const loadRequestIdRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] =
    useState<ManualAttendanceSaveProgress | null>(null);
  const [isDeletingManualRecords, setIsDeletingManualRecords] = useState(false);
  const [manualAttendanceDialogOpen, setManualAttendanceDialogOpen] =
    useState(false);
  const [eventsDialogGroup, setEventsDialogGroup] =
    useState<ManualAttendanceStudentGroup | null>(null);
  const [selectedRecordsDialogOpen, setSelectedRecordsDialogOpen] = useState(false);
  const [manualUpdateConfirmOpen, setManualUpdateConfirmOpen] = useState(false);
  const calculatedAttendance = useStudentCalculatedEvents(
    form.studentId,
    form.schoolYearId,
  );

  const studentGroups = useMemo(
    () => mergeManualAttendanceByStudent(records),
    [records],
  );

  const collegeOptions = useMemo<string[]>(() => {
    const colleges = studentGroups
      .map((group) => String(group.college ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set<string>(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [studentGroups]);

  const filteredGroups = useMemo(() => {
    const targetCollege = collegeFilter.trim().toLowerCase();
    const normalizedSearch = studentSearch.trim().toLowerCase();

    const filtered = studentGroups.filter((group) => {
      const matchesCollege =
        !targetCollege || group.college.trim().toLowerCase() === targetCollege;
      const matchesDate = matchesDateRange(
        group.latestChangedAt,
        fromDate,
        toDate,
      );
      const matchesStudent =
        !normalizedSearch ||
        group.studentId.toLowerCase().includes(normalizedSearch) ||
        group.name.toLowerCase().includes(normalizedSearch);

      return matchesCollege && matchesDate && matchesStudent;
    });

    return sortByDate(filtered, (group) => group.latestChangedAt, sortOrder);
  }, [studentGroups, collegeFilter, fromDate, toDate, studentSearch, sortOrder]);

  const manualAttendanceTotalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredGroups.length / Number(rowsPerPage)));
  }, [filteredGroups.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [collegeFilter, fromDate, toDate, studentSearch, sortOrder, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, manualAttendanceTotalPages));
  }, [manualAttendanceTotalPages]);

  const paginatedGroups = useMemo(() => {
    if (rowsPerPage === "all") return filteredGroups;

    const pageSize = Number(rowsPerPage);
    const startIndex = (currentPage - 1) * pageSize;
    return filteredGroups.slice(startIndex, startIndex + pageSize);
  }, [filteredGroups, currentPage, rowsPerPage]);

  const filteredGroupRecordIds = useMemo<string[]>(() => {
    return filteredGroups.flatMap((group) =>
      group.records
        .map((record) => String(record.id ?? "").trim())
        .filter(Boolean),
    );
  }, [filteredGroups]);

  const paginatedGroupRecordIds = useMemo<string[]>(() => {
    return paginatedGroups.flatMap((group) =>
      group.records
        .map((record) => String(record.id ?? "").trim())
        .filter(Boolean),
    );
  }, [paginatedGroups]);

  const allFilteredGroupsSelected =
    paginatedGroupRecordIds.length > 0 &&
    paginatedGroupRecordIds.every((recordId) =>
      selectedManualRecordIds.includes(recordId),
    );

  const manualRangeStart = filteredGroups.length
    ? rowsPerPage === "all"
      ? 1
      : (currentPage - 1) * Number(rowsPerPage) + 1
    : 0;
  const manualRangeEnd = rowsPerPage === "all"
    ? filteredGroups.length
    : Math.min(currentPage * Number(rowsPerPage), filteredGroups.length);

  const editingGroup = useMemo(() => {
    if (!editingGroupKey) return null;
    return studentGroups.find((group) => group.key === editingGroupKey) ?? null;
  }, [editingGroupKey, studentGroups]);

  const availableEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          !isStudentExemptFromEvent(event, form.college, form.yearLevel),
      ),
    [events, form.college, form.yearLevel],
  );

  const editingExemptedEventRecords = useMemo(() => {
    if (!editingGroup) return [];

    const eventById = new Map(events.map((event) => [event.id, event]));

    return getUniqueManualEventRecords(
      editingGroup.events.filter((record) => {
        const eventId = String(record.event_id ?? "").trim();
        return Boolean(
          eventId &&
            isStudentExemptFromEvent(
              eventById.get(eventId),
              form.college,
              form.yearLevel,
            ),
        );
      }),
    );
  }, [editingGroup, events, form.college, form.yearLevel]);

  const selectedEventRecords = useMemo(() => {
    if (!editingGroup) return [];

    return getUniqueManualEventRecords(
      getSelectedEventRecords(editingGroup.records, form.eventIds),
    );
  }, [editingGroup, form.eventIds]);
  const programOptions = useMemo(
    () => getStudentProgramOptions(form.college),
    [form.college],
  );
  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);
  const formSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(
      schoolYears,
      form.schoolYearId || selectedSchoolYearId,
    );
  }, [schoolYears, form.schoolYearId, selectedSchoolYearId]);
  const formCalculatedEntry = calculatedAttendance.getCached(
    form.studentId,
    form.schoolYearId,
  );
  const uploadedCalculatedEvents = useMemo(
    () =>
      (formCalculatedEntry?.attendedEvents ?? []).filter(
        (event) => event.source === "Uploaded",
      ),
    [formCalculatedEntry],
  );
  const uploadedEventIds = useMemo(
    () => new Set(uploadedCalculatedEvents.map((event) => event.id)),
    [uploadedCalculatedEvents],
  );
  const eventsDialogSchoolYearId = eventsDialogGroup
    ? getManualGroupSchoolYearId(eventsDialogGroup)
    : "";
  const eventsDialogCalculatedEntry = eventsDialogGroup
    ? calculatedAttendance.getCached(
        eventsDialogGroup.studentId,
        eventsDialogSchoolYearId,
      )
    : undefined;
  const eventsDialogCombinedEvents = eventsDialogGroup
    ? mergeCalculatedAndManualEvents(
        eventsDialogCalculatedEntry,
        eventsDialogGroup.events,
      )
    : [];
  const eventsDialogIsLoading = eventsDialogGroup
    ? calculatedAttendance.isLoading(
        eventsDialogGroup.studentId,
        eventsDialogSchoolYearId,
      )
    : false;
  const eventsDialogError = eventsDialogGroup
    ? calculatedAttendance.getError(
        eventsDialogGroup.studentId,
        eventsDialogSchoolYearId,
      )
    : "";

  function getGroupCombinedEventCount(group: ManualAttendanceStudentGroup) {
    const schoolYearId = getManualGroupSchoolYearId(group);
    const calculatedEntry = calculatedAttendance.getCached(
      group.studentId,
      schoolYearId,
    );

    return calculatedEntry
      ? mergeCalculatedAndManualEvents(calculatedEntry, group.events).length
      : group.events.length;
  }

  function updatePageLoadStep(
    label: string,
    status: LoadingStatusStep["status"],
    detail: string,
    progress: number,
    overallDetail: string,
  ) {
    setPageLoadProgress((current) => {
      if (!current) return current;

      return {
        ...current,
        progress: Math.max(current.progress, progress),
        detail: overallDetail,
        steps: current.steps.map((step) =>
          step.label === label ? { ...step, status, detail } : step,
        ),
      };
    });
  }

  async function loadPageData(nextSchoolYearId = selectedSchoolYearId) {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;

    setIsLoading(true);
    setPageLoadProgress({
      progress: 5,
      detail: "Checking the active school year before loading manual attendance.",
      steps: [
        { label: "School year", status: "loading", detail: "Checking active scope" },
        { label: "Events", status: "pending", detail: "Waiting" },
        { label: "Manual records", status: "pending", detail: "Waiting" },
        { label: "Legacy zero attendance", status: "pending", detail: "Waiting" },
      ],
    });

    try {
      const schoolYearRows = await listSchoolYears({ activeOnly: true });
      if (!isCurrentRequest()) return;

      const activeSchoolYearId = getActiveSchoolYearId(schoolYearRows);
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        nextSchoolYearId !== ALL_YEARS_VALUE &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : activeSchoolYearId;

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId || ALL_YEARS_VALUE);
      setForm((current) => ({
        ...current,
        schoolYearId:
          current.schoolYearId &&
          schoolYearRows.some(
            (schoolYear) => schoolYear.id === current.schoolYearId,
          )
            ? current.schoolYearId
            : activeSchoolYearId,
      }));
      updatePageLoadStep(
        "School year",
        "done",
        fallbackSchoolYearId ? "Active school year ready" : "No active school year",
        18,
        fallbackSchoolYearId
          ? "School year ready. Loading events and manual rows in parallel."
          : "No active school year was found.",
      );

      if (!fallbackSchoolYearId) {
        setEvents([]);
        setRecords([]);
        setPageLoadProgress((current) =>
          current
            ? {
                ...current,
                progress: 100,
                detail: "Nothing to load because there is no active school year.",
                steps: current.steps.map((step) => ({
                  ...step,
                  status: "done",
                  detail: step.status === "done" ? step.detail : "No data requested",
                })),
              }
            : current,
        );
        return;
      }

      updatePageLoadStep(
        "Events",
        "loading",
        "Loading event choices",
        24,
        "Loading event choices and manual attendance records in parallel.",
      );
      updatePageLoadStep(
        "Manual records",
        "loading",
        "Loading manual records page by page",
        24,
        "Loading event choices and manual attendance records in parallel.",
      );
      updatePageLoadStep(
        "Legacy zero attendance",
        "loading",
        "Scanning only legacy zero-attendance rows",
        24,
        "Legacy compatibility now requests only zero-attendance rows instead of the entire attendance table.",
      );

      const eventsPromise = listAttendanceEvents({
        schoolYearId: fallbackSchoolYearId,
        limit: 500,
        offset: 0,
      }).then((eventRows) => {
        if (!isCurrentRequest()) return eventRows;
        setEvents(sortByBackendEventOrder(eventRows));
        updatePageLoadStep(
          "Events",
          "done",
          `${eventRows.length.toLocaleString()} event/s ready`,
          45,
          "Event choices are ready. Manual attendance rows are still loading.",
        );
        return eventRows;
      });

      const manualPromise = listAllManualAttendanceRecords({
        schoolYearId: fallbackSchoolYearId,
        pageSize: 300,
        maxPages: 100,
        onPage: ({ rows, pageRows }) => {
          if (!isCurrentRequest()) return;
          setRecords(sortByBackendEventOrder(rows));
          updatePageLoadStep(
            "Manual records",
            pageRows.length < 300 ? "done" : "loading",
            `${rows.length.toLocaleString()} manual row/s loaded${
              pageRows.length < 300 ? "" : " so far"
            }`,
            pageRows.length < 300 ? 82 : 55,
            `Showing ${rows.length.toLocaleString()} manual row/s while remaining data finishes loading.`,
          );
        },
      });

      const legacyZeroPromise = listAllAttendanceRecords({
        schoolYearId: fallbackSchoolYearId,
        zeroAttendanceOnly: true,
        pageSize: 250,
        maxPages: 40,
      }).then((rows) => {
        if (!isCurrentRequest()) return rows;
        updatePageLoadStep(
          "Legacy zero attendance",
          "done",
          `${rows.length.toLocaleString()} legacy row/s found`,
          70,
          "Legacy zero-attendance compatibility rows are ready.",
        );
        return rows;
      });

      const [, manualRows, legacyZeroRows] = await Promise.all([
        eventsPromise,
        manualPromise,
        legacyZeroPromise,
      ]);
      if (!isCurrentRequest()) return;

      const zeroAttendanceRows = legacyZeroRows.filter(
        isZeroManualAttendanceRecord,
      );
      const mergedManualRows = mergeUniqueManualAttendanceRecords(
        manualRows,
        zeroAttendanceRows,
      );

      setRecords(sortByBackendEventOrder(mergedManualRows));
      setSelectedManualRecordIds([]);
      setPageLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: `Ready. Loaded ${mergedManualRows.length.toLocaleString()} manual attendance row/s.`,
              steps: current.steps.map((step) => ({ ...step, status: "done" })),
            }
          : current,
      );
    } catch (error) {
      if (!isCurrentRequest()) return;
      setPageLoadProgress((current) =>
        current
          ? {
              ...current,
              detail:
                error instanceof Error
                  ? error.message
                  : "Unable to load manual attendance.",
            }
          : current,
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load manual attendance.",
      );
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        window.setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            setPageLoadProgress(null);
          }
        }, 1400);
      }
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    if (
      !manualAttendanceDialogOpen ||
      editingGroupKey ||
      !normalizeStudentId(form.studentId) ||
      !form.schoolYearId
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void calculatedAttendance.load();
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    calculatedAttendance.load,
    editingGroupKey,
    form.schoolYearId,
    form.studentId,
    manualAttendanceDialogOpen,
  ]);

  useEffect(() => {
    if (!uploadedEventIds.size) return;

    setForm((current) => {
      const eventIds = current.eventIds.filter(
        (eventId) => !uploadedEventIds.has(eventId),
      );
      return eventIds.length === current.eventIds.length
        ? current
        : { ...current, eventIds };
    });
  }, [uploadedEventIds]);

  function handleFieldChange(
    field: Exclude<keyof ManualAttendanceFormState, "eventIds">,
    value: string,
  ) {
    if (field !== "college" && field !== "yearLevel") {
      setForm((current) => ({ ...current, [field]: value }));
      return;
    }

    const nextCollege = field === "college" ? value : form.college;
    const nextYearLevel = field === "yearLevel" ? value : form.yearLevel;
    const removedEvents = events.filter(
      (event) =>
        form.eventIds.includes(event.id) &&
        isStudentExemptFromEvent(event, nextCollege, nextYearLevel),
    );
    const removedEventIds = new Set(removedEvents.map((event) => event.id));

    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "college" ? { program: "" } : {}),
      eventIds: current.eventIds.filter((eventId) => !removedEventIds.has(eventId)),
    }));

    if (removedEvents.length) {
      toast.info(
        `Removed exempted event${removedEvents.length === 1 ? "" : "s"}: ${removedEvents
          .map((event) => event.name || `Event ${event.id}`)
          .join(", ")}.`,
      );
    }
  }

  function handleEventToggle(eventId: string) {
    if (uploadedEventIds.has(eventId)) return;

    setForm((current) => {
      const isSelected = current.eventIds.includes(eventId);

      return {
        ...current,
        eventIds: isSelected
          ? current.eventIds.filter((id) => id !== eventId)
          : [...current.eventIds, eventId],
      };
    });
  }

  function getManualGroupRecordIds(group: ManualAttendanceStudentGroup) {
    return group.records
      .map((record) => String(record.id ?? "").trim())
      .filter(Boolean);
  }

  function isManualGroupSelected(group: ManualAttendanceStudentGroup) {
    const groupRecordIds = getManualGroupRecordIds(group);

    return (
      groupRecordIds.length > 0 &&
      groupRecordIds.every((recordId) =>
        selectedManualRecordIds.includes(recordId),
      )
    );
  }

  function handleManualGroupSelection(
    group: ManualAttendanceStudentGroup,
    checked: boolean,
  ) {
    const groupRecordIds = getManualGroupRecordIds(group);

    setSelectedManualRecordIds((current) => {
      const nextIds = new Set(current);

      groupRecordIds.forEach((recordId) => {
        if (checked) nextIds.add(recordId);
        else nextIds.delete(recordId);
      });

      return Array.from(nextIds);
    });
  }

  function handleSelectAllManualGroups(checked: boolean) {
    setSelectedManualRecordIds((current) => {
      const pageIds = new Set(paginatedGroupRecordIds);
      if (!checked) return current.filter((id) => !pageIds.has(id));
      return Array.from(new Set([...current, ...paginatedGroupRecordIds]));
    });
  }

  function handleOpenCreateDialog() {
    setSaveProgress(null);
    setEditingGroupKey("");
    setForm((current) => ({
      ...emptyForm,
      schoolYearId:
        current.schoolYearId ||
        (selectedSchoolYearId === ALL_YEARS_VALUE ? "" : selectedSchoolYearId),
      scannedAt: formatDateTimeInputValue(),
    }));
    setManualAttendanceDialogOpen(true);
  }

  function handleEditGroup(group: ManualAttendanceStudentGroup) {
    setSaveProgress(null);
    const latestRecord = getLatestRecord(group.records);
    const eventById = new Map(events.map((event) => [event.id, event]));
    const schoolYearId =
      latestRecord?.school_year_id ||
      (selectedSchoolYearId === ALL_YEARS_VALUE ? "" : selectedSchoolYearId);

    setEditingGroupKey(group.key);
    setForm({
      schoolYearId,
      eventIds: Array.from(
        new Set(
          group.events
            .filter((record) => {
              const eventId = String(record.event_id ?? "").trim();
              return !isStudentExemptFromEvent(
                eventById.get(eventId),
                group.college,
                group.yearLevel,
              );
            })
            .map((record) => record.event_id)
            .filter(Boolean) as string[],
        ),
      ),
      scannedAt: formatDateTimeInputValue(
        latestRecord?.scanned_at
          ? new Date(latestRecord.scanned_at)
          : new Date(),
      ),
      studentId: group.studentId,
      name: group.name,
      yearLevel: group.yearLevel,
      college: group.college,
      program: group.program,
      institution: group.institution,
      remarks: group.remarks,
    });
    setManualAttendanceDialogOpen(true);
    if (schoolYearId) {
      void calculatedAttendance.load(group.studentId, schoolYearId);
    }
  }

  function handleOpenEventsDialog(group: ManualAttendanceStudentGroup) {
    setEventsDialogGroup(group);
    const schoolYearId = getManualGroupSchoolYearId(group);
    if (schoolYearId) {
      void calculatedAttendance.load(group.studentId, schoolYearId);
    }
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open && isSaving) return;

    setManualAttendanceDialogOpen(open);

    if (!open) {
      setSaveProgress(null);
      setEditingGroupKey("");
      setForm((current) => ({
        ...emptyForm,
        schoolYearId: current.schoolYearId,
        scannedAt: formatDateTimeInputValue(),
      }));
    }
  }

  function buildManualPayload(eventId?: string): ManualAttendanceInput {
    const event = events.find((item) => item.id === eventId) ?? null;

    return {
      attendanceType: eventId ? "manual" : "zero_attendance",
      schoolYearId: form.schoolYearId || undefined,
      eventId,
      eventName: event?.name,
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
  }

  function getEditingDeletePlan(
    blockedUploadedEventIds: ReadonlySet<string> = uploadedEventIds,
  ) {
    const selectedEventIds = Array.from(
      new Set(
        form.eventIds.filter(
          (eventId) => !blockedUploadedEventIds.has(eventId),
        ),
      ),
    );
    const editingGroup = editingGroupKey
      ? studentGroups.find((group) => group.key === editingGroupKey)
      : null;
    const existingByEventId = new Map<string, ManualAttendanceRecord>();

    if (!editingGroup) {
      return { selectedEventIds, editingGroup: null, existingByEventId, recordsToDelete: [] as ManualAttendanceRecord[] };
    }

    const duplicateEventRecordsToDelete: ManualAttendanceRecord[] = [];
    sortByBackendEventOrder(editingGroup.records).forEach((record) => {
      const eventId = String(record.event_id ?? "").trim();
      if (!eventId) return;
      if (existingByEventId.has(eventId)) {
        duplicateEventRecordsToDelete.push(record);
        return;
      }
      existingByEventId.set(eventId, record);
    });

    const selectedEventIdSet = new Set(selectedEventIds);
    const duplicateRecordIds = new Set(duplicateEventRecordsToDelete.map((record) => record.id));
    const recordsToDelete = editingGroup.records.filter((record) => {
      const eventId = String(record.event_id ?? "").trim();
      return !eventId || !selectedEventIdSet.has(eventId) || duplicateRecordIds.has(record.id);
    });

    return { selectedEventIds, editingGroup, existingByEventId, recordsToDelete };
  }

  async function saveManualAttendance(
    blockedUploadedEventIds: ReadonlySet<string> = uploadedEventIds,
  ) {
    setIsSaving(true);
    setManualUpdateConfirmOpen(false);

    const { selectedEventIds, editingGroup, existingByEventId, recordsToDelete } =
      getEditingDeletePlan(blockedUploadedEventIds);
    const saveOperationCount = Math.max(1, selectedEventIds.length);
    const totalWorkUnits = 2 + recordsToDelete.length + saveOperationCount;
    let completedWorkUnits = 1;
    let deletedRecords = 0;
    let savedRecords = 0;
    const progressPercent = () =>
      Math.min(99, Math.round((completedWorkUnits / totalWorkUnits) * 100));

    setSaveProgress({
      title: editingGroup
        ? "Updating manual attendance"
        : "Creating manual attendance",
      progress: progressPercent(),
      detail: editingGroup
        ? "Prepared the requested changes. Saving the student's manual attendance records now."
        : "Prepared the new manual attendance records. Saving them now.",
      steps: [
        {
          label: "Prepare changes",
          status: "done",
          detail: `${saveOperationCount} record operation${saveOperationCount === 1 ? "" : "s"} ready`,
        },
        {
          label: "Remove old records",
          status: recordsToDelete.length ? "loading" : "done",
          detail: recordsToDelete.length
            ? `0 of ${recordsToDelete.length} removed`
            : "No old records need removal",
        },
        {
          label: "Save attendance",
          status: recordsToDelete.length ? "pending" : "loading",
          detail: `0 of ${saveOperationCount} saved`,
        },
        {
          label: "Refresh records",
          status: "pending",
          detail: "Waiting",
        },
      ],
    });

    const updateSaveProgress = (
      detail: string,
      updater: (step: LoadingStatusStep) => LoadingStatusStep,
    ) => {
      setSaveProgress((current) =>
        current
          ? {
              ...current,
              progress: progressPercent(),
              detail,
              steps: current.steps.map(updater),
            }
          : current,
      );
    };

    try {
      if (recordsToDelete.length) {
        await Promise.all(
          recordsToDelete.map(async (record) => {
            await deleteAttendanceRecord(record.id);
            deletedRecords += 1;
            completedWorkUnits += 1;
            updateSaveProgress(
              `Removed ${deletedRecords} of ${recordsToDelete.length} old attendance record${recordsToDelete.length === 1 ? "" : "s"}.`,
              (step) => {
                if (step.label === "Remove old records") {
                  return {
                    ...step,
                    status:
                      deletedRecords === recordsToDelete.length
                        ? "done"
                        : "loading",
                    detail: `${deletedRecords} of ${recordsToDelete.length} removed`,
                  };
                }
                if (
                  step.label === "Save attendance" &&
                  deletedRecords === recordsToDelete.length
                ) {
                  return { ...step, status: "loading" };
                }
                return step;
              },
            );
          }),
        );
      }

      const saveOne = async (
        eventId: string | undefined,
        existingRecord?: ManualAttendanceRecord,
      ) => {
        const payload = buildManualPayload(eventId);
        if (existingRecord) {
          await updateAttendanceRecord(existingRecord.id, payload);
        } else {
          await saveManualAttendanceRecord(payload);
        }

        savedRecords += 1;
        completedWorkUnits += 1;
        updateSaveProgress(
          `${editingGroup ? "Updated" : "Saved"} ${savedRecords} of ${saveOperationCount} manual attendance record${saveOperationCount === 1 ? "" : "s"}.`,
          (step) =>
            step.label === "Save attendance"
              ? {
                  ...step,
                  status:
                    savedRecords === saveOperationCount ? "done" : "loading",
                  detail: `${savedRecords} of ${saveOperationCount} saved`,
                }
              : step,
        );
      };

      if (selectedEventIds.length) {
        await Promise.all(
          selectedEventIds.map((eventId) =>
            saveOne(
              eventId,
              editingGroup ? existingByEventId.get(eventId) : undefined,
            ),
          ),
        );
      } else {
        await saveOne(undefined);
      }

      calculatedAttendance.invalidate(form.studentId, form.schoolYearId);

      setSaveProgress((current) =>
        current
          ? {
              ...current,
              progress: progressPercent(),
              detail: "Attendance records are saved. Refreshing the manual attendance list with the latest data.",
              steps: current.steps.map((step) =>
                step.label === "Refresh records"
                  ? {
                      ...step,
                      status: "loading",
                      detail: "Loading updated attendance records",
                    }
                  : step,
              ),
            }
          : current,
      );

      await loadPageData(selectedSchoolYearId);
      completedWorkUnits += 1;

      setSaveProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: editingGroup
                ? "Manual attendance was updated and the latest records are now displayed."
                : "Manual attendance was created and the latest records are now displayed.",
              steps: current.steps.map((step) =>
                step.label === "Refresh records"
                  ? { ...step, status: "done", detail: "Updated records loaded" }
                  : step,
              ),
            }
          : current,
      );

      toast.success(
        editingGroup ? "Manual attendance updated." : "Manual attendance saved.",
      );
      setManualAttendanceDialogOpen(false);
      setEditingGroupKey("");
      setSaveProgress(null);
      setForm((current) => ({
        ...emptyForm,
        schoolYearId: current.schoolYearId,
        scannedAt: formatDateTimeInputValue(),
      }));
    } catch (error) {
      const message = getManualAttendanceSaveErrorMessage(error);
      setSaveProgress((current) =>
        current
          ? {
              ...current,
              detail: `Saving stopped: ${message}`,
              steps: current.steps.map((step) =>
                step.status === "loading"
                  ? {
                      ...step,
                      status: "pending",
                      detail: "Stopped before completion",
                    }
                  : step,
              ),
            }
          : current,
      );
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.schoolYearId) {
      toast.error("Active school year is required.");
      return;
    }

    if (!form.studentId.trim() || !form.name.trim()) {
      toast.error("Student ID and name are required.");
      return;
    }

    const calculatedEntry = await calculatedAttendance.load();
    const calculatedError = calculatedAttendance.getError(
      form.studentId,
      form.schoolYearId,
    );
    if (calculatedError) {
      toast.error(
        "Unable to verify calculated attendance. Refresh and try again before saving manual attendance.",
      );
      return;
    }

    const blockedUploadedEventIds = new Set(
      (calculatedEntry?.attendedEvents ?? [])
        .filter((eventItem) => eventItem.source === "Uploaded")
        .map((eventItem) => eventItem.id),
    );
    if (blockedUploadedEventIds.size) {
      setForm((current) => ({
        ...current,
        eventIds: current.eventIds.filter(
          (eventId) => !blockedUploadedEventIds.has(eventId),
        ),
      }));
    }

    const { recordsToDelete } = getEditingDeletePlan(blockedUploadedEventIds);
    if (recordsToDelete.length) {
      setManualUpdateConfirmOpen(true);
      return;
    }

    await saveManualAttendance(blockedUploadedEventIds);
  }

  async function handleDeleteGroup(group: ManualAttendanceStudentGroup) {
    setIsSaving(true);

    try {
      await Promise.all(
        group.records.map((record) => deleteAttendanceRecord(record.id)),
      );
      setSelectedManualRecordIds((current) =>
        current.filter(
          (recordId) => !getManualGroupRecordIds(group).includes(recordId),
        ),
      );
      calculatedAttendance.invalidate(
        group.studentId,
        getManualGroupSchoolYearId(group),
      );
      await loadPageData(selectedSchoolYearId);
      toast.success("Manual attendance deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete manual attendance.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSelectedManualRecords() {
    const recordIds = Array.from(new Set(selectedManualRecordIds));
    const recordIdSet = new Set(recordIds);
    const affectedGroups = studentGroups.filter((group) =>
      group.records.some((record) => recordIdSet.has(record.id)),
    );

    if (!recordIds.length) {
      toast.error("Select at least one manual attendance record.");
      return;
    }

    setIsDeletingManualRecords(true);

    try {
      const result = await deleteManualAttendanceRecordsByIds(recordIds);

      affectedGroups.forEach((group) =>
        calculatedAttendance.invalidate(
          group.studentId,
          getManualGroupSchoolYearId(group),
        ),
      );
      await loadPageData(selectedSchoolYearId);
      toast.success(
        `${result.deletedCount.toLocaleString()} manual attendance record/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete selected manual attendance records.",
      );
    } finally {
      setIsDeletingManualRecords(false);
    }
  }

  async function handleDeleteAllManualRecords() {
    const recordIds = Array.from(new Set(filteredGroupRecordIds));

    if (!recordIds.length) {
      toast.error("No manual attendance records to delete.");
      return;
    }

    setIsDeletingManualRecords(true);

    try {
      const result = await deleteManualAttendanceRecordsByIds(recordIds);

      filteredGroups.forEach((group) =>
        calculatedAttendance.invalidate(
          group.studentId,
          getManualGroupSchoolYearId(group),
        ),
      );

      await loadPageData(selectedSchoolYearId);
      toast.success(
        `${result.deletedCount.toLocaleString()} manual attendance record/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete manual attendance records.",
      );
    } finally {
      setIsDeletingManualRecords(false);
    }
  }

  return (
    <main className="min-h-svh w-full min-w-0 max-w-full px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-400 flex-col gap-6">
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
                Manual attendance is merged by Student ID and can store zero
                attendance placeholders or multiple attended events for each
                attendee.
              </p>
            </div>

            <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-3">
              <SchoolYearBadge
                label={selectedSchoolYearLabel}
                className="w-full justify-center"
              />

              <div className="grid min-w-0 grid-cols-2 gap-2 sm:col-span-2">
                <Input
                  type="date"
                  aria-label="Manual attendance from date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="min-h-12 min-w-0 rounded-2xl"
                />
                <Input
                  type="date"
                  aria-label="Manual attendance to date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(event) => setToDate(event.target.value)}
                  className="min-h-12 min-w-0 rounded-2xl"
                />
              </div>

              <Input
                type="search"
                aria-label="Search student by name or ID"
                placeholder="Search student name or ID..."
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                className="min-h-12 rounded-2xl"
              />

              <SortSelect
                value={sortOrder}
                onValueChange={setSortOrder}
                ariaLabel="Sort manual attendance"
                className="min-h-12 rounded-2xl"
              />

              <Select
                value={collegeFilter || "__all_colleges__"}
                onValueChange={(value) =>
                  setCollegeFilter(value === "__all_colleges__" ? "" : value)
                }
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-none rounded-2xl lg:max-w-64">
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

        {pageLoadProgress ? (
          <LoadingStatus
            title="Loading manual attendance"
            detail={pageLoadProgress.detail}
            progress={pageLoadProgress.progress}
            steps={pageLoadProgress.steps}
          />
        ) : null}

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Add manual attendance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one attendee row, save with empty events, or select all
                events attended by that student.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOpenCreateDialog}
              className="min-h-12 rounded-2xl px-6 font-black"
            >
              Add Manual Attendance
            </Button>
          </div>
        </section>

        <Dialog
          open={manualAttendanceDialogOpen}
          onOpenChange={handleDialogOpenChange}
        >
          <DialogContent className="min-w-0 max-w-full max-h-svh overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {editingGroupKey
                  ? "Edit manual attendance"
                  : "Add manual attendance"}
              </DialogTitle>
              <DialogDescription>
                {editingGroupKey
                  ? "Update the selected student's manual attendance records."
                  : "Add manual attendance records for a student and selected events."}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit}
              className="mt-5 grid gap-4 lg:grid-cols-4"
            >
              {saveProgress ? (
                <LoadingStatus
                  title={saveProgress.title}
                  detail={saveProgress.detail}
                  progress={saveProgress.progress}
                  steps={saveProgress.steps}
                  className="lg:col-span-4"
                />
              ) : null}
              <label className="space-y-2">
                <span className="text-sm font-bold">School year / semester</span>
                <SchoolYearBadge
                  label={formSchoolYearLabel}
                  className="w-full justify-center"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Scanned at</span>
                <DateTimePicker
                  value={form.scannedAt}
                  onValueChange={(value) =>
                    handleFieldChange("scannedAt", value)
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
                  onBlur={() => {
                    if (normalizeStudentId(form.studentId) && form.schoolYearId) {
                      void calculatedAttendance.load();
                    }
                  }}
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
                <Select
                  value={form.yearLevel}
                  onValueChange={(value) =>
                    handleFieldChange("yearLevel", value)
                  }
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 rounded-2xl">
                    <SelectValue placeholder="Select year level" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-80">
                    {renderCurrentStudentSelectOption(
                      QR_CODE_YEAR_LEVEL_OPTIONS,
                      form.yearLevel,
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
                  value={form.yearLevel}
                  onChange={(event) =>
                    handleFieldChange("yearLevel", event.target.value)
                  }
                  placeholder="Type custom year level if not listed"
                  className={customSelectInputClassName}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">College</span>
                <Select
                  value={form.college}
                  onValueChange={(value) => handleFieldChange("college", value)}
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 rounded-2xl">
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-80">
                    {renderCurrentStudentSelectOption(
                      QR_CODE_COLLEGE_OPTIONS,
                      form.college,
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
                  value={form.college}
                  onChange={(event) =>
                    handleFieldChange("college", event.target.value)
                  }
                  placeholder="Type custom college if not listed"
                  className={customSelectInputClassName}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Program</span>
                <Select
                  value={form.program}
                  onValueChange={(value) => handleFieldChange("program", value)}
                  disabled={!form.college}
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 rounded-2xl">
                    <SelectValue
                      placeholder={
                        form.college ? "Select program" : "Select college first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-80">
                    {renderCurrentStudentSelectOption(
                      programOptions,
                      form.program,
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
                  value={form.program}
                  onChange={(event) =>
                    handleFieldChange("program", event.target.value)
                  }
                  placeholder={
                    form.college
                      ? "Type custom program if not listed"
                      : "Select college before typing program"
                  }
                  disabled={!form.college}
                  className={customSelectInputClassName}
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm font-bold">Institution</span>
                <Select
                  value={form.institution}
                  onValueChange={(value) =>
                    handleFieldChange("institution", value)
                  }
                >
                  <SelectTrigger className="min-h-12 w-full min-w-0 rounded-2xl">
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-80">
                    {renderCurrentStudentSelectOption(
                      QR_CODE_INSTITUTION_OPTIONS,
                      form.institution,
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
                  value={form.institution}
                  onChange={(event) =>
                    handleFieldChange("institution", event.target.value)
                  }
                  placeholder="Type custom institution if not listed"
                  className={customSelectInputClassName}
                />
              </label>

              <div className="space-y-2 lg:col-span-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-bold">Events attended</span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {form.eventIds.length} manual + {uploadedCalculatedEvents.length} from upload
                  </span>
                </div>
                {editingExemptedEventRecords.length ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-200">
                    <p className="font-black">Saved events that are now exempted</p>
                    <p className="mt-1 text-xs font-semibold leading-5">
                      These records are no longer selectable for {form.college || "this college"} and will be removed when you save this edit.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editingExemptedEventRecords.map((record) => (
                        <span
                          key={record.id}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-card px-3 dark:border-amber-800 py-1.5 text-xs font-bold"
                        >
                          {getRecordEventLabel(record)}
                          <span className="rounded-full bg-amber-100 px-2 dark:bg-amber-950/70 py-0.5 text-[10px] font-black uppercase tracking-wide">
                            Exempted
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border bg-background p-3 sm:grid-cols-2">
                  {availableEvents.length ? (
                    availableEvents.map((eventItem) => {
                      const isUploaded = uploadedEventIds.has(eventItem.id);
                      const isSelected =
                        isUploaded || form.eventIds.includes(eventItem.id);

                      return (
                        <Button
                          key={eventItem.id}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          disabled={isUploaded}
                          onClick={() => handleEventToggle(eventItem.id)}
                          className="h-auto min-h-12 justify-start whitespace-normal rounded-2xl px-4 py-3 text-left text-sm font-bold"
                        >
                          <span className="flex w-full flex-wrap items-center gap-2">
                            <span>{getEventLabel(eventItem)}</span>
                            {isUploaded ? (
                              <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                                Already recorded (upload)
                              </span>
                            ) : null}
                          </span>
                        </Button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-card p-5 text-center text-sm font-semibold text-muted-foreground sm:col-span-2">
                      {events.length && form.college
                        ? `No selectable events remain for ${form.college}. Every loaded event is exempted for this college.`
                        : "No events available. Saving will create an empty-events attendee."}
                    </div>
                  )}
                </div>
              </div>

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

              {selectedEventRecords.length ? (
                <div className="lg:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedRecordsDialogOpen(true)}
                    className="min-h-11 rounded-2xl px-5 font-black"
                  >
                    View existing records ({selectedEventRecords.length.toLocaleString()})
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 lg:col-span-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSaving
                    ? `Saving ${Math.round(saveProgress?.progress ?? 0)}%...`
                    : editingGroupKey
                      ? "Update Manual Attendance"
                      : "Save Manual Attendance"}
                </Button>
                {editingGroupKey ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => handleDialogOpenChange(false)}
                    className="min-h-12 rounded-2xl px-6 font-black"
                  >
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ProtectedDeleteDialog
          open={manualUpdateConfirmOpen}
          onOpenChange={setManualUpdateConfirmOpen}
          title="Update and delete attendance records?"
          description={
            <>
              This update will permanently delete {getEditingDeletePlan().recordsToDelete.length.toLocaleString()} existing manual attendance record(s) that are no longer selected or are duplicates. The remaining selected event records will be updated or created. This action cannot be undone.
            </>
          }
          confirmationPhrase="UPDATE AND DELETE"
          confirmLabel="Update and Delete"
          pendingLabel={`Saving ${Math.round(saveProgress?.progress ?? 0)}%...`}
          isPending={isSaving}
          onConfirm={saveManualAttendance}
        />

        <Dialog open={selectedRecordsDialogOpen} onOpenChange={setSelectedRecordsDialogOpen}>
          <DialogContent className="flex max-w-full max-h-[80svh] min-w-0 flex-col overflow-hidden sm:max-w-2xl">
            <DialogHeader className="shrink-0">
              <DialogTitle>Existing records for this student</DialogTitle>
              <DialogDescription>
                Review the attendance records already saved for this student.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-background p-3">
              <div className="grid gap-2">
                {selectedEventRecords.map((record, index) => (
                  <div
                    key={record.id}
                    className="flex items-start gap-3 rounded-xl border bg-card p-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-black">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black">
                        {getRecordEventLabel(record)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {formatDateTime(record.scanned_at ?? record.created_at)}
                      </p>
                      {record.remarks ? (
                        <p className="mt-2 break-words text-xs text-muted-foreground">
                          {record.remarks}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(eventsDialogGroup)}
          onOpenChange={(open) => {
            if (!open) setEventsDialogGroup(null);
          }}
        >
          <DialogContent className="min-w-0 max-w-full max-h-svh overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Events attended by{" "}
                {eventsDialogGroup?.name || eventsDialogGroup?.studentId}
              </DialogTitle>
              <DialogDescription>
                Review calculated uploaded attendance together with manual attendance records for this student.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {eventsDialogCalculatedEntry?.finalResult ? (
                <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm font-black">
                  Attended {eventsDialogCalculatedEntry.finalResult.attended_events.toLocaleString()} of {eventsDialogCalculatedEntry.finalResult.expected_events.toLocaleString()} expected
                </div>
              ) : null}

              {eventsDialogIsLoading ? (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  Loading calculated attendance events...
                </div>
              ) : null}

              {eventsDialogError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300">
                  {eventsDialogError}
                </div>
              ) : null}

              {!eventsDialogIsLoading &&
              !eventsDialogError &&
              eventsDialogCalculatedEntry &&
              !eventsDialogCalculatedEntry.finalResult ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-200">
                  Not calculated yet. Showing manual records only. Run Calculate to include uploaded attendance.
                </div>
              ) : null}

              {!eventsDialogIsLoading && eventsDialogCombinedEvents.length ? (
                eventsDialogCombinedEvents.map((eventItem, index) => (
                  <article
                    key={`${eventItem.source}:${eventItem.id}`}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-black">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">{eventItem.name}</p>
                          <span className="rounded-full border bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">
                            {eventItem.source}
                          </span>
                        </div>
                        {eventItem.source === "Manual" ? (
                          <>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatDateTime(eventItem.scanned_at)}
                            </p>
                            {eventItem.remarks ? (
                              <p className="mt-2 break-words text-sm text-muted-foreground">
                                {eventItem.remarks}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : !eventsDialogIsLoading ? (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No attended events selected.
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Manual attendance records</h2>
              <p className="text-sm text-muted-foreground">
                {filteredGroups.length.toLocaleString()} attendee/s shown
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !selectedManualRecordIds.length ||
                      isSaving ||
                      isDeletingManualRecords
                    }
                    className="min-h-11 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingManualRecords ? "Deleting..." : "Delete Selected"}
                  </Button>
                }
                title="Delete selected manual attendance?"
                description={
                  <>
                    This will permanently delete {selectedManualRecordIds.length.toLocaleString()} selected manual attendance record(s). This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE SELECTED"
                confirmLabel="Delete Selected"
                isPending={isDeletingManualRecords}
                onConfirm={handleDeleteSelectedManualRecords}
              />
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      !filteredGroupRecordIds.length ||
                      isSaving ||
                      isDeletingManualRecords
                    }
                    className="min-h-11 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingManualRecords ? "Deleting..." : "Delete All"}
                  </Button>
                }
                title="Delete all matching manual attendance?"
                description={
                  <>
                    This will permanently delete all {filteredGroupRecordIds.length.toLocaleString()} manual attendance record(s) matching the current filters. This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE ALL"
                confirmLabel="Delete All"
                isPending={isDeletingManualRecords}
                onConfirm={handleDeleteAllManualRecords}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:hidden">
            <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2 text-sm font-semibold md:col-span-2">
              <Checkbox
                checked={allFilteredGroupsSelected}
                onCheckedChange={(checked) => handleSelectAllManualGroups(checked === true)}
                aria-label="Select all manual attendance records"
              />
              Select all filtered attendees
            </label>
            {paginatedGroups.length ? (
              paginatedGroups.map((group) => (
                <article key={group.key} className="min-w-0 rounded-2xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-black" title={group.studentId}>{group.studentId}</p>
                      <p className="mt-1 break-words text-sm font-semibold" title={group.name}>{group.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Checkbox
                        aria-label={`Select ${group.studentId}`}
                        checked={isManualGroupSelected(group)}
                        onCheckedChange={(checked) => handleManualGroupSelection(group, checked === true)}
                      />
                      <ActionMenu
                        ariaLabel={`Actions for ${group.studentId}`}
                        actions={[{ label: "Edit", onSelect: () => handleEditGroup(group), disabled: isSaving || isDeletingManualRecords }]}
                        deleteAction={{
                          label: isSaving ? "Deleting..." : "Delete",
                          disabled: isSaving || isDeletingManualRecords,
                          title: "Delete manual attendance?",
                          description: <>This will permanently delete all {group.records.length.toLocaleString()} manual attendance record(s) for Student ID {group.studentId}. This action cannot be undone.</>,
                          confirmationPhrase: "DELETE",
                          confirmLabel: "Delete",
                          isPending: isSaving,
                          onConfirm: () => handleDeleteGroup(group),
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border bg-muted px-3 py-1 text-xs font-black">
                      {group.attendanceType === "zero_attendance" ? "Zero attendance" : "Manual"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOpenEventsDialog(group)}
                      className="min-h-11 rounded-xl px-3 text-xs font-black"
                    >
                      Events ({getGroupCombinedEventCount(group)})
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">College</p>
                      <p className="mt-1 truncate font-semibold" title={group.college || "—"}>{group.college || "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Program</p>
                      <p className="mt-1 truncate font-semibold" title={group.program || "—"}>{group.program || "—"}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Date</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">{formatDateTime(group.latestChangedAt)}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground md:col-span-2">
                {isLoading ? "Loading manual attendance..." : "No manual attendance records found."}
              </div>
            )}
          </div>

          <div className="table-scroll-hint hidden min-w-0 max-w-full overscroll-x-contain overflow-x-auto rounded-2xl border bg-background lg:block">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-30 w-12 bg-muted/95 px-4 py-3">
                    <Checkbox
                      aria-label="Select all manual attendance records"
                      checked={allFilteredGroupsSelected}
                      onCheckedChange={(checked) =>
                        handleSelectAllManualGroups(checked === true)
                      }
                    />
                  </th>
                  <th className="sticky left-12 z-20 bg-muted/95 px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGroups.length ? (
                  paginatedGroups.map((group) => (
                    <tr key={group.key} className="border-t">
                      <td className="sticky left-0 z-20 bg-background px-4 py-3 align-top">
                        <Checkbox
                          aria-label={`Select ${group.studentId}`}
                          checked={isManualGroupSelected(group)}
                          onCheckedChange={(checked) =>
                            handleManualGroupSelection(
                              group,
                              checked === true,
                            )
                          }
                        />
                      </td>
                      <td className="sticky left-12 z-10 bg-background px-4 py-3 font-black">
                        {group.studentId}
                      </td>
                      <td className="px-4 py-3 font-semibold">{group.name}</td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenEventsDialog(group)}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                        >
                          Events ({getGroupCombinedEventCount(group)})
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.college || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.program || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-black">
                          {group.attendanceType === "zero_attendance"
                            ? "Zero attendance"
                            : "Manual"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(group.latestChangedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ActionMenu
                          ariaLabel={`Actions for ${group.studentId}`}
                          actions={[
                            {
                              label: "Edit",
                              onSelect: () => handleEditGroup(group),
                              disabled: isSaving || isDeletingManualRecords,
                            },
                          ]}
                          deleteAction={{
                            label: isSaving ? "Deleting..." : "Delete",
                            disabled: isSaving || isDeletingManualRecords,
                            title: "Delete manual attendance?",
                            description: (
                              <>
                                This will permanently delete all {group.records.length.toLocaleString()} manual attendance record(s) for Student ID {group.studentId}. This action cannot be undone.
                              </>
                            ),
                            confirmationPhrase: "DELETE",
                            confirmLabel: "Delete",
                            isPending: isSaving,
                            onConfirm: () => handleDeleteGroup(group),
                          }}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
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

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Showing {manualRangeStart.toLocaleString()}–{manualRangeEnd.toLocaleString()} of {filteredGroups.length.toLocaleString()} attendee/s
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Show</span>
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
              <Button type="button" variant="outline" disabled={currentPage <= 1 || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="h-10 rounded-xl px-4 text-xs font-black">Previous</Button>
              <span className="min-w-20 text-center text-xs font-black text-muted-foreground">Page {currentPage} of {manualAttendanceTotalPages}</span>
              <Button type="button" variant="outline" disabled={currentPage >= manualAttendanceTotalPages || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.min(manualAttendanceTotalPages, page + 1))} className="h-10 rounded-xl px-4 text-xs font-black">Next</Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );

}