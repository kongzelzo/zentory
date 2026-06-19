import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBranchPosSettings, saveBranchPosSettings } from "./pos-settings";

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  });
}

describe("branch POS settings", () => {
  beforeEach(() => stubLocalStorage());

  it("saves and loads settings per branch", () => {
    saveBranchPosSettings("branch-a", { defaultPaymentMethod: "TRANSFER", paymentQrImage: "qr-a" });

    expect(loadBranchPosSettings("branch-a")).toEqual({ defaultPaymentMethod: "TRANSFER", paymentQrImage: "qr-a" });
    expect(loadBranchPosSettings("branch-b")).toEqual({ defaultPaymentMethod: "CASH", paymentQrImage: "" });
  });

  it("keeps the legacy QR as a fallback before branch settings are saved", () => {
    localStorage.setItem("zentory-pos-payment-qr", "legacy-qr");

    expect(loadBranchPosSettings("branch-a")).toEqual({ defaultPaymentMethod: "CASH", paymentQrImage: "legacy-qr" });
  });
});
