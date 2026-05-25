import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import { listAttendanceRecords } from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearLabel,
  listSchoolYears,
  transferSchoolYearRecords,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import type { AttendanceRecord } from "../../api/attendance";
import {
  createPenalty,
  deletePenalty,
  listFines,
  listPenalties,
  seedDefaultPenalties,
  updateFineStatus,
  updatePenalty,
} from "../../api/fines";
import type { FineRecord, FineStatus, PenaltyRecord } from "../../api/fines";
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
import ExportReport from "../../components/exportReport";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type StatusFilter = FineStatus | "all";

type PenaltyFormState = {
  noOfAbsences: string;
  prescribedPenalty: string;
};

type DisplayFineRecord = FineRecord & {
  merged_fine_ids?: string[];
  merged_record_count?: number;
};

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "ALL STATUS" },
  { value: "unpaid", label: "UNPAID" },
  { value: "paid", label: "PAID" },
  { value: "waived", label: "WAIVED" },
];

const fineStatusOptions: Array<{ value: FineStatus; label: string }> = [
  { value: "unpaid", label: "UNPAID" },
  { value: "paid", label: "PAID" },
  { value: "waived", label: "WAIVED" },
];

const emptyPenaltyForm: PenaltyFormState = {
  noOfAbsences: "",
  prescribedPenalty: "",
};

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;

function getDateYear(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return String(date.getFullYear());
}

function getAttendanceRecordYear(record: AttendanceRecord) {
  return record.school_year_id || getDateYear(record.scanned_at ?? record.created_at ?? null);
}

function getFineRecordYear(fine: FineRecord) {
  return fine.school_year_id || getDateYear(fine.created_at ?? null);
}

function getYearOptions(
  attendanceRecords: AttendanceRecord[],
  fines: FineRecord[],
  schoolYears: SchoolYearRecord[],
) {
  return Array.from(
    new Set(
      [
        ...schoolYears.map((schoolYear) => schoolYear.id),
        ...attendanceRecords.map(getAttendanceRecordYear),
        ...fines.map(getFineRecordYear),
      ].filter(Boolean),
    ),
  );
}

function matchesSelectedYear(recordYear: string, selectedYear: string) {
  return selectedYear === ALL_YEARS_VALUE || recordYear === selectedYear;
}

function normalizeDisplayValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCollegeScopeKey(value: unknown) {
  return normalizeDisplayValue(value) || "__no_college__";
}

function getRecordCollegeScopeKey(record: AttendanceRecord) {
  return getCollegeScopeKey(record.college);
}

function getFineAttendanceRecordId(fine: FineRecord) {
  return String(fine.attendance_record_id ?? "").trim();
}

function getFineAttendanceEventId(fine: FineRecord) {
  return String(fine.attendance_event_id ?? "").trim();
}

function getAttendanceRecordAbsenceCount(record?: AttendanceRecord | null) {
  const numericValue = Number(record?.no_of_absences ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function getFineStoredAbsenceCount(fine: FineRecord) {
  const numericValue = Number(fine.no_of_absences ?? 0);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function getFineLinkedAttendanceRecord(
  fine: FineRecord,
  attendanceRecords: AttendanceRecord[],
) {
  const fineAttendanceRecordId = getFineAttendanceRecordId(fine);
  const fineAttendanceEventId = getFineAttendanceEventId(fine);
  const cleanStudentId = normalizeDisplayValue(fine.student_id);

  if (fineAttendanceRecordId) {
    const linkedRecord = attendanceRecords.find(
      (record) => String(record.id ?? "").trim() === fineAttendanceRecordId,
    );

    if (linkedRecord) return linkedRecord;
  }

  if (!fineAttendanceEventId || !cleanStudentId) return null;

  return (
    attendanceRecords.find(
      (record) =>
        String(record.event_id ?? "").trim() === fineAttendanceEventId &&
        normalizeDisplayValue(record.student_id) === cleanStudentId,
    ) ?? null
  );
}

function getFineBaseAbsenceCount(
  fine: FineRecord,
  attendanceRecords: AttendanceRecord[],
) {
  const linkedAttendanceRecord = getFineLinkedAttendanceRecord(
    fine,
    attendanceRecords,
  );

  if (linkedAttendanceRecord) {
    return getAttendanceRecordAbsenceCount(linkedAttendanceRecord);
  }

  return getFineStoredAbsenceCount(fine);
}

function isZeroAttendanceRecord(record: AttendanceRecord) {
  return (
    !record.event_id &&
    normalizeDisplayValue(record.remarks).includes("zero attendance")
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

function getRecordEventIdentityKey(record: AttendanceRecord) {
  const eventId = String(record.event_id ?? "").trim();
  const eventName = normalizeDisplayValue(
    (record as { event_name?: string | null }).event_name,
  );
  const importId = normalizeDisplayValue(
    (record as { import_id?: string | null }).import_id,
  );

  if (eventId) return `event-id:${eventId}`;
  if (eventName) return `event-name:${eventName}`;
  if (importId) return `import:${importId}`;

  return "";
}

function getRecordCollegeLinkedEventKey(record: AttendanceRecord) {
  const eventKey = getRecordEventIdentityKey(record);
  if (!eventKey) return "";

  return `${eventKey}:college:${getRecordCollegeScopeKey(record)}`;
}

function recordMatchesSelectedYear(
  record: AttendanceRecord,
  selectedYear: string,
) {
  return matchesSelectedYear(getAttendanceRecordYear(record), selectedYear);
}

function getStudentMissingCollegeLinkedEventCount(props: {
  studentId: string;
  attendanceRecords: AttendanceRecord[];
  selectedYear: string;
}) {
  const cleanStudentId = normalizeDisplayValue(props.studentId);

  if (!cleanStudentId || !props.attendanceRecords.length) return null;

  const yearRecords = props.attendanceRecords.filter((record) =>
    recordMatchesSelectedYear(record, props.selectedYear),
  );
  const studentRecords = yearRecords.filter(
    (record) => normalizeDisplayValue(record.student_id) === cleanStudentId,
  );
  const studentCollegeKeys = new Set(
    studentRecords
      .map(getRecordCollegeScopeKey)
      .filter((collegeKey) => collegeKey !== "__no_college__"),
  );

  if (!studentCollegeKeys.size) return null;

  const collegeLinkedEventKeys = new Set<string>();
  const attendedEventKeys = new Set<string>();

  yearRecords.forEach((record) => {
    const collegeKey = getRecordCollegeScopeKey(record);
    const eventKey = getRecordCollegeLinkedEventKey(record);

    if (
      !studentCollegeKeys.has(collegeKey) ||
      !eventKey ||
      isZeroAttendanceRecord(record)
    ) {
      return;
    }

    collegeLinkedEventKeys.add(eventKey);
  });

  if (!collegeLinkedEventKeys.size) return null;

  studentRecords.forEach((record) => {
    const collegeKey = getRecordCollegeScopeKey(record);
    const eventKey = getRecordCollegeLinkedEventKey(record);

    if (
      !studentCollegeKeys.has(collegeKey) ||
      !eventKey ||
      isZeroAttendanceRecord(record) ||
      isExplicitAbsentAttendanceRecord(record)
    ) {
      return;
    }

    attendedEventKeys.add(eventKey);
  });

  return Array.from(collegeLinkedEventKeys).filter(
    (eventKey) => !attendedEventKeys.has(eventKey),
  ).length;
}

function getDisplayedFineAbsenceCount(
  fine: FineRecord,
  attendanceRecords: AttendanceRecord[],
  selectedYear: string,
) {
  const fineAbsenceCount = getFineBaseAbsenceCount(
    fine,
    attendanceRecords,
  );
  const collegeLinkedAbsenceCount = getStudentMissingCollegeLinkedEventCount({
    studentId: fine.student_id,
    attendanceRecords,
    selectedYear,
  });

  if (collegeLinkedAbsenceCount !== null) {
    return collegeLinkedAbsenceCount > 0
      ? Math.min(Math.max(1, fineAbsenceCount), collegeLinkedAbsenceCount)
      : 0;
  }

  return fineAbsenceCount;
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

function statusClass(status: FineStatus) {
  if (status === "paid")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "waived") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function getFineStatusLabel(status: FineStatus) {
  return (
    fineStatusOptions.find((item) => item.value === status)?.label ??
    status.toUpperCase()
  );
}

function isZeroAttendanceFine(fine: FineRecord) {
  return (
    !fine.attendance_event_id &&
    String(fine.attendance_remarks ?? "")
      .toLowerCase()
      .includes("zero attendance")
  );
}

function normalizeFineDisplayValue(value: unknown) {
  return normalizeDisplayValue(value);
}

function getFineDisplayKey(fine: FineRecord) {
  return [
    normalizeFineDisplayValue(fine.student_id),
    normalizeFineDisplayValue(fine.attendance_event_id),
    normalizeFineDisplayValue(fine.attendance_record_id),
    getFineStoredAbsenceCount(fine),
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

function getMergedFineStatus(fines: FineRecord[]): FineStatus {
  if (fines.some((fine) => fine.status === "unpaid")) return "unpaid";
  if (fines.length && fines.every((fine) => fine.status === "paid"))
    return "paid";
  if (fines.length && fines.every((fine) => fine.status === "waived"))
    return "waived";

  return fines[0]?.status ?? "unpaid";
}

function getStudentMergedFineKey(fine: FineRecord) {
  const cleanStudentId = normalizeFineDisplayValue(fine.student_id);

  return cleanStudentId || getFineDisplayKey(fine);
}

function getMergedFineIds(fines: FineRecord[]) {
  return Array.from(new Set(fines.map((fine) => fine.id).filter(Boolean)));
}

function mergeStudentFineRecords(
  fines: FineRecord[],
  attendanceRecords: AttendanceRecord[],
  selectedYear: string,
): DisplayFineRecord[] {
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
        getDisplayedFineAbsenceCount(
          rightFine,
          attendanceRecords,
          selectedYear,
        ) -
        getDisplayedFineAbsenceCount(leftFine, attendanceRecords, selectedYear);

      if (absenceDifference !== 0) return absenceDifference;

      return getFineTimestamp(rightFine) - getFineTimestamp(leftFine);
    });
    const baseFine = sortedGroup[0];
    const mergedAbsenceCount = group.reduce((highestCount, fine) => {
      return Math.max(
        highestCount,
        getDisplayedFineAbsenceCount(fine, attendanceRecords, selectedYear),
      );
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

function getFineUpdateIds(fine: DisplayFineRecord) {
  const mergedFineIds = fine.merged_fine_ids?.filter(Boolean) ?? [];

  return mergedFineIds.length ? mergedFineIds : [fine.id];
}

function getStudentCollegeScopeKeys(
  studentId: string,
  attendanceRecords: AttendanceRecord[],
) {
  const cleanStudentId = normalizeDisplayValue(studentId);
  const collegeKeys = new Set<string>();

  if (!cleanStudentId) return collegeKeys;

  attendanceRecords.forEach((record) => {
    if (normalizeDisplayValue(record.student_id) !== cleanStudentId) return;

    const collegeKey = getRecordCollegeScopeKey(record);
    if (collegeKey !== "__no_college__") collegeKeys.add(collegeKey);
  });

  if (!collegeKeys.size) {
    attendanceRecords.forEach((record) => {
      if (normalizeDisplayValue(record.student_id) !== cleanStudentId) return;
      collegeKeys.add(getRecordCollegeScopeKey(record));
    });
  }

  return collegeKeys;
}

function isFineLinkedToAttendeeCollege(props: {
  fine: FineRecord;
  attendanceRecords: AttendanceRecord[];
  selectedYear: string;
}) {
  if (isZeroAttendanceFine(props.fine)) return true;
  if (!props.attendanceRecords.length) return true;

  const collegeLinkedAbsenceCount = getStudentMissingCollegeLinkedEventCount({
    studentId: props.fine.student_id,
    attendanceRecords: props.attendanceRecords,
    selectedYear: props.selectedYear,
  });

  if (collegeLinkedAbsenceCount !== null && collegeLinkedAbsenceCount <= 0) {
    return false;
  }

  const fineEventId = getFineAttendanceEventId(props.fine);
  const fineAttendanceRecordId = getFineAttendanceRecordId(props.fine);

  if (!fineEventId && !fineAttendanceRecordId) {
    return collegeLinkedAbsenceCount === null || collegeLinkedAbsenceCount > 0;
  }

  const linkedAttendanceRecord = fineAttendanceRecordId
    ? props.attendanceRecords.find(
        (record) => String(record.id ?? "") === fineAttendanceRecordId,
      )
    : null;

  if (linkedAttendanceRecord) {
    return matchesSelectedYear(
      getAttendanceRecordYear(linkedAttendanceRecord),
      props.selectedYear,
    );
  }

  if (!fineEventId)
    return collegeLinkedAbsenceCount === null || collegeLinkedAbsenceCount > 0;

  const studentCollegeKeys = getStudentCollegeScopeKeys(
    props.fine.student_id,
    props.attendanceRecords,
  );
  if (!studentCollegeKeys.size) return true;

  return props.attendanceRecords.some((record) => {
    if (String(record.event_id ?? "").trim() !== fineEventId) return false;
    if (!studentCollegeKeys.has(getRecordCollegeScopeKey(record))) return false;

    return matchesSelectedYear(
      getAttendanceRecordYear(record),
      props.selectedYear,
    );
  });
}

function DeletePenaltyConfirmation(props: {
  penalty: PenaltyRecord;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructiveOutline"
          disabled={props.isDeleting}
          className={props.className}
        >
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete penalty rule?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the penalty rule for{" "}
            {props.penalty.no_of_absences} absence/s. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => props.onConfirm(props.penalty.id)}
            className="bg-destructive text-destructive-foreground hover:opacity-90"
          >
            Delete Penalty
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeletePenaltiesConfirmation(props: {
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
          variant="destructiveOutline"
          disabled={props.disabled || props.isDeleting}
          className={props.className}
        >
          {props.isDeleting ? "Deleting..." : props.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
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

export default function FinesPage() {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedPenaltyIds, setSelectedPenaltyIds] = useState<string[]>([]);
  const [selectedFineIds, setSelectedFineIds] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [yearFilter, setYearFilter] = useState(ALL_YEARS_VALUE);
  const [studentId, setStudentId] = useState("");
  const [transferTargetSchoolYearId, setTransferTargetSchoolYearId] = useState("");
  const [isLoadingFines, setIsLoadingFines] = useState(true);
  const [isLoadingAttendanceRecords, setIsLoadingAttendanceRecords] =
    useState(true);
  const [isLoadingPenalties, setIsLoadingPenalties] = useState(true);
  const [isTransferringFines, setIsTransferringFines] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [savingPenalty, setSavingPenalty] = useState(false);
  const [seedingPenalties, setSeedingPenalties] = useState(false);
  const [deletingPenaltyId, setDeletingPenaltyId] = useState("");
  const [isDeletingPenaltyBulk, setIsDeletingPenaltyBulk] = useState(false);
  const [editingPenaltyId, setEditingPenaltyId] = useState("");
  const [penaltyForm, setPenaltyForm] =
    useState<PenaltyFormState>(emptyPenaltyForm);
  const [error, setError] = useState("");
  const [penaltyError, setPenaltyError] = useState("");

  const yearOptions = useMemo(
    () => getYearOptions(attendanceRecords, fines, schoolYears),
    [attendanceRecords, fines, schoolYears],
  );
  const yearFilteredFines = useMemo(() => {
    const filteredFines = fines.filter((fine) => {
      const matchesYear = matchesSelectedYear(
        getFineRecordYear(fine),
        yearFilter,
      );
      const matchesCollegeScope = isFineLinkedToAttendeeCollege({
        fine,
        attendanceRecords,
        selectedYear: yearFilter,
      });

      return matchesYear && matchesCollegeScope;
    });

    return mergeStudentFineRecords(filteredFines, attendanceRecords, yearFilter);
  }, [fines, attendanceRecords, yearFilter]);
  const reportYearLabel = getSchoolYearLabel(schoolYears, yearFilter);
  const totalFines = yearFilteredFines.length;
  const unpaidFines = useMemo(
    () => yearFilteredFines.filter((fine) => fine.status === "unpaid").length,
    [yearFilteredFines],
  );
  const zeroAttendanceFines = useMemo(
    () => yearFilteredFines.filter(isZeroAttendanceFine).length,
    [yearFilteredFines],
  );
  const selectedPenaltyIdsSet = useMemo(
    () => new Set(selectedPenaltyIds),
    [selectedPenaltyIds],
  );
  const selectedFineIdsSet = useMemo(
    () => new Set(selectedFineIds),
    [selectedFineIds],
  );
  const selectedPenaltyCount = selectedPenaltyIds.length;
  const selectedFineCount = selectedFineIds.length;
  const allPenaltiesSelected =
    penalties.length > 0 && selectedPenaltyCount === penalties.length;
  const allVisibleFinesSelected =
    yearFilteredFines.length > 0 && selectedFineCount === yearFilteredFines.length;
  const penaltyHeaderChecked = allPenaltiesSelected
    ? true
    : selectedPenaltyCount > 0
      ? "indeterminate"
      : false;
  const fineHeaderChecked = allVisibleFinesSelected
    ? true
    : selectedFineCount > 0
      ? "indeterminate"
      : false;
  const reportAttendanceRecords = useMemo(() => {
    const cleanStudentId = studentId.trim().toLowerCase();

    return attendanceRecords.filter((record) => {
      const matchesStudentId =
        !cleanStudentId ||
        String(record.student_id ?? "")
          .toLowerCase()
          .includes(cleanStudentId);
      const matchesYear = matchesSelectedYear(
        getAttendanceRecordYear(record),
        yearFilter,
      );

      return matchesStudentId && matchesYear;
    });
  }, [attendanceRecords, studentId, yearFilter]);

  function handleToggleFineSelected(
    id: string,
    checked: boolean | "indeterminate",
  ) {
    setSelectedFineIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((fineId) => fineId !== id);
    });
  }

  function handleToggleAllFines(checked: boolean | "indeterminate") {
    setSelectedFineIds(
      checked === true ? yearFilteredFines.map((fine) => fine.id) : [],
    );
  }

  async function handleTransferSelectedFines() {
    if (!selectedFineIds.length) {
      toast.error("Please select fine record/s to transfer.");
      return;
    }

    if (!transferTargetSchoolYearId) {
      toast.error("Please select a target school year.");
      return;
    }

    setIsTransferringFines(true);
    setError("");

    try {
      await transferSchoolYearRecords({
        targetSchoolYearId: transferTargetSchoolYearId,
        fineIds: selectedFineIds,
      });
      setSelectedFineIds([]);
      await Promise.all([loadFines(), loadAttendanceRecords()]);
      toast.success("Selected fine record/s transferred successfully.");
    } catch (transferError) {
      const message =
        transferError instanceof Error
          ? transferError.message
          : "Unable to transfer fine records.";
      setError(message);
      toast.error(message);
    } finally {
      setIsTransferringFines(false);
    }
  }

  function handleTogglePenaltySelected(
    id: string,
    checked: boolean | "indeterminate",
  ) {
    setSelectedPenaltyIds((current) => {
      if (checked === true) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((penaltyId) => penaltyId !== id);
    });
  }

  function handleToggleAllPenalties(checked: boolean | "indeterminate") {
    setSelectedPenaltyIds(
      checked === true ? penalties.map((penalty) => penalty.id) : [],
    );
  }

  async function loadFines() {
    setIsLoadingFines(true);
    setError("");

    try {
      const rows = await listFines({
        status: status === "all" ? "" : status,
        studentId: studentId.trim() || undefined,
        limit: 5000,
        offset: 0,
      });

      setFines(getUniqueDisplayFines(rows));
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load fines.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingFines(false);
    }
  }

  async function loadAttendanceRecords() {
    setIsLoadingAttendanceRecords(true);

    try {
      const rows = await listAttendanceRecords({ limit: 5000, offset: 0 });
      setAttendanceRecords(rows);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load attendance records for report.";
      toast.error(message);
    } finally {
      setIsLoadingAttendanceRecords(false);
    }
  }

  async function loadPenalties() {
    setIsLoadingPenalties(true);
    setPenaltyError("");

    try {
      const rows = await listPenalties();
      const rowIds = new Set(rows.map((penalty) => penalty.id));

      setPenalties(rows);
      setSelectedPenaltyIds((current) =>
        current.filter((id) => rowIds.has(id)),
      );
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load penalties.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setIsLoadingPenalties(false);
    }
  }

  async function loadSchoolYears() {
    try {
      const rows = await listSchoolYears();
      setSchoolYears(rows);
      setTransferTargetSchoolYearId((current) => current || rows[0]?.id || "");
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load school years.";
      toast.error(message);
    }
  }

  async function loadPageData() {
    await Promise.all([
      loadFines(),
      loadAttendanceRecords(),
      loadPenalties(),
      loadSchoolYears(),
    ]);
  }

  async function handleFilter(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFines();
  }

  async function handleResetFilters() {
    setStatus("all");
    setYearFilter(ALL_YEARS_VALUE);
    setStudentId("");
    setIsLoadingFines(true);
    setError("");

    try {
      const rows = await listFines({
        limit: 5000,
        offset: 0,
      });
      setFines(getUniqueDisplayFines(rows));
      await loadAttendanceRecords();
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load fines.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingFines(false);
    }
  }

  async function handleStatusChange(
    fineRecord: DisplayFineRecord,
    nextStatus: FineStatus,
  ) {
    const idsToUpdate = getFineUpdateIds(fineRecord);

    setUpdatingId(fineRecord.id);
    setError("");

    try {
      const updatedRows = await Promise.all(
        idsToUpdate.map((id) => updateFineStatus(id, nextStatus)),
      );
      const updatedById = new Map(
        updatedRows
          .filter((row): row is FineRecord => Boolean(row))
          .map((row) => [row.id, row]),
      );

      if (updatedById.size) {
        setFines((current) =>
          getUniqueDisplayFines(
            current.map((fine) => updatedById.get(fine.id) ?? fine),
          ),
        );
        toast.success("Fine status updated successfully.");
      }
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Unable to update fine status.";
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingId("");
    }
  }

  async function handlePenaltySubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPenalty(true);
    setPenaltyError("");

    const noOfAbsences = Number(penaltyForm.noOfAbsences);
    const prescribedPenalty = penaltyForm.prescribedPenalty.trim();

    if (!Number.isInteger(noOfAbsences) || noOfAbsences <= 0) {
      setPenaltyError("No. of Absences must be a positive whole number.");
      toast.error("No. of Absences must be a positive whole number.");
      setSavingPenalty(false);
      return;
    }

    if (!prescribedPenalty) {
      setPenaltyError("Prescribed penalty is required.");
      toast.error("Prescribed penalty is required.");
      setSavingPenalty(false);
      return;
    }

    const successMessage = editingPenaltyId
      ? "Penalty rule updated successfully."
      : "Penalty rule created successfully.";

    try {
      const saved = editingPenaltyId
        ? await updatePenalty(editingPenaltyId, noOfAbsences, prescribedPenalty)
        : await createPenalty(noOfAbsences, prescribedPenalty);

      if (saved) {
        setPenalties((current) => {
          const exists = current.some((penalty) => penalty.id === saved.id);
          const next = exists
            ? current.map((penalty) =>
                penalty.id === saved.id ? saved : penalty,
              )
            : [...current, saved];

          return next.sort(
            (first, second) => first.no_of_absences - second.no_of_absences,
          );
        });
      }

      setEditingPenaltyId("");
      setPenaltyForm(emptyPenaltyForm);
      await loadFines();
      toast.success(successMessage);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Unable to save penalty.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setSavingPenalty(false);
    }
  }

  function handleEditPenalty(penalty: PenaltyRecord) {
    setEditingPenaltyId(penalty.id);
    setPenaltyForm({
      noOfAbsences: String(penalty.no_of_absences),
      prescribedPenalty: penalty.prescribed_penalty,
    });
    setPenaltyError("");
  }

  function handleCancelPenaltyEdit() {
    setEditingPenaltyId("");
    setPenaltyForm(emptyPenaltyForm);
    setPenaltyError("");
  }

  async function handleDeletePenalty(id: string) {
    setDeletingPenaltyId(id);
    setPenaltyError("");

    try {
      await deletePenalty(id);
      setPenalties((current) => current.filter((penalty) => penalty.id !== id));
      setSelectedPenaltyIds((current) =>
        current.filter((penaltyId) => penaltyId !== id),
      );

      if (editingPenaltyId === id) {
        handleCancelPenaltyEdit();
      }

      await loadFines();
      toast.success("Penalty rule deleted successfully.");
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete penalty.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setDeletingPenaltyId("");
    }
  }

  async function handleDeletePenalties(ids: string[]) {
    const idsToDelete = Array.from(new Set(ids)).filter(Boolean);

    if (!idsToDelete.length) {
      toast.error("Please select penalty rule/s to delete.");
      return;
    }

    setIsDeletingPenaltyBulk(true);
    setPenaltyError("");

    try {
      await Promise.all(idsToDelete.map((id) => deletePenalty(id)));
      setPenalties((current) =>
        current.filter((penalty) => !idsToDelete.includes(penalty.id)),
      );
      setSelectedPenaltyIds((current) =>
        current.filter((id) => !idsToDelete.includes(id)),
      );

      if (editingPenaltyId && idsToDelete.includes(editingPenaltyId)) {
        handleCancelPenaltyEdit();
      }

      await loadFines();
      toast.success(
        `${idsToDelete.length} penalty rule/s deleted successfully.`,
      );
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete penalty rules.";
      setPenaltyError(message);
      toast.error(message);
      await loadPenalties();
      await loadFines();
    } finally {
      setIsDeletingPenaltyBulk(false);
    }
  }

  async function handleSeedPenalties() {
    setSeedingPenalties(true);
    setPenaltyError("");

    try {
      const rows = await seedDefaultPenalties();
      setPenalties(
        rows.sort(
          (first, second) => first.no_of_absences - second.no_of_absences,
        ),
      );
      setSelectedPenaltyIds([]);
      await loadFines();
      toast.success("Default penalty rules seeded successfully.");
    } catch (seedError) {
      const message =
        seedError instanceof Error
          ? seedError.message
          : "Unable to seed default penalties.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setSeedingPenalties(false);
    }
  }

  useEffect(() => {
    if (yearFilter !== ALL_YEARS_VALUE && !yearOptions.includes(yearFilter)) {
      setYearFilter(ALL_YEARS_VALUE);
    }
  }, [yearFilter, yearOptions]);

  useEffect(() => {
    void loadPageData();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Penalty records
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Fines
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Display existing student fines, filter records, update fine
            statuses, and manage penalty rules.
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Displayed fines
            </p>
            <p className="mt-2 text-3xl font-black">
              {isLoadingFines ? "—" : totalFines}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Displayed unpaid
            </p>
            <p className="mt-2 text-3xl font-black">
              {isLoadingFines ? "—" : unpaidFines}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Penalty rules
            </p>
            <p className="mt-2 text-3xl font-black">
              {isLoadingPenalties ? "—" : penalties.length}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Zero attendance
            </p>
            <p className="mt-2 text-3xl font-black">
              {isLoadingFines ? "—" : zeroAttendanceFines}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Current filter
            </p>
            <p className="mt-2 text-lg font-black uppercase">
              {status === "all" ? "All" : status} / {reportYearLabel}
            </p>
          </div>
        </section>

        <form
          onSubmit={handleFilter}
          className="flex flex-col gap-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5 lg:flex-row"
        >
          <Input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="Search by Student ID"
            className="min-h-12 rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:flex-1"
          />

          <Select
            value={status}
            onValueChange={(value) => setStatus(value as StatusFilter)}
          >
            <SelectTrigger className="min-h-12 rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:w-56">
              <SelectValue placeholder="ALL STATUS" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="min-h-12 rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:w-44">
              <SelectValue placeholder="ALL YEARS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_YEARS_VALUE}>ALL SCHOOL YEARS</SelectItem>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {getSchoolYearLabel(schoolYears, year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-col gap-3 sm:flex-row lg:w-auto">
            <Button
              type="submit"
              disabled={isLoadingFines}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black"
            >
              {isLoadingFines ? "Loading..." : "Apply Filter"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingFines}
              onClick={handleResetFilters}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black"
            >
              Reset
            </Button>
          </div>
        </form>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight">
                Existing Fines
              </h2>
              <p className="text-sm text-muted-foreground">
                Fines are loaded from saved fine records and separated by
                selected year.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <Select
                value={transferTargetSchoolYearId}
                onValueChange={setTransferTargetSchoolYearId}
              >
                <SelectTrigger className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black sm:w-52">
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
                disabled={!selectedFineCount || isTransferringFines}
                onClick={handleTransferSelectedFines}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              >
                {isTransferringFines ? "Transferring..." : "Transfer Selected"}
              </Button>
              <ExportReport
                attendanceRecords={reportAttendanceRecords}
                fines={yearFilteredFines}
                isLoading={isLoadingFines || isLoadingAttendanceRecords}
                yearLabel={reportYearLabel}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingFines || isLoadingAttendanceRecords}
                onClick={() => {
                  void Promise.all([loadFines(), loadAttendanceRecords()]);
                }}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              >
                {isLoadingFines || isLoadingAttendanceRecords
                  ? "Loading..."
                  : "Refresh Fines"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {yearFilteredFines.length ? (
              yearFilteredFines.map((fine) => (
                <article
                  key={fine.id}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Checkbox
                      checked={selectedFineIdsSet.has(fine.id)}
                      onCheckedChange={(checked) =>
                        handleToggleFineSelected(fine.id, checked)
                      }
                      aria-label={`Select fine record for ${fine.student_id}`}
                    />
                    <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Select fine
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="wrap-break-word font-black">{fine.name}</p>
                      <p className="break-all text-sm text-muted-foreground">
                        {fine.student_id}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isZeroAttendanceFine(fine) ? (
                        <span className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                          Zero attendance
                        </span>
                      ) : null}
                      <span
                        className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(fine.status)}`}
                      >
                        {fine.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 wrap-break-word text-sm text-muted-foreground">
                    {fine.prescribed_penalty}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold">
                      {getDisplayedFineAbsenceCount(
                        fine,
                        attendanceRecords,
                        yearFilter,
                      )}{" "}
                      absence/s • {formatDate(fine.created_at)}
                    </p>
                    <Select
                      value={fine.status}
                      disabled={updatingId === fine.id}
                      onValueChange={(value) =>
                        handleStatusChange(fine, value as FineStatus)
                      }
                    >
                      <SelectTrigger className="min-h-10 rounded-xl border bg-card px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-40">
                        <SelectValue
                          placeholder={getFineStatusLabel(fine.status)}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {fineStatusOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                {isLoadingFines
                  ? "Loading fine records..."
                  : "No fine records found."}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">
                    <Checkbox
                      checked={fineHeaderChecked}
                      onCheckedChange={handleToggleAllFines}
                      aria-label="Select all visible fine records"
                    />
                  </th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Absences</th>
                  <th className="px-3 py-3">Penalty</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {yearFilteredFines.length ? (
                  yearFilteredFines.map((fine) => (
                    <tr key={fine.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selectedFineIdsSet.has(fine.id)}
                          onCheckedChange={(checked) =>
                            handleToggleFineSelected(fine.id, checked)
                          }
                          aria-label={`Select fine record for ${fine.student_id}`}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatDate(fine.created_at)}
                      </td>
                      <td className="max-w-40 break-all px-3 py-3">
                        {fine.student_id}
                      </td>
                      <td className="max-w-56 wrap-break-word px-3 py-3">
                        {fine.name}
                      </td>
                      <td className="px-3 py-3">
                        {getDisplayedFineAbsenceCount(
                          fine,
                          attendanceRecords,
                          yearFilter,
                        )}
                      </td>
                      <td className="max-w-sm wrap-break-word px-3 py-3 text-muted-foreground">
                        {fine.prescribed_penalty}
                      </td>
                      <td className="px-3 py-3">
                        {isZeroAttendanceFine(fine) ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                            Zero attendance
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">
                            Attendance record
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(fine.status)}`}
                        >
                          {fine.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={fine.status}
                          disabled={updatingId === fine.id}
                          onValueChange={(value) =>
                            handleStatusChange(fine, value as FineStatus)
                          }
                        >
                          <SelectTrigger className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 lg:w-36">
                            <SelectValue
                              placeholder={getFineStatusLabel(fine.status)}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {fineStatusOptions.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoadingFines
                        ? "Loading fine records..."
                        : "No fine records found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight">
                Penalty Rules
              </h2>
              <p className="text-sm text-muted-foreground">
                Create, read, update, and delete penalty rules used when fines
                are generated.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              {selectedPenaltyCount ? (
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  {selectedPenaltyCount} selected
                </p>
              ) : null}
              <DeletePenaltiesConfirmation
                label="Delete Selected"
                title="Delete selected penalty rules?"
                description={`This will permanently delete ${selectedPenaltyCount} selected penalty rule/s. This action cannot be undone.`}
                isDeleting={isDeletingPenaltyBulk}
                disabled={!selectedPenaltyCount}
                onConfirm={() => handleDeletePenalties(selectedPenaltyIds)}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
              <DeletePenaltiesConfirmation
                label="Delete All"
                title="Delete all penalty rules?"
                description={`This will permanently delete all ${penalties.length} loaded penalty rule/s. This action cannot be undone.`}
                isDeleting={isDeletingPenaltyBulk}
                disabled={!penalties.length}
                onConfirm={() =>
                  handleDeletePenalties(penalties.map((penalty) => penalty.id))
                }
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              />
              <Button
                type="button"
                variant="outline"
                disabled={seedingPenalties || isDeletingPenaltyBulk}
                onClick={handleSeedPenalties}
                className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
              >
                {seedingPenalties ? "Seeding..." : "Seed Default Penalties"}
              </Button>
            </div>
          </div>

          <form
            onSubmit={handlePenaltySubmit}
            className="mb-5 grid gap-3 rounded-2xl border bg-background p-4 lg:grid-cols-12"
          >
            <Input
              type="number"
              min="1"
              value={penaltyForm.noOfAbsences}
              onChange={(event) =>
                setPenaltyForm((current) => ({
                  ...current,
                  noOfAbsences: event.target.value,
                }))
              }
              placeholder="No. of Absences"
              className="min-h-12 rounded-2xl border bg-card px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:col-span-3"
            />
            <Input
              value={penaltyForm.prescribedPenalty}
              onChange={(event) =>
                setPenaltyForm((current) => ({
                  ...current,
                  prescribedPenalty: event.target.value,
                }))
              }
              placeholder="Prescribed penalty"
              className="min-h-12 rounded-2xl border bg-card px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:col-span-6"
            />
            <Button
              type="submit"
              disabled={savingPenalty}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black lg:col-span-2"
            >
              {savingPenalty
                ? "Saving..."
                : editingPenaltyId
                  ? "Update"
                  : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelPenaltyEdit}
              disabled={savingPenalty && !editingPenaltyId}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black lg:col-span-1"
            >
              Clear
            </Button>
          </form>

          {penaltyError ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {penaltyError}
            </div>
          ) : null}

          <div className="space-y-3 lg:hidden">
            {penalties.length ? (
              penalties.map((penalty) => (
                <article
                  key={penalty.id}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedPenaltyIdsSet.has(penalty.id)}
                      onCheckedChange={(checked) =>
                        handleTogglePenaltySelected(penalty.id, checked)
                      }
                      aria-label={`Select penalty rule for ${penalty.no_of_absences} absence/s`}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-muted-foreground">
                            {penalty.no_of_absences} absence/s
                          </p>
                          <p className="mt-1 wrap-break-word font-black">
                            {penalty.prescribed_penalty}
                          </p>
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {formatDate(penalty.updated_at)}
                        </p>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleEditPenalty(penalty)}
                          className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                        >
                          Edit
                        </Button>
                        <DeletePenaltyConfirmation
                          penalty={penalty}
                          isDeleting={
                            deletingPenaltyId === penalty.id ||
                            isDeletingPenaltyBulk
                          }
                          onConfirm={handleDeletePenalty}
                          className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                {isLoadingPenalties
                  ? "Loading penalty records..."
                  : "No penalty records found."}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">
                    <Checkbox
                      checked={penaltyHeaderChecked}
                      onCheckedChange={handleToggleAllPenalties}
                      aria-label="Select all penalty rules"
                    />
                  </th>
                  <th className="px-3 py-3">Absences</th>
                  <th className="px-3 py-3">Prescribed Penalty</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {penalties.length ? (
                  penalties.map((penalty) => (
                    <tr key={penalty.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selectedPenaltyIdsSet.has(penalty.id)}
                          onCheckedChange={(checked) =>
                            handleTogglePenaltySelected(penalty.id, checked)
                          }
                          aria-label={`Select penalty rule for ${penalty.no_of_absences} absence/s`}
                        />
                      </td>
                      <td className="px-3 py-3 font-black">
                        {penalty.no_of_absences}
                      </td>
                      <td className="max-w-xl wrap-break-word px-3 py-3 text-muted-foreground">
                        {penalty.prescribed_penalty}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatDate(penalty.created_at)}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatDate(penalty.updated_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditPenalty(penalty)}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Edit
                          </Button>
                          <DeletePenaltyConfirmation
                            penalty={penalty}
                            isDeleting={
                              deletingPenaltyId === penalty.id ||
                              isDeletingPenaltyBulk
                            }
                            onConfirm={handleDeletePenalty}
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoadingPenalties
                        ? "Loading penalty records..."
                        : "No penalty records found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}