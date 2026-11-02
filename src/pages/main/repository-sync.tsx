import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, GitCommitHorizontal, GitPullRequest, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import {
  downloadRepositoryWorkbook, listRepositoryWorkbooks, markRepositorySync,
} from "../../api/repositorySync";
import type { RepositorySyncStatus, RepositoryWorkbook } from "../../api/repositorySync";
import { listAttendanceImports, saveAttendanceFile } from "../../api/attendance";
import { CollegeSelectDialog } from "../../components/college-select-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { QR_CODE_COLLEGE_OPTIONS } from "../../lib/colleges";

const STATUSES: Record<RepositorySyncStatus, string> = {
  untracked: "Untracked", pending: "Pending upload", uploaded: "Uploaded to Penalyze ✓", outdated: "Outdated · modified since upload",
};
const MAX_SELECTION = 200;
const ALL_COLLEGES = "__all_colleges__";
const NO_COLLEGE = "__no_college__";
const WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function filenameKey(name: string) {
  return name.normalize("NFC").trim().toLocaleLowerCase();
}

// Match the Attendance page's duplicate guard across all school years before importing.
async function existingImportNames() {
  const names = new Set<string>();
  const pageSize = 250;
  for (let offset = 0; offset < 50_000; offset += pageSize) {
    const imports = await listAttendanceImports({ limit: pageSize, offset });
    for (const item of imports) {
      if (!item.deleted_at && item.status === "saved") names.add(filenameKey(item.file_name));
    }
    if (imports.length < pageSize) return names;
  }
  throw new Error("Cannot confirm the complete attendance import history. No files were uploaded.");
}

export default function RepositorySyncPage() {
  const [records, setRecords] = useState<RepositoryWorkbook[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<RepositorySyncStatus | "all">("all");
  const [collegeFilter, setCollegeFilter] = useState(ALL_COLLEGES);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [importId, setImportId] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
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
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 30000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const colleges = useMemo(() => Array.from(new Set(records.map((item) => item.college.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b)), [records]);
  const hasUnassignedCollege = records.some((item) => !item.college.trim());
  const visible = useMemo(() => records.filter((item) =>
    (status === "all" || item.penalyzeStatus === status) &&
    (collegeFilter === ALL_COLLEGES || (collegeFilter === NO_COLLEGE ? !item.college.trim() : item.college.trim() === collegeFilter)) &&
    `${item.originalName} ${item.college} ${item.representativeName}`.toLowerCase().includes(search.toLowerCase())),
  [records, status, collegeFilter, search]);
  const everyVisible = visible.length > 0 && visible.every((item) => selected.includes(item.id));
  const selectedWorkbooks = records.filter((item) => selected.includes(item.id));
  const selectedVisibleCount = visible.filter((item) => selected.includes(item.id)).length;
  const defaultUploadCollege = useMemo(() => {
    const unique = new Set(selectedWorkbooks.map((item) => item.college.trim()));
    const candidate = unique.size === 1 ? Array.from(unique)[0] : "";
    return QR_CODE_COLLEGE_OPTIONS.includes(candidate) ? candidate : "";
  }, [selectedWorkbooks]);

  const runAction = async (action: "pending" | "uploaded" | "reset", ids: string[]) => {
    if (!ids.length) { toast.error("Select one or more workbooks."); return; }
    if (ids.length > MAX_SELECTION) { toast.error(`Select at most ${MAX_SELECTION} workbooks per action.`); return; }
    setBusy(true);
    try {
      await markRepositorySync(action, ids, note.trim(), importId.trim());
      toast.success(action === "pending" ? "Marked pending upload." : action === "uploaded" ? "Marked uploaded to Penalyze." : "Sync status reset to untracked.");
      setSelected([]);
      await refresh(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sync status update failed."); }
    finally { setBusy(false); }
  };

  const uploadSelected = async (college: string) => {
    const workbooks = selectedWorkbooks.filter((item) => item.penalyzeStatus !== "uploaded");
    if (!workbooks.length) { toast.error("Select workbooks that are not already marked uploaded."); return; }
    if (workbooks.length > MAX_SELECTION) { toast.error(`Select at most ${MAX_SELECTION} workbooks.`); return; }
    setUploadErrors([]);
    setBusy(true);
    setUploadProgress("Checking existing Penalyze imports…");
    const errors: string[] = [];
    const uploadedIds: string[] = [];
    let imported = 0;
    try {
      // Do not accidentally import a workbook that was already saved from the Attendance page.
      const names = await existingImportNames();
      for (const [index, item] of workbooks.entries()) {
        setUploadProgress(`Uploading ${index + 1} of ${workbooks.length}: ${item.originalName}`);
        const name = filenameKey(item.originalName);
        if (names.has(name)) {
          errors.push(`${item.originalName}: Already exists in Penalyze. Review it in Attendance before marking it uploaded.`);
          continue;
        }
        try {
          const blob = await downloadRepositoryWorkbook(item.id);
          const file = new File([blob], item.originalName, { type: WORKBOOK_MIME });
          // Use Penalyze's existing transactional attendance import flow, not just a status change.
          const result = await saveAttendanceFile([file], { college });
          const savedFile = result?.files?.[0]?.result;
          if (result?.filesSaved !== 1 || !savedFile?.importId) {
            throw new Error("The attendance import did not confirm a saved file.");
          }
          imported += 1;
          names.add(name);
          try {
            await markRepositorySync("uploaded", [item.id], "Imported from Repository sync", savedFile.importId);
            uploadedIds.push(item.id);
          } catch (error) {
            errors.push(`${item.originalName}: Imported into Penalyze, but the repository status could not be updated: ${error instanceof Error ? error.message : "Unknown error"}. Do not import it again; mark it uploaded manually.`);
          }
        } catch (error) {
          errors.push(`${item.originalName}: ${error instanceof Error ? error.message : "Import failed"}. Review event merges or college assignments in Attendance if needed.`);
        }
      }
      if (imported) toast.success(`${imported} workbook${imported === 1 ? "" : "s"} imported into Penalyze.`);
      if (errors.length) toast.error(`${errors.length} workbook${errors.length === 1 ? " needs" : "s need"} attention. See details below.`);
      setSelected((previous) => previous.filter((id) => !uploadedIds.includes(id)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Could not check existing attendance imports.");
      toast.error(errors[errors.length - 1]);
    } finally {
      setUploadErrors(errors);
      setUploadProgress("");
      await refresh(true);
      setBusy(false);
    }
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
          <p className="mt-1 text-sm text-muted-foreground">Import repository workbooks directly into Penalyze and track their sync status.</p>
        </div>
        <Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw className="size-4" /> Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["untracked", "pending", "uploaded", "outdated"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(status === value ? "all" : value)}
            className={`rounded-xl border p-4 text-left transition hover:bg-accent/50 ${status === value ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className="text-sm text-muted-foreground">{STATUSES[value]}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{records.filter((item) => item.penalyzeStatus === value && (collegeFilter === ALL_COLLEGES || (collegeFilter === NO_COLLEGE ? !item.college.trim() : item.college.trim() === collegeFilter))).length}</div>
          </button>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="min-w-48 flex-1" placeholder="Search filename or college..." aria-label="Search workbooks" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={collegeFilter} onValueChange={setCollegeFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="College" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COLLEGES}>All colleges</SelectItem>
              {colleges.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
              {hasUnassignedCollege && <SelectItem value={NO_COLLEGE}>Unspecified college</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as RepositorySyncStatus | "all")}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Sync status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["untracked", "pending", "uploaded", "outdated"] as const).map((value) => <SelectItem key={value} value={value}>{STATUSES[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Checkbox checked={everyVisible} disabled={busy} onCheckedChange={(checked) => setSelected(checked ? Array.from(new Set([...selected, ...visible.map((item) => item.id)])) : selected.filter((id) => !visible.some((item) => item.id === id)))} aria-label="Select all visible workbooks" />
          <span>{selected.length} selected · {visible.length} visible</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={!selected.length || busy}>Clear selection</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !selected.some((id) => records.some((item) => item.id === id && item.penalyzeStatus !== "uploaded")) || selected.length > MAX_SELECTION}
            onClick={() => setUploadDialogOpen(true)}><Upload className="size-4" /> Upload selected to Penalyze</Button>
          <Button disabled={busy || !selected.length} variant="outline" onClick={() => void runAction("pending", selected)}><GitPullRequest className="size-4" /> Mark pending</Button>
          <Button disabled={busy || !selected.length} variant="outline" onClick={() => void runAction("uploaded", selected)}><GitCommitHorizontal className="size-4" /> Mark uploaded</Button>
          <Button disabled={busy || !selected.length} variant="outline" onClick={() => void runAction("reset", selected)}><RotateCcw className="size-4" /> Reset to untracked</Button>
          <Link to="/attendance" className="ml-auto inline-flex items-center text-sm text-primary underline-offset-4 hover:underline">Go to attendance imports</Link>
        </div>
        {uploadProgress && <p role="status" className="text-sm font-medium text-primary">{uploadProgress}</p>}
        {uploadErrors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-semibold">Files needing attention ({uploadErrors.length})</p>
            <ul className="list-disc space-y-1 pl-5">{uploadErrors.map((message, index) => <li key={index} className="break-words">{message}</li>)}</ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Selected workbooks are transferred and saved as attendance imports automatically after you choose a college. Files already imported or needing event review are not imported again. Limit: 200 selected files.</p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Manual sync status options</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input placeholder="Optional Penalyze import UUID" aria-label="Penalyze import ID" value={importId} onChange={(e) => setImportId(e.target.value)} />
            <Input placeholder="Optional upload note" aria-label="Upload note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
          </div>
        </details>
      </section>
      <section className="space-y-2" aria-label="Repository workbooks">
        {loading ? <p className="text-sm text-muted-foreground">Checking repository workbooks…</p> : visible.length === 0 ? <p className="rounded-xl border p-8 text-center text-muted-foreground">No workbooks match this view.</p> :
          visible.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
              <Checkbox disabled={busy} checked={selected.includes(item.id)} onCheckedChange={(checked) => setSelected((prev) => checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))} aria-label={`Select ${item.originalName}`} />
              <div className="min-w-48 flex-1 space-y-1">
                <div className="break-words font-medium">{item.originalName}</div>
                <div className="text-xs text-muted-foreground">{item.college || "No college"} · {item.rowCount} rows · Updated {new Date(item.updatedAt).toLocaleString()}</div>
                {item.penalyzeUploadedAt && <div className="text-xs text-muted-foreground">Marked uploaded {new Date(item.penalyzeUploadedAt).toLocaleString()}{item.penalyzeUploadedBy ? ` by ${item.penalyzeUploadedBy}` : ""}</div>}
              </div>
              <Badge variant="outline" className={item.penalyzeStatus === "uploaded" ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-700" : ""}>
                {STATUSES[item.penalyzeStatus]}
              </Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void download(item)}><Download className="size-4" /> .xlsx</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runAction("pending", [item.id])}>Pending</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runAction("uploaded", [item.id])}>Uploaded</Button>
            </div>
          ))}
      </section>
      <p className="text-xs text-muted-foreground">Repository metadata is checked every 30 seconds while this tab is visible. Successful imports are marked uploaded automatically.</p>
      {selectedVisibleCount > 0 && <span className="sr-only">{selectedVisibleCount} visible workbooks selected</span>}
      <CollegeSelectDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        title="Upload selected workbooks to Penalyze"
        description={`Choose the default college for ${selectedWorkbooks.filter((item) => item.penalyzeStatus !== "uploaded").length} selected workbook(s). Imports use Penalyze's attendance processing. Files needing manual event or row review will be skipped with an explanation.`}
        confirmLabel="Upload to Penalyze"
        initialCollege={defaultUploadCollege}
        onConfirm={(college) => { void uploadSelected(college); }}
      />
    </main>
  );
}
