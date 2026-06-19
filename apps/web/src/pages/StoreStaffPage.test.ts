import { beforeAll, describe, expect, it, vi } from "vitest";
import type { filterStoreStaffMembers as filterStoreStaffMembersType, getStoreStaffMembersPath as getStoreStaffMembersPathType } from "./StoreStaffPage";

let filterStoreStaffMembers: typeof filterStoreStaffMembersType;
let getStoreStaffMembersPath: typeof getStoreStaffMembersPathType;

const permissions = {
  "products.read": true,
  "products.create": false,
  "products.update": false,
  "products.update_price": false,
  "products.update_cost": false,
  "products.archive": false,
  "inventory.read": true,
  "inventory.receive": false,
  "inventory.adjust": false,
  "inventory.movements.read": true,
  "sales.create": false,
  "sales.read": true,
  "sales.void": false,
  "reports.dashboard.read": true,
  "reports.sales.read": true,
  "reports.stock.read": true,
  "branches.manage": false,
  "warehouses.manage": false,
  "members.manage": false,
  "business.update": false,
  "subscription.manage": false
};

const members = [
  {
    id: "one",
    role: "CASHIER",
    status: "ACTIVE",
    permissionOverrides: {},
    effectivePermissions: permissions,
    assignedBranches: [{ id: "branch-one", name: "สาขาหนึ่ง" }],
    user: { name: "Ann", email: "ann@example.com" },
    employeePhone: "0801111111"
  },
  {
    id: "two",
    role: "VIEWER",
    status: "DISABLED",
    permissionOverrides: {},
    effectivePermissions: permissions,
    assignedBranches: [{ id: "branch-two", name: "สาขาสอง" }],
    user: { name: "Bee", email: "bee@example.com" },
    employeePhone: "0802222222"
  },
  {
    id: "pending",
    role: "VIEWER",
    status: "PENDING",
    requestedBranchId: "branch-two",
    requestedBranch: { id: "branch-two", name: "สาขาสอง" },
    permissionOverrides: {},
    effectivePermissions: permissions,
    assignedBranches: [],
    user: { name: "Candidate", email: "candidate@example.com" },
    employeePhone: "0803333333"
  }
] as Parameters<typeof filterStoreStaffMembersType>[0];

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  const module = await import("./StoreStaffPage");
  filterStoreStaffMembers = module.filterStoreStaffMembers;
  getStoreStaffMembersPath = module.getStoreStaffMembersPath;
});

describe("StoreStaffPage helpers", () => {
  it("uses the store-level members endpoint without a branch scope", () => {
    expect(getStoreStaffMembersPath()).toBe("/members");
  });

  it("filters by status, branch, and search query together", () => {
    expect(filterStoreStaffMembers(members, { status: "ACTIVE", branchId: "branch-one", query: "ann" }).map((member) => member.id)).toEqual(["one"]);
    expect(filterStoreStaffMembers(members, { status: "ALL", branchId: "branch-two", query: "candidate" }).map((member) => member.id)).toEqual(["pending"]);
    expect(filterStoreStaffMembers(members, { status: "DISABLED", branchId: "branch-one", query: "" })).toEqual([]);
  });
});
