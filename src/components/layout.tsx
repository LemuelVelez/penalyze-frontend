import type { ReactNode } from "react";

type LayoutProps = {
  children: ReactNode;
  currentPath: string;
  authenticated: boolean;
  onLogout: () => void;
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
  const navItems = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/attendance", label: "Attendance" },
    { path: "/fines", label: "Fines" },
    { path: "/users", label: "Users" }
  ];

  if (!props.authenticated) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigateTo("/dashboard")}
              className="text-left"
              aria-label="Go to dashboard"
            >
              <LogoMark textClassName="text-xl" />
            </button>

            <button
              type="button"
              onClick={props.onLogout}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border bg-card px-4 py-2 text-xs font-black transition hover:bg-accent lg:hidden"
            >
              Logout
            </button>
          </div>

          <nav className="flex flex-col gap-2 sm:flex-row sm:overflow-x-auto sm:pb-1 lg:pb-0" aria-label="Dashboard navigation">
            {navItems.map((item) => {
              const active = props.currentPath === item.path;

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigateTo(item.path)}
                  className={`min-h-10 rounded-xl px-4 py-2 text-sm font-black transition sm:shrink-0 ${
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
        </div>
      </header>

      {props.children}
    </div>
  );
}
