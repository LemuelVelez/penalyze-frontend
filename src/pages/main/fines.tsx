import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import {
  createPenalty,
  deletePenalty,
  listFines,
  listPenalties,
  seedDefaultPenalties,
  updateFineStatus,
  updatePenalty
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
  AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type StatusFilter = FineStatus | "all";

type PenaltyFormState = {
  noOfAbsences: string;
  prescribedPenalty: string;
};

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "ALL STATUS" },
  { value: "unpaid", label: "UNPAID" },
  { value: "paid", label: "PAID" },
  { value: "waived", label: "WAIVED" }
];

const fineStatusOptions: Array<{ value: FineStatus; label: string }> = [
  { value: "unpaid", label: "UNPAID" },
  { value: "paid", label: "PAID" },
  { value: "waived", label: "WAIVED" }
];

const emptyPenaltyForm: PenaltyFormState = {
  noOfAbsences: "",
  prescribedPenalty: ""
};

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

function statusClass(status: FineStatus) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "waived") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function getFineStatusLabel(status: FineStatus) {
  return fineStatusOptions.find((item) => item.value === status)?.label ?? status.toUpperCase();
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
        <Button type="button" variant="destructiveOutline" disabled={props.isDeleting} className={props.className}>
          {props.isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete penalty rule?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the penalty rule for {props.penalty.no_of_absences} absence/s. This action
            cannot be undone.
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

export default function FinesPage() {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [studentId, setStudentId] = useState("");
  const [isLoadingFines, setIsLoadingFines] = useState(true);
  const [isLoadingPenalties, setIsLoadingPenalties] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [savingPenalty, setSavingPenalty] = useState(false);
  const [seedingPenalties, setSeedingPenalties] = useState(false);
  const [deletingPenaltyId, setDeletingPenaltyId] = useState("");
  const [editingPenaltyId, setEditingPenaltyId] = useState("");
  const [penaltyForm, setPenaltyForm] = useState<PenaltyFormState>(emptyPenaltyForm);
  const [error, setError] = useState("");
  const [penaltyError, setPenaltyError] = useState("");

  const totalFines = fines.length;
  const unpaidFines = useMemo(() => fines.filter((fine) => fine.status === "unpaid").length, [fines]);

  async function loadFines() {
    setIsLoadingFines(true);
    setError("");

    try {
      const rows = await listFines({
        status: status === "all" ? "" : status,
        studentId: studentId.trim() || undefined,
        limit: 100,
        offset: 0
      });

      setFines(rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load fines.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingFines(false);
    }
  }

  async function loadPenalties() {
    setIsLoadingPenalties(true);
    setPenaltyError("");

    try {
      const rows = await listPenalties();
      setPenalties(rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load penalties.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setIsLoadingPenalties(false);
    }
  }

  async function loadPageData() {
    await Promise.all([loadFines(), loadPenalties()]);
  }

  async function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFines();
  }

  async function handleResetFilters() {
    setStatus("all");
    setStudentId("");
    setIsLoadingFines(true);
    setError("");

    try {
      const rows = await listFines({
        limit: 100,
        offset: 0
      });
      setFines(rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load fines.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingFines(false);
    }
  }

  async function handleStatusChange(id: string, nextStatus: FineStatus) {
    setUpdatingId(id);
    setError("");

    try {
      const updated = await updateFineStatus(id, nextStatus);
      if (updated) {
        setFines((current) => current.map((fine) => (fine.id === id ? updated : fine)));
        toast.success("Fine status updated successfully.");
      }
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Unable to update fine status.";
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingId("");
    }
  }

  async function handlePenaltySubmit(event: FormEvent<HTMLFormElement>) {
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
            ? current.map((penalty) => (penalty.id === saved.id ? saved : penalty))
            : [...current, saved];

          return next.sort((first, second) => first.no_of_absences - second.no_of_absences);
        });
      }

      setEditingPenaltyId("");
      setPenaltyForm(emptyPenaltyForm);
      await loadFines();
      toast.success(successMessage);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save penalty.";
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
      prescribedPenalty: penalty.prescribed_penalty
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
      await loadFines();
      toast.success("Penalty rule deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete penalty.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setDeletingPenaltyId("");
    }
  }

  async function handleSeedPenalties() {
    setSeedingPenalties(true);
    setPenaltyError("");

    try {
      const rows = await seedDefaultPenalties();
      setPenalties(rows.sort((first, second) => first.no_of_absences - second.no_of_absences));
      await loadFines();
      toast.success("Default penalty rules seeded successfully.");
    } catch (seedError) {
      const message = seedError instanceof Error ? seedError.message : "Unable to seed default penalties.";
      setPenaltyError(message);
      toast.error(message);
    } finally {
      setSeedingPenalties(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Penalty records</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Fines</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Display existing student fines, filter records, update fine statuses, and manage penalty rules.
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Displayed fines</p>
            <p className="mt-2 text-3xl font-black">{isLoadingFines ? "—" : totalFines}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Displayed unpaid</p>
            <p className="mt-2 text-3xl font-black">{isLoadingFines ? "—" : unpaidFines}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Penalty rules</p>
            <p className="mt-2 text-3xl font-black">{isLoadingPenalties ? "—" : penalties.length}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current filter</p>
            <p className="mt-2 text-lg font-black uppercase">{status === "all" ? "All" : status}</p>
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

          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
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
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight">Existing Fines</h2>
              <p className="text-sm text-muted-foreground">Fines are loaded from the saved fine records.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingFines}
              onClick={loadFines}
              className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
            >
              Refresh Fines
            </Button>
          </div>

          <div className="space-y-3 lg:hidden">
            {fines.length ? (
              fines.map((fine) => (
                <article key={fine.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black">{fine.name}</p>
                      <p className="text-sm text-muted-foreground">{fine.student_id}</p>
                    </div>
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(fine.status)}`}>
                      {fine.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{fine.prescribed_penalty}</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold">
                      {fine.no_of_absences} absence/s • {formatDate(fine.created_at)}
                    </p>
                    <Select
                      value={fine.status}
                      disabled={updatingId === fine.id}
                      onValueChange={(value) => handleStatusChange(fine.id, value as FineStatus)}
                    >
                      <SelectTrigger className="min-h-10 rounded-xl border bg-card px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-40">
                        <SelectValue placeholder={getFineStatusLabel(fine.status)} />
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
                {isLoadingFines ? "Loading fine records..." : "No fine records found."}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Absences</th>
                  <th className="px-3 py-3">Penalty</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {fines.length ? (
                  fines.map((fine) => (
                    <tr key={fine.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3 font-semibold">{formatDate(fine.created_at)}</td>
                      <td className="px-3 py-3">{fine.student_id}</td>
                      <td className="px-3 py-3">{fine.name}</td>
                      <td className="px-3 py-3">{fine.no_of_absences}</td>
                      <td className="max-w-sm px-3 py-3 text-muted-foreground">{fine.prescribed_penalty}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(fine.status)}`}>
                          {fine.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={fine.status}
                          disabled={updatingId === fine.id}
                          onValueChange={(value) => handleStatusChange(fine.id, value as FineStatus)}
                        >
                          <SelectTrigger className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 lg:w-36">
                            <SelectValue placeholder={getFineStatusLabel(fine.status)} />
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
                    <td colSpan={7} className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground">
                      {isLoadingFines ? "Loading fine records..." : "No fine records found."}
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
              <h2 className="text-xl font-black tracking-tight">Penalty Rules</h2>
              <p className="text-sm text-muted-foreground">Create, read, update, and delete penalty rules used when fines are generated.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={seedingPenalties}
              onClick={handleSeedPenalties}
              className="min-h-10 rounded-2xl px-4 py-2 text-xs font-black"
            >
              {seedingPenalties ? "Seeding..." : "Seed Default Penalties"}
            </Button>
          </div>

          <form onSubmit={handlePenaltySubmit} className="mb-5 grid gap-3 rounded-2xl border bg-background p-4 lg:grid-cols-12">
            <Input
              type="number"
              min="1"
              value={penaltyForm.noOfAbsences}
              onChange={(event) => setPenaltyForm((current) => ({ ...current, noOfAbsences: event.target.value }))}
              placeholder="No. of Absences"
              className="min-h-12 rounded-2xl border bg-card px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:col-span-3"
            />
            <Input
              value={penaltyForm.prescribedPenalty}
              onChange={(event) => setPenaltyForm((current) => ({ ...current, prescribedPenalty: event.target.value }))}
              placeholder="Prescribed penalty"
              className="min-h-12 rounded-2xl border bg-card px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:col-span-6"
            />
            <Button
              type="submit"
              disabled={savingPenalty}
              className="min-h-12 rounded-2xl px-6 py-3 text-sm font-black lg:col-span-2"
            >
              {savingPenalty ? "Saving..." : editingPenaltyId ? "Update" : "Create"}
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
                <article key={penalty.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-muted-foreground">{penalty.no_of_absences} absence/s</p>
                      <p className="mt-1 font-black">{penalty.prescribed_penalty}</p>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">{formatDate(penalty.updated_at)}</p>
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
                      isDeleting={deletingPenaltyId === penalty.id}
                      onConfirm={handleDeletePenalty}
                      className="min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-black"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                {isLoadingPenalties ? "Loading penalty records..." : "No penalty records found."}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
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
                      <td className="px-3 py-3 font-black">{penalty.no_of_absences}</td>
                      <td className="max-w-xl px-3 py-3 text-muted-foreground">{penalty.prescribed_penalty}</td>
                      <td className="px-3 py-3 font-semibold">{formatDate(penalty.created_at)}</td>
                      <td className="px-3 py-3 font-semibold">{formatDate(penalty.updated_at)}</td>
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
                      isDeleting={deletingPenaltyId === penalty.id}
                      onConfirm={handleDeletePenalty}
                      className="min-h-10 rounded-xl px-4 py-2 text-xs font-black"
                    />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground">
                      {isLoadingPenalties ? "Loading penalty records..." : "No penalty records found."}
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