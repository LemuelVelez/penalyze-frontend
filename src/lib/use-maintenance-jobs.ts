import { useEffect } from "react";
import { useMasterlistStatus, refreshAuthenticatedMasterlistStatus } from "./use-masterlist-status";
export function useMaintenanceJobs() {
  const {rebuildJob,loading} = useMasterlistStatus();
  useEffect(()=>{
    const refresh = () => refreshAuthenticatedMasterlistStatus();
    window.addEventListener("focus",refresh);
    const timer = rebuildJob?.status === "running" ? window.setInterval(refresh,10000) : undefined;
    return ()=>{window.removeEventListener("focus",refresh);if(timer!==undefined) window.clearInterval(timer);};
  },[rebuildJob?.status]);
  return {rebuildJob,loading,refresh:refreshAuthenticatedMasterlistStatus};
}
