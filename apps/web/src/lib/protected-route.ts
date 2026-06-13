import type { AuthSession } from "@zentory/shared";

export function getProtectedRouteRedirect(pathname: string, session?: AuthSession) {
  if (!session) return "/login";
  if (!session.business && pathname !== "/setup-store" && pathname !== "/app/onboarding" && pathname !== "/onboarding") {
    return "/setup-store";
  }
  return undefined;
}
