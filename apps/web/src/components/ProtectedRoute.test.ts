import { describe, expect, it } from "vitest";
import type { AuthSession } from "@zentory/shared";
import { getProtectedRouteRedirect } from "../lib/protected-route";

const baseSession: AuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
};

describe("getProtectedRouteRedirect", () => {
  it("sends signed-out users to login", () => {
    expect(getProtectedRouteRedirect("/app/dashboard")).toBe("/login");
  });

  it("sends users without a store to setup-store", () => {
    expect(getProtectedRouteRedirect("/app/dashboard", baseSession)).toBe("/setup-store");
  });

  it("allows users with unfinished onboarding to open the dashboard directly", () => {
    expect(
      getProtectedRouteRedirect("/app/dashboard", {
        ...baseSession,
        business: { id: "business_1", name: "Aquarium", role: "OWNER", onboardingCompleted: false }
      })
    ).toBeUndefined();
  });
});
