import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listSchoolYears, type SchoolYearRecord } from "../../api/schoolYears";
import { getFinalAttendance, getFinalAttendanceUnmatched, getFinalAttendanceCorrected, listMasterlist, reassignStudentAttendance, type StudentSuggestion, downloadFinalAttendanceXlsx, isMasterlistTerm, type FinalAttendanceResponse } from "../../api/masterlist";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { QR_CODE_COLLEGE_OPTIONS } from "../../lib/colleges";
import { QR_CODE_YEAR_LEVEL_OPTIONS } from "../../lib/year-levels";
import { MasterlistSelect, MasterlistPager } from "./masterlist";

export default function FinalAttendancePage() {
  const [years,setYears]=useState<SchoolYearRecord[]>([]); const [schoolYearId,setYear]=useState("");
  const [college,setCollege]=useState(""); const [yearLevel,setYearLevel]=useState(""); const [program,setProgram]=useState(""); const [search,setSearch]=useState("");
  const [page,setPage]=useState(0); const [unmatchedPage,setUnmatchedPage]=useState(0); const [tab,setTab]=useState<"final"|"unmatched"|"corrected">("final");
  const [data,setData]=useState<FinalAttendanceResponse|null>(null); const [loading,setLoading]=useState(true); const [downloading,setDownloading]=useState(false);
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [unmatched,setUnmatched]=useState<Awaited<ReturnType<typeof getFinalAttendanceUnmatched>>|null>(null);
  const [corrected,setCorrected]=useState<Awaited<ReturnType<typeof getFinalAttendanceCorrected>>|null>(null);
  const [fixRow,setFixRow]=useState<FixStudentIdRow|null>(null);
  const [unmatchedCount,setUnmatchedCount]=useState<number|null>(null);
  const [unmatchedLoading,setUnmatchedLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [unmatchedError,setUnmatchedError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const [unmatchedRevision,setUnmatchedRevision]=useState(0);
  const [yearsRevision,setYearsRevision]=useState(0);
  useEffect(()=>{let live=true;const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),60_000);setLoading(true);setError(null);listSchoolYears({signal:controller.signal}).then(rows=>{if(!live)return;setYears(rows);setYear(rows.find(y=>y.is_active)?.id ?? rows[0]?.id ?? "");if(!rows.length)setLoading(false);}).catch(e=>{if(live){setLoading(false);const message=controller.signal.aborted?"Loading school years timed out. Please retry.":e instanceof Error?e.message:"Unable to load school years.";setError(message);toast.error(message);}}).finally(()=>window.clearTimeout(timeout));return()=>{live=false;window.clearTimeout(timeout);controller.abort();};},[yearsRevision]);
  useEffect(()=>{
    if(search===debouncedSearch)return;
    const timeout=window.setTimeout(()=>{setDebouncedSearch(search);setPage(0);setUnmatchedPage(0);},350);
    return()=>window.clearTimeout(timeout);
  },[search,debouncedSearch]);
  useEffect(()=>{
    if(!schoolYearId || search!==debouncedSearch)return;
    const controller=new AbortController();
    setLoading(true);setError(null);
    getFinalAttendance({schoolYearId,college,yearLevel,program,search:debouncedSearch,limit:50,offset:page*50},controller.signal).then(r=>{
      if(controller.signal.aborted)return;
      setData(r);
      if(r.unmatchedCount!==null)setUnmatchedCount(r.unmatchedCount);
      if(!r.hasMasterlist)setTab("final");
    }).catch(e=>{
      if(controller.signal.aborted || (e instanceof Error&&e.name==="AbortError"))return;
      const message=e instanceof Error?e.message:"Unable to load final attendance.";setError(message);toast.error(message);
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[schoolYearId,college,yearLevel,program,search,debouncedSearch,page,revision]);
  useEffect(()=>{setUnmatched(null);setUnmatchedCount(null);setUnmatchedError(null);},[schoolYearId,college,yearLevel,program,debouncedSearch]);
  useEffect(()=>{
    if(!schoolYearId || tab!=="unmatched" || search!==debouncedSearch)return;
    const controller=new AbortController();
    setUnmatchedLoading(true);setUnmatchedError(null);
    getFinalAttendanceUnmatched({schoolYearId,college,yearLevel,program,search:debouncedSearch,limit:50,offset:unmatchedPage*50},controller.signal).then(r=>{
      if(controller.signal.aborted)return;
      setUnmatched(r);setUnmatchedCount(r.total);
    }).catch(e=>{
      if(controller.signal.aborted || (e instanceof Error&&e.name==="AbortError"))return;
      const message=e instanceof Error?e.message:"Unable to load unmatched students.";setUnmatchedError(message);toast.error(message);
    }).finally(()=>{if(!controller.signal.aborted)setUnmatchedLoading(false);});
    return()=>controller.abort();
  },[schoolYearId,college,yearLevel,program,search,debouncedSearch,unmatchedPage,unmatchedRevision,tab]);
  useEffect(()=>{
    if(!schoolYearId || tab!=="corrected" || search!==debouncedSearch)return;
    const controller=new AbortController();
    setUnmatchedLoading(true);setUnmatchedError(null);
    getFinalAttendanceCorrected({schoolYearId,college,yearLevel,program,search:debouncedSearch,limit:50,offset:unmatchedPage*50},controller.signal).then(r=>{
      if(!controller.signal.aborted)setCorrected(r);
    }).catch(e=>{if(!controller.signal.aborted){const message=e instanceof Error?e.message:"Unable to load corrected IDs.";setUnmatchedError(message);toast.error(message);}}).finally(()=>{if(!controller.signal.aborted)setUnmatchedLoading(false);});
    return()=>controller.abort();
  },[schoolYearId,college,yearLevel,program,search,debouncedSearch,unmatchedPage,unmatchedRevision,tab]);
  useEffect(()=>{
    if(!schoolYearId || !data?.hasMasterlist || tab==="unmatched" || search!==debouncedSearch)return;
    const controller=new AbortController();
    getFinalAttendanceUnmatched({schoolYearId,college,yearLevel,program,search:debouncedSearch,limit:1},controller.signal).then(r=>{if(!controller.signal.aborted)setUnmatchedCount(r.total);}).catch(()=>{});
    return()=>controller.abort();
  },[schoolYearId,college,yearLevel,program,search,debouncedSearch,unmatchedRevision,tab,data?.hasMasterlist]);
  function reset(){setPage(0);setUnmatchedPage(0);}
  const visibleLoading=(tab==="final"?loading:unmatchedLoading)||search!==debouncedSearch;
  const visibleError=tab==="final"?error:unmatchedError;
  const visiblePage=tab==="final"?page:unmatchedPage;
  async function download(){setDownloading(true);try{await downloadFinalAttendanceXlsx({schoolYearId,college,yearLevel,program,search});}catch(e){toast.error(e instanceof Error?e.message:"Download failed.");}finally{setDownloading(false);}}
  const headers=["Student Number","Last Name","Given Name","Middle Initial","Program","Year Level","College",...(data?.events??[]).map(e=>e.name),"Attended Events","Expected Events","Total Absences","Status"];
  return <main className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black tracking-tight">Final Attendance</h1><p className="text-muted-foreground">Preview and export semester attendance.</p></div><Button disabled={downloading||visibleLoading||!schoolYearId||!data} onClick={()=>void download()}>{downloading&&<Loader2 className="size-4 animate-spin" />}Download XLSX</Button></header>
    <section className="rounded-2xl border bg-card p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="grid gap-1 text-sm font-semibold">School year<Select value={schoolYearId} onValueChange={v=>{setYear(v);setProgram("");setData(null);setTab("final");reset();}}><SelectTrigger className="w-full"><SelectValue placeholder="School year" /></SelectTrigger><SelectContent>{years.map(y=><SelectItem key={y.id} value={y.id}>{y.name} · {y.semester==="first_semester"?"1st Semester":"2nd Semester"}</SelectItem>)}</SelectContent></Select></label><MasterlistSelect label="College" value={college} options={QR_CODE_COLLEGE_OPTIONS} onChange={v=>{setCollege(v);setProgram("");reset();}} /><MasterlistSelect label="Year level" value={yearLevel} options={[...QR_CODE_YEAR_LEVEL_OPTIONS]} onChange={v=>{setYearLevel(v);reset();}} /><MasterlistSelect label="Program" value={program} options={data?.programs??[]} onChange={v=>{setProgram(v);reset();}} /><label className="grid gap-1 text-sm font-semibold">Search<Input placeholder="Name or student number" value={search} onChange={e=>setSearch(e.target.value)} /></label></div></section>
    {data && !data.hasMasterlist && <div className="rounded-xl border bg-muted/40 p-4 text-sm">No masterlist for this school year. {isMasterlistTerm(data.schoolYear)&&<Link className="font-semibold underline" to="/masterlist">Upload masterlist</Link>}</div>}
    <section aria-busy={visibleLoading} className="rounded-2xl border bg-card p-5"><div className="mb-4 flex flex-wrap gap-2" role="tablist"><Button role="tab" aria-selected={tab==="final"} variant={tab==="final"?"default":"outline"} onClick={()=>setTab("final")}>Final Attendance</Button>{data?.hasMasterlist&&<Button role="tab" aria-selected={tab==="unmatched"} variant={tab==="unmatched"?"default":"outline"} onClick={()=>{if(tab!=="unmatched"){setUnmatchedLoading(true);setUnmatchedPage(0);setTab("unmatched");}}}>Unmatched{unmatchedCount!==null?` (${unmatchedCount})`:""}</Button>}{data?.hasMasterlist&&<Button role="tab" aria-selected={tab==="corrected"} variant={tab==="corrected"?"default":"outline"} onClick={()=>{if(tab!=="corrected"){setUnmatchedLoading(true);setUnmatchedPage(0);setTab("corrected");}}}>Corrected IDs</Button>}</div>{visibleLoading&&<div role="status" aria-live="polite" className="mb-3 flex items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm"><Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" /><div><p className="text-sm font-black">{tab==="final"?"Loading final attendance":tab==="corrected"?"Loading corrected IDs":"Loading unmatched students"}</p><p className="mt-1 text-xs font-semibold text-muted-foreground">{schoolYearId?`Fetching page ${visiblePage+1}…`:"Loading school years…"}</p></div></div>}
      {!visibleLoading&&visibleError&&<div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-3 text-sm"><p className="text-destructive">{visibleError}</p><Button variant="outline" onClick={()=>{if(!schoolYearId)setYearsRevision(v=>v+1);else if(tab==="final")setRevision(v=>v+1);else setUnmatchedRevision(v=>v+1);}}>Retry</Button></div>}
      {!visibleLoading&&!visibleError&&(tab==="final"?<><p className="mb-3 text-xs text-muted-foreground">P = Present · A = Absent · E = Exempt · Blank = Not applicable</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{headers.map((h,i)=><th key={i} className="min-w-24 whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{data?.rows.map(r=><tr key={r.student_number} className="border-b">{[r.student_number,r.last_name??r.name,r.given_name,r.middle_initial,r.program,r.year_level,r.college,...(data.events??[]).map(e=>r.event_details[e.id]??""),r.attended_events,r.expected_events,r.total_absences,r.attendance_status].map((v,i)=><td key={i} className="p-3">{v??""}</td>)}</tr>)}{!visibleLoading&&!data?.rows.length&&<tr><td colSpan={headers.length} className="p-5 text-center text-muted-foreground">No attendance records.</td></tr>}</tbody></table></div><MasterlistPager page={page} total={data?.total??0} onChange={setPage} /></>:tab==="unmatched"?<><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Student ID","Name","College","Program","Year level","Reason","ID status","Action"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{unmatched?.rows.map((r,i)=><tr key={`${r.student_id}-${i}`} className="border-b">{[r.student_id,r.name,r.college,r.program,r.year_level,r.reason].map((v,j)=><td key={j} className="p-3">{v??"—"}</td>)}<td className="p-3"><div className="flex flex-wrap gap-1">{r.is_placeholder&&<span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">Placeholder ID</span>}{r.id_owner&&<span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">ID belongs to {r.id_owner.full_name}</span>}{!r.is_placeholder&&!r.id_owner&&<span className="rounded-full bg-muted px-2 py-1 text-xs">Not on masterlist</span>}</div></td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>setFixRow({originalStudentId:r.student_id,originalName:r.name,college:r.college,program:r.program,yearLevel:r.year_level,reason:r.reason,suggestions:r.suggestions})}>Fix ID</Button></td></tr>)}{!unmatched?.rows.length&&<tr><td colSpan={8} className="p-5 text-center text-muted-foreground">No unmatched students.</td></tr>}</tbody></table></div><MasterlistPager page={unmatchedPage} total={unmatchedCount??0} onChange={setUnmatchedPage} /></>:<><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Original ID → Corrected ID","Original name → Corrected name","College","Program","Year level","Status","Records","Action"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{corrected?.rows.map((r,i)=><tr key={`${r.original_student_id}-${r.corrected_student_id}-${i}`} className="border-b"><td className="p-3"><div className="text-muted-foreground">{r.original_student_id}</div><div className="font-semibold">→ {r.corrected_student_id}</div></td><td className="p-3"><div className="text-muted-foreground">{r.original_name}</div><div className="font-semibold">→ {r.corrected_name}</div></td>{[r.college,r.program,r.year_level].map((v,j)=><td key={j} className="p-3">{v??"—"}</td>)}<td className="p-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{correctionLabel(r.masterlist_status)}</span></td><td className="p-3">{r.record_count}</td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>setFixRow({originalStudentId:r.original_student_id,originalName:r.original_name,college:r.college,program:r.program,yearLevel:r.year_level,reason:correctionLabel(r.masterlist_status),suggestions:[{student_number:r.corrected_student_id,full_name:r.corrected_name,college:r.college,program:r.program,year_level:r.year_level}]})}>Change</Button></td></tr>)}{!corrected?.rows.length&&<tr><td colSpan={8} className="p-5 text-center text-muted-foreground">No corrected IDs.</td></tr>}</tbody></table></div><MasterlistPager page={unmatchedPage} total={corrected?.total??0} onChange={setUnmatchedPage} /></>)}
    </section>{fixRow&&<FixStudentIdDialog row={fixRow} schoolYearId={schoolYearId} onClose={()=>setFixRow(null)} onAssigned={()=>{setFixRow(null);setRevision(v=>v+1);setUnmatchedRevision(v=>v+1);setUnmatchedPage(0);}} />}</main>;
}


type FixStudentIdRow = {originalStudentId:string;originalName:string;college:string|null;program:string|null;yearLevel:string|null;reason:string;suggestions?:StudentSuggestion[]};
function correctionLabel(status:string) {
  return status==="matched_by_partial_id"?"Matched by partial ID":status==="id_name_mismatch"?"ID/name mismatch":"Matched by name";
}
function FixStudentIdDialog({row,schoolYearId,onClose,onAssigned}:{row:FixStudentIdRow;schoolYearId:string;onClose:()=>void;onAssigned:()=>void}) {
  const [search,setSearch]=useState("");
  const [matches,setMatches]=useState<StudentSuggestion[]>([]);
  const [selected,setSelected]=useState<StudentSuggestion|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    let live=true;
    setMatches([]);setError("");setLoading(!!search.trim());
    if(!search.trim())return;
    const timer=window.setTimeout(()=>{
      listMasterlist({schoolYearId,search:search.trim(),limit:10}).then(result=>{if(live)setMatches(result.rows.map(m=>({student_number:m.student_number,full_name:[m.given_name,m.middle_initial,m.last_name].filter(Boolean).join(" "),program:m.program,college:m.college,year_level:m.year_level})));}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Unable to search masterlist.");}).finally(()=>{if(live)setLoading(false);});
    },300);
    return()=>{live=false;window.clearTimeout(timer);};
  },[search,schoolYearId]);
  async function assign(){
    if(!selected||saving)return;
    setSaving(true);
    try{const result=await reassignStudentAttendance({schoolYearId,originalStudentId:row.originalStudentId,originalName:row.originalName,studentNumber:selected.student_number});toast.success(`Moved ${row.originalName}'s attendance to ${result.studentNumber}`);onAssigned();}
    catch(e){toast.error(e instanceof Error?e.message:"Unable to assign attendance.");}finally{setSaving(false);}
  }
  const renderMatch=(m:StudentSuggestion)=><button type="button" key={m.student_number} disabled={saving} aria-pressed={selected?.student_number===m.student_number} onClick={()=>setSelected(m)} className={`w-full rounded-2xl border p-3 text-left ${selected?.student_number===m.student_number?"border-primary bg-primary/10":"bg-card hover:bg-muted"}`}><div className="font-bold">{m.full_name} · {m.student_number}</div><div className="text-xs text-muted-foreground">{[m.program,m.year_level,m.college].filter(Boolean).join(" · ")}</div></button>;
  return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent className="sm:max-w-lg" showCloseButton={!saving}><DialogHeader><DialogTitle>Fix Student ID</DialogTitle><DialogDescription>Assign all saved scans with this original ID and name to the correct masterlist student.</DialogDescription></DialogHeader><div className="rounded-2xl border bg-muted/40 p-3"><p className="font-bold">{row.originalName} · {row.originalStudentId}</p><p className="text-xs text-muted-foreground">{[row.college,row.program,row.yearLevel].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs">{row.reason}</p></div><div className="space-y-2"><p className="font-semibold">Suggested matches</p>{row.suggestions?.length?row.suggestions.map(renderMatch):<p className="text-xs text-muted-foreground">No suggested matches. Search the masterlist below.</p>}</div><label className="grid gap-1 font-semibold">Search masterlist<Input placeholder="Name or student number" value={search} onChange={e=>setSearch(e.target.value)} disabled={saving}/></label>{loading&&<Loader2 className="size-4 animate-spin"/>}{error&&<p role="alert" className="text-destructive">{error}</p>}<div className="max-h-64 space-y-2 overflow-y-auto">{matches.map(renderMatch)}{search.trim()&&!loading&&!error&&!matches.length&&<p className="text-muted-foreground">No matches found.</p>}</div><Button disabled={!selected||saving} onClick={()=>void assign()}>{saving&&<Loader2 className="size-4 animate-spin"/>}{selected?`Assign to ${selected.student_number}`:"Select a student"}</Button></DialogContent></Dialog>;
}
