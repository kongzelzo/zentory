import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, EffectivePermissions, Role } from "@zentory/shared";
import { getProtectedRouteRedirect } from "../lib/protected-route";
import { markProfileSetupCompleted } from "../lib/onboarding";

const baseSession: AuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
};

const noPermissions: EffectivePermissions = {
  "products.read": false,
  "products.create": false,
  "products.update": false,
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

function session(role: Role, permissions?: Partial<EffectivePermissions>, isSystemAdmin = false): AuthSession {
  return {
    ...baseSession,
    user: { ...baseSession.user, isSystemAdmin },
    business: {
      id: "business_1",
      name: "Aquarium",
      role,
      ...(permissions ? { effectivePermissions: { ...noPermissions, ...permissions } } : {})
    }
  };
}

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  });
}

describe("getProtectedRouteRedirect", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("sends signed-out users to login", () => {
    expect(getProtectedRouteRedirect("/app/dashboard")).toBe("/login");
  });

  it("sends users without a store to profile setup first", () => {
    expect(getProtectedRouteRedirect("/app/dashboard", baseSession)).toBe("/account-setup");
  });

  it("sends users without a store to the join-or-create choice after profile setup", () => {
    markProfileSetupCompleted(baseSession.user.id);
    expect(getProtectedRouteRedirect("/app/dashboard", baseSession)).toBe("/join-or-create");
  });

  it("sends pending membership requests to the waiting page", () => {
    expect(getProtectedRouteRedirect("/app/dashboard", {
      ...baseSession,
      membershipRequest: { id: "member_1", businessId: "business_1", businessName: "Aquarium", status: "PENDING" }
    })).toBe("/join-request/pending");
  });

  it("sends rejected membership requests to the rejected page", () => {
    expect(getProtectedRouteRedirect("/app/dashboard", {
      ...baseSession,
      membershipRequest: { id: "member_1", businessId: "business_1", businessName: "Aquarium", status: "REJECTED" }
    })).toBe("/join-request/rejected");
  });

  it("allows users with unfinished onboarding to open the dashboard directly", () => {
    expect(
      getProtectedRouteRedirect("/app/dashboard", {
        ...baseSession,
        business: { id: "business_1", name: "Aquarium", role: "OWNER", onboardingCompleted: false }
      })
    ).toBeUndefined();
  });

  it("sends users without branch settings or staff permission back to their dashboard", () => {
    expect(getProtectedRouteRedirect("/app/branch-settings", session("MANAGER", {
      "reports.dashboard.read": true,
      "members.manage": false
    }))).toBe("/app/dashboard");
  });

  it("allows users with staff permission to open branch settings for staff management", () => {
    expect(getProtectedRouteRedirect("/app/branch-settings", session("MANAGER", {
      "reports.dashboard.read": true,
      "members.manage": true
    }))).toBeUndefined();
  });

  it("sends users without business update permission back to their dashboard", () => {
    expect(getProtectedRouteRedirect("/app/settings", session("MANAGER", {
      "reports.dashboard.read": true,
      "business.update": false
    }))).toBe("/app/dashboard");
  });

  it("falls back to profile when the user cannot open the dashboard", () => {
    expect(getProtectedRouteRedirect("/app/branch-settings", session("MANAGER", {
      "reports.dashboard.read": false,
      "members.manage": false
    }))).toBe("/app/profile");
  });

  it("blocks non-system admins from admin routes", () => {
    expect(getProtectedRouteRedirect("/admin", session("OWNER"))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/admin/users", session("OWNER"))).toBe("/app/dashboard");
  });

  it("allows system admins to open admin routes", () => {
    expect(getProtectedRouteRedirect("/admin", session("VIEWER", undefined, true))).toBeUndefined();
    expect(getProtectedRouteRedirect("/admin/users", session("VIEWER", undefined, true))).toBeUndefined();
    expect(getProtectedRouteRedirect("/admin", {
      ...baseSession,
      user: { ...baseSession.user, isSystemAdmin: true }
    })).toBeUndefined();
  });

  it("allows only owners and system admins to create or edit product master data", () => {
    expect(getProtectedRouteRedirect("/app/products/new", session("OWNER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/products/product_1/edit", session("VIEWER", undefined, true))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/products/new", session("MANAGER"))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/products/product_1/edit", session("MANAGER"))).toBe("/app/dashboard");
  });

  it("allows branch settings only for owners and branch managers", () => {
    expect(getProtectedRouteRedirect("/app/branch-settings", session("OWNER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/branch-settings", session("BRANCH_MANAGER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/branch-settings", session("MANAGER"))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/branch-settings", session("CASHIER"))).toBe("/app/dashboard");
  });

  it("allows branch management list and edit routes only for owners and system admins", () => {
    expect(getProtectedRouteRedirect("/app/branches", session("OWNER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/branches/branch_1/edit", session("OWNER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/branches", session("MANAGER", {
      "reports.dashboard.read": true,
      "branches.manage": true
    }))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/branches/branch_1/edit", session("MANAGER", {
      "reports.dashboard.read": true,
      "branches.manage": true
    }))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/branches", session("BRANCH_MANAGER", {
      "reports.dashboard.read": true,
      "branches.manage": true
    }))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/branches/branch_1/edit", session("VIEWER", undefined, true))).toBeUndefined();
  });

  it("allows transfer requests only for owners and managers", () => {
    expect(getProtectedRouteRedirect("/app/transfers/requests", session("OWNER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/transfers/requests", session("MANAGER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/transfers/requests", session("BRANCH_MANAGER"))).toBeUndefined();
    expect(getProtectedRouteRedirect("/app/transfers/requests", session("STOCK_STAFF"))).toBe("/app/dashboard");
    expect(getProtectedRouteRedirect("/app/transfers/requests", session("CASHIER"))).toBe("/app/dashboard");
  });

  it("allows routes without a route permission policy", () => {
    expect(getProtectedRouteRedirect("/app/profile", session("VIEWER", noPermissions))).toBeUndefined();
  });
});
