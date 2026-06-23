import { beforeAll, describe, expect, it, vi } from "vitest";
import type { billingModeLabel as billingModeLabelType } from "./OperationsPages";

let billingModeLabel: typeof billingModeLabelType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./OperationsPages");
  billingModeLabel = module.billingModeLabel;
});

describe("billing mode labels", () => {
  it("labels active subscription and canceling subscription differently", () => {
    expect(billingModeLabel("STRIPE_SUBSCRIPTION")).toBe("รายเดือนอัตโนมัติผ่าน Stripe");
    expect(billingModeLabel("STRIPE_SUBSCRIPTION", true)).toContain("ใช้ได้ถึงวันจบรอบ");
  });

  it("labels PromptPay one-time access and system-opened accounts", () => {
    expect(billingModeLabel("PROMPTPAY_ONE_TIME")).toBe("PromptPay แบบจ่ายครั้งเดียว");
    expect(billingModeLabel("FREE")).toBe("เปิดใช้งานโดยระบบ");
  });
});
