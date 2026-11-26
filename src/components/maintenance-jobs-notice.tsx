import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cancelMaintenanceJob, listMaintenanceJobs, runMaintenanceJob, type MaintenanceJob } from "../api/maintenanceJobs";
import type { MasterlistProgress } from "../api/masterlist";
import { Button } from "./ui/button";
import { LoadingStatus } from "./loading-status";

const kindsByPath: Record<string, string[]> = {
  "/attendance": ["attendance_import_save", "event_exemptions", "final_result_event_batch", "derived_refresh"],
  "/repository-sync": ["attendance_import_save"],
  "/events": ["event_exemptions"],
  "/manual-attendance": ["manual_batch"],
  "/attendance-requests": ["request_group_review"],
  "/final-attendance": ["final_result_event_batch", "derived_refresh"],
  "/calculate": ["derived_refresh"],
  "/fines": ["derived_refresh"],
};
const labels: Record<string, string> = {
  attendance_import_save: "Attendance import", event_exemptions: "Event exemptions", final_result_event_batch: "Final attendance changes", derived_refresh: "Attendance results refresh", manual_batch: "Manual attendance", request_group_review: "Attendance request review",
};
export function MaintenanceJobsNotice({ path }: {path:string}) {
  const [jobs,setJobs] = useState<MaintenanceJob[]>([]);
  const [running,setRunning] = useState<string|null>(null);
  const [progress,setProgress] = useState<MasterlistProgress|null>(null);
  const [revision,setRevision] = useState(0);
  const runner=useRef<AbortController|null>(null);
  const kinds=kindsByPath[path];
  useEffect(()=>{
    setJobs([]);
    if(!kinds) return;
    const controller=new AbortController();
    let loading=false;
    const refresh=async()=>{
      if(loading || controller.signal.aborted) return;
      loading=true;
      try {
        const result=await Promise.all(kinds.map(kind=>listMaintenanceJobs({kind,open:true},controller.signal)));
        if(!controller.signal.aborted)setJobs(result.flat());
      } catch { /* Keep the last successful job list. */ }
      finally {loading=false;}
    };
    void refresh();
    window.addEventListener("focus",refresh);
    const timer=window.setInterval(refresh,10000);
    return ()=>{controller.abort();window.removeEventListener("focus",refresh);window.clearInterval(timer);};
  },[kinds,revision]);
  useEffect(()=>()=>runner.current?.abort(),[path]);
  useEffect(()=>{
    if(!running)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[running]);
  async function resume(job:MaintenanceJob){
    if(runner.current)return;
    const controller=new AbortController();runner.current=controller;
    setRunning(job.id);setProgress(null);
    try{
      const completed=await runMaintenanceJob(job.id,setProgress,controller.signal);
      if(completed.status==="completed" && !controller.signal.aborted){toast.success("Attendance operation completed.");window.location.reload();}
    }catch(error){if(!controller.signal.aborted)toast.error(error instanceof Error?error.message:"Operation paused. Press Resume to continue.");}
    finally{runner.current=null;setRunning(null);setRevision(v=>v+1);}
  }
  async function cancel(job:MaintenanceJob){
    if(!window.confirm("Cancel this saved operation? Already committed changes will not be undone."))return;
    try{await cancelMaintenanceJob(job.id);setRevision(v=>v+1);}
    catch(error){toast.error(error instanceof Error?error.message:"Unable to cancel saved operation.");}
  }
  if(!kinds || !jobs.length)return null;
  return <section className="space-y-2 border-b bg-muted/20 px-4 py-3" aria-label="Saved attendance operations">
    {jobs.map(job=><div className="flex flex-wrap items-center gap-3" key={job.id}>
      <div className="min-w-48 flex-1"><p className="text-sm font-semibold">{labels[job.kind] ?? job.kind} · {job.status}</p><p className="text-xs text-muted-foreground">{job.message ?? job.phase} · {Math.round(job.percent)}%</p>{job.last_error && <p className="text-xs text-destructive">{job.last_error}</p>}{running===job.id && <LoadingStatus title="Resuming saved operation" detail={progress?.message ?? job.message ?? "Starting…"} progress={progress?.percent ?? job.percent}/>}</div>
      <Button size="sm" disabled={!!running || job.status==="running"} onClick={()=>void resume(job)}>{running===job.id?"Running…":job.status==="running"?"Running in another tab":job.status==="pending"?"Start":"Resume"}</Button>
      {job.status!=="running" && <Button size="sm" variant="outline" disabled={!!running} onClick={()=>void cancel(job)}>Cancel saved operation</Button>}
    </div>)}
  </section>;
}
