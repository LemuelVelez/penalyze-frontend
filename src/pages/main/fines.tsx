import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { listFines, updateFineStatus } from "../../api/fines";
import type { FineRecord, FineStatus } from "../../api/fines";

const statuses: Array<FineStatus | ""> = ["", "unpaid", "paid", "waived"];

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

export default function FinesPage() {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [status, setStatus] = useState<FineStatus | "">("");
  const [studentId, setStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  async function loadFines() {
    setIsLoading(true);
    setError("");

    try {
      const rows = await listFines({
        status,
        studentId: studentId.trim() || undefined,
        limit: 100,
        offset: 0
      });

      setFines(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load fines.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFines();
  }

  async function handleStatusChange(id: string, nextStatus: FineStatus) {
    setUpdatingId(id);
    setError("");

    try {
      const updated = await updateFineStatus(id, nextStatus);
      if (updated) {
        setFines((current) => current.map((fine) => (fine.id === id ? updated : fine)));
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update fine status.");
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    void loadFines();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Penalty records</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Fines</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Search, filter, and update student fine statuses from desktop or mobile screens.
          </p>
        </div>

        <form
          onSubmit={handleFilter}
          className="mb-6 flex flex-col gap-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5 lg:flex-row"
        >
          <input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="Search by Student ID"
            className="min-h-12 rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:flex-1"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as FineStatus | "")}
            className="min-h-12 rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 lg:w-56"
          >
            {statuses.map((item) => (
              <option key={item || "all"} value={item}>
                {item ? item.toUpperCase() : "ALL STATUS"}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Apply Filter"}
          </button>
        </form>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
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
                    <select
                      value={fine.status}
                      disabled={updatingId === fine.id}
                      onChange={(event) => handleStatusChange(fine.id, event.target.value as FineStatus)}
                      className="min-h-10 rounded-xl border bg-card px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="unpaid">UNPAID</option>
                      <option value="paid">PAID</option>
                      <option value="waived">WAIVED</option>
                    </select>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                No fine records found.
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
                        <select
                          value={fine.status}
                          disabled={updatingId === fine.id}
                          onChange={(event) => handleStatusChange(fine.id, event.target.value as FineStatus)}
                          className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="unpaid">UNPAID</option>
                          <option value="paid">PAID</option>
                          <option value="waived">WAIVED</option>
                        </select>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground">
                      No fine records found.
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