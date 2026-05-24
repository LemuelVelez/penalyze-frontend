import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
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
  adminOnly?: boolean;
};

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function LogoMark(props: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${props.className ?? ""}`}>
      <img
        src="/logo.svg"
        alt="Penalyze logo"
        className="size-10 rounded-xl object-contain"
      />
      <span className={`font-black tracking-tight ${props.textClassName ?? ""}`}>
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
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Logout confirmation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to logout? You will need to sign in again to access the dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>Logout</AlertDialogAction>
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
    { path: "/dashboard", label: "Dashboard" },
    { path: "/attendance", label: "Attendance" },
    { path: "/fines", label: "Fines" },
    { path: "/users", label: "Users", adminOnly: true },
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

  if (!props.authenticated) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed left-0 right-0 top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="h-auto justify-start rounded-2xl px-0 text-left hover:bg-transparent"
            aria-label="Go to dashboard"
          >
            <LogoMark textClassName="text-xl" />
          </Button>

          <nav className="hidden items-center gap-2 lg:flex" aria-label="Dashboard navigation">
            {visibleNavItems.map((item) => {
              const active = props.currentPath === item.path;

              return (
                <Button
                  key={item.path}
                  type="button"
                  variant={active ? "default" : "outline"}
                  onClick={() => navigate(item.path)}
                  className="min-h-10 rounded-xl px-4 py-2"
                >
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <LogoutConfirmation
            onConfirm={handleLogout}
            trigger={
              <Button
                type="button"
                variant="outline"
                className="hidden min-h-10 rounded-xl px-4 py-2 text-xs lg:inline-flex"
              >
                Logout
              </Button>
            }
          />

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="inline-flex size-11 rounded-xl lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="h-svh min-h-svh w-80 px-5 py-6 sm:px-6 lg:hidden">
              <SheetHeader className="mb-6 text-left">
                <SheetTitle>
                  <LogoMark textClassName="text-xl" />
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col gap-3" aria-label="Mobile dashboard navigation">
                {visibleNavItems.map((item) => {
                  const active = props.currentPath === item.path;

                  return (
                    <Button
                      key={item.path}
                      type="button"
                      variant={active ? "default" : "outline"}
                      onClick={() => handleNavigate(item.path)}
                      className="min-h-12 justify-start rounded-2xl px-4 py-3 text-left"
                    >
                      {item.label}
                    </Button>
                  );
                })}

                <LogoutConfirmation
                  onConfirm={handleLogout}
                  trigger={
                    <Button type="button" variant="outline" className="mt-3 min-h-12 rounded-2xl px-4 py-3">
                      Logout
                    </Button>
                  }
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="pt-20">{props.children}</div>
    </div>
  );
}