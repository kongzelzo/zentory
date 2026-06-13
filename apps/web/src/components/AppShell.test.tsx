import { beforeAll, describe, expect, it, vi } from "vitest";
import type { filterSidebarNavGroups as filterSidebarNavGroupsType } from "./AppShell";

const TestIcon = () => null;

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

beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  });
  filterSidebarNavGroups = (await import("./AppShell")).filterSidebarNavGroups;
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
});
