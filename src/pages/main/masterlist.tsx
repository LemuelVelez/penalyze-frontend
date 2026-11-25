import { invalidateMasterlistStatus } from "../../lib/use-masterlist-status";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { listSchoolYears, type SchoolYearRecord } from "../../api/schoolYears";
import { listMasterlist, uploadMasterlistWithProgress, resumeMasterlistUploadWithProgress, discardMasterlistUpload, reconcileMasterlistWithProgress, deleteMasterlist, isMasterlistTerm, type MasterlistSummary, type MasterlistProgress } from "../../api/masterlist";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FilePicker } from "../../components/ui/file-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { LoadingStatus, type LoadingStatusStep } from "../../components/loading-status";
import { ProtectedDeleteDialog } from "../../components/protected-delete-dialog";
import { QR_CODE_COLLEGE_OPTIONS } from "../../lib/colleges";
import { QR_CODE_YEAR_LEVEL_OPTIONS } from "../../lib/year-levels";

export function MasterlistSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}<Select value={value || "__all"} onValueChange={v => onChange(v === "__all" ? "" : v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">All {label.toLowerCase()}</SelectItem>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></label>;
}
export function MasterlistPager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 50));
  return <div className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm"><span>{total} records · Page {page + 1} of {pages}</span><div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</Button><Button variant="outline" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>Next</Button></div></div>;
}
export default function MasterlistPage() {
  const [active, setActive] = useState<SchoolYearRecord | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof listMasterlist>> | null>(null);
  const [summary, setSummary] = useState<MasterlistSummary | null>(null);
  const [search, setSearch] = useState(""); const [college, setCollege] = useState(""); const [yearLevel, setYearLevel] = useState(""); const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<"upload" | "resume" | "reconcile" | "delete" | "discard" | null>(null);
  const [progress, setProgress] = useState<MasterlistProgress | null>(null);
  const deleting = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<NonNullable<NonNullable<typeof data>["pendingUpload"]> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NonNullable<NonNullable<typeof data>["import"]> | null>(null);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  },[busy]);
  useEffect(() => { let live = true; listSchoolYears().then(years => { if (live) setActive(years.find(y => y.is_active) ?? null); }).catch(e => toast.error(e.message)); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; setLoading(true); listMasterlist({ search, college, yearLevel, limit: 50, offset: page * 50 }).then(r => { if (live) setData(r); }).catch(e => { if (live) toast.error(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [search, college, yearLevel, page, revision]);
  const allowed = isMasterlistTerm(active);
  const pending = data?.pendingUpload;
  const savedProgress: MasterlistProgress | null = pending ? {
    stage: pending.phase === "staged" ? "saving_masterlist" : pending.phase === "syncing" ? "syncing_absences" : "refreshing_final_results",
    percent: pending.percent,
    message: pending.phase === "staged" ? `${pending.rowsValid} students saved. Ready to publish and reconcile.` : pending.phase === "syncing" ? `${pending.processed} / ${pending.totalStudents} students synchronized and saved.` : "Absence synchronization saved. Ready to refresh results.",
  } : null;
  async function run(action: "upload" | "resume" | "reconcile" | "delete" | "discard") {
    if (!allowed || busy || loading || (action === "upload" && (!file || pending))) return;
    if (action === "delete" && !deleteTarget) return;
    if (action === "discard" && !discardTarget) return;
    if (action === "resume" && !pending) return;
    if (action === "delete" || action === "discard") deleting.current = true;
    setBusy(true); setAction(action); setProgress(action === "resume" ? savedProgress : null);
    try {
      if ((action === "upload" && file) || (action === "resume" && pending)) {
        const result = action === "resume" && pending ? await resumeMasterlistUploadWithProgress(pending.id,setProgress) : await uploadMasterlistWithProgress(file!,setProgress);
        setSummary(result.summary); setFile(null); setData(previous => previous ? {...previous,import:result.import,pendingUpload:null} : previous);
      }
      if (action === "reconcile") setSummary(await reconcileMasterlistWithProgress(setProgress));
      if (action === "delete" && deleteTarget) { await deleteMasterlist(deleteTarget.id); setSummary(null); setData(previous => previous ? {...previous,import:null,pendingUpload:null,rows:[],total:0} : previous); setDeleteOpen(false); setDeleteTarget(null); }
      if (action === "discard" && discardTarget) { await discardMasterlistUpload(discardTarget.id); setData(previous => previous ? {...previous,pendingUpload:null} : previous); setDiscardOpen(false); setDiscardTarget(null); }
      if (action !== "discard") invalidateMasterlistStatus();
      setPage(0); toast.success(action === "delete" ? "Masterlist removed." : action === "discard" ? "Saved upload discarded. You can start a new upload." : "Masterlist reconciled.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Request failed."); }
    finally { deleting.current = false; setLoading(true); setRevision(v => v + 1); setBusy(false); setAction(null); }
  }
  const steps: {label:string; stages:MasterlistProgress["stage"][]}[] = [
    {label:"Parse",stages:["parsing"]},
    {label:"Save masterlist",stages:["saving_masterlist"]},
    {label:"Reconcile records",stages:["reconciling_records"]},
    {label:"Update students",stages:["remapping_overrides","updating_students"]},
    {label:"Sync absences",stages:["syncing_absences"]},
    {label:"Refresh results",stages:["refreshing_final_results","refreshing_calculations","refreshing_penalties"]},
  ];
  const displayProgress = busy ? progress : savedProgress;
  const currentStep = displayProgress?.stage === "finalizing" ? steps.length : displayProgress ? steps.findIndex(step=>step.stages.includes(displayProgress.stage)) : action === "reconcile" ? 2 : 0;
  const loadingSteps: LoadingStatusStep[] = steps.map((step,index)=>({label:step.label,status: index < currentStep ? "done" : index === currentStep && busy ? "loading" : "pending"}));
  const progressDetail = displayProgress ? `${displayProgress.message}${displayProgress.chunkIndex !== undefined && displayProgress.chunkTotal !== undefined ? ` (chunk ${displayProgress.chunkIndex} of ${displayProgress.chunkTotal})` : ""}` : "Starting…";
  const stats = pending && pending.phase !== "staged" ? null : summary ?? data?.import?.summary;
  return <main className="space-y-5"><header><h1 className="text-2xl font-black tracking-tight">Student Masterlist</h1><p className="text-muted-foreground">{allowed && active ? `Masterlist for 1st Semester, A.Y. ${active.name}` : "Masterlist for 1st Semester, A.Y. 2026-2027"}</p><p className="text-sm">Active school year: {active ? `${active.name} · ${active.semester === "first_semester" ? "1st Semester" : "2nd Semester"}` : "Unavailable"}</p></header>
    <section aria-busy={busy} className="space-y-4 rounded-2xl border bg-card p-5"><h2 className="text-lg font-bold">Upload masterlist</h2>{!allowed && <p className="rounded-xl border p-3 text-sm text-muted-foreground">Upload and reconciliation require the active first semester of A.Y. 2026-2027.</p>}
      <FilePicker accept=".xlsx,.csv" disabled={!allowed || busy || !!pending || loading} buttonLabel={file?.name ?? "Choose masterlist (.xlsx, .csv)"} onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        {pending ? <Button disabled={!allowed || busy || loading} onClick={() => void run("resume")}>Resume upload</Button> : <Button disabled={!allowed || busy || loading || !data || !file} onClick={() => data?.import ? setReplaceOpen(true) : void run("upload")}>Upload &amp; Reconcile</Button>}
        <Button variant="outline" disabled={!allowed || busy || loading || !!pending || !data?.import} onClick={() => void run("reconcile")}>Reconcile now</Button>
        {pending?.phase === "staged" && <Button variant="destructive" disabled={!allowed || busy || loading} onClick={() => {setDiscardTarget(pending);setDiscardOpen(true);}}>Discard saved upload</Button>}
        <Button variant="destructive" disabled={!allowed || busy || loading || pending?.phase === "staged" || !data?.import} onClick={() => {setDeleteTarget(data?.import ?? null);setDeleteOpen(true);}}>{pending && pending.phase !== "staged" ? "Delete masterlist & start over" : "Delete masterlist"}</Button>
      </div>
      {pending && <p className="rounded-xl border p-3 text-sm">Saved upload: {pending.fileName} · {pending.rowsValid} valid students. {pending.phase === "staged" ? "Resume without selecting the file again, or discard the saved upload to start over. The existing masterlist is unchanged." : "The masterlist is saved. Attendance results are incomplete until you resume and finish the rebuild. To start over, delete the masterlist and upload again."}</p>}
      <ProtectedDeleteDialog open={discardOpen} onOpenChange={open=>{if(!deleting.current && !busy)setDiscardOpen(open);}} title="Discard saved upload?" description={`This deletes the saved upload of ${discardTarget?.fileName ?? "Unknown"} (${discardTarget?.rowsValid ?? 0} students). The currently published masterlist and attendance records are not deleted.`} confirmationPhrase="DISCARD UPLOAD" confirmLabel="Discard saved upload" isPending={busy} confirmDisabled={!discardTarget || !allowed} onConfirm={()=>run("discard")} />
      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace current masterlist?</AlertDialogTitle><AlertDialogDescription>This will replace {data?.import?.file_name} ({data?.import?.rows_valid ?? 0} valid rows) and reconcile attendance using the new file.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || !file} onClick={() => {setReplaceOpen(false);void run("upload");}}>Replace &amp; Reconcile</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <ProtectedDeleteDialog open={deleteOpen} onOpenChange={open=>{if(!deleting.current && !busy)setDeleteOpen(open);}} title="Delete masterlist?" description={`School year: ${data?.schoolYear?.name ?? active?.name ?? "Unknown"} · 1st Semester. Latest import: ${deleteTarget?.file_name ?? "Unknown"} (${deleteTarget?.rows_valid ?? 0} valid rows). Previously reconciled attendance records will not be reverted.${pending ? " This also discards the saved upload checkpoint so you can start over." : ""}`} confirmationPhrase="DELETE MASTERLIST" confirmLabel="Delete masterlist" isPending={busy} confirmDisabled={!deleteTarget || !allowed} onConfirm={()=>run("delete")} />
      {busy && (action === "delete" || action === "discard" ? <LoadingStatus title={action === "delete" ? "Deleting masterlist" : "Discarding saved upload"} detail="Removing saved records…" progress={50} /> : <LoadingStatus title={action === "resume" ? "Resuming masterlist upload" : action === "upload" ? "Uploading masterlist" : "Reconciling masterlist"} detail={progressDetail} progress={displayProgress?.percent ?? 0} steps={loadingSteps} />)}
      {!busy && savedProgress && <LoadingStatus title="Saved upload progress" detail={progressDetail} progress={savedProgress.percent} steps={loadingSteps} />}
      {data?.import && <p className="text-sm text-muted-foreground">Latest import: {data.import.file_name} · {data.import.rows_valid} valid / {data.import.rows_invalid} invalid</p>}
      {stats && <><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[["Masterlist rows",stats.masterlistRows],["Matched by ID",stats.matchedById],["Matched by partial ID",stats.matchedByPartialId ?? 0],["Matched by name",stats.matchedByName],["ID/name mismatches",stats.idNameMismatches],["Unmatched",stats.unmatched],["Students updated",stats.studentsUpdated],["Records updated",stats.recordsUpdated]].map(([label,value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>{stats.unmappedPrograms.length > 0 && <p className="text-sm">Unmapped programs: {stats.unmappedPrograms.join(", ")}</p>}</>}
    </section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="mb-4 text-lg font-bold">Masterlist records</h2><div className="mb-4 grid gap-3 md:grid-cols-3"><label className="grid gap-1 text-sm font-semibold">Search<Input value={search} placeholder="Name or student number" onChange={e => {setSearch(e.target.value);setPage(0);}} /></label><MasterlistSelect label="College" value={college} options={QR_CODE_COLLEGE_OPTIONS} onChange={v => {setCollege(v);setPage(0);}} /><MasterlistSelect label="Year level" value={yearLevel} options={[...QR_CODE_YEAR_LEVEL_OPTIONS]} onChange={v => {setYearLevel(v);setPage(0);}} /></div>
      {loading && <p className="flex gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading records…</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Student Number","Last Name","Given Name","Middle Initial","Program","Year Level","College"].map(h => <th className="whitespace-nowrap p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data?.rows.map(r => <tr key={r.id} className="border-b">{[r.student_number,r.last_name,r.given_name,r.middle_initial,r.program,r.year_level,r.college].map((v,i) => <td className="p-3" key={i}>{v ?? "—"}</td>)}</tr>)}{!loading && !data?.rows.length && <tr><td colSpan={7} className="p-5 text-center text-muted-foreground">No records found.</td></tr>}</tbody></table></div><MasterlistPager page={page} total={data?.total ?? 0} onChange={setPage} />
    </section></main>;
}
