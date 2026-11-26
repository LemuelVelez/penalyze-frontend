const retryableStatus = new Set([502, 503, 504]);
function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function retryDelay(response: Response | undefined, attempt: number, maxRetryDelayMs: number) {
  const header = response?.headers.get("Retry-After");
  const seconds = header == null ? NaN : Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
  return Math.min(maxRetryDelayMs, Math.max(0, Number.isFinite(delay) ? delay : 1000 * 2 ** attempt));
}
export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit = {},
  retryOptions: { maxRetries?: number; maxRetryDelayMs?: number } = {},
): Promise<Response> {
  const { maxRetries = 3, maxRetryDelayMs = 15000 } = retryOptions;
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
  const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try { response = await fetch(input, init); }
    catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError") || attempt >= maxRetries) throw error;
    }
    if (response && (!retryableStatus.has(response.status) || attempt >= maxRetries)) return response;
    if (response?.body) void response.body.cancel().catch(() => undefined);
    await wait(retryDelay(response, attempt, maxRetryDelayMs), signal);
  }
}
export function isDatabaseBusy(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 503;
}
export function responseError(response: Response, payload: {message?: string; requestId?: string; code?: string} | null, fallback?: string) {
  const message = payload?.message || fallback || `Request failed with status ${response.status}.`;
  const requestId = payload?.requestId || response.headers.get("X-Request-ID");
  return Object.assign(new Error(payload?.code === "MASTERLIST_ACTIVE" ? message : requestId ? `${message} (Request ID: ${requestId})` : message), {status:response.status,code:payload?.code});
}
