import { useState } from "react";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
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
};

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function LogoMark(props: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${props.className ?? ""}`}>
      <img src="/logo.svg" alt="Penalyze logo" className="size-10 rounded-xl object-contain" />
      <span className={`font-black tracking-tight ${props.textClassName ?? ""}`}>Penalyze</span>
    </span>
  );
}

export default function AppLayout(props: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/attendance", label: "Attendance" },
    { path: "/fines", label: "Fines" },
    { path: "/users", label: "Users" }
  ];

  function handleNavigate(path: string) {
    setMobileMenuOpen(false);
    navigateTo(path);
  }

  function handleLogout() {
    setMobileMenuOpen(false);
    props.onLogout();
  }

  if (!props.authenticated) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigateTo("/dashboard")}
            className="text-left"
            aria-label="Go to dashboard"
          >
            <LogoMark textClassName="text-xl" />
          </button>

          <nav className="hidden items-center gap-2 lg:flex" aria-label="Dashboard navigation">
            {navItems.map((item) => {
              const active = props.currentPath === item.path;

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigateTo(item.path)}
                  className={`min-h-10 rounded-xl px-4 py-2 text-sm font-black transition ${
                    active ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-accent"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={props.onLogout}
            className="hidden min-h-10 items-center justify-center rounded-xl border bg-card px-4 py-2 text-xs font-black transition hover:bg-accent lg:inline-flex"
          >
            Logout
          </button>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-xl border bg-card text-foreground transition hover:bg-accent lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </SheetTrigger>

            <SheetContent side="right" className="w-80 px-5 py-6 sm:px-6 lg:hidden">
              <SheetHeader className="mb-6 text-left">
                <SheetTitle>
                  <LogoMark textClassName="text-xl" />
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col gap-3" aria-label="Mobile dashboard navigation">
                {navItems.map((item) => {
                  const active = props.currentPath === item.path;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      className={`min-h-12 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                        active ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-accent"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 inline-flex min-h-12 items-center justify-center rounded-2xl border bg-card px-4 py-3 text-sm font-black transition hover:bg-accent"
                >
                  Logout
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {props.children}
    </div>
  );
}