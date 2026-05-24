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
  token: string;
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

type ApiEnvelope<T> = {
  message?: string;
  data?: T;
};

const AUTH_TOKEN_KEY = "penalyze.auth.token";
const AUTH_USER_KEY = "penalyze.auth.user";
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
  const token = getAuthToken();

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return payload as ApiEnvelope<T>;
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredUser() {
  const value = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function persistSession(session: AuthSession, remember = true) {
  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  storage.setItem(AUTH_TOKEN_KEY, session.token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));

  otherStorage.removeItem(AUTH_TOKEN_KEY);
  otherStorage.removeItem(AUTH_USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}

export async function login(input: LoginInput, remember = true) {
  try {
    const response = await apiRequest<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });

    if (!response.data?.token || !response.data?.user) {
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

    if (!response.data?.token || !response.data?.user) {
      throw new Error("Registration response is missing session data.");
    }

    if (remember) {
      persistSession(response.data, true);
    }

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to register account."));
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

export function logout() {
  clearSession();
}