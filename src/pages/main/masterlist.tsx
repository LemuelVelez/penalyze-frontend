import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { listSchoolYears, type SchoolYearRecord } from "../../api/schoolYears";
import { listMasterlist, uploadMasterlist, reconcileMasterlist, deleteMasterlist, isMasterlistTerm, type MasterlistSummary } from "../../api/masterlist";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FilePicker } from "../../components/ui/file-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
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
  useEffect(() => { let live = true; listSchoolYears().then(years => { if (live) setActive(years.find(y => y.is_active) ?? null); }).catch(e => toast.error(e.message)); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; setLoading(true); listMasterlist({ search, college, yearLevel, limit: 50, offset: page * 50 }).then(r => { if (live) setData(r); }).catch(e => { if (live) toast.error(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [search, college, yearLevel, page, revision]);
  const allowed = isMasterlistTerm(active);
  async function run(action: "upload" | "reconcile" | "delete") {
    if (!allowed || busy || (action === "upload" && !file)) return;
    setBusy(true);
    try {
      if (action === "upload" && file) { const result = await uploadMasterlist(file); setSummary(result.summary); setFile(null); }
      if (action === "reconcile") setSummary(await reconcileMasterlist());
      if (action === "delete") { await deleteMasterlist(); setSummary(null); }
      setPage(0); setRevision(v => v + 1); toast.success(action === "delete" ? "Masterlist removed." : "Masterlist reconciled.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); }
  }
  const stats = summary ?? data?.import?.summary;
  return <main className="space-y-5"><header><h1 className="text-2xl font-black tracking-tight">Student Masterlist</h1><p className="text-muted-foreground">Masterlist for 1st Semester, A.Y. 2026-2027</p><p className="text-sm">Active school year: {active ? `${active.name} · ${active.semester === "first_semester" ? "1st Semester" : "2nd Semester"}` : "Unavailable"}</p></header>
    <section className="space-y-4 rounded-2xl border bg-card p-5"><h2 className="text-lg font-bold">Upload masterlist</h2>{!allowed && <p className="rounded-xl border p-3 text-sm text-muted-foreground">Upload and reconciliation require the active first semester of A.Y. 2026-2027.</p>}
      <FilePicker accept=".xlsx,.csv" disabled={!allowed || busy} buttonLabel={file?.name ?? "Choose masterlist (.xlsx, .csv)"} onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2"><Button disabled={!allowed || busy || !file} onClick={() => void run("upload")}>Upload &amp; Reconcile</Button><Button variant="outline" disabled={!allowed || busy || !data?.import} onClick={() => void run("reconcile")}>Reconcile now</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" disabled={!allowed || busy || !data?.import}>Delete masterlist</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete masterlist?</AlertDialogTitle><AlertDialogDescription>Previously reconciled attendance records will not be reverted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void run("delete")}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
      {busy && <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin" /> Reconciliation in progress…</p>}
      {data?.import && <p className="text-sm text-muted-foreground">Latest import: {data.import.file_name} · {data.import.rows_valid} valid / {data.import.rows_invalid} invalid</p>}
      {stats && <><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[["Masterlist rows",stats.masterlistRows],["Matched by ID",stats.matchedById],["Matched by name",stats.matchedByName],["ID/name mismatches",stats.idNameMismatches],["Unmatched",stats.unmatched],["Students updated",stats.studentsUpdated],["Records updated",stats.recordsUpdated]].map(([label,value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>{stats.unmappedPrograms.length > 0 && <p className="text-sm">Unmapped programs: {stats.unmappedPrograms.join(", ")}</p>}</>}
    </section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="mb-4 text-lg font-bold">Masterlist records</h2><div className="mb-4 grid gap-3 md:grid-cols-3"><label className="grid gap-1 text-sm font-semibold">Search<Input value={search} placeholder="Name or student number" onChange={e => {setSearch(e.target.value);setPage(0);}} /></label><MasterlistSelect label="College" value={college} options={QR_CODE_COLLEGE_OPTIONS} onChange={v => {setCollege(v);setPage(0);}} /><MasterlistSelect label="Year level" value={yearLevel} options={[...QR_CODE_YEAR_LEVEL_OPTIONS]} onChange={v => {setYearLevel(v);setPage(0);}} /></div>
      {loading && <p className="flex gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading records…</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Student Number","Last Name","Given Name","Middle Initial","Program","Year Level","College"].map(h => <th className="whitespace-nowrap p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data?.rows.map(r => <tr key={r.id} className="border-b">{[r.student_number,r.last_name,r.given_name,r.middle_initial,r.program,r.year_level,r.college].map((v,i) => <td className="p-3" key={i}>{v ?? "—"}</td>)}</tr>)}{!loading && !data?.rows.length && <tr><td colSpan={7} className="p-5 text-center text-muted-foreground">No records found.</td></tr>}</tbody></table></div><MasterlistPager page={page} total={data?.total ?? 0} onChange={setPage} />
    </section></main>;
}
