import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, GitCommitHorizontal, GitPullRequest, RefreshCw, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  downloadRepositoryWorkbook, listRepositoryWorkbooks, markRepositorySync,
} from "../../api/repositorySync";
import type { RepositorySyncStatus, RepositoryWorkbook } from "../../api/repositorySync";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

const STATUSES: Record<RepositorySyncStatus, string> = {
  untracked: "Untracked", pending: "Pending upload", uploaded: "Uploaded to Penalyze ✓", outdated: "Outdated · modified since upload",
};

export default function RepositorySyncPage() {
  const [records, setRecords] = useState<RepositoryWorkbook[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<RepositorySyncStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [importId, setImportId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const uploads = await listRepositoryWorkbooks();
      setRecords(uploads);
      setSelected((previous) => previous.filter((id) => uploads.some((item) => item.id === id)));
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not reach AttendanceRepository.");
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    // Watch metadata for new/changed workbooks. All status changes remain manual.
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 30000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const visible = useMemo(() => records.filter((item) => (status === "all" || item.penalyzeStatus === status) &&
    `${item.originalName} ${item.college} ${item.representativeName}`.toLowerCase().includes(search.toLowerCase())), [records, status, search]);
  const selectedVisible = visible.filter((item) => selected.includes(item.id));
  const everyVisible = visible.length > 0 && visible.every((item) => selected.includes(item.id));

  const runAction = async (action: "pending" | "uploaded" | "reset", ids: string[]) => {
    if (!ids.length) { toast.error("Select one or more workbooks."); return; }
    if (ids.length > 200) { toast.error("Select at most 200 workbooks per action."); return; }
    setBusy(true);
    try {
      await markRepositorySync(action, ids, note.trim(), importId.trim());
      toast.success(action === "pending" ? "Marked pending upload." : action === "uploaded" ? "Marked uploaded to Penalyze." : "Sync status reset to untracked.");
      setSelected([]);
      await refresh(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sync status update failed."); }
    finally { setBusy(false); }
  };

  const download = async (item: RepositoryWorkbook) => {
    try {
      const blob = await downloadRepositoryWorkbook(item.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Download failed."); }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-16 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repository sync</h1>
          <p className="mt-1 text-sm text-muted-foreground">Watch AttendanceRepository workbooks and manually track their Penalyze import status.</p>
        </div>
        <Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw className="size-4" /> Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["untracked", "pending", "uploaded", "outdated"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(status === value ? "all" : value)}
            className={`rounded-xl border p-4 text-left transition hover:bg-accent/50 ${status === value ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className="text-sm text-muted-foreground">{STATUSES[value]}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{records.filter((item) => item.penalyzeStatus === value).length}</div>
          </button>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="min-w-48 flex-1" placeholder="Search filename or college..." aria-label="Search workbooks" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={status} onValueChange={(value) => setStatus(value as RepositorySyncStatus | "all")}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Sync status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["untracked", "pending", "uploaded", "outdated"] as const).map((value) => <SelectItem key={value} value={value}>{STATUSES[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Checkbox checked={everyVisible} onCheckedChange={(checked) => setSelected(checked ? Array.from(new Set([...selected, ...visible.map((item) => item.id)])) : selected.filter((id) => !visible.some((item) => item.id === id)))} aria-label="Select all visible workbooks" />
          <span>{selected.length} selected · {visible.length} visible</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>Clear selection</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Optional Penalyze import UUID" aria-label="Penalyze import ID" value={importId} onChange={(e) => setImportId(e.target.value)} />
          <Input placeholder="Optional upload note" aria-label="Upload note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !selected.length} variant="outline" onClick={() => void runAction("pending", selected)}><GitPullRequest className="size-4" /> Mark pending</Button>
          <Button disabled={busy || !selected.length} onClick={() => void runAction("uploaded", selected)}><GitCommitHorizontal className="size-4" /> Mark uploaded</Button>
          <Button disabled={busy || !selected.length} variant="outline" onClick={() => void runAction("reset", selected)}><RotateCcw className="size-4" /> Reset to untracked</Button>
          <Link to="/attendance" className="ml-auto inline-flex items-center text-sm text-primary underline-offset-4 hover:underline">Go to attendance imports</Link>
        </div>
        <p className="text-xs text-muted-foreground">Mark uploaded only after you have imported the downloaded workbook into Penalyze. No automatic import is performed. Selected operations apply to at most 200 files.</p>
      </section>
      <section className="space-y-2" aria-label="Repository workbooks">
        {loading ? <p className="text-sm text-muted-foreground">Checking repository workbooks…</p> : visible.length === 0 ? <p className="rounded-xl border p-8 text-center text-muted-foreground">No workbooks match this view.</p> :
          visible.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
              <Checkbox checked={selected.includes(item.id)} onCheckedChange={(checked) => setSelected((prev) => checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))} aria-label={`Select ${item.originalName}`} />
              <div className="min-w-48 flex-1 space-y-1">
                <div className="break-words font-medium">{item.originalName}</div>
                <div className="text-xs text-muted-foreground">{item.college} · {item.rowCount} rows · Updated {new Date(item.updatedAt).toLocaleString()}</div>
                {item.penalyzeUploadedAt && <div className="text-xs text-muted-foreground">Marked uploaded {new Date(item.penalyzeUploadedAt).toLocaleString()}{item.penalyzeUploadedBy ? ` by ${item.penalyzeUploadedBy}` : ""}</div>}
              </div>
              <Badge variant={item.penalyzeStatus === "uploaded" ? "default" : "outline"}>
                {item.penalyzeStatus === "uploaded" && <Check className="mr-1 size-3" />}{STATUSES[item.penalyzeStatus]}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => void download(item)}><Download className="size-4" /> .xlsx</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runAction("pending", [item.id])}>Pending</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runAction("uploaded", [item.id])}>Uploaded</Button>
            </div>
          ))}
      </section>
      <p className="text-xs text-muted-foreground">Repository metadata is checked every 30 seconds while this tab is visible. Statuses are stored in AttendanceRepository.</p>
      {selectedVisible.length > 0 && <span className="sr-only">{selectedVisible.length} visible workbooks selected</span>}
    </main>
  );
}
