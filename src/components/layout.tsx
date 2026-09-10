import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calculator,
  CalendarDays,
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
  icon: LucideIcon;
  adminOnly?: boolean;
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

export default function AppLayout(props: LayoutProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentUser = useMemo(() => getStoredUser(), []);
  const isAdmin = currentUser?.role === "admin";

  const navItems: NavItem[] = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/attendance", label: "Attendance", icon: ClipboardCheck },
    { path: "/attendance-requests", label: "Requests", icon: FileClock },
    { path: "/manual-attendance", label: "Manual", icon: UserCheck },
    { path: "/events", label: "Events", icon: CalendarDays },
    { path: "/history", label: "History", icon: History },
    { path: "/calculate", label: "Calculate", icon: Calculator },
    { path: "/fines", label: "Fines", icon: ReceiptText },
    { path: "/users", label: "Users", icon: Users, adminOnly: true },
    { path: "/audit-log", label: "Audit Log", icon: ScrollText, adminOnly: true },
  ];
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  function handleNavigate(path: string) {
    setMobileMenuOpen(false);
    navigate(path);
  }

  function handleLogout() {
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
            onClick={() => navigate("/dashboard")}
            className="h-10 shrink-0 justify-start rounded-xl px-1.5 hover:bg-muted/60"
            aria-label="Go to dashboard"
          >
            <LogoMark textClassName="text-lg" />
          </Button>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex"
            aria-label="Dashboard navigation"
          >
            {visibleNavItems.map((item) => {
              const active = props.currentPath === item.path;
              const Icon = item.icon;

              return (
                <Button
                  key={item.path}
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(item.path)}
                  className={`h-9 rounded-lg px-2.5 text-xs font-medium transition-colors 2xl:px-3 2xl:text-sm ${
                    active
                      ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Button>
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
                className="h-svh min-h-svh w-80 border-l bg-background px-4 py-5 sm:px-5 xl:hidden"
              >
                <SheetHeader className="mb-5 border-b pb-4 text-left">
                  <SheetTitle>
                    <LogoMark textClassName="text-lg" />
                  </SheetTitle>
                </SheetHeader>

                <nav className="flex flex-col gap-1" aria-label="Mobile dashboard navigation">
                  {visibleNavItems.map((item) => {
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
                            ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Button>
                    );
                  })}

                  <div className="my-3 border-t" />

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
