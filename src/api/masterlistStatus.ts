import { checkUnauthorized, getApiBaseUrl } from "./auth";

export type MasterlistStatus = { active: boolean; schoolYearId: string | null; schoolYearName: string | null; studentCount: number };
async function getStatus<T>(path: string, authenticated: boolean): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include" });
  if (authenticated) checkUnauthorized(response);
  if (!response.ok) throw new Error("Unable to check masterlist status.");
  return response.json() as Promise<T>;
}
export const getMasterlistStatus = () => getStatus<MasterlistStatus>("/api/masterlist/status", true);
export const getPublicMasterlistStatus = () => getStatus<Pick<MasterlistStatus, "active">>("/api/public/masterlist-status", false);
