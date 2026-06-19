import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EffectivePermissions } from "@zentory/shared";
import type {
  filterSidebarNavGroups as filterSidebarNavGroupsType,
  getPendingStaffRequests as getPendingStaffRequestsType,
  getStoreMenuActions as getStoreMenuActionsType,
  navGroups as navGroupsType,
  shouldResetWarehouseDetailOnBranchChange as shouldResetWarehouseDetailOnBranchChangeType
} from "./AppShell";

const TestIcon = () => null;
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

const groups = [
  {
    title: "Overview",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: TestIcon },
      { to: "/app/onboarding", label: "Onboarding", icon: TestIcon }
    ]
  },
  {
    title: "Reports",
    items: [
      { to: "/app/reports/stock", label: "Stock report", icon: TestIcon },
      { to: "/app/audit-log", label: "Audit Log", icon: TestIcon }
    ]
  }
];

let filterSidebarNavGroups: typeof filterSidebarNavGroupsType;
let getPendingStaffRequests: typeof getPendingStaffRequestsType;
let getStoreMenuActions: typeof getStoreMenuActionsType;
let appNavGroups: typeof navGroupsType;
let shouldResetWarehouseDetailOnBranchChange: typeof shouldResetWarehouseDetailOnBranchChangeType;

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const appShell = await import("./AppShell");
  filterSidebarNavGroups = appShell.filterSidebarNavGroups;
  getPendingStaffRequests = appShell.getPendingStaffRequests;
  getStoreMenuActions = appShell.getStoreMenuActions;
  appNavGroups = appShell.navGroups;
  shouldResetWarehouseDetailOnBranchChange = appShell.shouldResetWarehouseDetailOnBranchChange;
});

describe("filterSidebarNavGroups", () => {
  it("filters sidebar items by label", () => {
    expect(filterSidebarNavGroups(groups, "stock", true)).toEqual([
      {
        title: "Reports",
        items: [{ to: "/app/reports/stock", label: "Stock report", icon: TestIcon }]
      }
    ]);
  });

  it("keeps a whole group when the group title matches", () => {
    expect(filterSidebarNavGroups(groups, "reports", true)).toEqual([groups[1]]);
  });

  it("keeps onboarding hidden when the session should not show it", () => {
    expect(filterSidebarNavGroups(groups, "", false)[0].items).toEqual([{ to: "/app/dashboard", label: "Dashboard", icon: TestIcon }]);
  });

  it("returns no groups when the query has no matches", () => {
    expect(filterSidebarNavGroups(groups, "missing", true)).toEqual([]);
  });

  it("keeps store-wide branch management out of the sidebar", () => {
    const labels = filterSidebarNavGroups(appNavGroups, "", false, {
      ...noPermissions,
      "branches.manage": true,
      "business.update": true
    }).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).not.toContain("จัดการสาขา");
    expect(labels).not.toContain("ตั้งค่าร้าน");
  });

  it("shows branch settings only to owners and branch managers", () => {
    const ownerLabels = filterSidebarNavGroups(appNavGroups, "", false, noPermissions, "OWNER").flatMap((group) => group.items.map((item) => item.label));
    const branchManagerLabels = filterSidebarNavGroups(appNavGroups, "", false, noPermissions, "BRANCH_MANAGER").flatMap((group) => group.items.map((item) => item.label));
    const cashierLabels = filterSidebarNavGroups(appNavGroups, "", false, noPermissions, "CASHIER").flatMap((group) => group.items.map((item) => item.label));

    expect(ownerLabels).toContain("ตั้งค่าสาขา");
    expect(branchManagerLabels).toContain("ตั้งค่าสาขา");
    expect(cashierLabels).not.toContain("ตั้งค่าสาขา");
  });

  it("keeps branch staff as an in-page section instead of a separate sidebar item", () => {
    const sidebarItems = filterSidebarNavGroups(appNavGroups, "", false, { ...noPermissions, "members.manage": true }, "OWNER")
      .flatMap((group) => group.items);

    expect(sidebarItems.map((item) => item.label)).not.toContain("พนักงาน");
    expect(sidebarItems.map((item) => item.to)).not.toContain("/app/branch-settings?section=staff");
  });
});

describe("getPendingStaffRequests", () => {
  it("keeps only staff requests waiting for approval", () => {
    expect(getPendingStaffRequests([
      { id: "member-1", status: "PENDING" },
      { id: "member-2", status: "ACTIVE" },
      { id: "member-3", status: "REJECTED" },
      { id: "member-4", status: "PENDING" }
    ])).toEqual([
      { id: "member-1", status: "PENDING" },
      { id: "member-4", status: "PENDING" }
    ]);
  });
});

describe("getStoreMenuActions", () => {
  it("shows the edit store action only with business update permission", () => {
    expect(getStoreMenuActions({ ...noPermissions, "business.update": true }).canEditStore).toBe(true);
    expect(getStoreMenuActions({ ...noPermissions, "business.update": false }).canEditStore).toBe(false);
    expect(getStoreMenuActions(undefined).canEditStore).toBe(false);
  });
});

describe("shouldResetWarehouseDetailOnBranchChange", () => {
  it("resets only warehouse detail routes when the working branch changes", () => {
    expect(shouldResetWarehouseDetailOnBranchChange("/app/warehouses/warehouse_1")).toBe(true);
    expect(shouldResetWarehouseDetailOnBranchChange("/app/warehouses")).toBe(false);
    expect(shouldResetWarehouseDetailOnBranchChange("/app/warehouses/warehouse_1/edit")).toBe(false);
    expect(shouldResetWarehouseDetailOnBranchChange("/app/products/product_1")).toBe(false);
  });
});
