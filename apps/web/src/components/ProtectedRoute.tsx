import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/auth";
import { getProtectedRouteRedirect } from "../lib/protected-route";

export function ProtectedRoute() {
  const session = useAuth((state) => state.session);
  const ensureActiveSession = useAuth((state) => state.ensureActiveSession);
  const location = useLocation();
  const redirectTo = getProtectedRouteRedirect(location.pathname, session);

  useEffect(() => {
    ensureActiveSession();
    const interval = window.setInterval(() => ensureActiveSession(), 60 * 1000);
    return () => window.clearInterval(interval);
  }, [ensureActiveSession, location.pathname]);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
}
