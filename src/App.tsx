import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { isAuthenticated, logout } from "./api/auth";
import AppLayout, { navigateTo } from "./components/layout";
import LoginPage from "./pages/auth/login";
import AttendancePage from "./pages/main/attendance";
import DashboardPage from "./pages/main/dashboard";
import FinesPage from "./pages/main/fines";
import UsersPage from "./pages/main/users";
import LandingPage from "./pages/landing";
import NotFoundPage from "./pages/notfound";

type RouteItem = {
  path: string;
  label: string;
  requiresAuth?: boolean;
  element: ReactNode;
};

function normalizePath(pathname: string) {
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => normalizePath(window.location.pathname));
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(normalizePath(window.location.pathname));
      setAuthenticated(isAuthenticated());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const routes = useMemo<RouteItem[]>(
    () => [
      { path: "/", label: "Landing", element: <LandingPage /> },
      { path: "/login", label: "Login", element: <LoginPage /> },
      { path: "/dashboard", label: "Dashboard", requiresAuth: true, element: <DashboardPage /> },
      { path: "/attendance", label: "Attendance", requiresAuth: true, element: <AttendancePage /> },
      { path: "/fines", label: "Fines", requiresAuth: true, element: <FinesPage /> },
      { path: "/users", label: "Users", requiresAuth: true, element: <UsersPage /> }
    ],
    []
  );

  const matchedRoute = routes.find((route) => route.path === currentPath);

  useEffect(() => {
    if (matchedRoute?.requiresAuth && !authenticated) {
      navigateTo("/login");
    }

    if (currentPath === "/login" && authenticated) {
      navigateTo("/dashboard");
    }
  }, [authenticated, currentPath, matchedRoute]);

  function handleLogout() {
    logout();
    setAuthenticated(false);
    navigateTo("/");
  }

  if (!matchedRoute) return <NotFoundPage />;

  if (matchedRoute.requiresAuth && !authenticated) {
    return <LoginPage />;
  }

  return (
    <AppLayout currentPath={currentPath} authenticated={authenticated} onLogout={handleLogout}>
      {matchedRoute.element}
    </AppLayout>
  );
}
