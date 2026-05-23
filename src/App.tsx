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

import { isAuthenticated, logout } from "./api/auth";
import AppLayout from "./components/layout";
import Loading from "./components/loading";
import { Toaster } from "./components/ui/sonner";
import LoginPage from "./pages/auth/login";
import AttendancePage from "./pages/main/attendance";
import DashboardPage from "./pages/main/dashboard";
import FinesPage from "./pages/main/fines";
import UsersPage from "./pages/main/users";
import LandingPage from "./pages/landing";
import NotFoundPage from "./pages/notfound";

type ProtectedPageProps = {
  authenticated: boolean;
  onLogout: () => void;
  children: ReactNode;
};

function ProtectedPage(props: ProtectedPageProps) {
  const location = useLocation();

  if (!props.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
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
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setIsCheckingSession(false);
  }, []);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, [location.pathname]);

  const protectedRoutes = useMemo(
    () => [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/attendance", element: <AttendancePage /> },
      { path: "/fines", element: <FinesPage /> },
      { path: "/users", element: <UsersPage /> },
    ],
    [],
  );

  function handleLogout() {
    logout();
    setAuthenticated(false);
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
            <ProtectedPage authenticated={authenticated} onLogout={handleLogout}>
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