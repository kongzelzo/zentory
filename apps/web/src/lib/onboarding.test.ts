import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@zentory/shared";
import { buildOnboardingSteps, getPostAuthPath, markProfileSetupCompleted, onboardingStepDefinitions, shouldShowOnboardingNav } from "./onboarding";

const baseSession: AuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
};

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  });
}

describe("onboarding navigation helpers", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("sends users without a store to profile setup after auth", () => {
    expect(getPostAuthPath(baseSession)).toBe("/account-setup");
  });

  it("sends users without a store to join-or-create after profile setup", () => {
    markProfileSetupCompleted(baseSession.user.id);
    expect(getPostAuthPath(baseSession)).toBe("/join-or-create");
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

  it("describes product, stock, and sale onboarding as real store data", () => {
    const productStep = onboardingStepDefinitions.find((step) => step.key === "firstProduct");
    const stockStep = onboardingStepDefinitions.find((step) => step.key === "stockIn");
    const saleStep = onboardingStepDefinitions.find((step) => step.key === "firstSale");

    expect(productStep?.description).toContain("อยู่ในระบบ");
    expect(stockStep?.description).toContain("ประวัติรับเข้าสต็อกจริง");
    expect(saleStep?.title).toBe("ขายสินค้าจริงรายการแรก");
    expect(saleStep?.description).toContain("บันทึกประวัติขายจริง");
  });
});
