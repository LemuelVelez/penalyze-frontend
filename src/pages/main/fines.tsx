import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  createPenalty,
  deletePenalty,
  deletePenaltyResultsByIds,
  getPenaltyResultAbsentEvents,
  listPenalties,
  listPenaltyResultColleges,
  listPenaltyResults,
  refreshPenaltyResults,
  seedDefaultPenalties,
  deletePenaltyResultsBySchoolYear,
  updatePenalty,
  updatePenaltyResult,
  updatePenaltyResultStatus,
} from "../../api/fines";
import type {
  FineStatus,
  PenaltyRecord,
  PenaltyResultRecord,
  PenaltyResultAbsentEvents,
} from "../../api/fines";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
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

type PenaltyFormState = {
  id: string;
  noOfAbsences: string;
  prescribedPenalty: string;
};

type PenaltyResultFormState = {
  id: string;
  studentId: string;
  name: string;
  noOfAbsences: string;
  prescribedPenalty: string;
  status: FineStatus;
};

type StatusFilter = FineStatus | "all";

const emptyPenaltyForm: PenaltyFormState = {
  id: "",
  noOfAbsences: "",
  prescribedPenalty: "",
};

const emptyPenaltyResultForm: PenaltyResultFormState = {
  id: "",
  studentId: "",
  name: "",
  noOfAbsences: "0",
  prescribedPenalty: "",
  status: "unpaid",
};

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All status" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "waived", label: "Waived" },
];

const fineStatusOptions: Array<{ value: FineStatus; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "waived", label: "Waived" },
];

const ALL_YEARS_VALUE = ALL_SCHOOL_YEARS_VALUE;

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
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
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

function getStatusBadgeClassName(status: FineStatus) {
  const styles: Record<FineStatus, string> = {
    unpaid: "border-red-200 bg-red-50 text-red-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    waived: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return styles[status];
}

function getPenaltyResultCollege(result: PenaltyResultRecord) {
  return String((result as { college?: string | null }).college ?? "").trim();
}

type BackendEventOrderedResult = PenaltyResultRecord & {
  event_order?: number | string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
};

function mergePenaltyResultUpdate(
  current: PenaltyResultRecord,
  updated?: PenaltyResultRecord | null,
) {
  if (!updated) return current;

  const currentBackendFields = current as BackendEventOrderedResult;
  const updatedBackendFields = updated as BackendEventOrderedResult;
  const currentCollege = getPenaltyResultCollege(current);
  const updatedCollege = getPenaltyResultCollege(updated);

  return {
    ...current,
    ...updated,
    ...(currentCollege && !updatedCollege ? { college: currentCollege } : {}),
    ...(currentBackendFields.event_order != null &&
    updatedBackendFields.event_order == null
      ? { event_order: currentBackendFields.event_order }
      : {}),
    ...(currentBackendFields.event_start_at != null &&
    updatedBackendFields.event_start_at == null
      ? { event_start_at: currentBackendFields.event_start_at }
      : {}),
    ...(currentBackendFields.event_end_at != null &&
    updatedBackendFields.event_end_at == null
      ? { event_end_at: currentBackendFields.event_end_at }
      : {}),
  } as PenaltyResultRecord;
}

const eventOrderCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function getBackendEventOrder(result: BackendEventOrderedResult) {
  const numericValue = Number(result.event_order ?? 0);

  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : Number.MAX_SAFE_INTEGER;
}

function getBackendEventTime(result: BackendEventOrderedResult) {
  const value =
    result.event_start_at ?? result.event_end_at ?? result.updated_at;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
}

function comparePenaltyResultsByBackendEventOrder(
  leftResult: PenaltyResultRecord,
  rightResult: PenaltyResultRecord,
) {
  const left = leftResult as BackendEventOrderedResult;
  const right = rightResult as BackendEventOrderedResult;
  const orderDifference =
    getBackendEventOrder(left) - getBackendEventOrder(right);
  if (orderDifference !== 0) return orderDifference;

  const timeDifference = getBackendEventTime(left) - getBackendEventTime(right);
  if (timeDifference !== 0) return timeDifference;

  return eventOrderCollator.compare(
    left.student_id ?? left.id,
    right.student_id ?? right.id,
  );
}

function sortPenaltyResultsByBackendEventOrder(rows: PenaltyResultRecord[]) {
  return [...rows].sort(comparePenaltyResultsByBackendEventOrder);
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

export default function FinesPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collegeFilter, setCollegeFilter] = useState("__all_colleges__");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [penaltyResults, setPenaltyResults] = useState<PenaltyResultRecord[]>(
    [],
  );
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [penaltyResultColleges, setPenaltyResultColleges] = useState<Array<string | null>>([]);
  const [absentEventsResult, setAbsentEventsResult] = useState<PenaltyResultAbsentEvents | null>(null);
  const [absentEventsStudentName, setAbsentEventsStudentName] = useState("");
  const [isLoadingAbsentEvents, setIsLoadingAbsentEvents] = useState(false);
  const [penaltyForm, setPenaltyForm] =
    useState<PenaltyFormState>(emptyPenaltyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingResults, setIsRefreshingResults] = useState(false);
  const [isSavingPenalty, setIsSavingPenalty] = useState(false);
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [penaltyResultDialogOpen, setPenaltyResultDialogOpen] = useState(false);
  const [penaltyResultForm, setPenaltyResultForm] =
    useState<PenaltyResultFormState>(emptyPenaltyResultForm);
  const [isSavingPenaltyResult, setIsSavingPenaltyResult] = useState(false);
  const [selectedPenaltyResultIds, setSelectedPenaltyResultIds] = useState<
    string[]
  >([]);
  const [isDeletingPenaltyResults, setIsDeletingPenaltyResults] =
    useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState("");

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const collegeOptions = useMemo(() =>
    penaltyResultColleges
      .filter((college): college is string => Boolean(college?.trim()))
      .map((college) => college.trim())
      .sort((left, right) => left.localeCompare(right)),
  [penaltyResultColleges]);
  const hasUnassignedCollege = penaltyResultColleges.some((college) => !college?.trim());

  const filteredPenaltyResults = useMemo(() => {
    const normalizedSearch = studentSearch.trim().toLowerCase();

    return sortPenaltyResultsByBackendEventOrder(penaltyResults).filter(
      (result) => {
        const matchesStatus =
          statusFilter === "all" || result.status === statusFilter;
        const resultCollege = getPenaltyResultCollege(result);
        const matchesCollege =
          collegeFilter === "__all_colleges__" ||
          (collegeFilter === "__unassigned_college__"
            ? !resultCollege
            : resultCollege === collegeFilter);
        const matchesDate = matchesDateRange(
          result.updated_at,
          fromDate,
          toDate,
        );
        const matchesStudent =
          !normalizedSearch ||
          String(result.student_id ?? "").toLowerCase().includes(normalizedSearch) ||
          String(result.name ?? "").toLowerCase().includes(normalizedSearch);

        return matchesStatus && matchesCollege && matchesDate && matchesStudent;
      },
    );
  }, [penaltyResults, statusFilter, collegeFilter, fromDate, toDate, studentSearch]);

  const penaltyResultsTotalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredPenaltyResults.length / Number(rowsPerPage)));
  }, [filteredPenaltyResults.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, collegeFilter, fromDate, toDate, studentSearch, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, penaltyResultsTotalPages));
  }, [penaltyResultsTotalPages]);

  const paginatedPenaltyResults = useMemo(() => {
    if (rowsPerPage === "all") return filteredPenaltyResults;
    const pageSize = Number(rowsPerPage);
    const startIndex = (currentPage - 1) * pageSize;
    return filteredPenaltyResults.slice(startIndex, startIndex + pageSize);
  }, [filteredPenaltyResults, currentPage, rowsPerPage]);

  const filteredPenaltyResultIds = useMemo<string[]>(() => {
    return filteredPenaltyResults
      .map((result) => String(result.id ?? "").trim())
      .filter(Boolean);
  }, [filteredPenaltyResults]);

  const displayedPenaltyResultIds = useMemo<string[]>(() => {
    return paginatedPenaltyResults
      .map((result) => String(result.id ?? "").trim())
      .filter(Boolean);
  }, [paginatedPenaltyResults]);

  const penaltyRangeStart = filteredPenaltyResults.length
    ? rowsPerPage === "all"
      ? 1
      : (currentPage - 1) * Number(rowsPerPage) + 1
    : 0;
  const penaltyRangeEnd = rowsPerPage === "all"
    ? filteredPenaltyResults.length
    : Math.min(currentPage * Number(rowsPerPage), filteredPenaltyResults.length);

  const allDisplayedPenaltyResultsSelected =
    displayedPenaltyResultIds.length > 0 &&
    displayedPenaltyResultIds.every((resultId) =>
      selectedPenaltyResultIds.includes(resultId),
    );

  const summary = useMemo(() => {
    return {
      total: filteredPenaltyResults.length,
      unpaid: filteredPenaltyResults.filter(
        (result) => result.status === "unpaid",
      ).length,
      paid: filteredPenaltyResults.filter((result) => result.status === "paid")
        .length,
      waived: filteredPenaltyResults.filter(
        (result) => result.status === "waived",
      ).length,
      absences: filteredPenaltyResults.reduce(
        (total, result) => total + Number(result.no_of_absences || 0),
        0,
      ),
    };
  }, [filteredPenaltyResults]);

  async function loadPageData(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const [schoolYearRows, penaltyRows] = await Promise.all([
        listSchoolYears({ activeOnly: true }),
        listPenalties(),
      ]);
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        nextSchoolYearId !== ALL_YEARS_VALUE &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : (schoolYearRows[0]?.id ?? "");
      const [penaltyResultRows, collegeRows] = fallbackSchoolYearId
        ? await Promise.all([
            listPenaltyResults({
              schoolYearId: fallbackSchoolYearId,
              limit: 5000,
              offset: 0,
            }),
            listPenaltyResultColleges(fallbackSchoolYearId),
          ])
        : [[], [] as Array<string | null>];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId || ALL_YEARS_VALUE);
      setPenalties(penaltyRows);
      setPenaltyResultColleges(collegeRows);
      setPenaltyResults(
        sortPenaltyResultsByBackendEventOrder(penaltyResultRows),
      );
      setSelectedPenaltyResultIds([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load penalty results.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  async function handleRefreshPenaltyResults() {
    setIsRefreshingResults(true);

    try {
      await refreshPenaltyResults({
        schoolYearId:
          selectedSchoolYearId === ALL_YEARS_VALUE
            ? undefined
            : selectedSchoolYearId,
      });
      await loadPageData(selectedSchoolYearId);
      toast.success("Penalty results refreshed from final absences.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to refresh penalty results.",
      );
    } finally {
      setIsRefreshingResults(false);
    }
  }

  async function handleOpenAbsentEvents(result: PenaltyResultRecord) {
    setAbsentEventsStudentName(result.name || result.student_id);
    setAbsentEventsResult(null);
    setIsLoadingAbsentEvents(true);
    try {
      setAbsentEventsResult(await getPenaltyResultAbsentEvents(result.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load absent events.");
      setAbsentEventsStudentName("");
    } finally {
      setIsLoadingAbsentEvents(false);
    }
  }

  function handlePenaltyResultSelection(resultId: string, checked: boolean) {
    setSelectedPenaltyResultIds((current) => {
      if (checked) return Array.from(new Set([...current, resultId]));

      return current.filter((id) => id !== resultId);
    });
  }

  function handleSelectAllPenaltyResults(checked: boolean) {
    setSelectedPenaltyResultIds((current) => {
      const pageIds = new Set(displayedPenaltyResultIds);
      if (!checked) return current.filter((id) => !pageIds.has(id));
      return Array.from(new Set([...current, ...displayedPenaltyResultIds]));
    });
  }

  async function handleDeleteSelectedPenaltyResults() {
    const resultIds = Array.from(new Set(selectedPenaltyResultIds));

    if (!resultIds.length) {
      toast.error("Select at least one penalty result.");
      return;
    }

    setIsDeletingPenaltyResults(true);

    try {
      const result = await deletePenaltyResultsByIds(resultIds);

      await loadPageData(selectedSchoolYearId);
      toast.success(
        `${result.deletedCount.toLocaleString()} penalty result/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete selected penalty results.",
      );
    } finally {
      setIsDeletingPenaltyResults(false);
    }
  }

  async function handleDeleteAllPenaltyResults() {
    const resultIds = Array.from(new Set(filteredPenaltyResultIds));

    if (!resultIds.length) {
      toast.error("No penalty results to delete.");
      return;
    }

    setIsDeletingPenaltyResults(true);

    try {
      const result =
        selectedSchoolYearId !== ALL_YEARS_VALUE &&
        statusFilter === "all" &&
        collegeFilter === "__all_colleges__"
          ? await deletePenaltyResultsBySchoolYear(selectedSchoolYearId)
          : await deletePenaltyResultsByIds(resultIds);

      await loadPageData(selectedSchoolYearId);
      toast.success(
        `${result.deletedCount.toLocaleString()} penalty result/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete penalty results.",
      );
    } finally {
      setIsDeletingPenaltyResults(false);
    }
  }

  async function handleSavePenalty(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const noOfAbsences = Number(penaltyForm.noOfAbsences);
    const prescribedPenalty = penaltyForm.prescribedPenalty.trim();

    if (!Number.isInteger(noOfAbsences) || noOfAbsences <= 0) {
      toast.error("No. of absences must be a positive whole number.");
      return;
    }

    if (!prescribedPenalty) {
      toast.error("Prescribed penalty is required.");
      return;
    }

    setIsSavingPenalty(true);

    try {
      if (penaltyForm.id) {
        await updatePenalty(penaltyForm.id, noOfAbsences, prescribedPenalty);
        toast.success("Penalty rule updated.");
      } else {
        await createPenalty(noOfAbsences, prescribedPenalty);
        toast.success("Penalty rule saved.");
      }

      setPenaltyForm(emptyPenaltyForm);
      setPenaltyDialogOpen(false);
      await loadPageData(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save penalty rule.",
      );
    } finally {
      setIsSavingPenalty(false);
    }
  }

  async function handleSeedDefaultPenalties() {
    setIsSavingPenalty(true);

    try {
      await seedDefaultPenalties();
      await loadPageData(selectedSchoolYearId);
      toast.success("Default penalty rules loaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to seed penalty rules.",
      );
    } finally {
      setIsSavingPenalty(false);
    }
  }

  async function handleDeletePenalty(penalty: PenaltyRecord) {
    setIsSavingPenalty(true);

    try {
      await deletePenalty(penalty.id);
      await loadPageData(selectedSchoolYearId);
      toast.success("Penalty rule deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete penalty rule.",
      );
    } finally {
      setIsSavingPenalty(false);
    }
  }

  async function handleStatusChange(
    result: PenaltyResultRecord,
    status: FineStatus,
  ) {
    setUpdatingStatusId(result.id);

    try {
      const updated = await updatePenaltyResultStatus(result.id, status);
      setPenaltyResults((current) =>
        sortPenaltyResultsByBackendEventOrder(
          current.map((item) =>
            item.id === result.id && updated
              ? mergePenaltyResultUpdate(item, updated)
              : item,
          ),
        ),
      );
      toast.success("Penalty status updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update penalty status.",
      );
    } finally {
      setUpdatingStatusId("");
    }
  }

  function handleOpenPenaltyResultDialog(result: PenaltyResultRecord) {
    setPenaltyResultForm({
      id: result.id,
      studentId: result.student_id,
      name: result.name,
      noOfAbsences: String(result.no_of_absences ?? 0),
      prescribedPenalty: result.prescribed_penalty ?? "",
      status: result.status,
    });
    setPenaltyResultDialogOpen(true);
  }

  function handlePenaltyResultDialogOpenChange(open: boolean) {
    setPenaltyResultDialogOpen(open);

    if (!open) setPenaltyResultForm(emptyPenaltyResultForm);
  }

  async function handleSavePenaltyResult(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const noOfAbsences = Number(penaltyResultForm.noOfAbsences);

    if (!penaltyResultForm.id) {
      toast.error("Penalty result is required.");
      return;
    }

    if (!Number.isInteger(noOfAbsences) || noOfAbsences < 0) {
      toast.error("No. of absences must be a whole number.");
      return;
    }

    if (noOfAbsences > 0 && !penaltyResultForm.prescribedPenalty.trim()) {
      toast.error("Prescribed penalty is required.");
      return;
    }

    const currentPenaltyResult = penaltyResults.find(
      (item) => item.id === penaltyResultForm.id,
    );
    const currentCollege = currentPenaltyResult
      ? getPenaltyResultCollege(currentPenaltyResult)
      : "";

    setIsSavingPenaltyResult(true);

    try {
      const updated = await updatePenaltyResult(penaltyResultForm.id, {
        studentId: penaltyResultForm.studentId.trim(),
        name: penaltyResultForm.name.trim(),
        noOfAbsences,
        prescribedPenalty: penaltyResultForm.prescribedPenalty.trim(),
        status: penaltyResultForm.status,
        ...(currentCollege ? { college: currentCollege } : {}),
      } as Parameters<typeof updatePenaltyResult>[1]);

      setPenaltyResults((current) =>
        sortPenaltyResultsByBackendEventOrder(
          current.map((item) =>
            item.id === penaltyResultForm.id && updated
              ? mergePenaltyResultUpdate(item, updated)
              : item,
          ),
        ),
      );
      handlePenaltyResultDialogOpenChange(false);
      toast.success("Penalty result updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update penalty result.",
      );
    } finally {
      setIsSavingPenaltyResult(false);
    }
  }

  function handleOpenCreatePenaltyDialog() {
    setPenaltyForm(emptyPenaltyForm);
    setPenaltyDialogOpen(true);
  }

  function handlePenaltyDialogOpenChange(open: boolean) {
    setPenaltyDialogOpen(open);

    if (!open) setPenaltyForm(emptyPenaltyForm);
  }

  function handleEditPenalty(penalty: PenaltyRecord) {
    setPenaltyForm({
      id: penalty.id,
      noOfAbsences: String(penalty.no_of_absences),
      prescribedPenalty: penalty.prescribed_penalty,
    });
    setPenaltyDialogOpen(true);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                Fines
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Penalties based on absences
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                This page renders the saved penalty result table. Results are
                refreshed from final attendance absences and matched to the
                configured penalty rules.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto xl:grid-cols-3">
              <SchoolYearBadge
                label={selectedSchoolYearLabel}
                className="w-full justify-center"
              />

              <Input
                type="search"
                aria-label="Search student by name or ID"
                placeholder="Search student name or ID..."
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                className="min-h-12 rounded-2xl sm:col-span-2 xl:col-span-2"
              />

              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-56 rounded-2xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2 xl:col-span-2">
                <Input
                  type="date"
                  aria-label="Fines from date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
                <Input
                  type="date"
                  aria-label="Fines to date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(event) => setToDate(event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </div>

              <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="College" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_colleges__">All colleges</SelectItem>
                  {hasUnassignedCollege ? (
                    <SelectItem value="__unassigned_college__">Unassigned college</SelectItem>
                  ) : null}
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

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl border bg-card p-5 md:col-span-2">
            <p className="text-sm font-bold text-muted-foreground">
              School Year / Semester
            </p>
            <p className="mt-2 text-2xl font-black">
              {selectedSchoolYearLabel}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Results</p>
            <p className="mt-2 text-2xl font-black">
              {summary.total.toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Unpaid</p>
            <p className="mt-2 text-2xl font-black">
              {summary.unpaid.toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Absences</p>
            <p className="mt-2 text-2xl font-black">
              {summary.absences.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Penalty results</h2>
              <p className="text-sm text-muted-foreground">
                Saved final penalty records generated from absence counts.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !selectedPenaltyResultIds.length ||
                      isRefreshingResults ||
                      isDeletingPenaltyResults
                    }
                    className="min-h-12 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingPenaltyResults ? "Deleting..." : "Delete Selected"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete selected penalty results?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {selectedPenaltyResultIds.length.toLocaleString()} selected penalty result(s). Penalty rules are not deleted. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingPenaltyResults}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleDeleteSelectedPenaltyResults()}
                      disabled={isDeletingPenaltyResults}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeletingPenaltyResults ? "Deleting..." : "Delete Selected"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      !filteredPenaltyResultIds.length ||
                      isRefreshingResults ||
                      isDeletingPenaltyResults
                    }
                    className="min-h-12 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingPenaltyResults ? "Deleting..." : "Delete All"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all matching penalty results?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {filteredPenaltyResultIds.length.toLocaleString()} penalty result(s) matching the current filters. Penalty rules are not deleted. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingPenaltyResults}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleDeleteAllPenaltyResults()}
                      disabled={isDeletingPenaltyResults}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeletingPenaltyResults ? "Deleting..." : "Delete All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                type="button"
                onClick={handleRefreshPenaltyResults}
                disabled={isRefreshingResults || isDeletingPenaltyResults}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isRefreshingResults
                  ? "Refreshing..."
                  : "Refresh Penalty Results"}
              </Button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      aria-label="Select all penalty results"
                      checked={allDisplayedPenaltyResultsSelected}
                      onCheckedChange={(checked) =>
                        handleSelectAllPenaltyResults(checked === true)
                      }
                    />
                  </th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Absences</th>
                  <th className="px-4 py-3">Prescribed Penalty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPenaltyResults.length ? (
                  paginatedPenaltyResults.map((result) => (
                    <tr key={result.id} className="border-t">
                      <td className="px-4 py-3 align-top">
                        <Checkbox
                          aria-label={`Select ${result.student_id}`}
                          checked={selectedPenaltyResultIds.includes(result.id)}
                          onCheckedChange={(checked) =>
                            handlePenaltyResultSelection(
                              result.id,
                              checked === true,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-black">
                        {result.student_id}
                      </td>
                      <td className="px-4 py-3 font-semibold">{result.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {getPenaltyResultCollege(result) || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleOpenAbsentEvents(result)}
                          className="min-h-9 rounded-xl px-3 text-xs font-black"
                        >
                          Absences ({result.no_of_absences})
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.prescribed_penalty}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${getStatusBadgeClassName(result.status)}`}
                          >
                            {result.status}
                          </span>
                          <Select
                            value={result.status}
                            onValueChange={(value) =>
                              handleStatusChange(result, value as FineStatus)
                            }
                            disabled={updatingStatusId === result.id}
                          >
                            <SelectTrigger className="h-9 w-32 rounded-xl text-xs font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fineStatusOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(result.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenPenaltyResultDialog(result)}
                          className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
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
                      {isLoading
                        ? "Loading penalty results..."
                        : "No penalty results found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Showing {penaltyRangeStart.toLocaleString()}–{penaltyRangeEnd.toLocaleString()} of {filteredPenaltyResults.length.toLocaleString()} result/s
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
              <span className="min-w-20 text-center text-xs font-black text-muted-foreground">Page {currentPage} of {penaltyResultsTotalPages}</span>
              <Button type="button" variant="outline" disabled={currentPage >= penaltyResultsTotalPages || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.min(penaltyResultsTotalPages, page + 1))} className="h-10 rounded-xl px-4 text-xs font-black">Next</Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Penalty rules</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create and edit penalty rules in a dialog.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleOpenCreatePenaltyDialog}
                className="min-h-11 rounded-2xl px-5 font-black"
              >
                Create Penalty Rule
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSavingPenalty}
                onClick={handleSeedDefaultPenalties}
                className="min-h-11 rounded-2xl px-5 font-black"
              >
                Seed Defaults
              </Button>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {penalties.length ? (
              penalties.map((penalty) => (
                <article
                  key={penalty.id}
                  className="rounded-2xl border bg-background p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black">
                        {penalty.no_of_absences} absence/s
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {penalty.prescribed_penalty}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEditPenalty(penalty)}
                        className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                      >
                        Edit
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete penalty rule?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the selected rule. Existing penalty
                              results keep their saved prescribed penalty text
                              until refreshed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeletePenalty(penalty)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                No penalty rules found.
              </div>
            )}
          </div>
        </section>
        <Dialog
          open={penaltyResultDialogOpen}
          onOpenChange={handlePenaltyResultDialogOpenChange}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit penalty result</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleSavePenaltyResult}
              className="rounded-3xl border bg-card p-5 shadow-sm"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold">Student ID</span>
                  <Input
                    value={penaltyResultForm.studentId}
                    onChange={(event) =>
                      setPenaltyResultForm((current) => ({
                        ...current,
                        studentId: event.target.value,
                      }))
                    }
                    className="min-h-12 rounded-2xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">Name</span>
                  <Input
                    value={penaltyResultForm.name}
                    onChange={(event) =>
                      setPenaltyResultForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="min-h-12 rounded-2xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">No. of absences</span>
                  <Input
                    type="number"
                    min={0}
                    value={penaltyResultForm.noOfAbsences}
                    onChange={(event) =>
                      setPenaltyResultForm((current) => ({
                        ...current,
                        noOfAbsences: event.target.value,
                      }))
                    }
                    className="min-h-12 rounded-2xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">Status</span>
                  <Select
                    value={penaltyResultForm.status}
                    onValueChange={(value) =>
                      setPenaltyResultForm((current) => ({
                        ...current,
                        status: value as FineStatus,
                      }))
                    }
                  >
                    <SelectTrigger className="min-h-12 w-full rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fineStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-bold">Prescribed penalty</span>
                  <Textarea
                    value={penaltyResultForm.prescribedPenalty}
                    onChange={(event) =>
                      setPenaltyResultForm((current) => ({
                        ...current,
                        prescribedPenalty: event.target.value,
                      }))
                    }
                    className="min-h-28 rounded-2xl"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={isSavingPenaltyResult}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSavingPenaltyResult ? "Saving..." : "Update Result"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingPenaltyResult}
                  onClick={() => handlePenaltyResultDialogOpenChange(false)}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(absentEventsStudentName)}
          onOpenChange={(open) => {
            if (!open) {
              setAbsentEventsStudentName("");
              setAbsentEventsResult(null);
            }
          }}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Absent events for {absentEventsStudentName}</DialogTitle>
            </DialogHeader>
            {isLoadingAbsentEvents ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm font-semibold text-muted-foreground">
                Loading absent events...
              </div>
            ) : absentEventsResult ? (
              <div className="space-y-3">
                {absentEventsResult.absentEvents.map((event, index) => (
                  <article key={`${event.eventId ?? event.eventName}-${index}`} className="rounded-2xl border bg-background p-4">
                    <div className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-semibold">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="wrap-break-word font-semibold">
                          {event.eventOrder ? `${event.eventOrder}. ` : ""}{event.eventName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.source} • {formatDateTime(event.eventStartAt)} to {formatDateTime(event.eventEndAt)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
                {absentEventsResult.unattributedAbsences > 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm font-semibold text-muted-foreground">
                    {absentEventsResult.unattributedAbsences} absence{absentEventsResult.unattributedAbsences === 1 ? "" : "s"} recorded from uploaded/manual totals — no specific event on record.
                  </div>
                ) : null}
                {!absentEventsResult.absentEvents.length && absentEventsResult.unattributedAbsences === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm font-semibold text-muted-foreground">No absent events found.</div>
                ) : null}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={penaltyDialogOpen}
          onOpenChange={handlePenaltyDialogOpenChange}
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {penaltyForm.id ? "Edit penalty rule" : "Create penalty rule"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleSavePenalty}
              className="rounded-3xl border bg-card p-5 shadow-sm"
            >
              <h2 className="text-xl font-black">
                {penaltyForm.id ? "Edit penalty rule" : "Create penalty rule"}
              </h2>

              <div className="mt-5 grid gap-4">
                <label className="space-y-2">
                  <span className="text-sm font-bold">No. of absences</span>
                  <Input
                    type="number"
                    min={1}
                    value={penaltyForm.noOfAbsences}
                    onChange={(event) =>
                      setPenaltyForm((current) => ({
                        ...current,
                        noOfAbsences: event.target.value,
                      }))
                    }
                    placeholder="Example: 3"
                    className="min-h-12 rounded-2xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">Prescribed penalty</span>
                  <Textarea
                    value={penaltyForm.prescribedPenalty}
                    onChange={(event) =>
                      setPenaltyForm((current) => ({
                        ...current,
                        prescribedPenalty: event.target.value,
                      }))
                    }
                    placeholder="Penalty description"
                    className="min-h-28 rounded-2xl"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={isSavingPenalty}
                  className="min-h-12 rounded-2xl px-6 font-black"
                >
                  {isSavingPenalty
                    ? "Saving..."
                    : penaltyForm.id
                      ? "Update Rule"
                      : "Save Rule"}
                </Button>
                {penaltyForm.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingPenalty}
                    onClick={() => handlePenaltyDialogOpenChange(false)}
                    className="min-h-12 rounded-2xl px-6 font-black"
                  >
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}