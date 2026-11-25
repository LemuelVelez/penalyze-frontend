export type UserRole = "admin" | "officer";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthSession = {
  user: AuthUser;
  expiresAt?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

const AUTH_USER_KEY = "penalyze.auth.user";
const AUTH_EXPIRY_KEY = "penalyze.auth.expiresAt";
const LAST_EMAIL_KEY = "penalyze.auth.lastEmail";
export const SESSION_EXPIRED_EVENT = "penalyze:session-expired";
let sessionExpiredNotified = false;
const LOCAL_API_BASE_URL = "http://localhost:3000";

function normalizeBaseUrl(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function getEnvUrl(...keys: string[]) {
  const env = (import.meta as any).env ?? {};

  for (const key of keys) {
    const value = normalizeBaseUrl(env[key]);
    if (value) return value;
  }

  return "";
}

function getRuntimeOrigin() {
  if (typeof window === "undefined") return "";
  return normalizeBaseUrl(window.location.origin);
}

function isLocalUrl(value: string) {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return value.includes("localhost") || value.includes("127.0.0.1");
  }
}

function getFrontendBaseUrl() {
  return (
    getEnvUrl("VITE_Frontend_URL", "VITE_FRONTEND_URL", "VITE_APP_URL") ||
    getRuntimeOrigin()
  );
}

export function getApiBaseUrl() {
  const backendUrl = getEnvUrl(
    "VITE_Backend_URL",
    "VITE_BACKEND_URL",
    "VITE_API_URL",
    "Backend_URL",
    "BACKEND_URL",
  );

  if (backendUrl) return backendUrl;

  const frontendUrl = getFrontendBaseUrl();

  if (frontendUrl && !isLocalUrl(frontendUrl)) {
    return frontendUrl;
  }

  return LOCAL_API_BASE_URL;
}

function getErrorMessage(error: unknown, fallback = "Request failed.") {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }


  headers.set("X-Penalyze-Request", "1");
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    if (
      (response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/register") ||
      (response.status === 404 && path === "/api/auth/me")
    ) {
      handleUnauthorized();
    }
    throw Object.assign(new Error(payload?.message || `Request failed with status ${response.status}.`), { code: payload?.code });
  }

  return payload as ApiEnvelope<T>;
}

function readSession(): { user: AuthUser; storage: Storage } | null {
  if (typeof window === "undefined") return null;
  for (const storage of [localStorage, sessionStorage]) {
    const userJson = storage.getItem(AUTH_USER_KEY);
    if (!userJson) continue;
    const expiresAt = Date.parse(storage.getItem(AUTH_EXPIRY_KEY) ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    try { return { user: JSON.parse(userJson) as AuthUser, storage }; }
    catch { clearSession(); return null; }
  }
  return null;
}

/** Legacy helper: the authentication cookie is HttpOnly and never accessible to JS. */
export function getAuthToken(): string { return ""; }

export function getStoredUser(): AuthUser | null {
  return readSession()?.user ?? null;
}

export function isAuthenticated(): boolean { return Boolean(readSession()); }

export function getLastRememberedEmail(): string {
  return typeof window !== "undefined" ? localStorage.getItem(LAST_EMAIL_KEY) ?? "" : "";
}

export function persistSession(session: AuthSession, remember = true) {
  if (typeof window === "undefined") return;
  const storage = remember ? localStorage : sessionStorage;
  clearSession();
  sessionExpiredNotified = false;
  storage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));
  if (session.expiresAt) storage.setItem(AUTH_EXPIRY_KEY, session.expiresAt);
  if (remember) localStorage.setItem(LAST_EMAIL_KEY, session.user.email);
  else localStorage.removeItem(LAST_EMAIL_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(AUTH_USER_KEY);
    storage.removeItem(AUTH_EXPIRY_KEY);
    // Clear legacy bearer credentials left by older versions.
    storage.removeItem("penalyze.auth.token");
  }
}

export function handleUnauthorized() {
  if (typeof window === "undefined") return;
  const hadSession = Boolean(getStoredUser());
  clearSession();
  if (!hadSession || sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function checkUnauthorized(response: Response): Response {
  if (response.status === 401) handleUnauthorized();
  return response;
}

export async function login(input: LoginInput, remember = true) {
  try {
    const response = await apiRequest<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ ...input, remember })
    });

    if (!response.data?.user || !response.data?.expiresAt) {
      throw new Error("Login response is missing session data.");
    }

    persistSession(response.data, remember);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to login."));
  }
}

export async function register(input: RegisterInput, remember = false) {
  try {
    const response = await apiRequest<AuthSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...input, role: input.role ?? "admin" })
    });

    if (!response.data?.user) {
      throw new Error("Registration response is missing account data.");
    }
    // Creating a user never replaces the admin's current session.
    void remember;

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to register account."));
  }
}

export async function changePassword(input: ChangePasswordInput) {
  try {
    await apiRequest<null>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
    clearSession();
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to change password."));
  }
}

export async function getCurrentUser() {
  const response = await apiRequest<{ user: AuthUser }>("/api/auth/me");
  return response.data?.user ?? null;
}

export async function listUsers() {
  try {
    const response = await apiRequest<AuthUser[]>("/api/users");
    return response.data ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load users."));
  }
}

export async function updateUser(id: string, input: UpdateUserInput) {
  try {
    const response = await apiRequest<AuthUser>(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });

    if (response.data) {
      const storage = localStorage.getItem(AUTH_USER_KEY) ? localStorage : sessionStorage;
      const storedUser = getStoredUser();

      if (storedUser?.id === response.data.id) {
        storage.setItem(AUTH_USER_KEY, JSON.stringify(response.data));
      }
    }

    return response.data ?? null;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to update user."));
  }
}

export async function deleteUser(id: string) {
  try {
    await apiRequest<{ id: string }>(`/api/users/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to delete user."));
  }
}

export async function logout() {
  try {
    await apiRequest<null>("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
  }
}