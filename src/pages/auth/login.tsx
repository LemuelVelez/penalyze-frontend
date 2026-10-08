import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { getLastRememberedEmail, isAuthenticated, login } from "../../api/auth";
import { useLocation, useNavigate } from "react-router-dom";
import PageBackground from "../../components/page-background";
import { BACKGROUNDS, BACKGROUND_CARD } from "../../lib/backgrounds";
import { LogoMark, navigateTo } from "../../components/layout";
import ThemeToggle from "../../components/theme-toggle";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(getLastRememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard", { replace: true });
      return;
    }

    setIsCheckingSession(false);
  }, [navigate]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError("");

    try {
      await login({ email, password }, remember);
      const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
      const destination = from?.pathname && from.pathname !== "/login"
        ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/dashboard";
      navigate(destination, { replace: true, state: null });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to login.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="photo-layout relative isolate flex min-h-svh items-center justify-center text-foreground">
        <PageBackground image={BACKGROUNDS.auth} overlay="medium" mobileOverlay="light" objectPosition="center 32%" />
        <ThemeToggle />
        <LogoMark textClassName="text-3xl" />
      </main>
    );
  }

  return (
    <main className="photo-layout relative isolate flex min-h-svh w-full min-w-0 items-center justify-center px-3 py-5 text-foreground sm:px-6 sm:py-10">
      <PageBackground image={BACKGROUNDS.auth} overlay="medium" mobileOverlay="light" objectPosition="center 32%" />
      <section className="grid w-full min-w-0 max-w-5xl grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl border bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative flex h-40 min-w-0 flex-col justify-end overflow-hidden md:h-auto md:min-h-[38rem]">
          <picture className="absolute inset-0">
            <source media="(max-width: 767px)" srcSet={BACKGROUND_CARD.loginPanel} />
            <img
            src={BACKGROUNDS.loginPanel}
            alt=""
            aria-hidden="true"
            decoding="async"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[center_36%]"
            />
          </picture>
          <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/32 to-black/5 dark:from-black/78 dark:via-black/38 dark:to-black/5" />
          <div className="relative z-10 p-4 text-white sm:p-6 md:p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/75">
              Student services
            </p>
            <h2 className="mt-2 max-w-sm text-lg font-black leading-tight sm:text-2xl md:mt-3 md:text-3xl">
              Attendance, fines, and records in one clear workspace.
            </h2>
            <p className="mt-4 hidden max-w-md text-sm leading-6 text-white/90 md:block">
              A focused dashboard for daily SSG operations and student record management.
            </p>
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-8 md:p-10">
          <div className="mb-8 text-center md:text-left">
            <a href="/" className="inline-flex justify-center md:justify-start">
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
                className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

          <label htmlFor="remember-device" className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl border bg-background px-3 py-3 text-sm font-semibold sm:px-4">
            <Checkbox
              id="remember-device"
              className="size-4 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <span className="min-w-0 break-words">Remember this device</span>
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
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
        </div>
      </section>
    </main>
  );
}