import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { deleteUser, getStoredUser, listUsers, register, updateUser } from "../../api/auth";
import type { AuthUser, RegisterInput } from "../../api/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: "admin";
};

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "admin"
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

export default function UsersPage() {
  const [form, setForm] = useState<UserFormState>(emptyUserForm);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [error, setError] = useState("");

  const currentUser = useMemo(() => getStoredUser(), []);
  const isEditing = Boolean(editingUserId);

  function updateForm<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadUsers() {
    setIsLoadingUsers(true);
    setError("");

    try {
      const rows = await listUsers();
      setUsers(rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load users.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingUsers(false);
    }
  }

  function resetForm() {
    setForm(emptyUserForm);
    setEditingUserId("");
    setShowPassword(false);
    setError("");
  }

  function handleEditUser(user: AuthUser) {
    setEditingUserId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: "admin"
    });
    setShowPassword(false);
    setError("");
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim();
    const password = form.password.trim();

    if (!name) {
      setError("Name is required.");
      toast.error("Name is required.");
      return;
    }

    if (!email) {
      setError("Email is required.");
      toast.error("Email is required.");
      return;
    }

    if (!isEditing && password.length < 6) {
      setError("Password must be at least 6 characters.");
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (isEditing && password && password.length < 6) {
      setError("Password must be at least 6 characters.");
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (isEditing) {
        const updated = await updateUser(editingUserId, {
          name,
          email,
          ...(password ? { password } : {})
        });

        if (updated) {
          setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
        }

        toast.success("User account updated successfully.");
      } else {
        const session = await register(
          {
            name,
            email,
            password,
            role: "admin"
          },
          false
        );

        setUsers((current) => [session.user, ...current.filter((user) => user.id !== session.user.id)]);
        toast.success("User account created successfully.");
      }

      resetForm();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save user.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteUser(id: string) {
    setDeletingUserId(id);
    setError("");

    try {
      await deleteUser(id);
      setUsers((current) => current.filter((user) => user.id !== id));

      if (editingUserId === id) {
        resetForm();
      }

      toast.success("User account deleted successfully.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete user.";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingUserId("");
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto ">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">User management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Users</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Display existing admin accounts and manage user records with create, read, update, and delete actions.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">{isEditing ? "Edit user" : "Create user"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEditing
                ? "Update the selected user. Leave password blank to keep the current password."
                : "Create an admin account that can access Penalyze."}
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  className="mt-2"
                  placeholder="Full name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  className="mt-2"
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">{isEditing ? "New password" : "Password"}</Label>
                <div className="relative mt-2">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    className="pr-12"
                    placeholder={isEditing ? "Leave blank to keep password" : "At least 6 characters"}
                    autoComplete="new-password"
                    required={!isEditing}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-1 right-2 size-10 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="submit" disabled={isSubmitting} className="min-h-12 rounded-2xl">
                  {isSubmitting ? "Saving..." : isEditing ? "Update User" : "Create User"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={resetForm}
                  className="min-h-12 rounded-2xl"
                >
                  {isEditing ? "Cancel Edit" : "Clear"}
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Existing users</h2>
                <p className="mt-1 text-sm text-muted-foreground">Saved admin accounts loaded from the database.</p>
              </div>
              <Button type="button" variant="outline" disabled={isLoadingUsers} onClick={loadUsers} className="min-h-10">
                {isLoadingUsers ? "Loading..." : "Refresh Users"}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Displayed users</p>
                <p className="mt-2 text-3xl font-black">{isLoadingUsers ? "—" : users.length}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="mt-2 text-lg font-black uppercase">Admin</p>
              </div>
              <div className="rounded-2xl border bg-background p-4 sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Selected action</p>
                <p className="mt-2 text-lg font-black">{isEditing ? "Editing" : "Creating"}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 lg:hidden">
              {users.length ? (
                users.map((user) => {
                  const isCurrentUser = currentUser?.id === user.id;

                  return (
                    <article key={user.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-black">{user.name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            Created {formatDate(user.createdAt)}
                          </p>
                        </div>
                        <span className="w-fit rounded-full border bg-muted px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
                          {isCurrentUser ? "Current" : user.role}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <Button type="button" variant="outline" onClick={() => handleEditUser(user)} className="min-h-10">
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={deletingUserId === user.id || isCurrentUser}
                              className="min-h-10"
                            >
                              {deletingUserId === user.id ? "Deleting..." : "Delete"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {user.name}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(user.id)}
                                className="bg-destructive text-destructive-foreground hover:opacity-90"
                              >
                                Delete User
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
                  {isLoadingUsers ? "Loading users..." : "No users found."}
                </div>
              )}
            </div>

            <div className="mt-5 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Created</th>
                    <th className="px-3 py-3">Updated</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length ? (
                    users.map((user) => {
                      const isCurrentUser = currentUser?.id === user.id;

                      return (
                        <tr key={user.id} className="border-b last:border-b-0">
                          <td className="px-3 py-3 font-black">{user.name}</td>
                          <td className="px-3 py-3">{user.email}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full border bg-muted px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
                              {isCurrentUser ? "Current" : user.role}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-semibold">{formatDate(user.createdAt)}</td>
                          <td className="px-3 py-3 font-semibold">{formatDate(user.updatedAt)}</td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" onClick={() => handleEditUser(user)} size="sm">
                                Edit
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={deletingUserId === user.id || isCurrentUser}
                                  >
                                    {deletingUserId === user.id ? "Deleting..." : "Delete"}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete user?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete {user.name}. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="bg-destructive text-destructive-foreground hover:opacity-90"
                                    >
                                      Delete User
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm font-semibold text-muted-foreground">
                        {isLoadingUsers ? "Loading users..." : "No users found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}