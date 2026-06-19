import { describe, expect, it } from "vitest";
import { buildOwnerTodos, calculateSalesTargetPreview, dashboardPathForScope, getRoleDashboardPath, getSessionDashboardPath } from "./dashboard";
import type { AuthSession } from "@zentory/shared";

describe("dashboard route helpers", () => {
  it("routes owners and managers to the owner dashboard", () => {
    expect(getRoleDashboardPath("OWNER")).toBe("/app/dashboard/owner");
    expect(getRoleDashboardPath("MANAGER")).toBe("/app/dashboard/owner");
    expect(getRoleDashboardPath("BRANCH_MANAGER")).toBe("/app/dashboard/owner");
  });

  it("routes operational roles to their own dashboards", () => {
    expect(getRoleDashboardPath("CASHIER")).toBe("/app/dashboard/cashier");
    expect(getRoleDashboardPath("STOCK_STAFF")).toBe("/app/dashboard/stock");
    expect(getRoleDashboardPath("VIEWER")).toBe("/app/dashboard/viewer");
  });

  it("uses the current session role for dashboard links", () => {
    const session = { business: { role: "CASHIER" } } as AuthSession;
    expect(getSessionDashboardPath(session)).toBe("/app/dashboard/cashier");
  });

  it("builds an all-branches dashboard report path", () => {
    expect(dashboardPathForScope({ mode: "ALL" })).toBe("/reports/dashboard");
  });

  it("builds a branch-scoped dashboard report path", () => {
    expect(dashboardPathForScope({ mode: "BRANCH", branchId: "branch_moon" })).toBe("/reports/dashboard?branchId=branch_moon");
  });

  it("falls back to the all-branches dashboard path when branch scope has no branch", () => {
    expect(dashboardPathForScope({ mode: "BRANCH" })).toBe("/reports/dashboard");
  });

  it("splits an annual target into equal monthly target and current-month daily target", () => {
    expect(calculateSalesTargetPreview("ANNUAL", 120000, 30)).toEqual({
      annualSalesTarget: 120000,
      monthlySalesTarget: 10000,
      dailySalesTarget: 10000 / 30
    });
  });

  it("derives annual and daily targets from a monthly target", () => {
    expect(calculateSalesTargetPreview("MONTHLY", 12000, 30)).toEqual({
      annualSalesTarget: 144000,
      monthlySalesTarget: 12000,
      dailySalesTarget: 400
    });
  });

  it("derives annual and current-month targets from a daily target", () => {
    expect(calculateSalesTargetPreview("DAILY", 500, 31)).toEqual({
      annualSalesTarget: 182500,
      monthlySalesTarget: 15500,
      dailySalesTarget: 500
    });
  });

  it("returns an empty preview when annual target is not set", () => {
    expect(calculateSalesTargetPreview("ANNUAL", null, 30)).toEqual({
      annualSalesTarget: null,
      monthlySalesTarget: null,
      dailySalesTarget: null
    });
  });
});

describe("owner dashboard todos", () => {
  const baseData = {
    sales: {
      todayReceiptCount: 2,
      dailyTargetProgress: { target: 1000, current: 1200, percent: 120, remaining: 0, reached: true },
      trend30Days: {
        last7DaysTotal: 12000,
        previous7DaysTotal: 10000,
        last7DaysChangePercent: 20
      }
    },
    inventory: {
      lowStockProducts: 0,
      outOfStockProducts: 0
    }
  };

  it("adds urgent todos for low sales, falling trend, and stock risks", () => {
    const todos = buildOwnerTodos({
      sales: {
        todayReceiptCount: 0,
        dailyTargetProgress: { target: 1000, current: 400, percent: 40, remaining: 600, reached: false },
        trend30Days: {
          last7DaysTotal: 7000,
          previous7DaysTotal: 10000,
          last7DaysChangePercent: -30
        }
      },
      inventory: {
        lowStockProducts: 3,
        outOfStockProducts: 2
      }
    });

    expect(todos).toHaveLength(4);
    expect(todos.map((todo) => todo.to)).toEqual(["/app/sales", "#goals", "/app/reports/sales", "/app/reports/stock"]);
    expect(todos[1].label).toBe("ยอดขายวันนี้ยังต่ำกว่าเป้า");
    expect(todos[2].label).toContain("ลดลง 30%");
  });

  it("shows a healthy state when there are no urgent todos", () => {
    expect(buildOwnerTodos(baseData)).toEqual([
      { label: "วันนี้ยังไม่มีงานด่วน", detail: "ยอดขายและสต็อกไม่มีสัญญาณเสี่ยง" }
    ]);
  });
});
