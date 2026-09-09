import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { login } from "../../api/auth";
import { LogoMark, navigateTo } from "../../components/layout";
import ThemeToggle from "../../components/theme-toggle";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";

const AUTH_STORAGE_KEYS = [
  "penalyze.auth.session",
  "penalyze.auth.token",
  "penalyze.session",
  "penalyze.token",
  "auth.session",
  "auth.token",
  "session",
  "token",
  "accessToken"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getExpiryTime(value: unknown) {
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedNumericValue = Number(value);
    if (!Number.isNaN(parsedNumericValue)) {
      return parsedNumericValue < 1_000_000_000_000 ? parsedNumericValue * 1000 : parsedNumericValue;
    }

    const parsedDateValue = new Date(value).getTime();
    if (!Number.isNaN(parsedDateValue)) return parsedDateValue;
  }

  return null;
}

function hasUsableSessionPayload(payload: Record<string, unknown>) {
  const expiresAt = payload.expiresAt ?? payload.expires_at ?? payload.exp;
  const expiryTime = getExpiryTime(expiresAt);

  if (expiryTime !== null && expiryTime <= Date.now()) return false;

  return Boolean(
    payload.token ||
      payload.accessToken ||
      payload.access_token ||
      payload.jwt ||
      payload.user ||
      payload.email ||
      payload.id
  );
}

function hasStoredSessionValue(value: string | null) {
  if (!value) return false;

  const cleanValue = value.trim();
  if (!cleanValue || cleanValue === "null" || cleanValue === "undefined") return false;

  try {
    const parsedValue: unknown = JSON.parse(cleanValue);

    if (typeof parsedValue === "string") return parsedValue.trim().length > 0;
    if (!isRecord(parsedValue)) return Boolean(parsedValue);

    return hasUsableSessionPayload(parsedValue);
  } catch {
    return true;
  }
}

function hasCurrentSession() {
  if (typeof window === "undefined") return false;

  const storageAreas: Storage[] = [window.localStorage, window.sessionStorage];

  return storageAreas.some((storageArea) => {
    try {
      return AUTH_STORAGE_KEYS.some((key) => hasStoredSessionValue(storageArea.getItem(key)));
    } catch {
      return false;
    }
  });
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasCurrentSession()) {
      navigateTo("/dashboard");
      return;
    }

    setIsCheckingSession(false);
  }, []);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError("");

    try {
      await login({ email, password }, remember);
      navigateTo("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to login.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 text-foreground">
        <ThemeToggle />\n          <LogoMark textClassName="text-3xl" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10 text-foreground sm:px-6">
      <section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-8 text-center">
          <a href="/" className="inline-flex justify-center">
            <LogoMark textClassName="text-3xl" />
          </a>
          <h1 className="mt-6 text-2xl font-black">SSG Login</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in to manage attendance uploads, fines, penalties, and users.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-bold">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
              placeholder="admin@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-bold">
              Password
            </label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 w-full rounded-2xl border bg-background px-4 pr-12 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 text-sm font-semibold">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            Remember this device
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          onClick={() => navigateTo("/")}
          className="mt-5 w-full text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to student lookup
        </Button>
      </section>
    </main>
  );
}