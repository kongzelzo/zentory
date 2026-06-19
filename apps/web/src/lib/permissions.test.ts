import { describe, expect, it } from "vitest";
import type { AuthSession, EffectivePermissions, Role } from "@zentory/shared";
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
