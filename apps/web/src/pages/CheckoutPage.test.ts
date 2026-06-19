import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  checkoutModeFromParam as checkoutModeFromParamType,
  checkoutProviderForMode as checkoutProviderForModeType,
  checkoutSubmitLabel as checkoutSubmitLabelType,
  checkoutSummaryLabel as checkoutSummaryLabelType
} from "./CheckoutPage";

let checkoutModeFromParam: typeof checkoutModeFromParamType;
let checkoutProviderForMode: typeof checkoutProviderForModeType;
let checkoutSubmitLabel: typeof checkoutSubmitLabelType;
let checkoutSummaryLabel: typeof checkoutSummaryLabelType;

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
