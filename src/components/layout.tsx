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
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getStoredUser } from "../api/auth";
import { BACKGROUNDS } from "../lib/backgrounds";
import {
  CALCULATION_STATUS_UPDATED_EVENT,
  getCalculationPendingSummary,
} from "../api/attendance";
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
import PageBackground from "./page-background";
import { Button } from "./ui/button";
import ThemeToggle from "./theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  showCalculationBadge?: boolean;
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

function PendingBadge(props: {
  count: number;
  className?: string;
  ariaLabel?: string;
  dot?: boolean;
}) {
  if (props.count <= 0) return null;

  if (props.dot) {
    return (
      <span
        className={`inline-flex size-2.5 shrink-0 rounded-full bg-amber-500 ${props.className ?? ""}`}
        aria-label={props.ariaLabel ?? "Pending item"}
      />
    );
  }

  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-black leading-none text-destructive-foreground ${props.className ?? ""}`}
      aria-label={
        props.ariaLabel ??
        `${props.count} pending request${props.count === 1 ? "" : "s"}`
      }
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
  const [calculationNeeded, setCalculationNeeded] = useState(false);

  const currentUser = useMemo(() => getStoredUser(), []);
  const isAdmin = currentUser?.role === "admin";

  const dashboardItem: NavItem = {
    path: "/dashboard",
    label: "Dashboard",
    description: "Overview and activity",
    icon: LayoutDashboard,
  };

  const rawNavGroups: NavGroup[] = [
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
      showCalculationBadge: true,
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
    {
      id: "account",
      label: "Account",
      items: [
        {
          path: "/settings",
          label: "Settings",
          description: "Change your account password",
          icon: Settings,
        },
      ],
    },
  ];

  const navGroups = rawNavGroups
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
    let active = true;

    async function refreshCalculationNeeded() {
      try {
        const summary = await getCalculationPendingSummary();
        if (active) setCalculationNeeded(summary.needsCalculation);
      } catch {
        if (active) setCalculationNeeded(false);
      }
    }

    const handleCalculationStatusUpdated = () => void refreshCalculationNeeded();
    void refreshCalculationNeeded();
    window.addEventListener(
      CALCULATION_STATUS_UPDATED_EVENT,
      handleCalculationStatusUpdated,
    );
    window.addEventListener("focus", handleCalculationStatusUpdated);
    const intervalId = window.setInterval(refreshCalculationNeeded, 30_000);

    return () => {
      active = false;
      window.removeEventListener(
        CALCULATION_STATUS_UPDATED_EVENT,
        handleCalculationStatusUpdated,
      );
      window.removeEventListener("focus", handleCalculationStatusUpdated);
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
      <div className="relative isolate min-h-svh w-full min-w-0 max-w-full text-foreground">
        <PageBackground
          image={BACKGROUNDS.mainLight}
          darkImage={BACKGROUNDS.mainDark}
          overlay="strong"
          mobileOverlay="light"
          objectPosition="center 30%"
        />
        <div className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-100 rounded-xl border bg-background/90 p-1 shadow-sm backdrop-blur">
          <ThemeToggle />
        </div>
        {props.children}
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-svh w-full min-w-0 max-w-full text-foreground">
      <PageBackground
        image={BACKGROUNDS.mainLight}
        darkImage={BACKGROUNDS.mainDark}
        overlay="strong"
          mobileOverlay="light"
          objectPosition="center 30%"
      />
      <header className="fixed inset-x-0 top-0 z-40 min-w-0 max-w-full border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-400 min-w-0 items-center gap-2 px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:gap-3 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleNavigate("/dashboard")}
            className="min-w-0 max-sm:px-0 h-11 shrink justify-start rounded-xl px-1.5 hover:bg-muted/60 [&_span]:max-sm:gap-1.5"
            aria-label="Go to dashboard"
          >
            <LogoMark textClassName="text-lg" />
          </Button>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex xl:gap-1.5"
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
                    {group.showCalculationBadge ? (
                      <PendingBadge
                        count={calculationNeeded ? 1 : 0}
                        dot
                        ariaLabel="Calculation needed"
                        className="ml-0.5"
                      />
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
                                {item.path === "/calculate" ? (
                                  <PendingBadge
                                    count={calculationNeeded ? 1 : 0}
                                    dot
                                    ariaLabel="Calculation needed"
                                  />
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

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <div className="rounded-lg border bg-background p-0.5">
              <ThemeToggle />
            </div>

            <LogoutConfirmation
              onConfirm={handleLogout}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  className="hidden h-9 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:text-foreground lg:inline-flex"
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
                  className="relative size-11 rounded-xl lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" aria-hidden="true" />
                  <PendingBadge
                    count={pendingRequestCount}
                    className="absolute -right-1 -top-1 ring-2 ring-background"
                  />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="right"
                className="h-svh min-h-svh w-[min(20rem,100vw)] min-w-0 max-w-full overflow-x-hidden overflow-y-auto border-l bg-background px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 lg:hidden"
              >
                <SheetHeader className="mb-5 border-b pb-4 text-left">
                  <SheetTitle>
                    <LogoMark textClassName="text-lg" />
                  </SheetTitle>
                  <SheetDescription>
                    Navigate between dashboard sections.
                  </SheetDescription>
                </SheetHeader>

                <nav className="flex min-w-0 flex-col gap-4" aria-label="Mobile dashboard navigation">
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
                        className={`min-w-0 rounded-2xl border p-1.5 ${
                          groupActive ? "bg-primary/[0.035]" : "bg-muted/20"
                        }`}
                        aria-label={`${group.label} navigation`}
                      >
                        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="flex items-center gap-2">
                            {group.showPendingBadge ? (
                              <PendingBadge count={pendingRequestCount} />
                            ) : null}
                            {group.showCalculationBadge ? (
                              <PendingBadge
                                count={calculationNeeded ? 1 : 0}
                                dot
                                ariaLabel="Calculation needed"
                              />
                            ) : null}
                          </span>
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
                                <span className="min-w-0 truncate">{item.label}</span>
                                {item.path === "/attendance-requests" ? (
                                  <PendingBadge count={pendingRequestCount} className="ml-auto" />
                                ) : null}
                                {item.path === "/calculate" ? (
                                  <PendingBadge
                                    count={calculationNeeded ? 1 : 0}
                                    dot
                                    ariaLabel="Calculation needed"
                                    className="ml-auto"
                                  />
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

      <div className="min-w-0 max-w-full scroll-pt-16 pt-[calc(4rem+env(safe-area-inset-top))]">{props.children}</div>
    </div>
  );
}
