import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  checkoutSuccessConfirmationPayload as checkoutSuccessConfirmationPayloadType,
  checkoutSuccessReturnPath as checkoutSuccessReturnPathType
} from "./CheckoutSuccessPage";

let checkoutSuccessConfirmationPayload: typeof checkoutSuccessConfirmationPayloadType;
let checkoutSuccessReturnPath: typeof checkoutSuccessReturnPathType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./CheckoutSuccessPage");
  checkoutSuccessConfirmationPayload = module.checkoutSuccessConfirmationPayload;
  checkoutSuccessReturnPath = module.checkoutSuccessReturnPath;
});

describe("checkout success page helpers", () => {
  it("builds confirmation payload from the Stripe success return", () => {
    expect(checkoutSuccessConfirmationPayload("cs_test_123", "ZT-123")).toEqual({
      sessionId: "cs_test_123",
      reference: "ZT-123"
    });
  });

  it("returns signed-in users to their account package page", () => {
    expect(checkoutSuccessReturnPath(true)).toBe("/app/profile/billing");
  });
});
