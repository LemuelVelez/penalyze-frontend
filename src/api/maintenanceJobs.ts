import { checkUnauthorized, getApiBaseUrl } from "./auth";
import { fetchWithRetry, responseError } from "./http";
import type { MasterlistProgress } from "./masterlist";
import { readProgressStream } from "./progressStream";
export type MaintenanceJobStatus = "pending" | "running" | "paused" | "failed" | "completed" | "cancelled";
export type MaintenanceJobSummary = { id:string; status:MaintenanceJobStatus; phase:string; percent:number; message:string|null; last_error?:string|null; };
export type MaintenanceJob = MaintenanceJobSummary & {kind:string; school_year_id:string|null; processed:number; total:number; result:unknown; input?:unknown; heartbeat_at:string|null;};
async function request(path:string,init:RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Penalyze-Request","1");
  if (init.body) headers.set("Content-Type","application/json");
  const response = checkUnauthorized(await fetchWithRetry(`${getApiBaseUrl()}/api/maintenance/jobs${path}`,{...init,headers,credentials:"include"}));
  if (!response.ok) throw responseError(response,await response.json().catch(()=>null));
  return response;
}
export async function listMaintenanceJobs(filters:{kind?:string;schoolYearId?:string;open?:boolean} = {},signal?:AbortSignal):Promise<MaintenanceJob[]> {
  const params = new URLSearchParams();
  if(filters.kind) params.set("kind",filters.kind);
  if(filters.schoolYearId) params.set("schoolYearId",filters.schoolYearId);
  if(filters.open!==undefined) params.set("open",String(filters.open));
  return (await request(`?${params}`,{signal})).json();
}
export async function getMaintenanceJob(id:string,signal?:AbortSignal):Promise<MaintenanceJob> { return (await request(`/${encodeURIComponent(id)}`,{signal})).json(); }
export async function createMaintenanceJob(kind:string,schoolYearId:string):Promise<MaintenanceJob> { return (await request("",{method:"POST",body:JSON.stringify({kind,schoolYearId})})).json(); }
export async function cancelMaintenanceJob(id:string):Promise<MaintenanceJob> { return (await request(`/${encodeURIComponent(id)}/cancel`,{method:"POST"})).json(); }
export async function runMaintenanceJob(id:string,onProgress?:(progress:MasterlistProgress)=>void,signal?:AbortSignal):Promise<MaintenanceJob> {
  const response = await request(`/${encodeURIComponent(id)}/run/progress`,{method:"POST",signal});
  const result = await readProgressStream<MasterlistProgress,MaintenanceJob>(response,onProgress,{errorFallback:"Maintenance job stopped. Press Resume to continue."});
  if(!result.data) throw new Error("Maintenance job stopped. Press Resume to continue.");
  return result.data;
}
