import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listSchoolYears, type SchoolYearRecord } from "../../api/schoolYears";
import { getFinalAttendance, getFinalAttendanceUnmatched, downloadFinalAttendanceXlsx, isMasterlistTerm, type FinalAttendanceResponse } from "../../api/masterlist";
import { LoadingStatus } from "../../components/loading-status";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { QR_CODE_COLLEGE_OPTIONS } from "../../lib/colleges";
import { QR_CODE_YEAR_LEVEL_OPTIONS } from "../../lib/year-levels";
import { MasterlistSelect, MasterlistPager } from "./masterlist";

export default function FinalAttendancePage() {
  const [years,setYears]=useState<SchoolYearRecord[]>([]); const [schoolYearId,setYear]=useState("");
  const [college,setCollege]=useState(""); const [yearLevel,setYearLevel]=useState(""); const [program,setProgram]=useState(""); const [search,setSearch]=useState("");
  const [page,setPage]=useState(0); const [unmatchedPage,setUnmatchedPage]=useState(0); const [tab,setTab]=useState<"final"|"unmatched">("final");
  const [data,setData]=useState<FinalAttendanceResponse|null>(null); const [loading,setLoading]=useState(true); const [downloading,setDownloading]=useState(false);
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [unmatched,setUnmatched]=useState<Awaited<ReturnType<typeof getFinalAttendanceUnmatched>>|null>(null);
  const [unmatchedCount,setUnmatchedCount]=useState<number|null>(null);
  const [unmatchedLoading,setUnmatchedLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [unmatchedError,setUnmatchedError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const [unmatchedRevision,setUnmatchedRevision]=useState(0);
  const [yearsRevision,setYearsRevision]=useState(0);
  useEffect(()=>{let live=true;setLoading(true);setError(null);listSchoolYears().then(rows=>{if(!live)return;setYears(rows);setYear(rows.find(y=>y.is_active)?.id ?? rows[0]?.id ?? "");if(!rows.length)setLoading(false);}).catch(e=>{if(live){setLoading(false);const message=e instanceof Error?e.message:"Unable to load school years.";setError(message);toast.error(message);}});return()=>{live=false;};},[yearsRevision]);
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
  function reset(){setPage(0);setUnmatchedPage(0);}
  const visibleLoading=(tab==="final"?loading:unmatchedLoading)||search!==debouncedSearch;
  const visibleError=tab==="final"?error:unmatchedError;
  const visiblePage=tab==="final"?page:unmatchedPage;
  const visibleTotal=tab==="final"?(data?.total??0):(unmatchedCount??0);
  async function download(){setDownloading(true);try{await downloadFinalAttendanceXlsx({schoolYearId,college,yearLevel,program,search});}catch(e){toast.error(e instanceof Error?e.message:"Download failed.");}finally{setDownloading(false);}}
  const headers=["Student Number","Last Name","Given Name","Middle Initial","Program","Year Level","College",...(data?.events??[]).map(e=>e.name),"Attended Events","Expected Events","Total Absences","Status"];
  return <main className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black tracking-tight">Final Attendance</h1><p className="text-muted-foreground">Preview and export semester attendance.</p></div><Button disabled={downloading||visibleLoading||!schoolYearId||!data} onClick={()=>void download()}>{downloading&&<Loader2 className="size-4 animate-spin" />}Download XLSX</Button></header>
    <section className="rounded-2xl border bg-card p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="grid gap-1 text-sm font-semibold">School year<Select value={schoolYearId} onValueChange={v=>{setYear(v);setProgram("");setData(null);setTab("final");reset();}}><SelectTrigger className="w-full"><SelectValue placeholder="School year" /></SelectTrigger><SelectContent>{years.map(y=><SelectItem key={y.id} value={y.id}>{y.name} · {y.semester==="first_semester"?"1st Semester":"2nd Semester"}</SelectItem>)}</SelectContent></Select></label><MasterlistSelect label="College" value={college} options={QR_CODE_COLLEGE_OPTIONS} onChange={v=>{setCollege(v);setProgram("");reset();}} /><MasterlistSelect label="Year level" value={yearLevel} options={[...QR_CODE_YEAR_LEVEL_OPTIONS]} onChange={v=>{setYearLevel(v);reset();}} /><MasterlistSelect label="Program" value={program} options={data?.programs??[]} onChange={v=>{setProgram(v);reset();}} /><label className="grid gap-1 text-sm font-semibold">Search<Input placeholder="Name or student number" value={search} onChange={e=>setSearch(e.target.value)} /></label></div></section>
    {data && !data.hasMasterlist && <div className="rounded-xl border bg-muted/40 p-4 text-sm">No masterlist for this school year. {isMasterlistTerm(data.schoolYear)&&<Link className="font-semibold underline" to="/masterlist">Upload masterlist</Link>}</div>}
    <section aria-busy={visibleLoading} className="rounded-2xl border bg-card p-5"><div className="mb-4 flex flex-wrap gap-2" role="tablist"><Button role="tab" aria-selected={tab==="final"} variant={tab==="final"?"default":"outline"} onClick={()=>setTab("final")}>Final Attendance</Button>{data?.hasMasterlist&&<Button role="tab" aria-selected={tab==="unmatched"} variant={tab==="unmatched"?"default":"outline"} onClick={()=>{if(tab!=="unmatched"){setUnmatchedLoading(true);setTab("unmatched");}}}>Unmatched{unmatchedCount!==null?` (${unmatchedCount})`:""}</Button>}</div>{visibleLoading&&<LoadingStatus className="mb-3" title="Loading final attendance" detail={`Fetching page ${visiblePage+1} of ${Math.max(visiblePage+1,Math.ceil(visibleTotal/50))}…`} progress={50} />}
      {!visibleLoading&&visibleError&&<div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-3 text-sm"><p className="text-destructive">{visibleError}</p><Button variant="outline" onClick={()=>{if(!schoolYearId)setYearsRevision(v=>v+1);else if(tab==="final")setRevision(v=>v+1);else setUnmatchedRevision(v=>v+1);}}>Retry</Button></div>}
      {!visibleLoading&&!visibleError&&(tab==="final"?<><p className="mb-3 text-xs text-muted-foreground">P = Present · A = Absent · E = Exempt · Blank = Not applicable</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{headers.map((h,i)=><th key={i} className="min-w-24 whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{data?.rows.map(r=><tr key={r.student_number} className="border-b">{[r.student_number,r.last_name??r.name,r.given_name,r.middle_initial,r.program,r.year_level,r.college,...(data.events??[]).map(e=>r.event_details[e.id]??""),r.attended_events,r.expected_events,r.total_absences,r.attendance_status].map((v,i)=><td key={i} className="p-3">{v??""}</td>)}</tr>)}{!visibleLoading&&!data?.rows.length&&<tr><td colSpan={headers.length} className="p-5 text-center text-muted-foreground">No attendance records.</td></tr>}</tbody></table></div><MasterlistPager page={page} total={data?.total??0} onChange={setPage} /></>:<><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Student ID","Name","College","Program","Reason"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{unmatched?.rows.map((r,i)=><tr key={`${r.student_id}-${i}`} className="border-b">{[r.student_id,r.name,r.college,r.program,r.reason].map((v,j)=><td key={j} className="p-3">{v??"—"}</td>)}</tr>)}{!unmatched?.rows.length&&<tr><td colSpan={5} className="p-5 text-center text-muted-foreground">No unmatched students.</td></tr>}</tbody></table></div><MasterlistPager page={unmatchedPage} total={unmatchedCount??0} onChange={setUnmatchedPage} /></>)}
    </section></main>;
}
