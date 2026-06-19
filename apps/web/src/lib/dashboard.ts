import type { AuthSession, Role } from "@zentory/shared";

export type SalesTargetMode = "ANNUAL" | "MONTHLY" | "DAILY";
export type DashboardScope = { mode: "ALL" } | { mode: "BRANCH"; branchId?: string };
type TargetProgress = { target: number | null; current: number; percent: number | null; remaining: number | null; reached: boolean };

export type OwnerTodo = { label: string; detail: string; to?: string };

type OwnerDashboardTodoData = {
  sales: {
    todayReceiptCount: number;
    dailyTargetProgress: TargetProgress;
    trend30Days?: {
      last7DaysTotal: number;
      previous7DaysTotal: number;
      last7DaysChangePercent: number;
    } | null;
  };
  inventory: {
    lowStockProducts: number;
    outOfStockProducts: number;
  };
};

export function getRoleDashboardPath(role?: Role | null) {
  if (role === "OWNER" || role === "MANAGER" || role === "BRANCH_MANAGER") return "/app/dashboard/owner";
  if (role === "CASHIER") return "/app/dashboard/cashier";
  if (role === "STOCK_STAFF") return "/app/dashboard/stock";
  if (role === "VIEWER") return "/app/dashboard/viewer";
  return "/app/dashboard/owner";
}

export function getSessionDashboardPath(session?: AuthSession | null) {
  return getRoleDashboardPath(session?.business?.role);
}

export function dashboardPathForScope(scope: DashboardScope) {
  if (scope.mode !== "BRANCH" || !scope.branchId) return "/reports/dashboard";
  const params = new URLSearchParams({ branchId: scope.branchId });
  return `/reports/dashboard?${params.toString()}`;
}

export function calculateSalesTargetPreview(mode: SalesTargetMode, sourceTarget: number | null, daysInCurrentMonth: number) {
  if (!sourceTarget || sourceTarget <= 0 || daysInCurrentMonth <= 0) {
    return { annualSalesTarget: null, monthlySalesTarget: null, dailySalesTarget: null };
  }
  if (mode === "MONTHLY") {
    return {
      annualSalesTarget: sourceTarget * 12,
      monthlySalesTarget: sourceTarget,
      dailySalesTarget: sourceTarget / daysInCurrentMonth
    };
  }
  if (mode === "DAILY") {
    return {
      annualSalesTarget: sourceTarget * 365,
      monthlySalesTarget: sourceTarget * daysInCurrentMonth,
      dailySalesTarget: sourceTarget
    };
  }
  const monthlySalesTarget = sourceTarget / 12;
  return {
    annualSalesTarget: sourceTarget,
    monthlySalesTarget,
    dailySalesTarget: monthlySalesTarget / daysInCurrentMonth
  };
}

export function buildOwnerTodos(data: OwnerDashboardTodoData): OwnerTodo[] {
  const todos: OwnerTodo[] = [];
  const trend30Days = data.sales.trend30Days ?? { last7DaysTotal: 0, previous7DaysTotal: 0, last7DaysChangePercent: 0 };
  if (data.sales.todayReceiptCount === 0) {
    todos.push({ label: "ยังไม่มีรายการขายที่บันทึกวันนี้", detail: "ตรวจสอบประวัติขายหรือรายงานขายวันนี้", to: "/app/sales" });
  }
  if (data.sales.dailyTargetProgress.target && !data.sales.dailyTargetProgress.reached) {
    todos.push({ label: "ยอดขายวันนี้ยังต่ำกว่าเป้า", detail: "ดูเป้ายอดขายวันนี้และปรับแผนระหว่างวัน", to: "#goals" });
  }
  if (trend30Days.previous7DaysTotal > 0 && trend30Days.last7DaysChangePercent < 0) {
    todos.push({ label: `ยอดขาย 7 วันล่าสุดลดลง ${Math.abs(trend30Days.last7DaysChangePercent).toLocaleString("th-TH")}%`, detail: "เปิดรายงานขายเพื่อดูวันที่ยอดตกและสินค้าที่กระทบ", to: "/app/reports/sales" });
  }
  if (data.inventory.outOfStockProducts > 0) {
    todos.push({ label: `สินค้าหมด ${data.inventory.outOfStockProducts.toLocaleString("th-TH")} รายการ`, detail: "ตรวจสอบรายการที่ขายไม่ได้แล้ว", to: "/app/reports/stock" });
  }
  if (data.inventory.lowStockProducts > 0) {
    todos.push({ label: `สินค้าใกล้หมด/ควรเติม ${data.inventory.lowStockProducts.toLocaleString("th-TH")} รายการ`, detail: "เปิดสินค้าต้องเติมเพื่อวางแผนรับเข้า", to: "/app/reports/stock" });
  }
  if (todos.length === 0) todos.push({ label: "วันนี้ยังไม่มีงานด่วน", detail: "ยอดขายและสต็อกไม่มีสัญญาณเสี่ยง" });
  return todos.slice(0, 4);
}
