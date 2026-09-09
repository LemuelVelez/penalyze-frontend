import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceEvent,
  getAttendanceEventMergeImpact,
  listAttendanceEventDuplicateGroups,
  listAttendanceEvents,
  mergeAttendanceEvents,
  saveAttendanceEvent,
  updateAttendanceEvent,
} from "../../api/attendance";
import type {
  AttendanceEvent,
  AttendanceEventDuplicateGroup,
  AttendanceEventInput,
  AttendanceEventMergeImpact,
} from "../../api/attendance";
import {
  ALL_SCHOOL_YEARS_VALUE,
  getActiveSchoolYearId,
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
import { DateTimePicker } from "../../components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

const emptyEventForm = {
  schoolYearId: "",
  eventOrder: "",
  name: "",
  eventStartAt: "",
  eventEndAt: "",
  description: "",
};

type EventFormState = typeof emptyEventForm;

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
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(
    null,
  );
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [isDeletingEvents, setIsDeletingEvents] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<
    AttendanceEventDuplicateGroup[]
  >([]);
  const [mergeImpact, setMergeImpact] = useState<AttendanceEventMergeImpact | null>(
    null,
  );
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [isMergingEvents, setIsMergingEvents] = useState(false);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const formSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(
      schoolYears,
      form.schoolYearId || selectedSchoolYearId,
    );
  }, [schoolYears, form.schoolYearId, selectedSchoolYearId]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = eventSearch.trim().toLowerCase();

    return events.filter((event) => {
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
  }, [events, fromDate, toDate, eventSearch]);

  const eventsTotalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(filteredEvents.length / Number(rowsPerPage)));
  }, [filteredEvents.length, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, eventSearch, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, eventsTotalPages));
  }, [eventsTotalPages]);

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

  async function loadEvents(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const schoolYearRows = await listSchoolYears({ activeOnly: true });
      const fallbackSchoolYearId =
        nextSchoolYearId &&
        schoolYearRows.some((schoolYear) => schoolYear.id === nextSchoolYearId)
          ? nextSchoolYearId
          : getActiveSchoolYearId(schoolYearRows);
      const [rows, groups] = fallbackSchoolYearId
        ? await Promise.all([
            listAttendanceEvents({
              schoolYearId: fallbackSchoolYearId,
              limit: 500,
              offset: 0,
            }),
            listAttendanceEventDuplicateGroups({
              schoolYearId: fallbackSchoolYearId,
            }),
          ])
        : [[], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setEvents(rows);
      setDuplicateGroups(groups);
      setSelectedEventIds([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load events.",
      );
    } finally {
      setIsLoading(false);
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

  async function handleOpenMergeDialog(group: AttendanceEventDuplicateGroup) {
    const [targetEvent, ...sourceEvents] = group.events;
    if (!targetEvent || !sourceEvents.length) return;

    try {
      const impact = await getAttendanceEventMergeImpact(
        targetEvent.id,
        sourceEvents.map((event) => event.id),
      );
      if (!impact) throw new Error("Unable to calculate merge impact.");
      setMergeImpact(impact);
      setMergeDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to inspect event merge.",
      );
    }
  }

  async function handleConfirmMergeEvents() {
    if (!mergeImpact) return;

    setIsMergingEvents(true);
    try {
      await mergeAttendanceEvents({
        targetEventId: mergeImpact.targetEvent.id,
        sourceEventIds: mergeImpact.sourceEvents.map((event) => event.id),
      });
      toast.success("Duplicate attendance events merged.");
      setMergeDialogOpen(false);
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
                onClick={handleOpenCreateDialog}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                Create Event
              </Button>
            </div>
          </div>
        </section>

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
            <div>
              <h2 className="text-xl font-black">Likely duplicate events</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review these candidates before merging. Nothing is moved until you confirm.
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {duplicateGroups.map((group, groupIndex) => (
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleOpenMergeDialog(group)}
                      className="shrink-0 rounded-xl font-black"
                    >
                      Review Merge
                    </Button>
                  </div>
                </article>
              ))}
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
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteSelectedEvents}
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
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteAllEvents}
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

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
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
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete this event?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete the selected attendance event
                                  record.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteEvent(event)}
                                >
                                  Delete Event
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          setMergeDialogOpen(open);
          if (!open) setMergeImpact(null);
        }}
      >
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm duplicate event merge</DialogTitle>
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
                {mergeImpact.affectedStudents.toLocaleString()} student/s will have absences, fines, and downstream results recalculated. The merge is logged before source events are removed.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isMergingEvents}
                  onClick={() => setMergeDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isMergingEvents}
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