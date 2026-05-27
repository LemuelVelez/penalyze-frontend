import { useEffect, useMemo, useState } from "react";
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

import { getStoredUser, isAuthenticated, logout } from "./api/auth";
import type { AuthUser, UserRole } from "./api/auth";
import AppLayout from "./components/layout";
import Loading from "./components/loading";
import { Toaster } from "./components/ui/sonner";
import LoginPage from "./pages/auth/login";
import AttendancePage from "./pages/main/attendance";
import HistoryPage from "./pages/main/history";
import ManualAttendancePage from "./pages/main/manual-attendance";
import DashboardPage from "./pages/main/dashboard";
import FinesPage from "./pages/main/fines";
import UsersPage from "./pages/main/users";
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

  if (!props.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (props.allowedRoles?.length && (!props.currentUser || !props.allowedRoles.includes(props.currentUser.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout
      currentPath={location.pathname}
      authenticated={props.authenticated}
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

  useEffect(() => {
    const hasSession = isAuthenticated();
    setAuthenticated(hasSession);
    setCurrentUser(hasSession ? getStoredUser() : null);
    setIsCheckingSession(false);
  }, []);

  useEffect(() => {
    const hasSession = isAuthenticated();
    setAuthenticated(hasSession);
    setCurrentUser(hasSession ? getStoredUser() : null);
  }, [location.pathname]);

  const protectedRoutes = useMemo(
    () => [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/attendance", element: <AttendancePage /> },
      { path: "/manual-attendance", element: <ManualAttendancePage /> },
      { path: "/history", element: <HistoryPage /> },
      { path: "/fines", element: <FinesPage /> },
      { path: "/users", element: <UsersPage />, allowedRoles: ["admin"] as UserRole[] },
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