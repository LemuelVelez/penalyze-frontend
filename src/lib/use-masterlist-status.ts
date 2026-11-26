import type { MaintenanceJobSummary } from "../api/maintenanceJobs";
import { useEffect, useSyncExternalStore } from "react";
import { getMasterlistStatus, getPublicMasterlistStatus } from "../api/masterlistStatus";
import { SESSION_EXPIRED_EVENT } from "../api/auth";

type Status = { active: boolean; loading: boolean; rebuildJob: MaintenanceJobSummary | null };
function createStatusStore(fetchStatus: () => Promise<{ active: boolean; rebuildJob?: MaintenanceJobSummary | null }>) {
  let snapshot: Status = { active: false, loading: true, rebuildJob:null };
  let requested = false;
  let generation = 0;
  let inFlight = false;
  const listeners = new Set<() => void>();
  const publish = (next: Status) => { snapshot = next; listeners.forEach(listener => listener()); };
  const load = () => {
    if (requested) return;
    requested = true;
    const current = ++generation;
    inFlight = true;
    void fetchStatus().then(result => {
      if (current === generation) publish({ active: result.active, loading: false, rebuildJob:result.rebuildJob ?? null });
    }).catch(() => {
      if (current === generation) { requested = false; publish({ ...snapshot, loading: false }); }
    }).finally(() => { if(current === generation) inFlight = false; });
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load,
    refresh: () => { if (!inFlight) { requested = false; load(); } },
    invalidate: (refetch = true) => {
      generation++;
      inFlight = false;
      requested = false;
      publish({ active: refetch ? snapshot.active : false, loading: true, rebuildJob:refetch ? snapshot.rebuildJob : null });
      if (refetch && listeners.size) load();
    },
  };
}
const authenticated = createStatusStore(getMasterlistStatus);
const publicStatus = createStatusStore(getPublicMasterlistStatus);
export function invalidateMasterlistStatus() { authenticated.invalidate(); publicStatus.invalidate(); }
export function resetMasterlistStatus() { authenticated.invalidate(false); publicStatus.invalidate(false); }
if (typeof window !== "undefined") window.addEventListener(SESSION_EXPIRED_EVENT, resetMasterlistStatus);
export function useMasterlistStatus(publicAccess = false): Status {
  const store = publicAccess ? publicStatus : authenticated;
  const status = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.load(); }, [store]);
  return status;
}

export function refreshAuthenticatedMasterlistStatus() { authenticated.refresh(); }
