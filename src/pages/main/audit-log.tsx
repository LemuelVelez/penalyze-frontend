import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Calculator, CalendarDays, CalendarCheck2, CircleDollarSign, ClipboardCheck,
  ClipboardPenLine, CloudUpload, FileUp, FolderOpen, ListChecks,
  Search, ServerCog, ShieldCheck, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { listAuditLogCategories, listAuditLogs } from "../../api/auditLogs";
import type { AuditLogCategoryCount, AuditLogOutcome, AuditLogRecord } from "../../api/auditLogs";
import { SortSelect } from "../../components/sort-select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import type { SortOrder } from "../../lib/sort";
import { useSortOrderSearchParam } from "../../lib/sort";

const PAGE_SIZE = 50;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Authentication & Accounts": UsersRound,
  "School Years": CalendarDays,
  "Attendance Requests": ClipboardCheck,
  "Attendance Exemptions": ShieldCheck,
  "Attendance Events": CalendarCheck2,
  "Attendance Imports": FileUp,
  "Manual Attendance": ClipboardPenLine,
  "Attendance Records & Final Results": ListChecks,
  "Calculation Results": Calculator,
  "Penalties & Fines": CircleDollarSign,
  "Repository Sync": CloudUpload,
  "System": ServerCog,
  "Other": FolderOpen,
};

const CATEGORY_ORDER = [
  "Authentication & Accounts", "School Years", "Attendance Requests",
  "Attendance Exemptions", "Attendance Events", "Attendance Imports",
  "Manual Attendance", "Attendance Records & Final Results", "Calculation Results",
  "Penalties & Fines", "Repository Sync", "System", "Other",
];

type CategoryGroupState = {
  rows: AuditLogRecord[];
  page: number;
  totalPages: number;
  loading: boolean;
  loaded: boolean;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(date);
}

function formatActor(log: AuditLogRecord) {
  if (log.actor_name || log.actor_email) {
    return {
      name: log.actor_name || log.actor_email || "Unknown user",
      detail: [log.actor_email, log.actor_role].filter(Boolean).join(" • "),
    };
  }
  if (log.method === "SYSTEM" && !log.user_id && !log.actor_role) {
    return { name: "System (automatic)", detail: "Performed automatically by the server" };
  }
  if (log.user_id) {
    return { name: `User ${log.user_id}`, detail: log.actor_role || "Actor ID captured" };
  }
  return { name: "Unauthenticated", detail: "No signed-in user was attached" };
}

function actionSummary(log: AuditLogRecord): string | null {
  return typeof log.details?.summary === "string" && log.details.summary.trim()
    ? log.details.summary
    : null;
}

function outcomeLabel(statusCode: number) {
  return statusCode >= 200 && statusCode < 400 ? "Success" : "Failed";
}

function dateBoundary(value: string, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
}

function CategoryRecords({
  group, onSelectLog, onPageChange,
}: {
  group?: CategoryGroupState;
  onSelectLog: (log: AuditLogRecord) => void;
  onPageChange: (page: number) => void;
}) {
  const logs = group?.rows ?? [];
  const page = group?.page ?? 1;
  const totalPages = group?.totalPages ?? 1;
  const isLoading = !group || group.loading || !group.loaded;
  return (
      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="grid gap-3 p-3 md:grid-cols-2 lg:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground md:col-span-2">
              Loading audit logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground md:col-span-2">
              No audit records match the current filters.
            </div>
          ) : (
            logs.map((log) => {
              const actor = formatActor(log);
              const successful = log.status_code >= 200 && log.status_code < 400;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => onSelectLog(log)}
                  className="min-w-0 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-black" title={actor.name}>{actor.name}</p>
                      <p className="mt-0.5 truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] text-xs text-muted-foreground" title={actor.detail}>{actor.detail}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${successful ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
                      {outcomeLabel(log.status_code)} · {log.status_code}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Action</p>
                      <p className="mt-1 break-words font-semibold" title={log.action}>{log.action}</p>
                      {actionSummary(log) ? <p className="mt-1 break-words text-xs font-normal text-muted-foreground">{actionSummary(log)}</p> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Resource</p>
                      <p className="mt-1 break-words font-semibold" title={log.resource_type}>{log.resource_type}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Source</p>
                      <p className="mt-1 font-mono text-xs font-semibold">{log.method}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Date & time</p>
                      <p className="mt-1 text-xs font-semibold">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                  <p className="mt-3 truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] font-mono text-xs text-muted-foreground" title={log.route}>{log.route}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="table-scroll-hint hidden min-w-0 max-w-full overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 bg-muted/95 px-4 py-3 font-medium">Date &amp; time</th>
                <th className="sm:sticky sm:left-40 z-20 bg-muted/95 px-4 py-3 font-medium">Accountable user</th>
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
                      onClick={() => onSelectLog(log)}
                    >
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-4 py-3.5 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="sm:sticky sm:left-40 z-10 bg-background px-4 py-3.5">
                        <div className="font-medium">{actor.name}</div>
                        <div className="mt-0.5 max-w-64 truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] text-xs text-muted-foreground">{actor.detail}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium">
                        <div>{log.action}</div>
                        {actionSummary(log) ? <div className="mt-1 max-w-80 break-words text-xs font-normal text-muted-foreground">{actionSummary(log)}</div> : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <div>{log.resource_type}</div>
                        <div className="mt-0.5 max-w-44 truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] font-mono text-xs text-muted-foreground">{log.resource_id || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${successful ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
                          {outcomeLabel(log.status_code)} · {log.status_code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="break-all font-mono text-xs font-medium">{log.method}</div>
                        <div className="mt-0.5 max-w-56 truncate max-lg:overflow-visible max-lg:whitespace-normal max-lg:text-clip max-lg:[overflow-wrap:anywhere] font-mono text-xs text-muted-foreground">{log.route}</div>
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
            <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={page <= 1 || isLoading} onClick={() => onPageChange(Math.max(1, page - 1))}>
              Previous
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={page >= totalPages || isLoading} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
              Next
            </Button>
          </div>
        </div>
      </section>

  );
}

export default function AuditLogPage() {
  const [categories, setCategories] = useState<AuditLogCategoryCount[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, CategoryGroupState>>({});
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [outcome, setOutcome] = useState<AuditLogOutcome>("all");
  const [sortOrder, setSortOrder] = useSortOrderSearchParam();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const filtersKey = JSON.stringify([appliedSearch, outcome, sortOrder, fromDate, toDate]);
  const activeFiltersKey = useRef(filtersKey);
  activeFiltersKey.current = filtersKey;

  const from = dateBoundary(fromDate);
  const to = dateBoundary(toDate, true);

  useEffect(() => {
    let active = true;
    setGroups({});
    setCategories([]);
    setIsLoadingCategories(true);
    void listAuditLogCategories({ search: appliedSearch, outcome, from, to }).then((result) => {
      if (!active) return;
      setCategories(result.sort((a, b) => {
        const aOrder = CATEGORY_ORDER.indexOf(a.category);
        const bOrder = CATEGORY_ORDER.indexOf(b.category);
        return (aOrder < 0 ? CATEGORY_ORDER.length : aOrder) -
          (bOrder < 0 ? CATEGORY_ORDER.length : bOrder) || a.category.localeCompare(b.category);
      }));
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : "Unable to load audit categories.");
    }).finally(() => {
      if (active) setIsLoadingCategories(false);
    });
    return () => { active = false; };
  }, [filtersKey, appliedSearch, outcome, from, to]);

  const loadGroup = useCallback(async (category: string, page: number) => {
    const requestFiltersKey = filtersKey;
    setGroups((previous) => ({
      ...previous,
      [category]: {
        page, rows: previous[category]?.rows ?? [],
        totalPages: previous[category]?.totalPages ?? 1,
        loading: true, loaded: false,
      },
    }));
    try {
      const result = await listAuditLogs({
        category, page, limit: PAGE_SIZE, search: appliedSearch,
        outcome, sort: sortOrder, from, to,
      });
      if (activeFiltersKey.current !== requestFiltersKey) return;
      setGroups((previous) => {
        if (previous[category]?.page !== page) return previous;
        return {
          ...previous,
          [category]: { rows: result.rows, page, totalPages: result.meta.totalPages, loaded: true, loading: false },
        };
      });
    } catch (error) {
      if (activeFiltersKey.current !== requestFiltersKey) return;
      toast.error(error instanceof Error ? error.message : `Unable to load ${category} audit records.`);
      setGroups((previous) => {
        if (previous[category]?.page !== page) return previous;
        return {
          ...previous,
          [category]: { rows: [], page, totalPages: 1, loaded: true, loading: false },
        };
      });
    }
  }, [filtersKey, appliedSearch, outcome, sortOrder, from, to]);

  useEffect(() => {
    for (const { category } of categories) {
      if (!expanded.includes(category)) continue;
      const group = groups[category];
      if (!group || (!group.loading && !group.loaded)) {
        void loadGroup(category, group?.page ?? 1);
      }
    }
  }, [categories, expanded, groups, loadGroup]);

  const total = categories.reduce((sum, item) => sum + item.total, 0);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  function handleOutcomeChange(value: string) {
    setOutcome(value as AuditLogOutcome);
  }

  function handleSortChange(value: SortOrder) {
    setSortOrder(value);
  }

  function changePage(category: string, nextPage: number) {
    setGroups((previous) => {
      const group = previous[category];
      if (!group || group.page === nextPage) return previous;
      return { ...previous, [category]: {
        ...group, page: nextPage, rows: [], loading: false, loaded: false,
      } };
    });
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setOutcome("all");
    setSortOrder("newest");
    setFromDate("");
    setToDate("");
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-400 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="page-heading mb-6 flex min-w-0 flex-col flex-wrap gap-2 sm:flex-row sm:items-end sm:justify-between">
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
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,180px)_minmax(0,180px)_minmax(0,170px)_minmax(0,170px)_auto]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, resource, or route"
              className="min-h-11 min-w-0 rounded-xl"
            />
            <Button type="submit" variant="outline" size="icon" className="size-10 shrink-0 rounded-xl" aria-label="Search audit logs">
              <Search className="size-4" aria-hidden="true" />
            </Button>
          </form>
          <Select value={outcome} onValueChange={handleOutcomeChange}>
            <SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="success">Successful</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <SortSelect value={sortOrder} onValueChange={handleSortChange} ariaLabel="Sort audit logs" />
          <Input
            type="date" value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="h-10 rounded-xl" aria-label="From date"
          />
          <Input
            type="date" value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="h-10 rounded-xl" aria-label="To date"
          />
          <Button type="button" variant="ghost" onClick={clearFilters} className="h-10 rounded-xl px-4">Clear</Button>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={isLoadingCategories || categories.length === 0}
          onClick={() => setExpanded(categories.map((item) => item.category))}>
          Expand all
        </Button>
        <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={expanded.length === 0}
          onClick={() => setExpanded([])}>
          Collapse all
        </Button>
      </div>

      {isLoadingCategories ? (
        <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground">Loading audit categories...</div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground">No audit records match the current filters.</div>
      ) : (
        <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="gap-3">
          {categories.map(({ category, total: categoryTotal }) => {
            const Icon = CATEGORY_ICONS[category] ?? FolderOpen;
            return (
              <AccordionItem key={category} value={category} className="overflow-hidden rounded-2xl border bg-background shadow-sm last:border-b">
                <AccordionTrigger className="items-center gap-3 px-4 py-4 text-left text-sm hover:no-underline sm:px-5">
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="font-semibold">{category}</span>
                    <span className="shrink-0 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                      {categoryTotal.toLocaleString()}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  <CategoryRecords group={groups[category]} onSelectLog={setSelectedLog}
                    onPageChange={(nextPage) => changePage(category, nextPage)} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="min-w-0 max-w-full max-h-[85svh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit record details</DialogTitle>
            <DialogDescription>Review the captured action, actor, request, and audit details.</DialogDescription>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                <div><span className="text-xs text-muted-foreground">Action</span><div className="mt-1 font-medium">{selectedLog.action}</div></div>
                <div><span className="text-xs text-muted-foreground">Category</span><div className="mt-1 font-medium">{selectedLog.category}</div></div>
                <div className="sm:col-span-2"><span className="text-xs text-muted-foreground">Summary</span><div className="mt-1 break-words">{actionSummary(selectedLog) || "—"}</div></div>
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
                <pre className="max-h-80 min-w-0 max-w-full overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-5">
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
