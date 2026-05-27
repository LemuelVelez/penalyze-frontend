
import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  listAttendanceFinalResults,
  listAttendanceImports,
  listManualAttendanceRecords,
} from "../../api/attendance";
import type {
  AttendanceFinalResultRecord,
  AttendanceImportRecord,
  ManualAttendanceRecord,
} from "../../api/attendance";
import {
  assignCurrentRecordsToSchoolYear,
  deleteSchoolYearRecords,
  getActiveSchoolYearId,
  getSchoolYearLabel,
  listSchoolYears,
  saveSchoolYear,
} from "../../api/schoolYears";
import type { SchoolYearRecord } from "../../api/schoolYears";
import { listPenaltyResults } from "../../api/fines";
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
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type SchoolYearFormState = {
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const emptyForm: SchoolYearFormState = {
  name: "",
  startsAt: "",
  endsAt: "",
  isActive: false,
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

export default function HistoryPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [imports, setImports] = useState<AttendanceImportRecord[]>([]);
  const [finalResults, setFinalResults] = useState<AttendanceFinalResultRecord[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualAttendanceRecord[]>([]);
  const [penaltyResults, setPenaltyResults] = useState<PenaltyResultRecord[]>([]);
  const [form, setForm] = useState<SchoolYearFormState>(() => {
    const name = getDefaultSchoolYearName();
    const dates = getDefaultSchoolYearDates(name);

    return {
      ...emptyForm,
      name,
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    };
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSchoolYear, setIsSavingSchoolYear] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedSchoolYear = useMemo(() => {
    return schoolYears.find((schoolYear) => schoolYear.id === selectedSchoolYearId) ?? null;
  }, [schoolYears, selectedSchoolYearId]);

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const summary = useMemo(() => {
    return {
      imports: imports.length,
      finalResults: finalResults.length,
      manualRecords: manualRecords.length,
      penaltyResults: penaltyResults.length,
      absences: finalResults.reduce((total, record) => total + Number(record.total_absences || 0), 0),
    };
  }, [imports, finalResults, manualRecords, penaltyResults]);

  async function loadHistory(nextSchoolYearId = selectedSchoolYearId) {
    setIsLoading(true);

    try {
      const schoolYearRows = await listSchoolYears();
      const fallbackSchoolYearId = nextSchoolYearId || getActiveSchoolYearId(schoolYearRows) || schoolYearRows[0]?.id || "";
      const [importRows, finalRows, manualRows, penaltyRows] = fallbackSchoolYearId
        ? await Promise.all([
            listAttendanceImports({ schoolYearId: fallbackSchoolYearId, limit: 100, offset: 0 }),
            listAttendanceFinalResults({ schoolYearId: fallbackSchoolYearId, limit: 500, offset: 0 }),
            listManualAttendanceRecords({ schoolYearId: fallbackSchoolYearId, limit: 500, offset: 0 }),
            listPenaltyResults({ schoolYearId: fallbackSchoolYearId, limit: 500, offset: 0 }),
          ])
        : [[], [], [], []];

      setSchoolYears(schoolYearRows);
      setSelectedSchoolYearId(fallbackSchoolYearId);
      setImports(importRows);
      setFinalResults(finalRows);
      setManualRecords(manualRows);
      setPenaltyResults(penaltyRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load history records.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    await loadHistory(value);
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

  async function handleCreateSchoolYear(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("School year name is required.");
      return;
    }

    setIsSavingSchoolYear(true);

    try {
      const saved = await saveSchoolYear({
        name: form.name.trim(),
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        isActive: form.isActive,
      });

      toast.success("School year saved.");
      setSelectedSchoolYearId(saved?.id ?? selectedSchoolYearId);
      await loadHistory(saved?.id ?? selectedSchoolYearId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save school year.");
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
      toast.error(error instanceof Error ? error.message : "Unable to assign records.");
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
      toast.error(error instanceof Error ? error.message : "Unable to delete school-year records.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                History
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                School-year record history
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Create school years, assign current records, filter records by school year, and delete records that belong to a selected school year.
              </p>
            </div>

            <Select value={selectedSchoolYearId} onValueChange={handleSchoolYearChange}>
              <SelectTrigger className="min-h-12 rounded-2xl lg:w-80">
                <SelectValue placeholder="Select school year" />
              </SelectTrigger>
              <SelectContent>
                {schoolYears.map((schoolYear) => (
                  <SelectItem key={schoolYear.id} value={schoolYear.id}>
                    {schoolYear.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl border bg-card p-5 md:col-span-2">
            <p className="text-sm font-bold text-muted-foreground">Selected School Year</p>
            <p className="mt-2 text-2xl font-black">{selectedSchoolYearLabel}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedSchoolYear ? `${formatDate(selectedSchoolYear.starts_at)} - ${formatDate(selectedSchoolYear.ends_at)}` : "No school year selected"}
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Uploaded Files</p>
            <p className="mt-2 text-2xl font-black">{summary.imports.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Final Results</p>
            <p className="mt-2 text-2xl font-black">{summary.finalResults.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-bold text-muted-foreground">Penalty Results</p>
            <p className="mt-2 text-2xl font-black">{summary.penaltyResults.toLocaleString()}</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCreateSchoolYear} className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-black">Create school year</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-bold">School year name</span>
                <Input
                  value={form.name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="2025-2026"
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">Start date</span>
                <Input
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold">End date</span>
                <Input
                  type="date"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                  className="min-h-12 rounded-2xl"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border bg-background p-4 sm:col-span-2">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(value) => setForm((current) => ({ ...current, isActive: Boolean(value) }))}
                />
                <span className="text-sm font-bold">Set as active school year</span>
              </label>
            </div>

            <Button type="submit" disabled={isSavingSchoolYear} className="mt-5 min-h-12 rounded-2xl px-6 font-black">
              {isSavingSchoolYear ? "Saving..." : "Save School Year"}
            </Button>
          </form>

          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-black">School-year actions</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Assign current unassigned records to the selected school year, or delete all records under the selected school year.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <Button
                type="button"
                onClick={handleAssignCurrentRecords}
                disabled={isAssigning || !selectedSchoolYearId}
                className="min-h-12 rounded-2xl px-6 font-black"
              >
                {isAssigning ? "Assigning..." : "Assign Current Records"}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isDeleting || !selectedSchoolYearId}
                    className="min-h-12 rounded-2xl px-6 font-black"
                  >
                    {isDeleting ? "Deleting..." : "Delete Records by School Year"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete selected school-year records?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This deletes attendance imports, attendance records, final results, manual records, fines, and penalty results assigned to this school year.
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
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-black">Filtered records</h2>
            <p className="text-sm text-muted-foreground">
              Showing records assigned to {selectedSchoolYearLabel}.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-background p-4">
              <h3 className="font-black">Uploaded files</h3>
              <div className="mt-3 space-y-3">
                {imports.length ? (
                  imports.map((item) => (
                    <article key={item.id} className="rounded-xl border bg-card p-3">
                      <p className="font-bold">{item.file_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.rows_valid} valid row/s • {formatDate(item.created_at)}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">
                    {isLoading ? "Loading records..." : "No uploaded files for this school year."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <h3 className="font-black">Penalty results</h3>
              <div className="mt-3 space-y-3">
                {penaltyResults.length ? (
                  penaltyResults.slice(0, 10).map((item) => (
                    <article key={item.id} className="rounded-xl border bg-card p-3">
                      <p className="font-bold">{item.student_id} • {item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.no_of_absences} absence/s • {item.prescribed_penalty}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">
                    {isLoading ? "Loading records..." : "No penalty results for this school year."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <h3 className="font-black">Final attendance results</h3>
              <div className="mt-3 space-y-3">
                {finalResults.length ? (
                  finalResults.slice(0, 10).map((item) => (
                    <article key={item.id} className="rounded-xl border bg-card p-3">
                      <p className="font-bold">{item.student_id} • {item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.total_absences} absence/s • {item.attended_events} attended event/s
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">
                    {isLoading ? "Loading records..." : "No final attendance results for this school year."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <h3 className="font-black">Manual attendance records</h3>
              <div className="mt-3 space-y-3">
                {manualRecords.length ? (
                  manualRecords.slice(0, 10).map((item) => (
                    <article key={item.id} className="rounded-xl border bg-card p-3">
                      <p className="font-bold">{item.student_id} • {item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.attendance_type === "zero_attendance" ? "Zero attendance" : "Manual attendance"} • {item.college || "No college"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">
                    {isLoading ? "Loading records..." : "No manual records for this school year."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}