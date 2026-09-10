import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calculator,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileClock,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  UserCheck,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getStoredUser } from "../api/auth";
import {
  ATTENDANCE_REQUESTS_UPDATED_EVENT,
  listAttendanceRequests,
} from "../api/attendanceRequests";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import ThemeToggle from "./theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

type LayoutProps = {
  children: ReactNode;
  currentPath: string;
  authenticated: boolean;
  onLogout: () => void;
};

type NavItem = {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
  showPendingBadge?: boolean;
};

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function LogoMark(props: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${props.className ?? ""}`}>
      <img
        src="/logo.svg"
        alt="Penalyze logo"
        className="size-9 rounded-lg object-contain"
      />
      <span className={`font-semibold tracking-tight ${props.textClassName ?? ""}`}>
        Penalyze
      </span>
    </span>
  );
}

function LogoutConfirmation(props: {
  trigger: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{props.trigger}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            You will need to sign in again to access the dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>Log out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PendingBadge(props: { count: number; className?: string }) {
  if (props.count <= 0) return null;

  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-black leading-none text-destructive-foreground ${props.className ?? ""}`}
      aria-label={`${props.count} pending request${props.count === 1 ? "" : "s"}`}
    >
      {props.count > 99 ? "99+" : props.count}
    </span>
  );
}

export default function AppLayout(props: LayoutProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopGroupOpen, setDesktopGroupOpen] = useState<string | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const currentUser = useMemo(() => getStoredUser(), []);
  const isAdmin = currentUser?.role === "admin";

  const dashboardItem: NavItem = {
    path: "/dashboard",
    label: "Dashboard",
    description: "Overview and activity",
    icon: LayoutDashboard,
  };

  const navGroups: NavGroup[] = [
    {
      id: "attendance",
      label: "Attendance",
      showPendingBadge: true,
      items: [
        {
          path: "/attendance",
          label: "Attendance",
          description: "Record and review attendance",
          icon: ClipboardCheck,
        },
        {
          path: "/attendance-requests",
          label: "Requests",
          description: "Review pending submissions",
          icon: FileClock,
        },
        {
          path: "/manual-attendance",
          label: "Manual",
          description: "Add attendance manually",
          icon: UserCheck,
        },
        {
          path: "/events",
          label: "Events",
          description: "Manage attendance events",
          icon: CalendarDays,
        },
      ],
    },
    {
      id: "records",
      label: "Records",
      items: [
        {
          path: "/history",
          label: "History",
          description: "Browse attendance history",
          icon: History,
        },
        {
          path: "/calculate",
          label: "Calculate",
          description: "Calculate attendance totals",
          icon: Calculator,
        },
        {
          path: "/fines",
          label: "Fines",
          description: "Review and export fines",
          icon: ReceiptText,
        },
      ],
    },
    {
      id: "administration",
      label: "Admin",
      items: [
        {
          path: "/users",
          label: "Users",
          description: "Manage user access",
          icon: Users,
          adminOnly: true,
        },
        {
          path: "/audit-log",
          label: "Audit Log",
          description: "Review accountable actions",
          icon: ScrollText,
          adminOnly: true,
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    let active = true;

    async function refreshPendingRequestCount() {
      try {
        const rows = await listAttendanceRequests({ status: "pending" });
        if (active) setPendingRequestCount(rows.length);
      } catch {
        if (active) setPendingRequestCount(0);
      }
    }

    const handleRequestsUpdated = () => void refreshPendingRequestCount();
    void refreshPendingRequestCount();
    window.addEventListener(ATTENDANCE_REQUESTS_UPDATED_EVENT, handleRequestsUpdated);
    const intervalId = window.setInterval(refreshPendingRequestCount, 30_000);

    return () => {
      active = false;
      window.removeEventListener(ATTENDANCE_REQUESTS_UPDATED_EVENT, handleRequestsUpdated);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setDesktopGroupOpen(null);
  }, [props.currentPath]);

  useEffect(() => {
    if (!desktopGroupOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-desktop-nav-group]")) {
        setDesktopGroupOpen(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDesktopGroupOpen(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopGroupOpen]);

  function handleNavigate(path: string) {
    setDesktopGroupOpen(null);
    setMobileMenuOpen(false);
    navigate(path);
  }

  function handleLogout() {
    setDesktopGroupOpen(null);
    setMobileMenuOpen(false);
    props.onLogout();
  }

  if (!props.authenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="fixed right-4 top-4 z-[100] rounded-xl border bg-background/90 p-1 shadow-sm backdrop-blur">
          <ThemeToggle />
        </div>
        {props.children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleNavigate("/dashboard")}
            className="h-10 shrink-0 justify-start rounded-xl px-1.5 hover:bg-muted/60"
            aria-label="Go to dashboard"
          >
            <LogoMark textClassName="text-lg" />
          </Button>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 xl:flex"
            aria-label="Dashboard navigation"
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleNavigate(dashboardItem.path)}
              className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                props.currentPath === dashboardItem.path
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Dashboard
            </Button>

            {navGroups.map((group) => {
              const active = group.items.some((item) => item.path === props.currentPath);
              const open = desktopGroupOpen === group.id;

              return (
                <div key={group.id} className="relative" data-desktop-nav-group>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setDesktopGroupOpen((current) =>
                        current === group.id ? null : group.id,
                      )
                    }
                    className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active || open
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    aria-haspopup="menu"
                    aria-expanded={open}
                  >
                    <span>{group.label}</span>
                    {group.showPendingBadge ? (
                      <PendingBadge count={pendingRequestCount} className="ml-0.5" />
                    ) : null}
                    <ChevronDown
                      className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </Button>

                  {open ? (
                    <div
                      role="menu"
                      aria-label={`${group.label} menu`}
                      className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/5"
                    >
                      <div className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {group.label}
                      </div>
                      {group.items.map((item) => {
                        const itemActive = props.currentPath === item.path;
                        const Icon = item.icon;

                        return (
                          <button
                            key={item.path}
                            type="button"
                            role="menuitem"
                            onClick={() => handleNavigate(item.path)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                              itemActive
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted/70"
                            }`}
                          >
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${
                                itemActive
                                  ? "border-primary/20 bg-primary/10"
                                  : "bg-background"
                              }`}
                            >
                              <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-sm font-semibold">
                                {item.label}
                                {item.path === "/attendance-requests" ? (
                                  <PendingBadge count={pendingRequestCount} />
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                                {item.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="rounded-lg border bg-background p-0.5">
              <ThemeToggle />
            </div>

            <LogoutConfirmation
              onConfirm={handleLogout}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  className="hidden h-9 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground xl:inline-flex"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Log out
                </Button>
              }
            />

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-lg xl:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-4" aria-hidden="true" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="right"
                className="h-svh min-h-svh w-80 overflow-y-auto border-l bg-background px-4 py-5 sm:px-5 xl:hidden"
              >
                <SheetHeader className="mb-5 border-b pb-4 text-left">
                  <SheetTitle>
                    <LogoMark textClassName="text-lg" />
                  </SheetTitle>
                </SheetHeader>

                <nav className="flex flex-col gap-4" aria-label="Mobile dashboard navigation">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleNavigate(dashboardItem.path)}
                    className={`h-11 justify-start rounded-xl px-3 text-sm font-medium ${
                      props.currentPath === dashboardItem.path
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    Dashboard
                  </Button>

                  {navGroups.map((group) => {
                    const groupActive = group.items.some(
                      (item) => item.path === props.currentPath,
                    );

                    return (
                      <section
                        key={group.id}
                        className={`rounded-2xl border p-1.5 ${
                          groupActive ? "bg-primary/[0.035]" : "bg-muted/20"
                        }`}
                        aria-label={`${group.label} navigation`}
                      >
                        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {group.label}
                          </span>
                          {group.showPendingBadge ? (
                            <PendingBadge count={pendingRequestCount} />
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-0.5">
                          {group.items.map((item) => {
                            const active = props.currentPath === item.path;
                            const Icon = item.icon;

                            return (
                              <Button
                                key={item.path}
                                type="button"
                                variant="ghost"
                                onClick={() => handleNavigate(item.path)}
                                className={`h-11 justify-start rounded-xl px-3 text-sm font-medium ${
                                  active
                                    ? "bg-background text-primary shadow-sm hover:bg-background hover:text-primary"
                                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                }`}
                              >
                                <Icon className="size-4" aria-hidden="true" />
                                <span>{item.label}</span>
                                {item.path === "/attendance-requests" ? (
                                  <PendingBadge count={pendingRequestCount} className="ml-auto" />
                                ) : null}
                              </Button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}

                  <LogoutConfirmation
                    onConfirm={handleLogout}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 justify-start rounded-xl px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                      >
                        <LogOut className="size-4" aria-hidden="true" />
                        Log out
                      </Button>
                    }
                  />
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div className="pt-16">{props.children}</div>
    </div>
  );
}
