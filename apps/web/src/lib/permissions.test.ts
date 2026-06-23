import { describe, expect, it } from "vitest";
import { planCapabilities, planCatalog, resolvePlanCapabilities, type AuthSession, type EffectivePermissions, type Role } from "@zentory/shared";
import { canManageProductMaster, hasSessionPermission } from "./permissions";

function session(role: Role, isSystemAdmin = false): AuthSession {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "user", name: "User", email: "user@example.com", isSystemAdmin },
    business: { id: "business", name: "Store", role }
  };
}

describe("canManageProductMaster", () => {
  it("allows owners and system admins to manage product master data", () => {
    expect(canManageProductMaster(session("OWNER"))).toBe(true);
    expect(canManageProductMaster(session("BRANCH_MANAGER", true))).toBe(true);
  });

  it("blocks non-owner store roles from managing product master data", () => {
    expect(canManageProductMaster(session("MANAGER"))).toBe(false);
    expect(canManageProductMaster(session("BRANCH_MANAGER"))).toBe(false);
    expect(canManageProductMaster(session("STOCK_STAFF"))).toBe(false);
  });
});

describe("hasSessionPermission", () => {
  it("allows system admins for every permission", () => {
    expect(hasSessionPermission(session("VIEWER", true), "products.update")).toBe(true);
    expect(hasSessionPermission(session("VIEWER", true), "members.manage")).toBe(true);
  });

  it("blocks sessions without a business", () => {
    const noBusiness: AuthSession = {
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "user", name: "User", email: "user@example.com", isSystemAdmin: false }
    };

    expect(hasSessionPermission(noBusiness, "products.read")).toBe(false);
  });

  it("uses role defaults when effective permissions are not present", () => {
    expect(hasSessionPermission(session("CASHIER"), "products.read")).toBe(true);
    expect(hasSessionPermission(session("CASHIER"), "products.update")).toBe(false);
  });

  it("uses effective permissions when provided by the session", () => {
    const effectivePermissions: EffectivePermissions = {
      "products.read": false,
      "products.create": false,
      "products.update": true,
      "products.update_price": false,
      "products.update_cost": false,
      "products.archive": false,
      "inventory.read": false,
      "inventory.receive": false,
      "inventory.adjust": false,
      "inventory.movements.read": false,
      "sales.create": false,
      "sales.read": false,
      "sales.void": false,
      "reports.dashboard.read": false,
      "reports.sales.read": false,
      "reports.stock.read": false,
      "branches.manage": false,
      "warehouses.manage": false,
      "members.manage": false,
      "business.update": false,
      "subscription.manage": false
    };

    expect(hasSessionPermission({
      ...session("CASHIER"),
      business: { id: "business", name: "Store", role: "CASHIER", effectivePermissions }
    }, "products.read")).toBe(false);
    expect(hasSessionPermission({
      ...session("CASHIER"),
      business: { id: "business", name: "Store", role: "CASHIER", effectivePermissions }
    }, "products.update")).toBe(true);
  });
});

describe("planCatalog", () => {
  it("defines the paid launch packages and limits", () => {
    expect(planCatalog.STARTER).toMatchObject({
      name: "Starter",
      productLimit: 200,
      userLimit: 2,
      branchLimit: 1,
      warehouseLimit: 1,
      priceMonthly: 399,
      priceYearly: 3990
    });
    expect(planCatalog.PROFESSIONAL).toMatchObject({
      name: "Professional",
      productLimit: 1500,
      userLimit: 6,
      branchLimit: 1,
      warehouseLimit: 2,
      priceMonthly: 899,
      priceYearly: 8990
    });
    expect(planCatalog.MULTI_BRANCH).toMatchObject({
      name: "Multi-Branch",
      productLimit: 3000,
      userLimit: 12,
      branchLimit: 2,
      warehouseLimit: 4,
      priceMonthly: 1790,
      priceYearly: 17900
    });
  });

  it("keeps stock count available on Starter while gating advanced operations", () => {
    expect(resolvePlanCapabilities("STARTER")).toMatchObject({
      canUseStockCount: true,
      canUseApprovalWorkflow: false,
      canUseAuditLog: false,
      canUseProfitLoss: false,
      canUseBranchTransfer: false,
      canUseMultiBranch: false,
      canUseAdvancedExport: false
    });
    expect(resolvePlanCapabilities("PROFESSIONAL")).toMatchObject({
      canUseStockCount: true,
      canUseApprovalWorkflow: true,
      canUseAuditLog: true,
      canUseProfitLoss: true,
      canUseBranchTransfer: false,
      canUseMultiBranch: false,
      canUseAdvancedExport: true
    });
    expect(resolvePlanCapabilities("MULTI_BRANCH")).toMatchObject({
      canUseBranchTransfer: true,
      canUseMultiBranch: true,
      canUseAdvancedExport: true
    });
  });

  it("falls back to Starter capabilities for unknown or missing plan codes", () => {
    expect(resolvePlanCapabilities(undefined)).toEqual(planCapabilities.STARTER);
    expect(resolvePlanCapabilities("legacy_pro")).toEqual(planCapabilities.STARTER);
  });

  it("maps legacy launch plan codes to the new paid packages", () => {
    expect(resolvePlanCapabilities("FREE")).toEqual(planCapabilities.STARTER);
    expect(resolvePlanCapabilities("PRO")).toEqual(planCapabilities.PROFESSIONAL);
    expect(resolvePlanCapabilities("PREMIUM")).toEqual(planCapabilities.MULTI_BRANCH);
  });
});
