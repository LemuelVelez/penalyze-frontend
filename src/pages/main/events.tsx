import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceEvent,
  deleteEventCollegeExemption,
  deleteEventCollegeExemptionsBulk,
  getAttendanceEventMergeImpact,
  getEventCollegeExemptionImpact,
  listAttendanceEventDuplicateGroups,
  listAttendanceColleges,
  listEventCollegeExemptions,
  listAttendanceEvents,
  mergeAttendanceEvents,
  createEventCollegeExemptions,
  saveAttendanceEvent,
  updateAttendanceEvent,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceEventDuplicateGroup,
  AttendanceEventInput,
  AttendanceEventMergeImpact,
  AttendanceCollege,
  EventCollegeExemption,
  EventExemptionImpact,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  listSchoolYears,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { ProtectedDeleteDialog } from "../../components/protected-delete-dialog";
import { SortSelect } from "../../components/sort-select";
import { LoadingStatus } from "../../components/loading-status";
import type { LoadingStatusStep } from "../../components/loading-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
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

const emptyEventForm = {
  schoolYearId: "",
  eventOrder: "",
  name: "",
  eventStartAt: "",
  eventEndAt: "",
  description: "",
};

type EventFormState = typeof emptyEventForm;

type EventsLoadProgress = {
  progress: number;
  detail: string;
  steps: LoadingStatusStep[];
};

type ExemptionSnapshot = {
  eventId: string;
  eventName: string;
  reason: string | null;
};

type ExemptionHistoryEntry = {
  kind: "add" | "remove";
  collegeLabel: string;
  collegeKey: string;
  schoolYearId: string;
  before: ExemptionSnapshot[];
  after: ExemptionSnapshot[];
  label: string;
};

const DISMISSED_DUPLICATE_GROUPS_STORAGE_KEY =
  "penalyze:attendance-event-duplicate-dismissals:v1";

function getDuplicateGroupKey(group: AttendanceEventDuplicateGroup) {
  return group.events
    .map((event) => String(event.id ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(":");
}

function loadDismissedDuplicateGroupKeys() {
  if (typeof window === "undefined") return [] as string[];

  try {
    const rawValue = window.localStorage.getItem(
      DISMISSED_DUPLICATE_GROUPS_STORAGE_KEY,
    );
    if (!rawValue) return [] as string[];

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [] as string[];

    return parsed
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  } catch {
    return [] as string[];
  }
}

function persistDismissedDuplicateGroupKeys(keys: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      DISMISSED_DUPLICATE_GROUPS_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(keys))),
    );
  } catch {
    // A disabled/full localStorage should never block event administration.
  }
}

function getCollegeExemptionSnapshot(
  rows: EventCollegeExemption[],
  collegeKey: string,
): ExemptionSnapshot[] {
  return rows
    .filter((item) => item.college_key === collegeKey)
    .map((item) => ({
      eventId: item.event_id,
      eventName: item.event_name,
      reason: item.reason ?? null,
    }))
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
}

function exemptionSnapshotsMatch(
  left: ExemptionSnapshot[],
  right: ExemptionSnapshot[],
) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other?.eventId === item.eventId &&
      other.reason === item.reason
    );
  });
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

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function buildEventForm(
  event: AttendanceEvent | null,
  fallbackSchoolYearId: string,
): EventFormState {
  if (!event) {
    return {
      ...emptyEventForm,
      schoolYearId:
        fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE
          ? ""
          : fallbackSchoolYearId,
    };
  }

  return {
    schoolYearId: event.school_year_id ?? "",
    eventOrder: event.event_order ? String(event.event_order) : "",
    name: event.name ?? "",
    eventStartAt: toDateTimeLocalValue(event.event_start_at),
    eventEndAt: toDateTimeLocalValue(event.event_end_at),
    description: event.description ?? "",
  };
}

function buildEventPayload(form: EventFormState): AttendanceEventInput {
  const eventOrder = Number(form.eventOrder);

  return {
    schoolYearId: form.schoolYearId || undefined,
    name: form.name.trim(),
    eventStartAt: fromDateTimeLocalValue(form.eventStartAt),
    eventEndAt: fromDateTimeLocalValue(form.eventEndAt),
    description: form.description.trim() || undefined,
    eventOrder:
      Number.isInteger(eventOrder) && eventOrder > 0 ? eventOrder : undefined,
  };
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

export default function EventsPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [sortOrder, setSortOrder] = useSortOrderSearchParam();
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(
    null,
  );
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [isLoading, setIsLoading] = useState(true);
  const [pageLoadProgress, setPageLoadProgress] =
    useState<EventsLoadProgress | null>(null);
  const loadRequestIdRef = useRef(0);
  const historyApplyingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [isDeletingEvents, setIsDeletingEvents] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<
    AttendanceEventDuplicateGroup[]
  >([]);
  const [dismissedDuplicateGroupKeys, setDismissedDuplicateGroupKeys] = useState<
    string[]
  >(() => loadDismissedDuplicateGroupKeys());
  const [mergeImpact, setMergeImpact] = useState<AttendanceEventMergeImpact | null>(
    null,
  );
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeConfirmationAccepted, setMergeConfirmationAccepted] =
    useState(false);
  const [isMergingEvents, setIsMergingEvents] = useState(false);
  const [colleges, setColleges] = useState<AttendanceCollege[]>([]);
  const [exemptions, setExemptions] = useState<EventCollegeExemption[]>([]);
  const [exemptionDialogOpen, setExemptionDialogOpen] = useState(false);
  const [exemptionCollege, setExemptionCollege] = useState("");
  const [exemptionEventIds, setExemptionEventIds] = useState<string[]>([]);
  const [exemptionReason, setExemptionReason] = useState("");
  const [exemptionImpact, setExemptionImpact] = useState<EventExemptionImpact[]>([]);
  const [hasPreviewedExemptions, setHasPreviewedExemptions] = useState(false);
  const [isPreviewingExemptions, setIsPreviewingExemptions] = useState(false);
  const [isSavingExemptions, setIsSavingExemptions] = useState(false);
  const [deletingExemptionId, setDeletingExemptionId] = useState("");
  const [undoStack, setUndoStack] = useState<ExemptionHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<ExemptionHistoryEntry[]>([]);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const [applyingHistoryAction, setApplyingHistoryAction] = useState<
    "undo" | "redo" | ""
  >("");
  const [undoConfirmationOpen, setUndoConfirmationOpen] = useState(false);
  const [exemptionDetailsEvent, setExemptionDetailsEvent] = useState<AttendanceEvent | null>(null);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const formSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(
      schoolYears,
      form.schoolYearId || selectedSchoolYearId,
    );
  }, [schoolYears, form.schoolYearId, selectedSchoolYearId]);

  const visibleDuplicateGroups = useMemo(() => {
    const dismissed = new Set(dismissedDuplicateGroupKeys);
    return duplicateGroups.filter(
      (group) => !dismissed.has(getDuplicateGroupKey(group)),
    );
  }, [duplicateGroups, dismissedDuplicateGroupKeys]);

  const dismissedDuplicateGroupCount =
    duplicateGroups.length - visibleDuplicateGroups.length;

  const filteredEvents = useMemo(() => {
    const normalizedSearch = eventSearch.trim().toLowerCase();

    const filtered = events.filter((event) => {
      const matchesDate = matchesDateRange(
        event.event_start_at ?? event.event_end_at ?? event.updated_at,
        fromDate,
        toDate,
      );
      const matchesSearch =
        !normalizedSearch ||
        String(event.name ?? "").toLowerCase().includes(normalizedSearch) ||
        String(event.description ?? "").toLowerCase().includes(normalizedSearch);

      return matchesDate && matchesSearch;
    });

    return sortByDate(
      filtered,
      (event) => event.event_start_at ?? event.event_end_at ?? event.created_at,
      sortOrder,
    );
  }, [events, fromDate, toDate, eventSearch, sortOrder]);

  const eventsTotalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredEvents.length / Number(rowsPerPage)));
  }, [filteredEvents.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, eventSearch, sortOrder, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, eventsTotalPages));
  }, [eventsTotalPages]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setUndoConfirmationOpen(false);
  }, [selectedSchoolYearId]);

  const paginatedEvents = useMemo(() => {
    if (rowsPerPage === "all") return filteredEvents;
    const pageSize = Number(rowsPerPage);
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEvents.slice(startIndex, startIndex + pageSize);
  }, [filteredEvents, currentPage, rowsPerPage]);

  const eventRangeStart = filteredEvents.length
    ? rowsPerPage === "all"
      ? 1
      : (currentPage - 1) * Number(rowsPerPage) + 1
    : 0;
  const eventRangeEnd = rowsPerPage === "all"
    ? filteredEvents.length
    : Math.min(currentPage * Number(rowsPerPage), filteredEvents.length);

  const summary = useMemo(() => {
    return {
      events: filteredEvents.length,
      attendees: filteredEvents.reduce(
        (total, event) => total + Number(event.attendees_count || 0),
        0,
      ),
      scheduled: filteredEvents.filter(
        (event) => event.event_start_at || event.event_end_at,
      ).length,
    };
  }, [filteredEvents]);

  const displayedEventIds = useMemo<string[]>(() => {
    return filteredEvents
      .map((event) => String(event.id ?? "").trim())
      .filter(Boolean);
  }, [filteredEvents]);

  const paginatedEventIds = useMemo<string[]>(() => {
    return paginatedEvents
      .map((event) => String(event.id ?? "").trim())
      .filter(Boolean);
  }, [paginatedEvents]);

  const allDisplayedEventsSelected =
    paginatedEventIds.length > 0 &&
    paginatedEventIds.every((eventId) => selectedEventIds.includes(eventId));

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

  async function reloadExemptions(schoolYearId = selectedSchoolYearId) {
    if (!schoolYearId) {
      setExemptions([]);
      setEvents((current) =>
        current.map((event) => ({ ...event, exempted_colleges: [] })),
      );
      return [] as EventCollegeExemption[];
    }

    const rows = await listEventCollegeExemptions({ schoolYearId });
    setExemptions(rows);
    setEvents((current) =>
      current.map((event) => ({
        ...event,
        exempted_colleges: rows
          .filter((item) => item.event_id === event.id)
          .map((item) => ({
            id: item.id,
            college_key: item.college_key,
            college_label: item.college_label,
          })),
      })),
    );
    return rows;
  }

  function recordExemptionHistory(entry: ExemptionHistoryEntry) {
    setRedoStack([]);
    if (exemptionSnapshotsMatch(entry.before, entry.after)) return;
    setUndoStack((current) => [...current, entry].slice(-20));
  }

  async function loadEvents(nextSchoolYearId = selectedSchoolYearId) {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;

    setIsLoading(true);
    setSelectedEventIds([]);
    setPageLoadProgress({
      progress: 6,
      detail: "Checking the active school year before loading events.",
      steps: [
        { label: "School year", status: "loading", detail: "Checking active scope" },
        { label: "Events", status: "pending", detail: "Waiting for scope" },
        { label: "Duplicate review", status: "pending", detail: "Waiting for scope" },
      ],
    });

    try {
      const schoolYearRows = await listSchoolYears({ activeOnly: true });
      if (!isCurrentRequest()) return;
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : getActiveSchoolYearId(schoolYearRows);

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      updatePageLoadStep(
        "School year",
        "done",
        fallbackSchoolYearId ? "Active scope ready" : "No active school year",
        22,
        fallbackSchoolYearId
          ? "School year ready. Event rows and duplicate analysis are loading in parallel."
          : "No active school year was found.",
      );

      if (!fallbackSchoolYearId) {
        setEvents([]);
        setDuplicateGroups([]);
        setPageLoadProgress((current) =>
          current
            ? {
                ...current,
                progress: 100,
                detail: "No event data was requested because there is no active school year.",
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
        "Loading event rows",
        30,
        "Loading event rows first so the table can appear while duplicate analysis finishes.",
      );
      updatePageLoadStep(
        "Duplicate review",
        "loading",
        "Analyzing likely duplicate events",
        30,
        "Event rows and duplicate analysis are running in parallel.",
      );

      const eventsPromise = listAttendanceEvents({
        schoolYearId: fallbackSchoolYearId,
        limit: 500,
        offset: 0,
      }).then((rows) => {
        if (!isCurrentRequest()) return rows;
        setEvents(rows);
        updatePageLoadStep(
          "Events",
          "done",
          `${rows.length.toLocaleString()} event/s ready`,
          72,
          "Event rows are visible. Duplicate analysis may still be finishing.",
        );
        return rows;
      });

      const duplicatesPromise = listAttendanceEventDuplicateGroups({
        schoolYearId: fallbackSchoolYearId,
      }).then((groups) => {
        if (!isCurrentRequest()) return groups;
        setDuplicateGroups(groups);
        updatePageLoadStep(
          "Duplicate review",
          "done",
          `${groups.length.toLocaleString()} candidate group/s found`,
          88,
          "Duplicate analysis is ready. Finalizing the page.",
        );
        return groups;
      });

      await Promise.all([eventsPromise, duplicatesPromise]);
      const [collegeRows, exemptionRows] = await Promise.all([
        listAttendanceColleges(),
        listEventCollegeExemptions({ schoolYearId: fallbackSchoolYearId }),
      ]);
      if (!isCurrentRequest()) return;
      setColleges(collegeRows);
      setExemptions(exemptionRows);
      setPageLoadProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              detail: "Ready. Event rows were displayed as soon as they arrived instead of waiting for duplicate analysis.",
              steps: current.steps.map((step) => ({ ...step, status: "done" })),
            }
          : current,
      );
    } catch (error) {
      if (!isCurrentRequest()) return;
      const message = error instanceof Error ? error.message : "Unable to load events.";
      setPageLoadProgress((current) =>
        current ? { ...current, detail: `Loading stopped: ${message}` } : current,
      );
      toast.error(message);
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
    void loadEvents();
  }, []);

  function handleOpenCreateDialog() {
    setEditingEvent(null);
    setForm(buildEventForm(null, selectedSchoolYearId));
    setEventDialogOpen(true);
  }

  function handleOpenEditDialog(event: AttendanceEvent) {
    setEditingEvent(event);
    setForm(buildEventForm(event, selectedSchoolYearId));
    setEventDialogOpen(true);
  }

  function handleFieldChange(field: keyof EventFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleEventSelection(eventId: string, checked: boolean) {
    setSelectedEventIds((current) => {
      if (checked) return Array.from(new Set([...current, eventId]));

      return current.filter((id) => id !== eventId);
    });
  }

  function handleSelectAllEvents(checked: boolean) {
    setSelectedEventIds((current) => {
      const pageIds = new Set(paginatedEventIds);
      if (!checked) return current.filter((id) => !pageIds.has(id));
      return Array.from(new Set([...current, ...paginatedEventIds]));
    });
  }

  async function handleSaveEvent(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Event name is required.");
      return;
    }

    if (!form.schoolYearId) {
      toast.error("Active school year is required.");
      return;
    }

    if (form.eventOrder) {
      const eventOrder = Number(form.eventOrder);

      if (!Number.isInteger(eventOrder) || eventOrder < 1) {
        toast.error("Event order must be a positive whole number.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const payload = buildEventPayload(form);
      const saved = editingEvent
        ? await updateAttendanceEvent(editingEvent.id, payload)
        : await saveAttendanceEvent(payload);

      toast.success(editingEvent ? "Event updated." : "Event created.");
      setEventDialogOpen(false);
      setEditingEvent(null);
      setForm(emptyEventForm);
      await loadEvents(saved?.school_year_id || selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save event.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEvent(event: AttendanceEvent) {
    setDeletingEventId(event.id);

    try {
      await deleteAttendanceEvent(event.id);
      setSelectedEventIds((current) => current.filter((id) => id !== event.id));
      toast.success("Event deleted.");
      await loadEvents(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete event.",
      );
    } finally {
      setDeletingEventId("");
    }
  }

  async function handleDeleteSelectedEvents() {
    const eventIds = Array.from(new Set(selectedEventIds));

    if (!eventIds.length) {
      toast.error("Select at least one event record.");
      return;
    }

    setIsDeletingEvents(true);

    try {
      await Promise.all(
        eventIds.map((eventId) => deleteAttendanceEvent(eventId)),
      );
      await loadEvents(selectedSchoolYearId);
      toast.success(
        `${eventIds.length.toLocaleString()} event record/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete selected event records.",
      );
    } finally {
      setIsDeletingEvents(false);
    }
  }

  async function handleDeleteAllEvents() {
    const eventIds = Array.from(new Set(displayedEventIds));

    if (!eventIds.length) {
      toast.error("No event records to delete.");
      return;
    }

    setIsDeletingEvents(true);

    try {
      await Promise.all(
        eventIds.map((eventId) => deleteAttendanceEvent(eventId)),
      );
      await loadEvents(selectedSchoolYearId);
      toast.success(
        `${eventIds.length.toLocaleString()} event record/s deleted.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete event records.",
      );
    } finally {
      setIsDeletingEvents(false);
    }
  }

  function handleDismissDuplicateGroup(group: AttendanceEventDuplicateGroup) {
    const groupKey = getDuplicateGroupKey(group);
    if (!groupKey) return;

    setDismissedDuplicateGroupKeys((current) => {
      if (current.includes(groupKey)) return current;
      const next = [...current, groupKey];
      persistDismissedDuplicateGroupKeys(next);
      return next;
    });
    toast.success("Candidate dismissed. These events will remain separate.");
  }

  function handleRestoreDismissedDuplicateGroups() {
    const displayedKeys = new Set(
      duplicateGroups.map(getDuplicateGroupKey).filter(Boolean),
    );

    setDismissedDuplicateGroupKeys((current) => {
      const next = current.filter((key) => !displayedKeys.has(key));
      persistDismissedDuplicateGroupKeys(next);
      return next;
    });
    toast.success("Dismissed duplicate candidates restored.");
  }

  async function handleOpenMergeDialog(group: AttendanceEventDuplicateGroup) {
    const [targetEvent, ...sourceEvents] = group.events;
    if (!targetEvent || !sourceEvents.length) return;

    try {
      const impact = await getAttendanceEventMergeImpact(
        targetEvent.id,
        sourceEvents.map((event) => event.id),
      );
      if (!impact) throw new Error("Unable to calculate merge impact.");
      setMergeConfirmationAccepted(false);
      setMergeImpact(impact);
      setMergeDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to inspect event merge.",
      );
    }
  }

  async function handleConfirmMergeEvents() {
    if (!mergeImpact || !mergeConfirmationAccepted) return;

    setIsMergingEvents(true);
    try {
      await mergeAttendanceEvents({
        targetEventId: mergeImpact.targetEvent.id,
        sourceEventIds: mergeImpact.sourceEvents.map((event) => event.id),
      });
      toast.success("Duplicate attendance events merged.");
      setMergeDialogOpen(false);
      setMergeConfirmationAccepted(false);
      setMergeImpact(null);
      await loadEvents(selectedSchoolYearId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to merge attendance events.",
      );
    } finally {
      setIsMergingEvents(false);
    }
  }

  function handleOpenExemptionDialog() {
    setExemptionCollege("");
    setExemptionEventIds([]);
    setExemptionReason("");
    setExemptionImpact([]);
    setHasPreviewedExemptions(false);
    setExemptionDialogOpen(true);
  }

  function handleExemptionCollegeChange(label: string) {
    setExemptionCollege(label);
    const key = colleges.find((college) => college.label === label)?.key;
    setExemptionEventIds(
      key
        ? exemptions.filter((item) => item.college_key === key).map((item) => item.event_id)
        : [],
    );
    setExemptionImpact([]);
    setHasPreviewedExemptions(false);
  }

  function handleExemptionEventToggle(eventId: string, checked: boolean) {
    setExemptionEventIds((current) =>
      checked
        ? Array.from(new Set([...current, eventId]))
        : current.filter((id) => id !== eventId),
    );
    setExemptionImpact([]);
    setHasPreviewedExemptions(false);
  }

  async function handlePreviewExemptions() {
    if (isPreviewingExemptions) return;
    if (!exemptionCollege || !selectedSchoolYearId || !exemptionEventIds.length) {
      toast.error("Select a college and at least one event.");
      return;
    }

    setIsPreviewingExemptions(true);
    try {
      const impact = await getEventCollegeExemptionImpact({
        college: exemptionCollege,
        eventIds: exemptionEventIds,
        schoolYearId: selectedSchoolYearId,
      });
      setExemptionImpact(impact);
      setHasPreviewedExemptions(true);
      if (!impact.length) {
        toast.info("No impact data for the selected events.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to preview exemption impact.");
    } finally {
      setIsPreviewingExemptions(false);
    }
  }

  async function handleSaveExemptions() {
    if (!hasPreviewedExemptions) {
      await handlePreviewExemptions();
      return;
    }
    if (historyApplyingRef.current || deletingExemptionId) return;

    const college = colleges.find((item) => item.label === exemptionCollege);
    if (!college) {
      toast.error("Select a valid college.");
      return;
    }

    const before = getCollegeExemptionSnapshot(exemptions, college.key);
    setIsSavingExemptions(true);
    try {
      await createEventCollegeExemptions({
        college: exemptionCollege,
        eventIds: exemptionEventIds,
        reason: exemptionReason.trim() || undefined,
        schoolYearId: selectedSchoolYearId,
      });
      const refreshed = await reloadExemptions(selectedSchoolYearId);
      const after = getCollegeExemptionSnapshot(refreshed, college.key);
      recordExemptionHistory({
        kind: "add",
        collegeLabel: exemptionCollege,
        collegeKey: college.key,
        schoolYearId: selectedSchoolYearId,
        before,
        after,
        label: `Exempted ${exemptionCollege} from ${exemptionEventIds.length} ${
          exemptionEventIds.length === 1 ? "event" : "events"
        }`,
      });
      toast.success("College exemptions saved. Absences and fines were recalculated.");
      setExemptionDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save exemptions.");
    } finally {
      setIsSavingExemptions(false);
    }
  }

  async function handleRemoveExemption(exemption: EventCollegeExemption) {
    if (historyApplyingRef.current || isSavingExemptions || deletingExemptionId) return;

    const before = getCollegeExemptionSnapshot(exemptions, exemption.college_key);
    setDeletingExemptionId(exemption.id);
    try {
      await deleteEventCollegeExemption(exemption.id);
      const refreshed = await reloadExemptions(selectedSchoolYearId);
      const after = getCollegeExemptionSnapshot(
        refreshed,
        exemption.college_key,
      );
      recordExemptionHistory({
        kind: "remove",
        collegeLabel: exemption.college_label,
        collegeKey: exemption.college_key,
        schoolYearId: selectedSchoolYearId,
        before,
        after,
        label: `Removed ${exemption.college_label} exemption for ${exemption.event_name}`,
      });
      toast.success("College exemption removed. Absences and fines were recalculated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove exemption.");
    } finally {
      setDeletingExemptionId("");
    }
  }

  async function applyExemptionState(
    collegeLabel: string,
    schoolYearId: string,
    from: ExemptionSnapshot[],
    to: ExemptionSnapshot[],
  ) {
    const currentRows = await listEventCollegeExemptions({ schoolYearId });
    setExemptions(currentRows);
    const collegeKey =
      colleges.find((college) => college.label === collegeLabel)?.key ??
      currentRows.find((item) => item.college_label === collegeLabel)?.college_key;

    if (!collegeKey) {
      throw new Error("College could not be resolved for exemption history.");
    }

    const current = getCollegeExemptionSnapshot(currentRows, collegeKey);
    if (!exemptionSnapshotsMatch(current, from)) {
      throw new Error("Exemption history no longer matches the server.");
    }

    const toByEventId = new Map(to.map((item) => [item.eventId, item]));
    const currentByEventId = new Map(
      current.map((item) => [item.eventId, item]),
    );
    const eventIdsToRemove = from
      .filter((item) => !toByEventId.has(item.eventId))
      .map((item) => item.eventId);

    if (eventIdsToRemove.length) {
      await deleteEventCollegeExemptionsBulk({
        college: collegeLabel,
        eventIds: eventIdsToRemove,
        schoolYearId,
      });
    }

    const createGroups = new Map<string | null, string[]>();
    for (const target of to) {
      const currentItem = currentByEventId.get(target.eventId);
      if (currentItem && currentItem.reason === target.reason) continue;
      const group = createGroups.get(target.reason) ?? [];
      group.push(target.eventId);
      createGroups.set(target.reason, group);
    }

    for (const [reason, eventIds] of createGroups) {
      await createEventCollegeExemptions({
        college: collegeLabel,
        eventIds,
        reason: reason ?? undefined,
        schoolYearId,
      });
    }

    const refreshed = await reloadExemptions(schoolYearId);
    const applied = getCollegeExemptionSnapshot(refreshed, collegeKey);
    if (!exemptionSnapshotsMatch(applied, to)) {
      throw new Error("Exemption history did not match the server after recalculation.");
    }
  }

  async function handleUndoExemptions() {
    if (
      historyApplyingRef.current ||
      isSavingExemptions ||
      deletingExemptionId ||
      !undoStack.length
    ) {
      return;
    }

    setUndoConfirmationOpen(false);
    const entry = undoStack[undoStack.length - 1];
    historyApplyingRef.current = true;
    setIsApplyingHistory(true);
    setApplyingHistoryAction("undo");
    setUndoStack((current) => current.slice(0, -1));
    try {
      await applyExemptionState(
        entry.collegeLabel,
        entry.schoolYearId,
        entry.after,
        entry.before,
      );
      setRedoStack((current) => [...current, entry].slice(-20));
      toast.success(`Undid: ${entry.label}. Absences and fines were recalculated.`);
    } catch {
      try {
        await reloadExemptions(entry.schoolYearId);
      } catch {
        // Keep the original history failure message below.
      }
      setUndoStack([]);
      setRedoStack([]);
      toast.error(
        "Couldn't undo. Exemptions were changed elsewhere; history entry discarded.",
      );
    } finally {
      historyApplyingRef.current = false;
      setIsApplyingHistory(false);
      setApplyingHistoryAction("");
    }
  }

  async function handleRedoExemptions() {
    if (
      historyApplyingRef.current ||
      isSavingExemptions ||
      deletingExemptionId ||
      !redoStack.length
    ) {
      return;
    }

    const entry = redoStack[redoStack.length - 1];
    historyApplyingRef.current = true;
    setIsApplyingHistory(true);
    setApplyingHistoryAction("redo");
    setRedoStack((current) => current.slice(0, -1));
    try {
      await applyExemptionState(
        entry.collegeLabel,
        entry.schoolYearId,
        entry.before,
        entry.after,
      );
      setUndoStack((current) => [...current, entry].slice(-20));
      toast.success(`Redid: ${entry.label}. Absences and fines were recalculated.`);
    } catch {
      try {
        await reloadExemptions(entry.schoolYearId);
      } catch {
        // Keep the original history failure message below.
      }
      setUndoStack([]);
      setRedoStack([]);
      toast.error(
        "Couldn't redo. Exemptions were changed elsewhere; history entry discarded.",
      );
    } finally {
      historyApplyingRef.current = false;
      setIsApplyingHistory(false);
      setApplyingHistoryAction("");
    }
  }

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const tagName = target?.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        eventDialogOpen ||
        exemptionDialogOpen ||
        mergeDialogOpen ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      ) {
        return;
      }
      if (historyApplyingRef.current || isSavingExemptions || deletingExemptionId) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey && redoStack.length) {
        event.preventDefault();
        void handleRedoExemptions();
        return;
      }
      if (key === "y" && redoStack.length) {
        event.preventDefault();
        void handleRedoExemptions();
        return;
      }
      if (key === "z" && !event.shiftKey && undoStack.length) {
        event.preventDefault();
        setUndoConfirmationOpen(true);
      }
    }

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [
    deletingExemptionId,
    eventDialogOpen,
    exemptionDialogOpen,
    isSavingExemptions,
    mergeDialogOpen,
    redoStack,
    undoStack,
  ]);

  const exemptionActionsBusy =
    isApplyingHistory || isSavingExemptions || Boolean(deletingExemptionId);
  const undoEntry = undoStack[undoStack.length - 1];
  const redoEntry = redoStack[redoStack.length - 1];

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                Events
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Attendance events
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Create, update, delete, and organize attendance events by school
                year.
              </p>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row lg:items-center">
              <SchoolYearBadge
                label={selectedSchoolYearLabel}
                className="w-full justify-center sm:w-auto"
              />

              <Button
                type="button"
                variant="outline"
                onClick={handleOpenExemptionDialog}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                College Exemptions
              </Button>

              <Button
                type="button"
                onClick={handleOpenCreateDialog}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Create Event
              </Button>
            </div>
          </div>
        </section>

        {pageLoadProgress ? (
          <LoadingStatus
            title="Loading events"
            detail={pageLoadProgress.detail}
            progress={pageLoadProgress.progress}
            steps={pageLoadProgress.steps}
          />
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              School Year / Semester
            </p>
            <p className="mt-2 text-2xl font-black">
              {selectedSchoolYearLabel}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Events</p>
            <p className="mt-2 text-2xl font-black">
              {summary.events.toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">
              Total Attendees
            </p>
            <p className="mt-2 text-2xl font-black">
              {summary.attendees.toLocaleString()}
            </p>
          </div>
        </section>

        {duplicateGroups.length ? (
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Likely duplicate events</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review before merging. Choose Do Not Merge for events that must stay separate.
                </p>
              </div>
              {dismissedDuplicateGroupCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRestoreDismissedDuplicateGroups}
                  className="shrink-0 font-bold"
                >
                  Restore dismissed ({dismissedDuplicateGroupCount})
                </Button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {visibleDuplicateGroups.length ? (
                visibleDuplicateGroups.map((group, groupIndex) => (
                  <article
                    key={`${group.schoolYearId ?? "none"}-${group.events.map((event) => event.id).join("-")}`}
                    className="rounded-2xl border bg-background p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">Candidate #{groupIndex + 1}</p>
                          <span className="rounded-full border px-2.5 py-1 text-xs font-black">
                            {Math.round(group.score * 100)}% {group.confidence}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {group.events.map((attendanceEvent) => (
                            <div key={attendanceEvent.id} className="rounded-xl bg-muted/40 p-3">
                              <p className="font-bold">{attendanceEvent.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(attendanceEvent.event_start_at)} to {formatDateTime(attendanceEvent.event_end_at)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                                {Number(attendanceEvent.attendees_count || 0).toLocaleString()} attendee/s
                              </p>
                            </div>
                          ))}
                        </div>
                        {group.reasons.length ? (
                          <p className="mt-3 text-xs font-semibold text-muted-foreground">
                            {group.reasons.join(" • ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleDismissDuplicateGroup(group)}
                          className="rounded-xl font-black"
                        >
                          Do Not Merge
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleOpenMergeDialog(group)}
                          className="rounded-xl font-black"
                        >
                          Review Merge
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm font-semibold text-muted-foreground">
                  All duplicate suggestions for this school year are dismissed. The events will remain separate unless you restore a candidate and explicitly merge it.
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Event records</h2>
              <p className="text-sm text-muted-foreground">
                Showing {filteredEvents.length.toLocaleString()} event record/s.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Input
                type="search"
                aria-label="Search events"
                placeholder="Search event..."
                value={eventSearch}
                onChange={(event) => setEventSearch(event.target.value)}
                className="min-h-11 rounded-2xl sm:w-64"
              />
              <SortSelect
                value={sortOrder}
                onValueChange={setSortOrder}
                ariaLabel="Sort events"
                className="rounded-2xl sm:w-44"
              />
              <Input
                type="date"
                aria-label="Events from date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                className="min-h-11 rounded-2xl sm:w-40"
              />
              <Input
                type="date"
                aria-label="Events to date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className="min-h-11 rounded-2xl sm:w-40"
              />
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !selectedEventIds.length ||
                      isSaving ||
                      isDeletingEvents ||
                      Boolean(deletingEventId)
                    }
                    className="min-h-11 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingEvents ? "Deleting..." : "Delete Selected"}
                  </Button>
                }
                title="Delete selected events?"
                description={
                  <>
                    This will permanently delete {selectedEventIds.length.toLocaleString()} selected event record(s). This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE SELECTED"
                confirmLabel="Delete Selected"
                isPending={isDeletingEvents}
                onConfirm={handleDeleteSelectedEvents}
              />
              <ProtectedDeleteDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      !displayedEventIds.length ||
                      isSaving ||
                      isDeletingEvents ||
                      Boolean(deletingEventId)
                    }
                    className="min-h-11 rounded-2xl px-5 text-xs font-black"
                  >
                    {isDeletingEvents ? "Deleting..." : "Delete All"}
                  </Button>
                }
                title="Delete all matching events?"
                description={
                  <>
                    This will permanently delete all {displayedEventIds.length.toLocaleString()} event record(s) matching the current filters. This action cannot be undone.
                  </>
                }
                confirmationPhrase="DELETE ALL"
                confirmLabel="Delete All"
                isPending={isDeletingEvents}
                onConfirm={handleDeleteAllEvents}
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      aria-label="Select all event records"
                      checked={allDisplayedEventsSelected}
                      onCheckedChange={(checked) =>
                        handleSelectAllEvents(checked === true)
                      }
                    />
                  </th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">School Year / Semester</th>
                  <th className="px-4 py-3">Attendees</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.length ? (
                  paginatedEvents.map((event, index) => (
                    <tr key={event.id} className="border-t">
                      <td className="px-4 py-3 align-top">
                        <Checkbox
                          aria-label={`Select ${event.name}`}
                          checked={selectedEventIds.includes(event.id)}
                          onCheckedChange={(checked) =>
                            handleEventSelection(
                              event.id,
                              checked === true,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-base font-black">
                        {(event.event_order || (rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1)).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-black">{event.name}</p>
                        {event.exempted_colleges?.length ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setExemptionDetailsEvent(event)}
                            className="mt-1 h-8 max-w-full rounded-lg border-amber-200 bg-amber-50 px-2.5 text-[11px] font-black text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                          >
                            View exemptions ({event.exempted_colleges.length})
                          </Button>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Updated {formatDateTime(event.updated_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold">
                          {formatDateTime(event.event_start_at)}
                        </p>
                        <p className="text-muted-foreground">
                          to {formatDateTime(event.event_end_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top font-semibold">
                        {getSchoolYearLabel(
                          schoolYears,
                          event.school_year_id ?? "",
                        )}
                      </td>
                      <td className="px-4 py-3 align-top font-bold">
                        {Number(event.attendees_count || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {event.description || "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenEditDialog(event)}
                            className="min-h-10 rounded-xl px-4 text-xs font-black"
                          >
                            Edit
                          </Button>

                          <ProtectedDeleteDialog
                            trigger={
                              <Button
                                type="button"
                                variant="destructive"
                                disabled={deletingEventId === event.id}
                                className="min-h-10 rounded-xl px-4 text-xs font-black"
                              >
                                {deletingEventId === event.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </Button>
                            }
                            title="Delete this event?"
                            description="This will permanently delete 1 attendance event record. Linked attendance and fine records for this event will also be removed, and downstream results will be recalculated."
                            confirmationPhrase="DELETE"
                            confirmLabel="Delete Event"
                            isPending={deletingEventId === event.id}
                            onConfirm={() => handleDeleteEvent(event)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground"
                    >
                      {isLoading ? "Loading events..." : "No events found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Showing {eventRangeStart.toLocaleString()}–{eventRangeEnd.toLocaleString()} of {filteredEvents.length.toLocaleString()} event/s
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
              <span className="min-w-20 text-center text-xs font-black text-muted-foreground">Page {currentPage} of {eventsTotalPages}</span>
              <Button type="button" variant="outline" disabled={currentPage >= eventsTotalPages || rowsPerPage === "all"} onClick={() => setCurrentPage((page) => Math.min(eventsTotalPages, page + 1))} className="h-10 rounded-xl px-4 text-xs font-black">Next</Button>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto mt-6 w-full max-w-7xl rounded-3xl border bg-card p-4 shadow-sm sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black sm:text-xl">Current college exemptions</h2>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!undoEntry || exemptionActionsBusy}
                title={undoEntry ? `Undo: ${undoEntry.label}` : "Nothing to undo"}
                onClick={() => setUndoConfirmationOpen(true)}
                className="min-h-10 w-full rounded-xl px-4 sm:w-auto"
              >
                {isApplyingHistory && applyingHistoryAction === "undo"
                  ? "Recalculating..."
                  : "Undo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!redoEntry || exemptionActionsBusy}
                title={redoEntry ? `Redo: ${redoEntry.label}` : "Nothing to redo"}
                onClick={() => void handleRedoExemptions()}
                className="min-h-10 w-full rounded-xl px-4 sm:w-auto"
              >
                {isApplyingHistory && applyingHistoryAction === "redo"
                  ? "Recalculating..."
                  : "Redo"}
              </Button>
            </div>
            <p className="max-w-lg text-left text-xs font-semibold leading-5 text-muted-foreground lg:text-right">
              Undo history is kept for this session only and clears on reload or school-year change.
            </p>
          </div>
        </div>
        {exemptions.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {Array.from(new Set(exemptions.map((item) => item.college_label))).map((collegeLabel) => (
              <div key={collegeLabel} className="min-w-0 rounded-2xl border bg-background p-4 sm:p-5">
                <p className="break-words font-black">{collegeLabel}</p>
                <div className="mt-3 grid gap-2">
                  {exemptions.filter((item) => item.college_label === collegeLabel).map((item) => (
                    <div key={item.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-bold">{item.event_name}</p>
                        {item.reason ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.reason}</p> : null}
                      </div>
                      <ProtectedDeleteDialog
                        trigger={<Button type="button" variant="outline" disabled={exemptionActionsBusy} className="min-h-10 w-full shrink-0 rounded-xl sm:w-auto">Remove</Button>}
                        title="Remove this college exemption?"
                        description="The event will return to this college's expected-event roster and attendance results and fines will be recalculated."
                        confirmationPhrase="REMOVE"
                        confirmLabel="Remove Exemption"
                        isPending={deletingExemptionId === item.id}
                        onConfirm={() => handleRemoveExemption(item)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 flex min-h-20 items-center rounded-2xl border border-dashed bg-muted/20 px-4 py-5 text-sm font-semibold leading-6 text-muted-foreground sm:px-5">
            No college exemptions for this school year.
          </p>
        )}
      </section>

      <Dialog
        open={Boolean(exemptionDetailsEvent)}
        onOpenChange={(open) => {
          if (!open) setExemptionDetailsEvent(null);
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Event Exemptions</DialogTitle>
            <DialogDescription>
              View the colleges exempted from this event without expanding the events table.
            </DialogDescription>
          </DialogHeader>
          {exemptionDetailsEvent ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-sm font-black">{exemptionDetailsEvent.name}</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {exemptionDetailsEvent.exempted_colleges?.length ?? 0} exempted college{
                    (exemptionDetailsEvent.exempted_colleges?.length ?? 0) === 1 ? "" : "s"
                  }
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {exemptionDetailsEvent.exempted_colleges?.map((college) => (
                  <div
                    key={college.id}
                    className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-900"
                  >
                    <span className="break-words">{college.college_label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={undoConfirmationOpen}
        onOpenChange={(open) => {
          if (!isApplyingHistory) setUndoConfirmationOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the last exemption change?</AlertDialogTitle>
            <AlertDialogDescription>
              {undoEntry
                ? `This will undo “${undoEntry.label}” and recalculate affected absences and fines. Confirm to avoid an accidental undo.`
                : "There is no exemption change available to undo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingHistory}>Keep Change</AlertDialogCancel>
            <AlertDialogAction
              disabled={!undoEntry || exemptionActionsBusy}
              onClick={() => void handleUndoExemptions()}
            >
              {isApplyingHistory && applyingHistoryAction === "undo"
                ? "Recalculating..."
                : "Undo Change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={exemptionDialogOpen} onOpenChange={setExemptionDialogOpen}>
        <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>College Event Exemptions</DialogTitle>
            <DialogDescription>
              Choose a college and the events it is exempted from. Preview how absences and penalties change before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-black">1. Select college</p>
              <Select value={exemptionCollege} onValueChange={handleExemptionCollegeChange}>
                <SelectTrigger className="min-h-12 rounded-2xl"><SelectValue placeholder="Select college" /></SelectTrigger>
                <SelectContent>{colleges.map((college) => <SelectItem key={college.key} value={college.label}>{college.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-black">2. Select exempted events</p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border p-3">
                {events.map((event) => (
                  <label key={event.id} className="flex items-start gap-3 rounded-xl p-2 hover:bg-muted/40">
                    <Checkbox checked={exemptionEventIds.includes(event.id)} onCheckedChange={(checked) => handleExemptionEventToggle(event.id, checked === true)} />
                    <span className="text-sm font-semibold">{event.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block space-y-2 text-sm font-black">
              <span>3. Optional reason</span>
              <Textarea value={exemptionReason} onChange={(event) => setExemptionReason(event.target.value)} placeholder="Why is this college exempted from these events?" />
            </label>
            {hasPreviewedExemptions ? (
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="font-black">Impact preview</p>
                {exemptionImpact.length ? (
                  <div className="mt-3 space-y-2">
                    {exemptionImpact.map((impact) => (
                      <div key={impact.event_id} className="rounded-xl border bg-background p-3 text-sm">
                        <p className="font-black">{impact.event_name}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {impact.already_exempted ? (
                            <span className="rounded-full border px-2.5 py-1 text-xs font-bold text-muted-foreground">Already exempted</span>
                          ) : null}
                          {!impact.in_roster_scope ? (
                            <span className="rounded-full border px-2.5 py-1 text-xs font-bold text-muted-foreground">No attendance records for this college</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-muted-foreground">{impact.students_attended} attended • {impact.students_losing_absence} students lose an absence • penalties {impact.penalties_before} → {impact.penalties_after}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed bg-background p-3 text-sm font-semibold text-muted-foreground">
                    No impact data for the selected events.
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setExemptionDialogOpen(false)}>Cancel</Button>
              {!hasPreviewedExemptions ? (
                <Button
                  type="button"
                  disabled={isPreviewingExemptions || exemptionActionsBusy}
                  onClick={() => void handlePreviewExemptions()}
                >
                  {isPreviewingExemptions ? "Previewing..." : "Preview Impact"}
                </Button>
              ) : (
                <Button type="button" disabled={exemptionActionsBusy} onClick={() => void handleSaveExemptions()}>{isSavingExemptions ? "Saving..." : "Confirm & Save"}</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          setMergeDialogOpen(open);
          if (!open) {
            setMergeImpact(null);
            setMergeConfirmationAccepted(false);
          }
        }}
      >
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm duplicate event merge</DialogTitle>
            <DialogDescription>
              Review affected records before permanently merging duplicate attendance events.
            </DialogDescription>
          </DialogHeader>

          {mergeImpact ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs font-black uppercase text-muted-foreground">Keep as target</p>
                <p className="mt-1 font-black">{mergeImpact.targetEvent.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(mergeImpact.targetEvent.event_start_at)} to {formatDateTime(mergeImpact.targetEvent.event_end_at)}
                </p>
              </div>

              <div>
                <p className="text-sm font-black">Source event/s to remove after moving data</p>
                <div className="mt-2 grid gap-2">
                  {mergeImpact.sourceEvents.map((sourceEvent) => (
                    <div key={sourceEvent.id} className="rounded-xl border p-3">
                      <p className="font-bold">{sourceEvent.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(sourceEvent.event_start_at)} to {formatDateTime(sourceEvent.event_end_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold text-muted-foreground">Attendance records moved</p>
                  <p className="mt-1 text-xl font-black">{mergeImpact.movedCounts.attendanceRecords.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold text-muted-foreground">Imports repointed</p>
                  <p className="mt-1 text-xl font-black">{mergeImpact.movedCounts.attendanceImports.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold text-muted-foreground">Manual records moved</p>
                  <p className="mt-1 text-xl font-black">{mergeImpact.movedCounts.manualAttendanceRecords.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold text-muted-foreground">Request links repointed</p>
                  <p className="mt-1 text-xl font-black">{mergeImpact.movedCounts.attendanceRequestEvents.toLocaleString()}</p>
                </div>
              </div>

              <p className="text-sm font-semibold text-muted-foreground">
                This merge will permanently delete {mergeImpact.sourceEvents.length.toLocaleString()} source event record(s) after moving their linked data. {mergeImpact.affectedStudents.toLocaleString()} student(s) will have absences, fines, and downstream results recalculated. The merge is logged before source events are removed.
              </p>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                <Checkbox
                  checked={mergeConfirmationAccepted}
                  disabled={isMergingEvents}
                  onCheckedChange={(checked) =>
                    setMergeConfirmationAccepted(checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="block font-black">Required confirmation</span>
                  <span className="mt-1 block font-semibold text-muted-foreground">
                    I understand that merging permanently combines these events and deletes the source event record(s).
                  </span>
                </span>
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isMergingEvents}
                  onClick={() => setMergeDialogOpen(false)}
                >
                  Cancel — Keep Separate
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isMergingEvents || !mergeConfirmationAccepted}
                  onClick={() => void handleConfirmMergeEvents()}
                >
                  {isMergingEvents ? "Merging..." : "Merge Events"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit event" : "Create event"}
            </DialogTitle>
            <DialogDescription>
              {editingEvent
                ? "Update the event details, schedule, and description."
                : "Add an event with its schedule and optional description."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEvent} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2 text-sm font-bold">
                <span>Order</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.eventOrder}
                  onChange={(event) =>
                    handleFieldChange("eventOrder", event.target.value)
                  }
                  placeholder="1"
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                <span>Event name</span>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    handleFieldChange("name", event.target.value)
                  }
                  placeholder="Event name"
                  className="min-h-12 rounded-2xl"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">
                <span>Start date and time</span>
                <DateTimePicker
                  value={form.eventStartAt}
                  onValueChange={(value) =>
                    handleFieldChange("eventStartAt", value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>End date and time</span>
                <DateTimePicker
                  value={form.eventEndAt}
                  onValueChange={(value) =>
                    handleFieldChange("eventEndAt", value)
                  }
                  className="min-h-12 rounded-2xl"
                />
              </label>
            </div>

            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>School year / semester</span>
              <SchoolYearBadge
                label={formSchoolYearLabel}
                className="w-full justify-center"
              />
            </div>

            <label className="space-y-2 text-sm font-bold">
              <span>Description</span>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  handleFieldChange("description", event.target.value)
                }
                placeholder="Optional event description"
                className="min-h-28 w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setEventDialogOpen(false)}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isSaving
                  ? "Saving..."
                  : editingEvent
                    ? "Update Event"
                    : "Save Event"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}