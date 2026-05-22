import { useState } from "react";
import type { FormEvent } from "react";

import { AuthSession, RegisterInput, UserRole, register } from "../../api/auth";

const roles: UserRole[] = ["staff", "admin"];

export default function UsersPage() {
  const [form, setForm] = useState<RegisterInput>({
    name: "",
    email: "",
    password: "",
    role: "staff"
  });
  const [createdUsers, setCreatedUsers] = useState<AuthSession["user"][]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateForm<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const session = await register(form, false);
      setCreatedUsers((current) => [session.user, ...current]);
      setForm({ name: "", email: "", password: "", role: "staff" });
      setMessage("User account created successfully.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">User management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Users</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Create staff and admin accounts using a responsive form that works on mobile and desktop screens.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Create user</h2>
            <p className="mt-1 text-sm text-muted-foreground">The first registered account becomes admin on the backend.</p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="name" className="text-sm font-bold">
                  Name
                </label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                  placeholder="Full name"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="text-sm font-bold">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="password" className="text-sm font-bold">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                    placeholder="At least 6 characters"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="role" className="text-sm font-bold">
                    Role
                  </label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(event) => updateForm("role", event.target.value as UserRole)}
                    className="mt-2 min-h-12 w-full rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/20"
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creating..." : "Create User"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Created in this session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recently created accounts appear here after successful registration.
            </p>

            <div className="mt-5 space-y-3">
              {createdUsers.length ? (
                createdUsers.map((user) => (
                  <article key={user.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <span className="w-fit rounded-full border bg-muted px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
                        {user.role}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  No users created in this browser session yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
