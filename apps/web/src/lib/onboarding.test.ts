import { describe, expect, it } from "vitest";
import type { AuthSession } from "@zentory/shared";
import { buildOnboardingSteps, getPostAuthPath, shouldShowOnboardingNav } from "./onboarding";

const baseSession: AuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
};

describe("onboarding navigation helpers", () => {
  it("sends users without a store to setup-store after auth", () => {
    expect(getPostAuthPath(baseSession)).toBe("/setup-store");
  });

  it("sends users with a store to the dashboard even when onboarding is unfinished", () => {
    expect(getPostAuthPath({ ...baseSession, business: { id: "business_1", name: "ร้าน", role: "OWNER", onboardingCompleted: false } })).toBe("/app/dashboard");
  });

  it("hides onboarding nav after completion", () => {
    const session = { ...baseSession, business: { id: "business_1", name: "ร้าน", role: "OWNER", onboardingCompleted: true } } satisfies AuthSession;
    expect(shouldShowOnboardingNav(session)).toBe(false);
  });
});

describe("buildOnboardingSteps", () => {
  it("marks only completed steps with completed status and picks the next current step", () => {
    const steps = buildOnboardingSteps({ setupStore: true, firstProduct: false, stockIn: false, firstSale: false, firstReport: false });

    expect(steps.map((step) => step.status)).toEqual(["completed", "current", "pending", "pending", "pending"]);
  });
});
