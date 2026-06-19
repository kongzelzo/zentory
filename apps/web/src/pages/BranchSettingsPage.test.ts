import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EffectivePermissions } from "@zentory/shared";
import type {
  BranchSettingsForm,
  buildBranchReadiness as buildBranchReadinessType,
  buildBranchShortcutLinks as buildBranchShortcutLinksType,
  getBranchSettingsSection as getBranchSettingsSectionType
} from "./BranchSettingsPage";

const completeForm: BranchSettingsForm = {
  name: "สาขาหลัก",
  code: "MAIN",
  status: "ACTIVE",
  address: "ชั้น 1",
  contactName: "ผู้จัดการ",
  contactPhone: "080-000-0000",
  note: ""
};

let buildBranchReadiness: typeof buildBranchReadinessType;
let buildBranchShortcutLinks: typeof buildBranchShortcutLinksType;
let getBranchSettingsSection: typeof getBranchSettingsSectionType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./BranchSettingsPage");
  buildBranchReadiness = module.buildBranchReadiness;
  buildBranchShortcutLinks = module.buildBranchShortcutLinks;
  getBranchSettingsSection = module.getBranchSettingsSection;
});

describe("buildBranchReadiness", () => {
  it("marks every branch readiness item ready when core branch data, warehouse, and POS QR are present", () => {
    const items = buildBranchReadiness(completeForm, { branchId: "branch-1", warehouseCount: 1, hasPaymentQr: true });

    expect(items.every((item) => item.ready)).toBe(true);
  });

  it("marks address, contact, warehouse, and POS QR missing when they are not configured", () => {
    const items = buildBranchReadiness(
      { ...completeForm, address: "", contactName: "", contactPhone: "" },
      { branchId: "branch-1", warehouseCount: 0, hasPaymentQr: false }
    );

    expect(items.map((item) => [item.key, item.ready])).toEqual([
      ["identity", true],
      ["address", false],
      ["contact", false],
      ["warehouse", false],
      ["pos", false]
    ]);
  });
});

describe("buildBranchShortcutLinks", () => {
  const permissions: EffectivePermissions = {
    "products.read": false,
    "products.create": false,
    "products.update": false,
    "products.update_price": false,
    "products.update_cost": false,
    "products.archive": false,
    "inventory.read": false,
    "inventory.receive": true,
    "inventory.adjust": true,
    "inventory.movements.read": true,
    "sales.create": false,
    "sales.read": true,
    "sales.void": false,
    "reports.dashboard.read": false,
    "reports.sales.read": true,
    "reports.stock.read": true,
    "branches.manage": false,
    "warehouses.manage": false,
    "members.manage": false,
    "business.update": false,
    "subscription.manage": false
  };

  it("keeps branch shortcuts focused on operational actions instead of sales reports", () => {
    const links = buildBranchShortcutLinks("branch-1", permissions);

    expect(links.map((link) => link.label)).toEqual(["รับสินค้าเข้า", "ปรับสต็อก", "ประวัติสต็อก"]);
    expect(links.map((link) => link.to)).toEqual([
      "/app/inventory/receipts?branchId=branch-1",
      "/app/inventory/adjustments?branchId=branch-1",
      "/app/inventory/movements?branchId=branch-1"
    ]);
  });
});

describe("getBranchSettingsSection", () => {
  it("returns the staff section only when the URL asks for staff and the user can manage members", () => {
    expect(getBranchSettingsSection(new URLSearchParams("section=staff"), true)).toBe("staff");
    expect(getBranchSettingsSection(new URLSearchParams("section=staff"), false)).toBe("overview");
  });

  it("returns overview when the URL no longer has a section", () => {
    const currentSection = getBranchSettingsSection(new URLSearchParams("section=staff"), true);
    const nextSection = getBranchSettingsSection(new URLSearchParams(), true);

    expect(currentSection).toBe("staff");
    expect(nextSection).toBe("overview");
  });
});
