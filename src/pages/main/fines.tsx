import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  createPenalty,
  deletePenalty,
  listPenalties,
  listPenaltyResults,
  refreshPenaltyResults,
  seedDefaultPenalties,
  updatePenalty,
  updatePenaltyResultStatus,
} from "../../api/fines";
import type {
  FineStatus,
  PenaltyRecord,
  PenaltyResultRecord,
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

type StatusFilter = FineStatus | "all";

const emptyPenaltyForm: PenaltyFormState = {
  id: "",
  noOfAbsences: "",
  prescribedPenalty: "",
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

export default function FinesPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] =
    useState(ALL_YEARS_VALUE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collegeFilter, setCollegeFilter] = useState("__all_colleges__");
  const [penaltyResults, setPenaltyResults] = useState<PenaltyResultRecord[]>(
    [],
  );
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [penaltyForm, setPenaltyForm] =
    useState<PenaltyFormState>(emptyPenaltyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingResults, setIsRefreshingResults] = useState(false);
  const [isSavingPenalty, setIsSavingPenalty] = useState(false);
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState("");

  const selectedSchoolYearLabel = useMemo(() => {
    return getSchoolYearLabel(schoolYears, selectedSchoolYearId);
  }, [schoolYears, selectedSchoolYearId]);

  const collegeOptions = useMemo(() => {
    const colleges = penaltyResults
      .map(getPenaltyResultCollege)
      .filter(Boolean);

    return Array.from(new Set(colleges)).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [penaltyResults]);

  const filteredPenaltyResults = useMemo(() => {
    return penaltyResults.filter((result) => {
      const matchesStatus =
        statusFilter === "all" || result.status === statusFilter;
      const matchesCollege =
        collegeFilter === "__all_colleges__" ||
        getPenaltyResultCollege(result) === collegeFilter;

      return matchesStatus && matchesCollege;
    });
  }, [penaltyResults, statusFilter, collegeFilter]);

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
      const [schoolYearRows, penaltyRows, penaltyResultRows] =
        await Promise.all([
          listSchoolYears(),
          listPenalties(),
          listPenaltyResults({
            schoolYearId:
              nextSchoolYearId === ALL_YEARS_VALUE
                ? undefined
                : nextSchoolYearId,
            limit: 500,
            offset: 0,
          }),
        ]);

      setSchoolYears(schoolYearRows);
      setPenalties(penaltyRows);
      setPenaltyResults(penaltyResultRows);
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

  async function handleSchoolYearChange(value: string) {
    setSelectedSchoolYearId(value);
    await loadPageData(value);
  }

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
        current.map((item) =>
          item.id === result.id && updated ? updated : item,
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
              <Select
                value={selectedSchoolYearId}
                onValueChange={handleSchoolYearChange}
              >
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="School year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS_VALUE}>
                    All school years
                  </SelectItem>
                  {schoolYears.map((schoolYear) => (
                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

              <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                <SelectTrigger className="min-h-12 w-full min-w-0 max-w-64 rounded-2xl">
                  <SelectValue placeholder="College" />
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

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl border bg-card p-5 md:col-span-2">
            <p className="text-sm font-bold text-muted-foreground">
              School Year
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
            <Button
              type="button"
              onClick={handleRefreshPenaltyResults}
              disabled={isRefreshingResults}
              className="min-h-12 rounded-2xl px-6 font-black"
            >
              {isRefreshingResults
                ? "Refreshing..."
                : "Refresh Penalty Results"}
            </Button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Absences</th>
                  <th className="px-4 py-3">Prescribed Penalty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredPenaltyResults.length ? (
                  filteredPenaltyResults.map((result) => (
                    <tr key={result.id} className="border-t">
                      <td className="px-4 py-3 font-black">
                        {result.student_id}
                      </td>
                      <td className="px-4 py-3 font-semibold">{result.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {getPenaltyResultCollege(result) || "—"}
                      </td>
                      <td className="px-4 py-3 font-black">
                        {result.no_of_absences}
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
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
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