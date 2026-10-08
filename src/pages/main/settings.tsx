import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { changePassword, getStoredUser } from "../../api/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
  maxLength: number;
};

function PasswordField({ id, label, value, onChange, autoComplete, disabled, maxLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required
          maxLength={maxLength}
          className="h-11 pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setVisible((previous) => !previous)}
          disabled={disabled}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-1 top-1 size-9 rounded-lg text-muted-foreground"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const user = getStoredUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("New password must be 8 to 128 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a password different from your current password.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-400 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Your account</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account security.</p>
      </div>

      <div className="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section className="h-fit rounded-2xl border bg-card/95 p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Account information
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="mt-1 break-words font-medium">{user?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="mt-1 break-words font-medium">{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="mt-1 font-medium capitalize">{user?.role || "—"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card/95 p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Change password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your current password, then choose a new one.
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              disabled={submitting}
              maxLength={1024}
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              disabled={submitting}
              maxLength={128}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              disabled={submitting}
              maxLength={128}
            />
            <p className="text-xs text-muted-foreground">Use 8–128 characters. Your new password must be different from your current password.</p>
            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={submitting} className="h-10 rounded-xl px-5">
                <KeyRound className="size-4" aria-hidden="true" />
                {submitting ? "Updating password..." : "Update password"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
