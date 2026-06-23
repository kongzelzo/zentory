import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  checkoutModeFromParam as checkoutModeFromParamType,
  checkoutProviderForMode as checkoutProviderForModeType,
  checkoutSubmitLabel as checkoutSubmitLabelType,
  checkoutSummaryLabel as checkoutSummaryLabelType,
  checkoutPlans as checkoutPlansType,
  checkoutConfirmationPayload as checkoutConfirmationPayloadType,
  planFromParam as planFromParamType
} from "./CheckoutPage";

let checkoutModeFromParam: typeof checkoutModeFromParamType;
let checkoutProviderForMode: typeof checkoutProviderForModeType;
let checkoutSubmitLabel: typeof checkoutSubmitLabelType;
let checkoutSummaryLabel: typeof checkoutSummaryLabelType;
let checkoutPlans: typeof checkoutPlansType;
let checkoutConfirmationPayload: typeof checkoutConfirmationPayloadType;
let planFromParam: typeof planFromParamType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./CheckoutPage");
  checkoutModeFromParam = module.checkoutModeFromParam;
  checkoutProviderForMode = module.checkoutProviderForMode;
  checkoutSubmitLabel = module.checkoutSubmitLabel;
  checkoutSummaryLabel = module.checkoutSummaryLabel;
  checkoutPlans = module.checkoutPlans;
  checkoutConfirmationPayload = module.checkoutConfirmationPayload;
  planFromParam = module.planFromParam;
});

describe("checkout billing mode helpers", () => {
  it("defaults to card subscription checkout", () => {
    expect(checkoutModeFromParam(null)).toBe("subscription");
    expect(checkoutModeFromParam("yearly")).toBe("subscription");
    expect(checkoutProviderForMode("subscription")).toBe("stripe");
    expect(checkoutSubmitLabel("subscription")).toContain("ตัดบัตร");
  });

  it("uses PromptPay one-time checkout when requested", () => {
    expect(checkoutModeFromParam("promptpay")).toBe("promptpay");
    expect(checkoutProviderForMode("promptpay")).toBe("stripe_promptpay");
    expect(checkoutSubmitLabel("promptpay")).toContain("PromptPay");
    expect(checkoutSummaryLabel("promptpay")).toContain("30 วัน");
  });
});

describe("checkout paid launch plans", () => {
  it("offers Starter, Professional, and Multi-Branch without a free checkout plan", () => {
    expect(Object.keys(checkoutPlans)).toEqual(["starter", "professional", "multi_branch"]);
    expect(checkoutPlans.starter.monthlyPrice).toBe(399);
    expect(checkoutPlans.professional.monthlyPrice).toBe(899);
    expect(checkoutPlans.multi_branch.monthlyPrice).toBe(1790);
  });

  it("defaults unknown plan params to Professional", () => {
    expect(planFromParam(null)).toBe("professional");
    expect(planFromParam("multi-branch")).toBe("multi_branch");
  });

  it("normalizes canonical and legacy plan params", () => {
    expect(planFromParam("STARTER")).toBe("starter");
    expect(planFromParam("PRO")).toBe("professional");
    expect(planFromParam("PREMIUM")).toBe("multi_branch");
    expect(planFromParam("free")).toBe("starter");
  });
});

describe("checkout success confirmation", () => {
  it("builds a Stripe confirmation payload from a successful return URL", () => {
    expect(checkoutConfirmationPayload("success", "cs_test_123", "ZT-123")).toEqual({
      sessionId: "cs_test_123",
      reference: "ZT-123"
    });
  });

  it("does not confirm cancelled or missing Stripe sessions", () => {
    expect(checkoutConfirmationPayload("cancelled", "cs_test_123", "ZT-123")).toBeUndefined();
    expect(checkoutConfirmationPayload("success", null, "ZT-123")).toBeUndefined();
  });
});
