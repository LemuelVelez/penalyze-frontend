import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  deleteAttendanceEvent,
  listAttendanceEvents,
  saveAttendanceEvent,
  updateAttendanceEvent,
} from "../../api/attendance";
import type { AttendanceEvent, AttendanceEventInput } from "../../api/attendance";
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

const emptyEventForm = {
  schoolYearId: "",
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

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function buildEventForm(event: AttendanceEvent | null, fallbackSchoolYearId: string): EventFormState {
  if (!event) {
    return {
      ...emptyEventForm,
      schoolYearId: fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE ? "" : fallbackSchoolYearId,
    };
  }

  return {
    schoolYearId: event.school_year_id ?? "",
    name: event.name ?? "",
    eventStartAt: toDateTimeLocalValue(event.event_start_at),
    eventEndAt: toDateTimeLocalValue(event.event_end_at),
    description: event.description ?? "",
  };
}

function buildEventPayload(form: EventFormState): AttendanceEventInput {
  return {
    schoolYearId: form.schoolYearId || undefined,
    name: form.name.trim(),
    eventStartAt: fromDateTimeLocalValue(form.eventStartAt),
    eventEndAt: fromDateTimeLocalValue(form.eventEndAt),
    description: form.description.trim() || undefined,
  };
}

export default function EventsPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(ALL_SCHOOL_YEARS_VALUE);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState("");

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const summary = useMemo(() => {
    return {
      events: events.length,
      attendees: events.reduce((total, event) => total + Number(event.attendees_count || 0), 0),
      scheduled: events.filter((event) => event.event_start_at || event.event_end_at).length,
    };
  }, [events]);

  async function loadEvents(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const schoolYearRows = await listSchoolYears();
      const fallbackSchoolYearId =
        nextSchoolYearId || getActiveSchoolYearId(schoolYearRows) || ALL_SCHOOL_YEARS_VALUE;
      const rows = await listAttendanceEvents({
        schoolYearId: fallbackSchoolYearId === ALL_SCHOOL_YEARS_VALUE ? undefined : fallbackSchoolYearId,
        limit: 500,
        offset: 0,
      });

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setEvents(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load events.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    await loadEvents(value);
  }

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

  async function handleSaveEvent(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Event name is required.");
      return;
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
      toast.error(error instanceof Error ? error.message : "Unable to save event.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEvent(event: AttendanceEvent) {
    setDeletingEventId(event.id);

    try {
      await deleteAttendanceEvent(event.id);
      toast.success("Event deleted.");
      await loadEvents(selectedSchoolYearId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete event.");
    } finally {
      setDeletingEventId("");
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
                Create, update, delete, and organize attendance events by school year.
              </p>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row lg:items-center">
              <Select value={selectedSchoolYearId} onValueChange={handleSchoolYearChange}>
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-xs rounded-2xl sm:w-56">
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent className="max-w-xs">
                  <SelectItem value={ALL_SCHOOL_YEARS_VALUE}>All school years</SelectItem>
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
            <p className="text-sm font-bold text-muted-foreground">School Year</p>
            <p className="mt-2 text-2xl font-black">{selectedSchoolYearLabel}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Events</p>
            <p className="mt-2 text-2xl font-black">{summary.events.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Total Attendees</p>
            <p className="mt-2 text-2xl font-black">{summary.attendees.toLocaleString()}</p>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black">Event records</h2>
            <p className="text-sm text-muted-foreground">
              Showing {events.length.toLocaleString()} event record/s.
            </p>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">School Year</th>
                  <th className="px-4 py-3">Attendees</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length ? (
                  events.map((event) => (
                    <tr key={event.id} className="border-t">
                      <td className="px-4 py-3 align-top">
                        <p className="font-black">{event.name}</p>
                        <p className="text-xs text-muted-foreground">Updated {formatDateTime(event.updated_at)}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold">{formatDateTime(event.event_start_at)}</p>
                        <p className="text-muted-foreground">to {formatDateTime(event.event_end_at)}</p>
                      </td>
                      <td className="px-4 py-3 align-top font-semibold">
                        {getSchoolYearLabel(schoolYears, event.school_year_id ?? "")}
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
                                {deletingEventId === event.id ? "Deleting..." : "Delete"}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete the selected attendance event record.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteEvent(event)}>
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
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
                      {isLoading ? "Loading events..." : "No events found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit event" : "Create event"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEvent} className="space-y-5">
            <label className="space-y-2 text-sm font-bold">
              <span>Event name</span>
              <Input
                value={form.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
                placeholder="Event name"
                className="min-h-12 rounded-2xl"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">
                <span>Start date and time</span>
                <Input
                  type="datetime-local"
                  value={form.eventStartAt}
                  onChange={(event) => handleFieldChange("eventStartAt", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                <span>End date and time</span>
                <Input
                  type="datetime-local"
                  value={form.eventEndAt}
                  onChange={(event) => handleFieldChange("eventEndAt", event.target.value)}
                  className="min-h-12 rounded-2xl"
                />
              </label>
            </div>

            <div className="min-w-0 space-y-2 text-sm font-bold">
              <span>School year</span>
              <Select value={form.schoolYearId} onValueChange={(value) => handleFieldChange("schoolYearId", value)}>
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-xs overflow-hidden rounded-2xl">
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent className="max-w-xs">
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="space-y-2 text-sm font-bold">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => handleFieldChange("description", event.target.value)}
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
              <Button type="submit" disabled={isSaving} className="min-h-12 rounded-2xl px-6 font-black">
                {isSaving ? "Saving..." : editingEvent ? "Update Event" : "Save Event"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}