import { getApiBaseUrl, getAuthToken } from "./auth";

export type AuditLogOutcome = "all" | "success" | "failed";

export type AuditLogRecord = {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  method: string;
  route: string;
  status_code: number;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AuditLogMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AuditLogListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  outcome?: AuditLogOutcome;
  from?: string;
  to?: string;
};

type AuditLogEnvelope = {
  data?: AuditLogRecord[];
  meta?: AuditLogMeta;
  message?: string;
};

export async function listAuditLogs(options: AuditLogListOptions = {}) {
  const params = new URLSearchParams();
  const token = getAuthToken();

  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.outcome && options.outcome !== "all") params.set("outcome", options.outcome);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);

  const response = await fetch(`${getApiBaseUrl()}/api/audit-logs?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });

  const payload = (await response.json().catch(() => null)) as AuditLogEnvelope | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return {
    rows: payload?.data ?? [],
    meta: payload?.meta ?? { page: 1, limit: options.limit ?? 50, total: 0, totalPages: 1 },
  };
}
