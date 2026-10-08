import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { toast } from "sonner";

import { getCurrentUser, getStoredUser, handleUnauthorized, isAuthenticated, logout, SESSION_EXPIRED_EVENT } from "./api/auth";
import type { AuthUser, UserRole } from "./api/auth";
import AppLayout from "./components/layout";
import Loading from "./components/loading";
import { Toaster } from "./components/ui/sonner";
import LoginPage from "./pages/auth/login";
import AttendancePage from "./pages/main/attendance";
import AttendanceRequestsPage from "./pages/main/attendance-requests";
import HistoryPage from "./pages/main/history";
import ManualAttendancePage from "./pages/main/manual-attendance";
import CalculatePage from "./pages/main/calculate";
import EventsPage from "./pages/main/events";
import DashboardPage from "./pages/main/dashboard";
import FinesPage from "./pages/main/fines";
import UsersPage from "./pages/main/users";
import AuditLogPage from "./pages/main/audit-log";
import SettingsPage from "./pages/main/settings";
import LandingPage from "./pages/landing";
import NotFoundPage from "./pages/notfound";

type ProtectedPageProps = {
  authenticated: boolean;
  currentUser: AuthUser | null;
  allowedRoles?: UserRole[];
  onLogout: () => void;
  children: ReactNode;
};

function ProtectedPage(props: ProtectedPageProps) {
  const location = useLocation();

  const authenticated = props.authenticated || isAuthenticated();
  const currentUser = props.currentUser ?? (authenticated ? getStoredUser() : null);

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (props.allowedRoles?.length && (!currentUser || !props.allowedRoles.includes(currentUser.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout
      currentPath={location.pathname}
      authenticated={authenticated}
      onLogout={props.onLogout}
    >
      {props.children}
    </AppLayout>
  );
}

function LoginRoute(props: { authenticated: boolean }) {
  if (props.authenticated) return <Navigate to="/dashboard" replace />;

  return <LoginPage />;
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const currentLocation = useRef(location);
  currentLocation.current = location;

  useEffect(() => {
    let mounted = true;

    function onSessionExpired() {
      if (!mounted) return;
      setAuthenticated(false);
      setCurrentUser(null);
      toast.error("Your session expired, please sign in again.", { id: "session-expired" });
      const from = currentLocation.current;
      if (from.pathname !== "/login") {
        navigate("/login", { replace: true, state: { from } });
      }
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    async function validateSession() {
      if (!isAuthenticated()) {
        if (mounted) setIsCheckingSession(false);
        return;
      }

      try {
        const user = await getCurrentUser();
        if (!user) {
          handleUnauthorized();
          return;
        }
        if (mounted) {
          setAuthenticated(true);
          setCurrentUser(user);
        }
      } catch {
        // An HTTP 401 is handled by the shared API helper. On a network failure,
        // retain the unexpired local session; subsequent requests can still retry.
        if (mounted && isAuthenticated()) {
          setAuthenticated(true);
          setCurrentUser(getStoredUser());
        }
      } finally {
        if (mounted) setIsCheckingSession(false);
      }
    }

    void validateSession();
    return () => {
      mounted = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    };
  }, [navigate]);

  useEffect(() => {
    if (isCheckingSession) return;
    const hasSession = isAuthenticated();
    setAuthenticated(hasSession);
    setCurrentUser(hasSession ? getStoredUser() : null);
  }, [location.pathname, isCheckingSession]);

  const protectedRoutes = useMemo(
    () => [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/attendance", element: <AttendancePage /> },
      { path: "/attendance-requests", element: <AttendanceRequestsPage /> },
      { path: "/manual-attendance", element: <ManualAttendancePage /> },
      { path: "/events", element: <EventsPage /> },
      { path: "/history", element: <HistoryPage /> },
      { path: "/calculate", element: <CalculatePage /> },
      { path: "/fines", element: <FinesPage /> },
      { path: "/users", element: <UsersPage />, allowedRoles: ["admin"] as UserRole[] },
      { path: "/audit-log", element: <AuditLogPage />, allowedRoles: ["admin"] as UserRole[] },
      { path: "/settings", element: <SettingsPage /> },
    ],
    [],
  );

  function handleLogout() {
    logout();
    setAuthenticated(false);
    setCurrentUser(null);
    navigate("/", { replace: true });
    toast.success("Logged out successfully.");
  }

  if (isCheckingSession) {
    return <Loading label="Checking session..." />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginRoute authenticated={authenticated} />} />
      {protectedRoutes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={
            <ProtectedPage
              authenticated={authenticated}
              currentUser={currentUser}
              allowedRoles={route.allowedRoles}
              onLogout={handleLogout}
            >
              {route.element}
            </ProtectedPage>
          }
        />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster />
    </BrowserRouter>
  );
}