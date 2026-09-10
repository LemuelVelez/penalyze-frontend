import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { listAuditLogs } from "../../api/auditLogs";
import type { AuditLogOutcome, AuditLogRecord } from "../../api/auditLogs";
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

const PAGE_SIZE = 50;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatActor(log: AuditLogRecord) {
  if (log.actor_name || log.actor_email) {
    return {
      name: log.actor_name || log.actor_email || "Unknown user",
      detail: [log.actor_email, log.actor_role].filter(Boolean).join(" • "),
    };
  }

  return { name: "Unauthenticated", detail: "No signed-in user was attached" };
}

function outcomeLabel(statusCode: number) {
  return statusCode >= 200 && statusCode < 400 ? "Success" : "Failed";
}

function dateBoundary(value: string, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [outcome, setOutcome] = useState<AuditLogOutcome>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await listAuditLogs({
        page,
        limit: PAGE_SIZE,
        search: appliedSearch,
        outcome,
        from: dateBoundary(fromDate),
        to: dateBoundary(toDate, true),
      });

      setLogs(result.rows);
      setTotal(result.meta.total);
      setTotalPages(result.meta.totalPages);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load audit logs.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, fromDate, outcome, page, toDate]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  function handleOutcomeChange(value: string) {
    setPage(1);
    setOutcome(value as AuditLogOutcome);
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setOutcome("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Accountability</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review who performed system changes, what they changed, and whether each action succeeded.
          </p>
        </div>
        <div className="rounded-xl border bg-background px-4 py-2 text-sm shadow-sm">
          <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
          <span className="ml-1.5 text-muted-foreground">record{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      <section className="mb-5 rounded-2xl border bg-background p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_170px_170px_auto]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, resource, or route"
              className="h-10 min-w-0 rounded-xl"
            />
            <Button type="submit" variant="outline" size="icon" className="size-10 shrink-0 rounded-xl" aria-label="Search audit logs">
              <Search className="size-4" aria-hidden="true" />
            </Button>
          </form>

          <Select value={outcome} onValueChange={handleOutcomeChange}>
            <SelectTrigger className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="success">Successful</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setPage(1);
              setFromDate(event.target.value);
            }}
            className="h-10 rounded-xl"
            aria-label="From date"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(event) => {
              setPage(1);
              setToDate(event.target.value);
            }}
            className="h-10 rounded-xl"
            aria-label="To date"
          />
          <Button type="button" variant="ghost" onClick={clearFilters} className="h-10 rounded-xl px-4">
            Clear
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date &amp; time</th>
                <th className="px-4 py-3 font-medium">Accountable user</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-muted-foreground">Loading audit logs...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-muted-foreground">No audit records match the current filters.</td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actor = formatActor(log);
                  const successful = log.status_code >= 200 && log.status_code < 400;

                  return (
                    <tr
                      key={log.id}
                      className="cursor-pointer transition-colors hover:bg-muted/35"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium">{actor.name}</div>
                        <div className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground">{actor.detail}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium">{log.action}</td>
                      <td className="px-4 py-3.5">
                        <div>{log.resource_type}</div>
                        <div className="mt-0.5 max-w-44 truncate font-mono text-xs text-muted-foreground">{log.resource_id || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${successful ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
                          {outcomeLabel(log.status_code)} · {log.status_code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-medium">{log.method}</div>
                        <div className="mt-0.5 max-w-56 truncate font-mono text-xs text-muted-foreground">{log.route}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · showing up to {PAGE_SIZE} records
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={page >= totalPages || isLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
              Next
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit record details</DialogTitle>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                <div><span className="text-xs text-muted-foreground">Action</span><div className="mt-1 font-medium">{selectedLog.action}</div></div>
                <div><span className="text-xs text-muted-foreground">Timestamp</span><div className="mt-1">{formatDateTime(selectedLog.created_at)}</div></div>
                <div><span className="text-xs text-muted-foreground">Actor</span><div className="mt-1">{formatActor(selectedLog).name}</div></div>
                <div><span className="text-xs text-muted-foreground">Email</span><div className="mt-1 break-all">{selectedLog.actor_email || "—"}</div></div>
                <div><span className="text-xs text-muted-foreground">Resource</span><div className="mt-1">{selectedLog.resource_type}</div></div>
                <div><span className="text-xs text-muted-foreground">Resource ID</span><div className="mt-1 break-all font-mono text-xs">{selectedLog.resource_id || "—"}</div></div>
                <div><span className="text-xs text-muted-foreground">Request</span><div className="mt-1 break-all font-mono text-xs">{selectedLog.method} {selectedLog.route}</div></div>
                <div><span className="text-xs text-muted-foreground">IP address</span><div className="mt-1 font-mono text-xs">{selectedLog.ip_address || "—"}</div></div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Captured details</div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-5">
                  {JSON.stringify(selectedLog.details ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
