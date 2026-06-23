import { beforeAll, describe, expect, it, vi } from "vitest";
import type { landingPricingPlans as landingPricingPlansType } from "./LandingPage";

let landingPricingPlans: typeof landingPricingPlansType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./LandingPage");
  landingPricingPlans = module.landingPricingPlans;
});

describe("landing pricing plans", () => {
  it("keeps complete plan copy grouped for readable index cards", () => {
    expect(landingPricingPlans).toHaveLength(3);

    expect(landingPricingPlans[0]).toMatchObject({
      name: "Starter",
      desc: "ร้านเล็กที่เริ่มใช้จริง",
      bestFor: "เหมาะกับร้านเดียวที่ต้องการเริ่มจัดระบบสต็อก"
    });
    expect(landingPricingPlans[0].highlights).toEqual(["สินค้า 200 รายการ", "ผู้ใช้ 2 คน", "1 สาขา / 1 คลัง"]);
    expect(landingPricingPlans[0].details).toContain("ขายหน้าร้าน / POS");
    expect(landingPricingPlans[0].details).toContain("ใช้ Stock Count ได้");

    expect(landingPricingPlans[1].details).toContain("Profit & Loss");
    expect(landingPricingPlans[1].details).toContain("Approval Workflow");
    expect(landingPricingPlans[2].highlights).toContain("2 สาขา / 4 คลัง");
    expect(landingPricingPlans[2].details).toContain("โอนสินค้าระหว่างสาขา / คลัง");
  });
});
