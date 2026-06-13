import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/auth";
import { getProtectedRouteRedirect } from "../lib/protected-route";

export function ProtectedRoute() {
  const session = useAuth((state) => state.session);
  const location = useLocation();
  const redirectTo = getProtectedRouteRedirect(location.pathname, session);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
}
