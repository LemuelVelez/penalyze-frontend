import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAllAttendanceImports,
  deleteAttendanceFinalResultsByIds,
  deleteAttendanceFinalResultsBySchoolYear,
  deleteAttendanceImportsByIds,
  getAttendanceImportDeleteImpact,
  restoreAttendanceImport,
  deleteManualAttendanceRecordsByIds,
  deleteManualAttendanceRecordsBySchoolYear,
  listAttendanceFinalResults,
  listAttendanceImports,
  listManualAttendanceRecords,
} from "../../api/attendance";
import type {
  AttendanceFinalResultRecord,
  AttendanceImportDeleteImpact,
  AttendanceImportRecord,
  ManualAttendanceRecord,
} from "../../api/attendance";
import {
  assignCurrentRecordsToSchoolYear,
  deleteSchoolYear,
  deleteSchoolYearRecords,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  getSchoolYearRecordLabel,
  listSchoolYears,
  saveSchoolYear,
  transferSchoolYearRecords,
  updateSchoolYear,
} from "../../api/schoolYears";
import type { SchoolSemester, SchoolYearRecord } from "../../api/schoolYears";
import {
  deletePenaltyResultsByIds,
  deletePenaltyResultsBySchoolYear,
  listPenaltyResults,
} from "../../api/fines";
import type { PenaltyResultRecord } from "../../api/fines";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Checkbox } from "../../components/ui/checkbox";
import { DateTimePicker } from "../../components/ui/date-time-picker";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

type SchoolYearFormState = {
  name: string;
  semester: SchoolSemester;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type SelectedRecordState = {
  importIds: string[];
  finalResultIds: string[];
  manualRecordIds: string[];
  penaltyResultIds: string[];
};

type SelectedRecordKey = keyof SelectedRecordState;

type FilteredRecordGroupKey =
  | "uploadedFiles"
  | "penaltyResults"
  | "finalAttendanceResults"
  | "manualAttendanceRecords";

const emptyForm: SchoolYearFormState = {
  name: "",
  semester: "first_semester",
  startsAt: "",
  endsAt: "",
  isActive: false,
};

const emptySelectedRecords: SelectedRecordState = {
  importIds: [],
  finalResultIds: [],
  manualRecordIds: [],
  penaltyResultIds: [],
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

function toDateInputValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function getDefaultSchoolYearName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function getDefaultSchoolYearDates(name: string) {
  const match = name.match(/^(\d{4})-(\d{4})$/);

  if (!match) {
    return {
      startsAt: "",
      endsAt: "",
    };
  }

  return {
    startsAt: `${match[1]}-06-01`,
    endsAt: `${match[2]}-05-31`,
  };
}

function createDefaultForm() {
  const name = getDefaultSchoolYearName();
  const dates = getDefaultSchoolYearDates(name);

  return {
    ...emptyForm,
    name,
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
  };
}

function getSelectedCount(records: SelectedRecordState) {
  return Object.values(records).reduce((total, ids) => total + ids.length, 0);
}

function getSelectionCheckboxState(selectedIds: string[], recordIds: string[]) {
  const selectedCount = recordIds.filter((id) => selectedIds.includes(id)).length;

  if (!recordIds.length || selectedCount === 0) return false;
  if (selectedCount === recordIds.length) return true;

  return "indeterminate" as const;
}

function normalizeRecordSearchValue(value?: string | number | null) {
  return String(value ?? "").toLowerCase();
}

function recordMatchesSearch(
  query: string,
  values: Array<string | number | null | undefined>,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  return values.some((value) =>
    normalizeRecordSearchValue(value).includes(normalizedQuery),
  );
}

export default function HistoryPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [transferTargetSchoolYearId, setTransferTargetSchoolYearId] =
    useState("");
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [recentlyDeletedImports, setRecentlyDeletedImports] = useState<
    AttendanceImportRecord[]
  >([]);
  const [finalResults, setFinalResults] = useState<
    AttendanceFinalResultRecord[]
  >([]);
  const [manualRecords, setManualRecords] = useState<ManualAttendanceRecord[]>(
    [],
  );
  const [penaltyResults, setPenaltyResults] = useState<PenaltyResultRecord[]>(
    [],
  );
  const [form, setForm] = useState<SchoolYearFormState>(createDefaultForm);
  const [editingSchoolYearId, setEditingSchoolYearId] = useState("");
  const [schoolYearDialogOpen, setSchoolYearDialogOpen] = useState(false);
  const [activeRecordsDialog, setActiveRecordsDialog] =
    useState<FilteredRecordGroupKey | null>(null);
  const [recordDialogSearch, setRecordDialogSearch] = useState("");
  const [selectedRecords, setSelectedRecords] =
    useState<SelectedRecordState>(emptySelectedRecords);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSchoolYear, setIsSavingSchoolYear] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingSchoolYear, setIsDeletingSchoolYear] = useState(false);
  const [deletingRecordGroup, setDeletingRecordGroup] =
    useState<FilteredRecordGroupKey | null>(null);
  const [isUpdatingSchoolYearActive, setIsUpdatingSchoolYearActive] =
    useState(false);
  const [uploadDeleteDialogMode, setUploadDeleteDialogMode] = useState<
    "selected" | "all" | null
  >(null);
  const [uploadDeleteConfirmation, setUploadDeleteConfirmation] = useState("");
  const [uploadDeleteImpacts, setUploadDeleteImpacts] = useState<
    AttendanceImportDeleteImpact[]
  >([]);
  const [isLoadingUploadDeleteImpact, setIsLoadingUploadDeleteImpact] =
    useState(false);
  const [recentlyDeletedOpen, setRecentlyDeletedOpen] = useState(false);
  const [restoringImportId, setRestoringImportId] = useState("");

  const selectedSchoolYear = useMemo(() => {
    return (
      schoolYears.find(
        (schoolYear) => schoolYear.id === selectedSchoolYearId,
      ) ?? null
    );
  }, [schoolYears, selectedSchoolYearId]);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const transferTargetOptions = useMemo(() => {
    return schoolYears.filter(
      (schoolYear) => schoolYear.id !== selectedSchoolYearId,
    );
  }, [schoolYears, selectedSchoolYearId]);

  const selectedRecordCount = useMemo(() => {
    return getSelectedCount(selectedRecords);
  }, [selectedRecords]);

  const isDeletingUploadedFiles = deletingRecordGroup === "uploadedFiles";
  const isDeletingPenaltyResults = deletingRecordGroup === "penaltyResults";
  const isDeletingFinalResults =
    deletingRecordGroup === "finalAttendanceResults";
  const isDeletingManualRecords =
    deletingRecordGroup === "manualAttendanceRecords";

  const summary = useMemo(() => {
    return {
      imports: imports.length,
      finalResults: finalResults.length,
      manualRecords: manualRecords.length,
      penaltyResults: penaltyResults.length,
      absences: finalResults.reduce(
        (total, record) => total + Number(record.total_absences || 0),
        0,
      ),
    };
  }, [imports, finalResults, manualRecords, penaltyResults]);

  const recordGroupSummaries = useMemo<
    Array<{
      key: FilteredRecordGroupKey;
      title: string;
      count: number;
      selectedCount: number;
    }>
  >(
    () => [
      {
        key: "uploadedFiles",
        title: "Uploaded files",
        count: imports.length,
        selectedCount: selectedRecords.importIds.length,
      },
      {
        key: "penaltyResults",
        title: "Penalty results",
        count: penaltyResults.length,
        selectedCount: selectedRecords.penaltyResultIds.length,
      },
      {
        key: "finalAttendanceResults",
        title: "Final attendance results",
        count: finalResults.length,
        selectedCount: selectedRecords.finalResultIds.length,
      },
      {
        key: "manualAttendanceRecords",
        title: "Manual attendance records",
        count: manualRecords.length,
        selectedCount: selectedRecords.manualRecordIds.length,
      },
    ],
    [
      finalResults.length,
      imports.length,
      manualRecords.length,
      penaltyResults.length,
      selectedRecords.finalResultIds.length,
      selectedRecords.importIds.length,
      selectedRecords.manualRecordIds.length,
      selectedRecords.penaltyResultIds.length,
    ],
  );

  const allFilteredRecordCount = useMemo(() => {
    return (
      imports.length +
      finalResults.length +
      manualRecords.length +
      penaltyResults.length
    );
  }, [finalResults.length, imports.length, manualRecords.length, penaltyResults.length]);

  const allFilteredSelectionState = useMemo(() => {
    if (!allFilteredRecordCount || selectedRecordCount === 0) return false;
    if (selectedRecordCount === allFilteredRecordCount) return true;

    return "indeterminate" as const;
  }, [allFilteredRecordCount, selectedRecordCount]);

  const filteredImports = useMemo(() => {
    return imports.filter((item) =>
      recordMatchesSearch(recordDialogSearch, [
        item.id,
        item.file_name,
        item.rows_valid,
        item.created_at,
        formatDate(item.created_at),
      ]),
    );
  }, [imports, recordDialogSearch]);

  const filteredPenaltyResults = useMemo(() => {
    return penaltyResults.filter((item) =>
      recordMatchesSearch(recordDialogSearch, [
        item.id,
        item.student_id,
        item.name,
        item.no_of_absences,
        item.prescribed_penalty,
      ]),
    );
  }, [penaltyResults, recordDialogSearch]);

  const filteredFinalResults = useMemo(() => {
    return finalResults.filter((item) =>
      recordMatchesSearch(recordDialogSearch, [
        item.id,
        item.student_id,
        item.name,
        item.total_absences,
        item.attended_events,
      ]),
    );
  }, [finalResults, recordDialogSearch]);

  const filteredManualRecords = useMemo(() => {
    return manualRecords.filter((item) =>
      recordMatchesSearch(recordDialogSearch, [
        item.id,
        item.student_id,
        item.name,
        item.attendance_type,
        item.college,
      ]),
    );
  }, [manualRecords, recordDialogSearch]);

  async function loadHistory(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const schoolYearRows = await listSchoolYears();
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : getActiveSchoolYearId(schoolYearRows) ||
            schoolYearRows[0]?.id ||
            "";
      const [importRows, finalRows, manualRows, penaltyRows] =
        fallbackSchoolYearId
          ? await Promise.all([
              listAttendanceImports({
                schoolYearId: fallbackSchoolYearId,
                includeDeleted: true,
                limit: 200,
                offset: 0,
              }),
              listAttendanceFinalResults({
                schoolYearId: fallbackSchoolYearId,
                limit: 500,
                offset: 0,
              }),
              listManualAttendanceRecords({
                schoolYearId: fallbackSchoolYearId,
                limit: 500,
                offset: 0,
              }),
              listPenaltyResults({
                schoolYearId: fallbackSchoolYearId,
                limit: 500,
                offset: 0,
              }),
            ])
          : [[], [], [], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setTransferTargetSchoolYearId((current) => {
        if (
          current &&
          current !== fallbackSchoolYearId &&
          schoolYearRows.some((schoolYear) => schoolYear.id === current)
        ) {
          return current;
        }

        return (
          schoolYearRows.find(
            (schoolYear) => schoolYear.id !== fallbackSchoolYearId,
          )?.id ?? ""
        );
      });
      setImports(importRows.filter((item) => !item.deleted_at));
      setRecentlyDeletedImports(
        importRows.filter((item) => Boolean(item.deleted_at)),
      );
      setFinalResults(finalRows);
      setManualRecords(manualRows);
      setPenaltyResults(penaltyRows);
      setSelectedRecords(emptySelectedRecords);
      setRecordDialogSearch("");
      setActiveRecordsDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load history records.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    setSelectedRecords(emptySelectedRecords);
    setRecordDialogSearch("");
    setActiveRecordsDialog(null);
    await loadHistory(value);
  }

  function handleOpenRecordsDialog(groupKey: FilteredRecordGroupKey) {
    setRecordDialogSearch("");
    setActiveRecordsDialog(groupKey);
  }

  function handleCloseRecordsDialog() {
    setRecordDialogSearch("");
    setActiveRecordsDialog(null);
  }

  function handleNameChange(value: string) {
    const dates = getDefaultSchoolYearDates(value);

    setForm((current) => ({
      ...current,
      name: value,
      startsAt: dates.startsAt || current.startsAt,
      endsAt: dates.endsAt || current.endsAt,
    }));
  }

  function handleOpenCreateSchoolYearDialog() {
    setEditingSchoolYearId("");
    setForm(createDefaultForm());
    setSchoolYearDialogOpen(true);
  }

  function handleStartEditSchoolYear() {
    if (!selectedSchoolYear) {
      toast.error("Please select a school year to edit.");
      return;
    }

    setEditingSchoolYearId(selectedSchoolYear.id);
    setForm({
      name: selectedSchoolYear.name,
      semester: selectedSchoolYear.semester,
      startsAt: toDateInputValue(selectedSchoolYear.starts_at),
      endsAt: toDateInputValue(selectedSchoolYear.ends_at),
      isActive: selectedSchoolYear.is_active,
    });
    setSchoolYearDialogOpen(true);
  }

  function handleCancelEditSchoolYear() {
    setEditingSchoolYearId("");
    setForm(createDefaultForm());
    setSchoolYearDialogOpen(false);
  }

  async function handleCreateSchoolYear(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("School year name is required.");
      return;
    }

    setIsSavingSchoolYear(true);

    try {
      const payload = {
        name: form.name.trim(),
        semester: form.semester,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        isActive: form.isActive,
      };
      const saved = editingSchoolYearId
        ? await updateSchoolYear(editingSchoolYearId, payload)
        : await saveSchoolYear(payload);

      toast.success(
        editingSchoolYearId ? "School year updated." : "School year saved.",
      );
      setSelectedSchoolYearId(saved?.id ?? selectedSchoolYearId);
      setEditingSchoolYearId("");
      setForm(createDefaultForm());
      setSchoolYearDialogOpen(false);
      await loadHistory(saved?.id ?? selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save school year.",
      );
    } finally {
      setIsSavingSchoolYear(false);
    }
  }

  async function handleAssignCurrentRecords() {
    if (!selectedSchoolYearId) {
      toast.error("Please select a school year.");
      return;
    }

    setIsAssigning(true);

    try {
      await assignCurrentRecordsToSchoolYear(selectedSchoolYearId);
      toast.success("Current records assigned to the selected school year.");
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to assign records.",
      );
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleDeleteSchoolYearRecords() {
    if (!selectedSchoolYearId) {
      toast.error("Please select a school year.");
      return;
    }

    setIsDeleting(true);

    try {
      await deleteSchoolYearRecords(selectedSchoolYearId);
      toast.success("School-year records deleted.");
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete school-year records.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteSchoolYear() {
    if (!selectedSchoolYearId) {
      toast.error("Please select a school year.");
      return;
    }

    setIsDeletingSchoolYear(true);

    try {
      await deleteSchoolYear(selectedSchoolYearId);
      toast.success("School year deleted.");
      setEditingSchoolYearId("");
      setForm(createDefaultForm());
      await loadHistory("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete school year.",
      );
    } finally {
      setIsDeletingSchoolYear(false);
    }
  }

  async function handleToggleSelectedSchoolYearActive(checked: boolean) {
    if (!selectedSchoolYear) {
      toast.error("Please select a school year.");
      return;
    }

    setIsUpdatingSchoolYearActive(true);

    try {
      const saved = await updateSchoolYear(selectedSchoolYear.id, {
        name: selectedSchoolYear.name,
        semester: selectedSchoolYear.semester,
        startsAt: toDateInputValue(selectedSchoolYear.starts_at),
        endsAt: toDateInputValue(selectedSchoolYear.ends_at),
        isActive: checked,
      });

      toast.success(
        checked ? "School year activated." : "School year deactivated.",
      );
      await loadHistory(saved?.id ?? selectedSchoolYear.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update school year status.",
      );
    } finally {
      setIsUpdatingSchoolYearActive(false);
    }
  }

  function toggleRecordSelection(
    key: SelectedRecordKey,
    id: string,
    checked: boolean,
  ) {
    setSelectedRecords((current) => {
      const currentIds = current[key];

      return {
        ...current,
        [key]: checked
          ? Array.from(new Set([...currentIds, id]))
          : currentIds.filter((item) => item !== id),
      };
    });
  }

  function toggleRecordGroupSelection(
    key: SelectedRecordKey,
    ids: string[],
    checked: boolean,
  ) {
    setSelectedRecords((current) => {
      const currentIds = current[key];

      return {
        ...current,
        [key]: checked
          ? Array.from(new Set([...currentIds, ...ids]))
          : currentIds.filter((item) => !ids.includes(item)),
      };
    });
  }

  function handleToggleAllFilteredRecords(checked: boolean) {
    setSelectedRecords(
      checked
        ? {
            importIds: imports.map((item) => item.id),
            finalResultIds: finalResults.map((item) => item.id),
            manualRecordIds: manualRecords.map((item) => item.id),
            penaltyResultIds: penaltyResults.map((item) => item.id),
          }
        : emptySelectedRecords,
    );
  }

  async function deleteRecordGroup(args: {
    groupKey: FilteredRecordGroupKey;
    count: number;
    emptyMessage: string;
    successMessage: string;
    deleteRecords: () => Promise<unknown>;
  }) {
    if (!args.count) {
      toast.error(args.emptyMessage);
      return;
    }

    setDeletingRecordGroup(args.groupKey);

    try {
      await args.deleteRecords();
      toast.success(args.successMessage);
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete records.",
      );
    } finally {
      setDeletingRecordGroup(null);
    }
  }

  async function deleteRecordGroupByIds(args: {
    groupKey: FilteredRecordGroupKey;
    ids: string[];
    emptyMessage: string;
    successMessage: string;
    deleteRecords: (ids: string[]) => Promise<unknown>;
  }) {
    const uniqueIds = Array.from(new Set(args.ids.filter(Boolean)));

    if (!uniqueIds.length) {
      toast.error(args.emptyMessage);
      return;
    }

    setDeletingRecordGroup(args.groupKey);

    try {
      await args.deleteRecords(uniqueIds);
      toast.success(args.successMessage);
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete records.",
      );
    } finally {
      setDeletingRecordGroup(null);
    }
  }

  function getSelectedUploadedFiles() {
    const selectedIds = new Set(selectedRecords.importIds);
    return imports.filter((item) => selectedIds.has(item.id));
  }

  async function openSelectedUploadDeleteDialog() {
    const selectedFiles = getSelectedUploadedFiles();
    if (!selectedFiles.length) {
      toast.error("Please select at least one uploaded file to delete.");
      return;
    }

    setUploadDeleteDialogMode("selected");
    setUploadDeleteConfirmation("");
    setUploadDeleteImpacts([]);
    setIsLoadingUploadDeleteImpact(true);
    try {
      const impacts = await Promise.all(
        selectedFiles.map((item) => getAttendanceImportDeleteImpact(item.id)),
      );
      setUploadDeleteImpacts(
        impacts.filter(
          (item): item is AttendanceImportDeleteImpact => Boolean(item),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to preview delete impact.",
      );
      setUploadDeleteDialogMode(null);
    } finally {
      setIsLoadingUploadDeleteImpact(false);
    }
  }

  function openAllUploadDeleteDialog() {
    if (!selectedSchoolYearId || !selectedSchoolYear) {
      toast.error("Please select a school year before deleting all uploaded files.");
      return;
    }

    if (!imports.length) {
      toast.error("No uploaded files to delete.");
      return;
    }

    setUploadDeleteDialogMode("all");
    setUploadDeleteConfirmation("");
    setUploadDeleteImpacts([]);
  }

  async function handleDeleteSelectedUploadedFiles() {
    const selectedImportIds = getSelectedUploadedFiles().map((item) => item.id);

    await deleteRecordGroupByIds({
      groupKey: "uploadedFiles",
      ids: selectedImportIds,
      emptyMessage: "Please select at least one uploaded file to delete.",
      successMessage: "Selected uploaded files moved to Recently deleted.",
      deleteRecords: deleteAttendanceImportsByIds,
    });
    setUploadDeleteDialogMode(null);
    setUploadDeleteConfirmation("");
  }

  async function handleDeleteAllUploadedFiles() {
    if (!selectedSchoolYearId) {
      toast.error("Please select a school year before deleting all uploaded files.");
      return;
    }

    await deleteRecordGroup({
      groupKey: "uploadedFiles",
      count: imports.length,
      emptyMessage: "No uploaded files to delete.",
      successMessage: "Uploaded files moved to Recently deleted.",
      deleteRecords: () => deleteAllAttendanceImports(selectedSchoolYearId),
    });
    setUploadDeleteDialogMode(null);
    setUploadDeleteConfirmation("");
  }

  async function handleRestoreUploadedFile(importId: string) {
    setRestoringImportId(importId);
    try {
      const result = await restoreAttendanceImport(importId);
      toast.success(
        result?.needsReattachment
          ? "Attendance file restored and needs event re-attachment."
          : "Attendance file restored successfully.",
      );
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to restore attendance file.",
      );
    } finally {
      setRestoringImportId("");
    }
  }

  async function handleDeleteSelectedPenaltyResults() {
    const existingIds = new Set(penaltyResults.map((item) => item.id));
    const selectedIds = selectedRecords.penaltyResultIds.filter((id) =>
      existingIds.has(id),
    );

    await deleteRecordGroupByIds({
      groupKey: "penaltyResults",
      ids: selectedIds,
      emptyMessage: "Please select at least one penalty result to delete.",
      successMessage: "Selected penalty results deleted.",
      deleteRecords: deletePenaltyResultsByIds,
    });
  }

  async function handleDeleteAllPenaltyResults() {
    await deleteRecordGroup({
      groupKey: "penaltyResults",
      count: penaltyResults.length,
      emptyMessage: "No penalty results to delete.",
      successMessage: "All penalty results deleted.",
      deleteRecords: () =>
        selectedSchoolYearId
          ? deletePenaltyResultsBySchoolYear(selectedSchoolYearId)
          : deletePenaltyResultsByIds(penaltyResults.map((item) => item.id)),
    });
  }

  async function handleDeleteSelectedFinalResults() {
    const existingIds = new Set(finalResults.map((item) => item.id));
    const selectedIds = selectedRecords.finalResultIds.filter((id) =>
      existingIds.has(id),
    );

    await deleteRecordGroupByIds({
      groupKey: "finalAttendanceResults",
      ids: selectedIds,
      emptyMessage:
        "Please select at least one final attendance result to delete.",
      successMessage: "Selected final attendance results deleted.",
      deleteRecords: deleteAttendanceFinalResultsByIds,
    });
  }

  async function handleDeleteAllFinalResults() {
    await deleteRecordGroup({
      groupKey: "finalAttendanceResults",
      count: finalResults.length,
      emptyMessage: "No final attendance results to delete.",
      successMessage: "All final attendance results deleted.",
      deleteRecords: () =>
        selectedSchoolYearId
          ? deleteAttendanceFinalResultsBySchoolYear(selectedSchoolYearId)
          : deleteAttendanceFinalResultsByIds(finalResults.map((item) => item.id)),
    });
  }

  async function handleDeleteSelectedManualRecords() {
    const existingIds = new Set(manualRecords.map((item) => item.id));
    const selectedIds = selectedRecords.manualRecordIds.filter((id) =>
      existingIds.has(id),
    );

    await deleteRecordGroupByIds({
      groupKey: "manualAttendanceRecords",
      ids: selectedIds,
      emptyMessage: "Please select at least one manual record to delete.",
      successMessage: "Selected manual attendance records deleted.",
      deleteRecords: deleteManualAttendanceRecordsByIds,
    });
  }

  async function handleDeleteAllManualRecords() {
    await deleteRecordGroup({
      groupKey: "manualAttendanceRecords",
      count: manualRecords.length,
      emptyMessage: "No manual attendance records to delete.",
      successMessage: "All manual attendance records deleted.",
      deleteRecords: () =>
        selectedSchoolYearId
          ? deleteManualAttendanceRecordsBySchoolYear(selectedSchoolYearId)
          : deleteManualAttendanceRecordsByIds(manualRecords.map((item) => item.id)),
    });
  }

  async function handleTransferSelectedRecords() {
    if (!transferTargetSchoolYearId) {
      toast.error("Please select a target school year.");
      return;
    }

    if (transferTargetSchoolYearId === selectedSchoolYearId) {
      toast.error("Please choose a different target school year.");
      return;
    }

    if (!selectedRecordCount) {
      toast.error("Please select at least one record to transfer.");
      return;
    }

    setIsTransferring(true);

    try {
      await transferSchoolYearRecords({
        targetSchoolYearId: transferTargetSchoolYearId,
        importIds: selectedRecords.importIds,
        finalResultIds: selectedRecords.finalResultIds,
        manualRecordIds: selectedRecords.manualRecordIds,
        penaltyResultIds: selectedRecords.penaltyResultIds,
      });
      toast.success("Selected records transferred.");
      await loadHistory(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to transfer selected records.",
      );
    } finally {
      setIsTransferring(false);
    }
  }

  function renderEmptyRecordState(message: string) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">
        {isLoading ? "Loading records..." : message}
      </p>
    );
  }

  function renderDialogSearchInput(title: string) {
    return (
      <div className="mt-4">
        <Input
          type="search"
          value={recordDialogSearch}
          onChange={(event) => setRecordDialogSearch(event.target.value)}
          placeholder={`Search ${title}`}
          aria-label={`Search ${title}`}
          className="min-h-10 rounded-xl"
        />
      </div>
    );
  }

  function renderDialogSelectAll(
    title: string,
    selectionKey: SelectedRecordKey,
    ids: string[],
  ) {
    const selectedGroupCount = ids.filter((id) =>
      selectedRecords[selectionKey].includes(id),
    ).length;

    return (
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-3">
          <Checkbox
            checked={getSelectionCheckboxState(
              selectedRecords[selectionKey],
              ids,
            )}
            onCheckedChange={(value) =>
              toggleRecordGroupSelection(selectionKey, ids, value === true)
            }
            disabled={!ids.length}
            aria-label={`Select all ${title}`}
          />
          <span className="text-sm font-semibold">Select all</span>
        </label>
        <p className="text-sm font-semibold text-muted-foreground">
          {selectedGroupCount.toLocaleString()} of {ids.length.toLocaleString()}{" "}
          selected
        </p>
      </div>
    );
  }

  function renderDialogDeleteActions(args: {
    isDeleting: boolean;
    selectedCount: number;
    totalCount: number;
    selectedTitle: string;
    selectedDescription: string;
    allTitle: string;
    allDescription: string;
    onDeleteSelected: () => void | Promise<void>;
    onDeleteAll: () => void | Promise<void>;
  }) {
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={args.isDeleting || !args.selectedCount}
              className="min-h-10 rounded-xl px-5 font-semibold"
            >
              {args.isDeleting ? "Deleting..." : "Delete Selected"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{args.selectedTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {args.selectedDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={args.onDeleteSelected}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Selected
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={args.isDeleting || !args.totalCount}
              className="min-h-10 rounded-xl px-5 font-semibold"
            >
              {args.isDeleting ? "Deleting..." : "Delete All"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{args.allTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {args.allDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={args.onDeleteAll}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  function renderActiveRecordsDialogContent() {
    switch (activeRecordsDialog) {
      case "uploadedFiles": {
        const ids = filteredImports.map((item) => item.id);

        return (
          <>
            <DialogHeader>
              <DialogTitle>Uploaded files</DialogTitle>
            </DialogHeader>
            {renderDialogSearchInput("uploaded files")}
            {renderDialogSelectAll("uploaded files", "importIds", ids)}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="destructive"
                disabled={isDeletingUploadedFiles || !selectedRecords.importIds.length}
                onClick={() => void openSelectedUploadDeleteDialog()}
                className="min-h-10 rounded-xl px-5 font-semibold"
              >
                {isDeletingUploadedFiles ? "Deleting..." : "Delete Selected"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isDeletingUploadedFiles ||
                  !imports.length ||
                  !selectedSchoolYearId
                }
                onClick={openAllUploadDeleteDialog}
                className="min-h-10 rounded-xl px-5 font-semibold"
              >
                {isDeletingUploadedFiles ? "Deleting..." : "Delete All"}
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {imports.length ? (
                filteredImports.length ? (
                  filteredImports.map((item) => (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-xl border bg-card p-3"
                    >
                      <Checkbox
                        checked={selectedRecords.importIds.includes(item.id)}
                        onCheckedChange={(value) =>
                          toggleRecordSelection(
                            "importIds",
                            item.id,
                            Boolean(value),
                          )
                        }
                        aria-label={`Select uploaded file ${item.file_name}`}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-bold">{item.file_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.rows_valid} valid row/s •{" "}
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  renderEmptyRecordState("No uploaded files match your search.")
                )
              ) : (
                renderEmptyRecordState("No uploaded files for this school year.")
              )}
            </div>
            <div className="mt-5 rounded-2xl border bg-background p-4">
              <button
                type="button"
                onClick={() => setRecentlyDeletedOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left font-semibold"
              >
                <span>Recently deleted ({recentlyDeletedImports.length})</span>
                <span aria-hidden="true">{recentlyDeletedOpen ? "−" : "+"}</span>
              </button>
              {recentlyDeletedOpen ? (
                <div className="mt-4 space-y-3">
                  {recentlyDeletedImports.length ? (
                    recentlyDeletedImports.map((item) => (
                      <article key={item.id} className="rounded-xl border bg-card p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold">{item.file_name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Deleted by {item.deleted_by_name || item.deleted_by_email || "Unknown user"} • {formatDateTime(item.deleted_at)}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-muted-foreground">
                              {Math.max(0, Number(item.days_remaining ?? 0))} day(s) remaining before permanent purge.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={restoringImportId === item.id}
                            onClick={() => void handleRestoreUploadedFile(item.id)}
                            className="rounded-xl font-semibold"
                          >
                            {restoringImportId === item.id ? "Restoring..." : "Restore"}
                          </Button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm font-semibold text-muted-foreground">No recently deleted files.</p>
                  )}
                </div>
              ) : null}
            </div>
          </>
        );
      }

      case "penaltyResults": {
        const ids = filteredPenaltyResults.map((item) => item.id);

        return (
          <>
            <DialogHeader>
              <DialogTitle>Penalty results</DialogTitle>
            </DialogHeader>
            {renderDialogSearchInput("penalty results")}
            {renderDialogSelectAll("penalty results", "penaltyResultIds", ids)}
            {renderDialogDeleteActions({
              isDeleting: isDeletingPenaltyResults,
              selectedCount: selectedRecords.penaltyResultIds.length,
              totalCount: penaltyResults.length,
              selectedTitle: "Delete selected penalty results?",
              selectedDescription:
                "This will delete the selected penalty result records.",
              allTitle: "Delete all penalty results?",
              allDescription:
                "This will delete all penalty results for the selected school year.",
              onDeleteSelected: handleDeleteSelectedPenaltyResults,
              onDeleteAll: handleDeleteAllPenaltyResults,
            })}
            <div className="mt-4 space-y-3">
              {penaltyResults.length ? (
                filteredPenaltyResults.length ? (
                  filteredPenaltyResults.map((item) => (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-xl border bg-card p-3"
                    >
                      <Checkbox
                        checked={selectedRecords.penaltyResultIds.includes(
                          item.id,
                        )}
                        onCheckedChange={(value) =>
                          toggleRecordSelection(
                            "penaltyResultIds",
                            item.id,
                            Boolean(value),
                          )
                        }
                        aria-label={`Select penalty result for ${item.student_id}`}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-bold">
                          {item.student_id} • {item.name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.no_of_absences} absence/s •{" "}
                          {item.prescribed_penalty}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  renderEmptyRecordState("No penalty results match your search.")
                )
              ) : (
                renderEmptyRecordState("No penalty results for this school year.")
              )}
            </div>
          </>
        );
      }

      case "finalAttendanceResults": {
        const ids = filteredFinalResults.map((item) => item.id);

        return (
          <>
            <DialogHeader>
              <DialogTitle>Final attendance results</DialogTitle>
            </DialogHeader>
            {renderDialogSearchInput("final attendance results")}
            {renderDialogSelectAll(
              "final attendance results",
              "finalResultIds",
              ids,
            )}
            {renderDialogDeleteActions({
              isDeleting: isDeletingFinalResults,
              selectedCount: selectedRecords.finalResultIds.length,
              totalCount: finalResults.length,
              selectedTitle: "Delete selected final attendance results?",
              selectedDescription:
                "This will delete the selected final attendance result records.",
              allTitle: "Delete all final attendance results?",
              allDescription:
                "This will delete all final attendance results for the selected school year.",
              onDeleteSelected: handleDeleteSelectedFinalResults,
              onDeleteAll: handleDeleteAllFinalResults,
            })}
            <div className="mt-4 space-y-3">
              {finalResults.length ? (
                filteredFinalResults.length ? (
                  filteredFinalResults.map((item) => (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-xl border bg-card p-3"
                    >
                      <Checkbox
                        checked={selectedRecords.finalResultIds.includes(
                          item.id,
                        )}
                        onCheckedChange={(value) =>
                          toggleRecordSelection(
                            "finalResultIds",
                            item.id,
                            Boolean(value),
                          )
                        }
                        aria-label={`Select final result for ${item.student_id}`}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-bold">
                          {item.student_id} • {item.name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.total_absences} absence/s •{" "}
                          {item.attended_events} attended event/s
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  renderEmptyRecordState(
                    "No final attendance results match your search.",
                  )
                )
              ) : (
                renderEmptyRecordState(
                  "No final attendance results for this school year.",
                )
              )}
            </div>
          </>
        );
      }

      case "manualAttendanceRecords": {
        const ids = filteredManualRecords.map((item) => item.id);

        return (
          <>
            <DialogHeader>
              <DialogTitle>Manual attendance records</DialogTitle>
            </DialogHeader>
            {renderDialogSearchInput("manual attendance records")}
            {renderDialogSelectAll(
              "manual attendance records",
              "manualRecordIds",
              ids,
            )}
            {renderDialogDeleteActions({
              isDeleting: isDeletingManualRecords,
              selectedCount: selectedRecords.manualRecordIds.length,
              totalCount: manualRecords.length,
              selectedTitle: "Delete selected manual attendance records?",
              selectedDescription:
                "This will delete the selected manual attendance records.",
              allTitle: "Delete all manual attendance records?",
              allDescription:
                "This will delete all manual attendance records for the selected school year.",
              onDeleteSelected: handleDeleteSelectedManualRecords,
              onDeleteAll: handleDeleteAllManualRecords,
            })}
            <div className="mt-4 space-y-3">
              {manualRecords.length ? (
                filteredManualRecords.length ? (
                  filteredManualRecords.map((item) => (
                    <article
                      key={item.id}
                      className="flex gap-3 rounded-xl border bg-card p-3"
                    >
                      <Checkbox
                        checked={selectedRecords.manualRecordIds.includes(
                          item.id,
                        )}
                        onCheckedChange={(value) =>
                          toggleRecordSelection(
                            "manualRecordIds",
                            item.id,
                            Boolean(value),
                          )
                        }
                        aria-label={`Select manual record for ${item.student_id}`}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-bold">
                          {item.student_id} • {item.name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.attendance_type === "zero_attendance"
                            ? "Zero attendance"
                            : "Manual attendance"}{" "}
                          • {item.college || "No college"}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  renderEmptyRecordState("No manual records match your search.")
                )
              ) : (
                renderEmptyRecordState("No manual records for this school year.")
              )}
            </div>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                History
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                School-year and semester record history
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Create, edit, delete, transfer, assign, and filter records by
                school year and semester.
              </p>
            </div>

            <Select
              value={selectedSchoolYearId}
              onValueChange={handleSchoolYearChange}
            >
              <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl lg:w-64">
                <SelectValue placeholder="Select school year / semester" />
              </SelectTrigger>
              <SelectContent>
                {schoolYears.map((schoolYear) => (
                  <SelectItem key={schoolYear.id} value={schoolYear.id}>
                    {getSchoolYearRecordLabel(schoolYear)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-6">
          <div className="rounded-2xl border bg-card p-5 md:col-span-2">
            <p className="text-sm font-bold text-muted-foreground">
              Selected School Year / Semester
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {selectedSchoolYearLabel}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedSchoolYear
                ? `${formatDate(selectedSchoolYear.starts_at)} - ${formatDate(selectedSchoolYear.ends_at)}`
                : "No school year selected"}
            </p>
            {selectedSchoolYear ? (
              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  selectedSchoolYear.is_active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {selectedSchoolYear.is_active ? "Active" : "Inactive"}
              </span>
            ) : null}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Uploaded Files
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.imports.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Final Results
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.finalResults.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Penalty Results
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.penaltyResults.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Manual Records
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.manualRecords.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">School-year actions</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Edit the selected school year, assign unassigned records, or delete
            selected school-year data.
          </p>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <Button
              type="button"
              onClick={handleOpenCreateSchoolYearDialog}
              className="min-h-12 w-full rounded-2xl px-6 font-semibold"
            >
              Create School Year
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleStartEditSchoolYear}
              disabled={!selectedSchoolYearId}
              className="min-h-12 w-full rounded-2xl px-6 font-semibold"
            >
              Edit Selected School Year / Semester
            </Button>

            <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border bg-background px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Active School Year</p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {selectedSchoolYear?.is_active ? "Active" : "Inactive"}
                </p>
              </div>
              <Switch
                checked={Boolean(selectedSchoolYear?.is_active)}
                onCheckedChange={handleToggleSelectedSchoolYearActive}
                disabled={!selectedSchoolYearId || isUpdatingSchoolYearActive}
                aria-label="Toggle active school year"
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={isAssigning || !selectedSchoolYearId}
                  className="min-h-12 w-full rounded-2xl px-6 font-semibold"
                >
                  {isAssigning ? "Assigning..." : "Assign Current Records"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Assign current records?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will assign unassigned attendance, manual attendance,
                    fine, and penalty result records to the selected school
                    year.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAssignCurrentRecords}>
                    Assign Records
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeleting || !selectedSchoolYearId}
                  className="min-h-12 w-full rounded-2xl px-6 font-semibold"
                >
                  {isDeleting ? "Deleting..." : "Delete Records by School Year"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete selected school-year records?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes attendance imports, attendance records, final
                    results, manual records, fines, and penalty results assigned
                    to this school year.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSchoolYearRecords}>
                    Delete Records
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeletingSchoolYear || !selectedSchoolYearId}
                  className="min-h-12 w-full rounded-2xl px-6 font-semibold"
                >
                  {isDeletingSchoolYear ? "Deleting..." : "Delete School Year"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this school year?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes the school year and all linked attendance,
                    final result, manual, fine, and penalty result records under
                    it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSchoolYear}>
                    Delete School Year
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        <Dialog
          open={schoolYearDialogOpen}
          onOpenChange={(open) =>
            open ? setSchoolYearDialogOpen(true) : handleCancelEditSchoolYear()
          }
        >
          <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingSchoolYearId
                  ? "Edit school year"
                  : "Create school year"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleCreateSchoolYear}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {editingSchoolYearId
                      ? "Edit school year"
                      : "Create school year"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editingSchoolYearId
                      ? "Update the selected school year details."
                      : "Add a new school year for records."}
                  </p>
                </div>
                {editingSchoolYearId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEditSchoolYear}
                    className="min-h-10 rounded-xl px-4 font-bold"
                  >
                    Cancel Edit
                  </Button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold">School year name</span>
                  <Input
                    value={form.name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    placeholder="2025-2026"
                    className="min-h-10 rounded-xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">Semester</span>
                  <Select
                    value={form.semester}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        semester: value as SchoolSemester,
                      }))
                    }
                  >
                    <SelectTrigger className="min-h-10 rounded-xl">
                      <SelectValue placeholder="Select semester" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_semester">First Semester</SelectItem>
                      <SelectItem value="second_semester">Second Semester</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">Start date</span>
                  <DateTimePicker
                    mode="date"
                    value={form.startsAt}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        startsAt: value,
                      }))
                    }
                    className="min-h-10 rounded-xl"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-bold">End date</span>
                  <DateTimePicker
                    mode="date"
                    value={form.endsAt}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        endsAt: value,
                      }))
                    }
                    className="min-h-10 rounded-xl"
                  />
                </label>
              </div>

              <Button
                type="submit"
                disabled={isSavingSchoolYear}
                className="mt-5 min-h-10 rounded-xl px-6 font-semibold"
              >
                {isSavingSchoolYear
                  ? "Saving..."
                  : editingSchoolYearId
                    ? "Update School Year"
                    : "Save School Year"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Transfer selected records</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selected records: {selectedRecordCount.toLocaleString()} from{" "}
                {selectedSchoolYearLabel}.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={transferTargetSchoolYearId}
                onValueChange={setTransferTargetSchoolYearId}
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl sm:w-64">
                  <SelectValue placeholder="Target school year / semester" />
                </SelectTrigger>
                <SelectContent>
                  {transferTargetOptions.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {getSchoolYearRecordLabel(schoolYear)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedRecords(emptySelectedRecords)}
                disabled={!selectedRecordCount}
                className="min-h-10 rounded-xl px-6 font-semibold"
              >
                Clear
              </Button>
              <Button
                type="button"
                onClick={handleTransferSelectedRecords}
                disabled={
                  isTransferring ||
                  !selectedRecordCount ||
                  !transferTargetSchoolYearId
                }
                className="min-h-10 rounded-xl px-6 font-semibold"
              >
                {isTransferring ? "Transferring..." : "Transfer Selected"}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Filtered records</h2>
              <p className="text-sm text-muted-foreground">
                Showing records assigned to {selectedSchoolYearLabel}.
              </p>
            </div>

            <label className="flex min-h-12 items-center gap-3 rounded-2xl border bg-background px-4 py-3">
              <Checkbox
                checked={allFilteredSelectionState}
                onCheckedChange={(value) =>
                  handleToggleAllFilteredRecords(value === true)
                }
                disabled={!allFilteredRecordCount}
                aria-label="Select all filtered records"
              />
              <span className="text-sm font-semibold">
                Select all filtered records
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            {recordGroupSummaries.map((group) => (
              <div
                key={group.key}
                className="flex flex-col justify-between gap-5 rounded-2xl border bg-background p-4"
              >
                <div>
                  <h3 className="font-semibold">{group.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground">
                    {group.count.toLocaleString()} record/s •{" "}
                    {group.selectedCount.toLocaleString()} selected
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenRecordsDialog(group.key)}
                  className="min-h-11 w-full rounded-2xl px-5 font-semibold"
                >
                  View Records
                </Button>
              </div>
            ))}
          </div>

          <AlertDialog
            open={Boolean(uploadDeleteDialogMode)}
            onOpenChange={(open) => {
              if (!open && !isDeletingUploadedFiles) {
                setUploadDeleteDialogMode(null);
                setUploadDeleteConfirmation("");
                setUploadDeleteImpacts([]);
              }
            }}
          >
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {uploadDeleteDialogMode === "all"
                    ? "Delete all uploaded files for this school year?"
                    : "Delete selected uploaded file(s)?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Deleted files remain restorable during the retention window.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-4 text-sm text-muted-foreground">
                {uploadDeleteDialogMode === "selected" ? (
                  isLoadingUploadDeleteImpact ? (
                    <p>Calculating attendance, absence, and fine impact...</p>
                  ) : uploadDeleteImpacts.length ? (
                    uploadDeleteImpacts.map((impact) => (
                      <p key={impact.importId}>
                        <span className="font-bold text-foreground">
                          {impact.fileName}
                        </span>{" "}
                        contains {impact.recordCount.toLocaleString()} attendance
                        record(s) for {impact.distinctStudentCount.toLocaleString()}
                        student(s) across {impact.affectedEvents.length.toLocaleString()}
                        event(s). Deleting it will add absences for{" "}
                        {impact.studentsGainingAbsence.toLocaleString()} student(s)
                        and create or change{" "}
                        {impact.finesCreatedOrChanged.toLocaleString()} fine(s).
                      </p>
                    ))
                  ) : (
                    <p>Delete impact is unavailable. The destructive action remains disabled.</p>
                  )
                ) : (
                  <p>
                    This will move all {imports.length.toLocaleString()} uploaded
                    file(s) for{" "}
                    <span className="font-bold text-foreground">
                      {selectedSchoolYearLabel}
                    </span>{" "}
                    to Recently deleted.
                  </p>
                )}

                <p className="font-semibold text-foreground">
                  {uploadDeleteDialogMode === "all"
                    ? `Type the school year label exactly: ${selectedSchoolYearLabel}`
                    : getSelectedUploadedFiles().length === 1
                      ? `Type the file name exactly: ${getSelectedUploadedFiles()[0]?.file_name ?? ""}`
                      : "Type each selected file name exactly, one per line, in the order shown."}
                </p>
                <Input
                  value={uploadDeleteConfirmation}
                  onChange={(event) =>
                    setUploadDeleteConfirmation(event.target.value)
                  }
                  autoComplete="off"
                  aria-label="Destructive action confirmation"
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingUploadedFiles}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    isDeletingUploadedFiles ||
                    isLoadingUploadDeleteImpact ||
                    (uploadDeleteDialogMode === "selected" &&
                      !uploadDeleteImpacts.length) ||
                    uploadDeleteConfirmation !==
                      (uploadDeleteDialogMode === "all"
                        ? selectedSchoolYearLabel
                        : getSelectedUploadedFiles()
                            .map((item) => item.file_name)
                            .join("\n"))
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    if (uploadDeleteDialogMode === "all") {
                      void handleDeleteAllUploadedFiles();
                    } else {
                      void handleDeleteSelectedUploadedFiles();
                    }
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeletingUploadedFiles ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog
            open={Boolean(activeRecordsDialog)}
            onOpenChange={(open) => {
              if (!open) handleCloseRecordsDialog();
            }}
          >
            <DialogContent className="max-h-svh overflow-y-auto sm:max-w-4xl">
              {renderActiveRecordsDialogContent()}
            </DialogContent>
          </Dialog>
        </section>
      </div>
    </main>
  );
}