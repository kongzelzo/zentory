import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, Bell, Boxes, ClipboardList, FileClock, History, Loader2, Maximize2, Package, PackageX, ShoppingBag, Target, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown, type DropdownOption } from "../components/Dropdown";
import { api, patch } from "../lib/api";
import { calculateSalesTargetPreview, dashboardPathForScope, getRoleDashboardPath, getSessionDashboardPath, type DashboardScope, type SalesTargetMode } from "../lib/dashboard";
import { baht, number, thaiDate } from "../lib/format";
import { isStockAdjustmentRequestNotification, notificationAuditPath, notificationDisplayTitle, notificationDisplayTypeLabel, notificationItemBadgeClass, notificationListPath, notificationSummaryPath, type NotificationItem, type NotificationPage, type NotificationSummary, type NotificationType } from "../lib/notifications";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";
import type { EffectivePermissions, Role } from "@zentory/shared";

type TargetProgress = { target: number | null; current: number; percent: number | null; remaining: number | null; reached: boolean };
type SalesPoint = { date: string; total: number };
type StockPreview = { id: string; sku: string; name: string; quantity: number; minStock: number };
type TopProduct = { productId: string; name: string; sku: string; quantity: number; revenue: number; grossProfit: number };
type RecentSale = { id: string; receiptNo: string; total: string | number; createdAt: string };
type RecentMovement = { id: string; type: string; quantity: number; balanceAfter?: number; createdAt: string; product: { name: string } };
type TransferTask = {
  id: string;
  documentNo: string;
  status: "REQUESTED" | "IN_TRANSIT";
  createdAt: string;
  sourceWarehouse: { branchId?: string; branch?: { id: string; name: string; code?: string | null } };
  destinationWarehouse: { branchId?: string; branch?: { id: string; name: string; code?: string | null } };
};

type Dashboard = {
  role: Role;
  goals: { salesTargetMode: SalesTargetMode; annualSalesTarget: number | null; dailySalesTarget: number | null; monthlySalesTarget: number | null; daysInCurrentMonth: number };
  sales: {
    todayTotal: number;
    yesterdayTotal: number;
    todayReceiptCount: number;
    averageReceiptValue: number;
    todayGrossProfit: number;
    todayChangePercent: number;
    monthTotal: number;
    last7Days: SalesPoint[];
    trend30Days: {
      total: number;
      averageDailySales: number;
      receiptCount: number;
      last7DaysTotal: number;
      previous7DaysTotal: number;
      last7DaysChangePercent: number;
      bestDay: { date: string; total: number } | null;
    } | null;
    dailyTargetProgress: TargetProgress;
    monthlyTargetProgress: TargetProgress;
  };
  inventory: {
    stockValue: number;
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    lowStockPreview: StockPreview[];
    outOfStockPreview: StockPreview[];
  };
  topProducts: {
    today: TopProduct[];
    last7Days: TopProduct[];
  };
  recentSales: RecentSale[];
  recentMovements: RecentMovement[];
};

type Business = {
  subscription?: { plan: { name: string; productLimit: number } };
};

type BranchOption = { id: string; name: string; code?: string; status?: string };

const emptySalesTrend: NonNullable<Dashboard["sales"]["trend30Days"]> = {
  total: 0,
  averageDailySales: 0,
  receiptCount: 0,
  last7DaysTotal: 0,
  previous7DaysTotal: 0,
  last7DaysChangePercent: 0,
  bestDay: null
};
const notificationHistoryPageSize = 50;

function useDashboardScope(canSelectAllBranches = true) {
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const assignedBranchIds = useAuth((state) => state.session?.business?.assignedBranchIds ?? []);
  const [searchParams] = useSearchParams();
  const requestedBranchId = searchParams.get("branchId") || undefined;
  const defaultBranchId = workingBranchId || assignedBranchIds[0] || undefined;
  const previousWorkingBranchId = useRef<string | null>(null);
  const [scope, setScope] = useState<DashboardScope>(() => requestedBranchId ? { mode: "BRANCH", branchId: requestedBranchId } : canSelectAllBranches ? { mode: "ALL" } : { mode: "BRANCH", branchId: defaultBranchId });
  const currentScopeBranchId = scope.mode === "BRANCH" ? scope.branchId : undefined;

  useEffect(() => {
    if (requestedBranchId && (scope.mode !== "BRANCH" || currentScopeBranchId !== requestedBranchId)) {
      previousWorkingBranchId.current = requestedBranchId;
      setScope({ mode: "BRANCH", branchId: requestedBranchId });
      return;
    }
    if (!canSelectAllBranches && scope.mode === "ALL") {
      setScope({ mode: "BRANCH", branchId: defaultBranchId });
      return;
    }
    if (!canSelectAllBranches && scope.mode === "BRANCH" && !currentScopeBranchId && defaultBranchId) {
      setScope({ mode: "BRANCH", branchId: defaultBranchId });
      return;
    }
    if (!workingBranchId) return;
    if (previousWorkingBranchId.current === null) {
      previousWorkingBranchId.current = workingBranchId;
      return;
    }
    if (previousWorkingBranchId.current !== workingBranchId) {
      previousWorkingBranchId.current = workingBranchId;
      setScope({ mode: "BRANCH", branchId: workingBranchId });
    }
  }, [canSelectAllBranches, currentScopeBranchId, defaultBranchId, requestedBranchId, scope.mode, workingBranchId]);

  return { scope, setScope };
}

function useDashboard(scope: DashboardScope) {
  return useQuery({
    queryKey: ["dashboard", scope.mode, scope.mode === "BRANCH" ? scope.branchId ?? "" : "all"],
    queryFn: () => api<Dashboard>(dashboardPathForScope(scope))
  });
}

function useBusiness() {
  return useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/businesses/current") });
}

function getSessionPermissions(session?: ReturnType<typeof useAuth.getState>["session"]): EffectivePermissions | undefined {
  return session?.business?.effectivePermissions;
}

function useRoleRedirect(allowed: Role[]) {
  const role = useAuth((state) => state.session?.business?.role);
  if (!role || allowed.includes(role)) return undefined;
  return getRoleDashboardPath(role);
}

export function DashboardRedirectPage() {
  const session = useAuth((state) => state.session);
  return <Navigate to={getSessionDashboardPath(session)} replace />;
}

export function OwnerDashboardPage() {
  const redirectTo = useRoleRedirect(["OWNER", "MANAGER", "BRANCH_MANAGER"]);
  const session = useAuth((state) => state.session);
  const permissions = getSessionPermissions(session);
  const canEditGoals = permissions?.["business.update"] ?? session?.business?.role === "OWNER";
  const canSelectAllBranches = session?.business?.role === "OWNER";
  const dashboardScope = useDashboardScope(canSelectAllBranches);
  const query = useDashboard(dashboardScope.scope);

  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return (
    <DashboardState query={query}>
      {(data) => <OwnerDashboard data={data} canEditGoals={canEditGoals} canSelectAllBranches={canSelectAllBranches} dashboardScope={dashboardScope.scope} onDashboardScopeChange={dashboardScope.setScope} />}
    </DashboardState>
  );
}

export function CashierDashboardPage() {
  const redirectTo = useRoleRedirect(["CASHIER"]);
  const dashboardScope = useDashboardScope(false);
  const query = useDashboard(dashboardScope.scope);
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return (
    <DashboardState query={query}>
      {(data) => <CashierDashboard data={data} dashboardScope={dashboardScope.scope} onDashboardScopeChange={dashboardScope.setScope} />}
    </DashboardState>
  );
}

export function StockDashboardPage() {
  const redirectTo = useRoleRedirect(["STOCK_STAFF"]);
  const dashboardScope = useDashboardScope(false);
  const query = useDashboard(dashboardScope.scope);
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return (
    <DashboardState query={query}>
      {(data) => <StockDashboard data={data} dashboardScope={dashboardScope.scope} onDashboardScopeChange={dashboardScope.setScope} />}
    </DashboardState>
  );
}

export function ViewerDashboardPage() {
  const redirectTo = useRoleRedirect(["VIEWER"]);
  const dashboardScope = useDashboardScope(false);
  const query = useDashboard(dashboardScope.scope);
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return (
    <DashboardState query={query}>
      {(data) => <ViewerDashboard data={data} dashboardScope={dashboardScope.scope} onDashboardScopeChange={dashboardScope.setScope} />}
    </DashboardState>
  );
}

function DashboardState({ query, children }: { query: ReturnType<typeof useDashboard>; children: (data: Dashboard) => JSX.Element }) {
  if (query.isLoading) return <p>กำลังโหลด Dashboard...</p>;
  if (query.error) return <p className="text-red-700">{query.error.message}</p>;
  if (!query.data) return null;
  return children(query.data);
}

function OwnerDashboard({ data, canEditGoals, canSelectAllBranches, dashboardScope, onDashboardScopeChange }: { data: Dashboard; canEditGoals: boolean; canSelectAllBranches: boolean; dashboardScope: DashboardScope; onDashboardScopeChange: (scope: DashboardScope) => void }) {
  const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
  const business = useBusiness();
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<BranchOption[]>("/branches")
  });
  const activeBranches = useMemo(() => (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE"), [branches.data]);

  return (
    <div className="space-y-6">
      <DashboardHeader title="Owner Dashboard" subtitle="สุขภาพร้านวันนี้ ยอดเทียบเป้า และงานที่ต้องรีบจัดการ">
        <DashboardScopeSelector scope={dashboardScope} canSelectAllBranches={canSelectAllBranches} onScopeChange={onDashboardScopeChange} />
      </DashboardHeader>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr] xl:items-start">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="ยอดขายวันนี้" value={baht(data.sales.todayTotal)} subtitle={`เมื่อวาน ${baht(data.sales.yesterdayTotal)}`} icon={Wallet} priority />
            <MetricCard label="บิลวันนี้" value={number(data.sales.todayReceiptCount)} subtitle={`เฉลี่ย ${baht(data.sales.averageReceiptValue)}`} icon={FileClock} priority />
            <MetricCard label="กำไรขั้นต้นวันนี้" value={baht(data.sales.todayGrossProfit)} subtitle="ก่อนหักค่าใช้จ่ายอื่น" icon={Wallet} priority />
            <MetricCard label="ถึงเป้าวันนี้" value={targetPercentLabel(data.sales.dailyTargetProgress)} subtitle={data.sales.dailyTargetProgress.target ? `เป้า ${baht(data.sales.dailyTargetProgress.target)}` : "ยังไม่ได้ตั้งเป้า"} icon={Target} priority />
          </div>

          <TargetCard data={data} canEditGoals={canEditGoals} isOpen={isGoalEditorOpen} onToggle={() => setIsGoalEditorOpen((open) => !open)} />

          <QuickActions actions={[
            { label: "ดูรายงานขาย", to: "/app/reports/sales", icon: BarChart3, primary: true },
            { label: "เปิด POS", to: "/app/pos", icon: ShoppingBag },
            { label: "รับสินค้าเข้า", to: "/app/inventory/receipts", icon: Boxes },
            { label: "จัดการสินค้า", to: "/app/products", icon: Package }
          ]} />
        </div>

        <OwnerNotificationsPanel dashboardScope={dashboardScope} activeBranches={activeBranches} isLoadingBranches={branches.isLoading} compact />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="เทียบเมื่อวาน" value={signedPercent(data.sales.todayChangePercent)} subtitle={data.sales.todayChangePercent >= 0 ? "ยอดขายดีขึ้นหรือเริ่มมีรายการขาย" : "ยอดขายต่ำกว่าเมื่อวาน"} icon={BarChart3} />
        <MetricCard label="เฉลี่ยต่อบิล" value={baht(data.sales.averageReceiptValue)} icon={ShoppingBag} />
        <MetricCard label="ยอดขายเดือนนี้" value={baht(data.sales.monthTotal)} icon={BarChart3} />
        <MetricCard label="มูลค่าสต็อก" value={baht(data.inventory.stockValue)} icon={Boxes} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SalesTrendCard trend={data.sales.trend30Days ?? emptySalesTrend} />
        <InventoryPlanCard inventory={data.inventory} business={business.data} isLoading={business.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SalesChart title="ยอดขาย 7 วัน" data={data.sales.last7Days} />
        <TopProductsPanel data={data.topProducts} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RecentSalesPanel sales={data.recentSales} />
        <StockAlertsPanel inventory={data.inventory} readonly={false} />
      </div>
    </div>
  );
}

function OwnerNotificationsPanel({ dashboardScope, activeBranches, isLoadingBranches, compact = false }: { dashboardScope: DashboardScope; activeBranches: BranchOption[]; isLoadingBranches: boolean; compact?: boolean }) {
  const isMultiBranch = activeBranches.length > 1;
  const scopedBranchId = dashboardScope.mode === "BRANCH" ? dashboardScope.branchId ?? "" : "";
  const [branchFilter, setBranchFilter] = useState(scopedBranchId);
  const [typeFilter, setTypeFilter] = useState<"" | NotificationType>("");
  const [historyBranchFilter, setHistoryBranchFilter] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"" | NotificationType>("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const branchId = isMultiBranch ? branchFilter || undefined : undefined;
  const historyBranchId = isMultiBranch ? historyBranchFilter || undefined : undefined;
  const list = useQuery({
    queryKey: ["notifications", "dashboard-list", branchId ?? "all", typeFilter || "all"],
    queryFn: () => api<NotificationItem[]>(notificationListPath({ status: "all", type: typeFilter || undefined, branchId })),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const showTransferTasks = !typeFilter || typeFilter === "TRANSFER_REQUEST";
  const transferRequestTasks = useQuery({
    queryKey: ["notifications", "dashboard-transfer-tasks", "requested", branchId ?? "all"],
    queryFn: () => api<TransferTask[]>(transferTaskPath("REQUESTED", "source", branchId)),
    enabled: showTransferTasks,
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const transferReceiveTasks = useQuery({
    queryKey: ["notifications", "dashboard-transfer-tasks", "receive", branchId ?? "all"],
    queryFn: () => api<TransferTask[]>(transferTaskPath("IN_TRANSIT", "destination", branchId)),
    enabled: showTransferTasks,
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const summary = useQuery({
    queryKey: ["notifications", "dashboard-summary", branchId ?? "all"],
    queryFn: () => api<NotificationSummary>(notificationSummaryPath(branchId)),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const historyList = useInfiniteQuery({
    queryKey: ["notifications", "dashboard-history-list", historyBranchId ?? "all", historyTypeFilter || "all"],
    queryFn: ({ pageParam }) => api<NotificationPage>(notificationAuditPath({ type: historyTypeFilter || undefined, branchId: historyBranchId, limit: notificationHistoryPageSize, cursor: pageParam || undefined })),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  useEffect(() => {
    setBranchFilter(isMultiBranch ? scopedBranchId : "");
  }, [isMultiBranch, scopedBranchId]);

  const historyItems = list.data ?? [];
  const allBranchHistoryItems = useMemo(() => {
    return [...(historyList.data?.pages.flatMap((page) => page.items) ?? [])].sort(compareNotificationItems);
  }, [historyList.data]);
  const liveTransferItems = showTransferTasks ? [
    ...(transferRequestTasks.data ?? []).map((transfer) => transferTaskNotificationItem(transfer, "request")),
    ...(transferReceiveTasks.data ?? []).map((transfer) => transferTaskNotificationItem(transfer, "receive"))
  ] : [];
  const items = mergeNotificationItems([
    ...historyItems.filter((item) => !item.notification.resolvedAt && !item.archivedAt),
    ...liveTransferItems
  ]);
  const heading = isMultiBranch ? "การแจ้งเตือนทุกสาขา" : "การแจ้งเตือน";
  const historyHeading = isMultiBranch ? "ประวัติแจ้งเตือนทุกสาขา" : "ประวัติแจ้งเตือน";
  const visibleItems = compact ? items : items.slice(0, 8);
  const branchContext = !isMultiBranch && activeBranches[0]?.name ? activeBranches[0].name : undefined;
  const historyBranchContext = historyBranchId ? activeBranches.find((branch) => branch.id === historyBranchId)?.name : undefined;
  const branchOptions: DropdownOption[] = [
    { value: "", label: "ทุกสาขา" },
    ...activeBranches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.code ? ` (${branch.code})` : ""}` }))
  ];
  const typeOptions: DropdownOption[] = [
    { value: "", label: "ทุกประเภท" },
    { value: "STOCK_ALERT", label: "สต็อก" },
    { value: "TRANSFER_REQUEST", label: "โอนสินค้า" },
    { value: "STAFF_REQUEST", label: "คำขอพนักงาน" },
    { value: "STOCK_COUNT", label: "นับสต็อก" },
    { value: "SYSTEM", label: "ระบบ" }
  ];
  const compactDropdownButtonClass = "h-8 min-h-0 rounded px-2 py-0 text-xs font-black";
  const compactDropdownMenuClass = "w-max min-w-44 max-w-72";
  const taskCount = summary.data?.activeCount ?? items.length;
  const actionCount = summary.data?.openActionCount ?? 0;
  const closedCount = allBranchHistoryItems.filter((item) => item.notification.resolvedAt).length;
  const archivedCount = allBranchHistoryItems.filter((item) => item.archivedAt).length;
  const historyLoading = historyList.isLoading;
  const showAllTasksButton = compact ? items.length > 3 : items.length > visibleItems.length;

  return (
    <Card className={compact ? "flex h-[27rem] min-h-0 flex-col !p-4" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell size={compact ? 17 : 20} className="shrink-0 text-leaf" />
            <h2 className={compact ? "text-lg font-black" : "text-xl font-black"}>{heading}</h2>
          </div>
          <p className={compact ? "mt-1 text-xs font-semibold text-stone-500" : "mt-1 text-sm font-semibold text-stone-500"}>
            {branchContext ? `${branchContext} • ` : ""}ด่วน {number(summary.data?.outOfStockCount ?? 0)} | ต้องจัดการ {number(actionCount)} | งานค้าง {number(taskCount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className={compact ? "h-9 px-3 text-xs" : undefined} icon={<History size={15} />} onClick={() => setIsHistoryOpen(true)}>
            ดูประวัติ
          </Button>
          {!compact ? (
            <Button type="button" icon={<Maximize2 size={15} />} onClick={() => setIsExpanded(true)}>
              งานค้างทั้งหมด
            </Button>
          ) : null}
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? (isMultiBranch ? "grid-cols-2" : "grid-cols-1") : isMultiBranch ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        {isMultiBranch ? (
          <Dropdown
            options={branchOptions}
            value={branchFilter}
            disabled={isLoadingBranches}
            onValueChange={setBranchFilter}
            aria-label="กรองแจ้งเตือนตามสาขา"
            className="min-w-0"
            buttonClassName={compact ? compactDropdownButtonClass : undefined}
            menuClassName={compact ? compactDropdownMenuClass : undefined}
          />
        ) : null}
        <Dropdown
          options={typeOptions}
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as "" | NotificationType)}
          aria-label="กรองแจ้งเตือนตามประเภท"
          className="min-w-0"
          buttonClassName={compact ? compactDropdownButtonClass : undefined}
          menuClassName={compact ? compactDropdownMenuClass : undefined}
        />
      </div>

      <div className={compact ? "stable-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1" : "mt-4 space-y-3"}>
        {list.isLoading ? <p className="rounded-md border border-stone-200 p-4 text-sm font-semibold text-stone-500">กำลังโหลดแจ้งเตือน...</p> : null}
        {!list.isLoading && items.length === 0 ? (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            ไม่มีแจ้งเตือนในเงื่อนไขนี้
          </div>
        ) : null}
        {visibleItems.map((item) => (
          <NotificationRow key={item.id} item={item} showBranch={isMultiBranch} compact={compact} />
        ))}
      </div>
      {showAllTasksButton ? (
        <button
          type="button"
          className="mt-3 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm transition hover:bg-teal-800"
          onClick={() => setIsExpanded(true)}
        >
          <Maximize2 size={14} />
          <span>ดูงานค้างทั้งหมด {number(items.length)} รายการ</span>
          <ArrowRight size={14} />
        </button>
      ) : null}
      {isExpanded ? (
        <div className="fixed inset-0 z-50 grid overscroll-contain place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="owner-notifications-modal-title" onMouseDown={() => setIsExpanded(false)}>
          <div className="w-full max-w-5xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex max-h-[86vh] min-h-0 w-full flex-col rounded-lg border border-stone-200 bg-white shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Bell size={21} className="text-leaf" />
                    <h2 id="owner-notifications-modal-title" className="text-2xl font-black">{heading}</h2>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-stone-500">
                    {branchContext ? `${branchContext} • ` : ""}ด่วน {number(summary.data?.outOfStockCount ?? 0)} | ต้องจัดการ {number(actionCount)} | งานค้าง {number(taskCount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" className="h-12 w-12 px-0" aria-label="ปิดแจ้งเตือน" icon={<X size={24} />} onClick={() => setIsExpanded(false)} />
                </div>
              </div>
              <div className={`grid gap-2 border-b border-stone-200 p-4 ${isMultiBranch ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
                {isMultiBranch ? (
                  <Dropdown
                    options={branchOptions}
                    value={branchFilter}
                    disabled={isLoadingBranches}
                    onValueChange={setBranchFilter}
                    aria-label="กรองแจ้งเตือนตามสาขา"
                    className="min-w-0"
                    menuClassName="w-max min-w-56 max-w-80"
                  />
                ) : null}
                <Dropdown
                  options={typeOptions}
                  value={typeFilter}
                  onValueChange={(value) => setTypeFilter(value as "" | NotificationType)}
                  aria-label="กรองแจ้งเตือนตามประเภท"
                  className="min-w-0"
                  menuClassName="w-max min-w-52 max-w-72"
                />
              </div>
              <div className="stable-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
                {list.isLoading ? <p className="rounded-md border border-stone-200 p-4 text-sm font-semibold text-stone-500">กำลังโหลดแจ้งเตือน...</p> : null}
                {!list.isLoading && items.length === 0 ? (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                    ไม่มีแจ้งเตือนในเงื่อนไขนี้
                  </div>
                ) : null}
                {items.map((item) => (
                <NotificationRow key={item.id} item={item} showBranch={isMultiBranch} />
              ))}
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {isHistoryOpen ? (
        <div className="fixed inset-0 z-50 grid overscroll-contain place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="owner-notifications-history-title" onMouseDown={() => setIsHistoryOpen(false)}>
          <div className="w-full max-w-5xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex max-h-[86vh] min-h-0 w-full flex-col rounded-lg border border-stone-200 bg-white shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <History size={21} className="text-leaf" />
                    <h2 id="owner-notifications-history-title" className="text-2xl font-black">{historyHeading}</h2>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-stone-500">
                    {historyBranchContext ? `${historyBranchContext} • ` : isMultiBranch ? "ทุกสาขา • " : branchContext ? `${branchContext} • ` : ""}ประวัติ {number(allBranchHistoryItems.length)} | ปิดแล้ว {number(closedCount)} | เก็บถาวร {number(archivedCount)}
                  </p>
                </div>
                <Button type="button" variant="ghost" className="h-12 w-12 px-0" aria-label="ปิดประวัติแจ้งเตือน" icon={<X size={24} />} onClick={() => setIsHistoryOpen(false)} />
              </div>
              <div className={`grid gap-2 border-b border-stone-200 p-4 ${isMultiBranch ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
                {isMultiBranch ? (
                  <Dropdown
                    options={branchOptions}
                    value={historyBranchFilter}
                    disabled={isLoadingBranches}
                    onValueChange={setHistoryBranchFilter}
                    aria-label="กรองประวัติแจ้งเตือนตามสาขา"
                    className="min-w-0"
                    menuClassName="w-max min-w-56 max-w-80"
                  />
                ) : null}
                <Dropdown
                  options={typeOptions}
                  value={historyTypeFilter}
                  onValueChange={(value) => setHistoryTypeFilter(value as "" | NotificationType)}
                  aria-label="กรองประวัติแจ้งเตือนตามประเภท"
                  className="min-w-0"
                  menuClassName="w-max min-w-52 max-w-72"
                />
              </div>
              <div className="stable-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
                {historyLoading ? <p className="rounded-md border border-stone-200 p-4 text-sm font-semibold text-stone-500">กำลังโหลดประวัติแจ้งเตือน...</p> : null}
                {!historyLoading && allBranchHistoryItems.length === 0 ? (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                    ยังไม่มีประวัติแจ้งเตือนที่ปิดแล้วในเงื่อนไขนี้
                  </div>
                ) : null}
                {allBranchHistoryItems.map((item) => (
                  <NotificationRow key={item.id} item={item} showBranch={isMultiBranch} statusMode="history" readonly showRecipient={isMultiBranch} />
                ))}
                {historyList.hasNextPage ? (
                  <div className="flex justify-center pt-1">
                    <Button type="button" variant="secondary" icon={historyList.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />} disabled={historyList.isFetchingNextPage} onClick={() => historyList.fetchNextPage()}>
                      {historyList.isFetchingNextPage ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function NotificationRow({ item, showBranch, compact = false, statusMode = "task", readonly = false, showRecipient = false }: { item: NotificationItem; showBranch: boolean; compact?: boolean; statusMode?: "task" | "history"; readonly?: boolean; showRecipient?: boolean }) {
  const notification = item.notification;
  const recipientLabel = item.user?.name || item.user?.email;
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-black ring-1 ${notificationItemBadgeClass(item)}`}>
            {notificationDisplayTypeLabel(item)}
          </span>
          {showBranch && notification.branch?.name ? <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-black text-stone-700">{notification.branch.name}</span> : null}
          {showRecipient && recipientLabel ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{recipientLabel}</span> : null}
          <span className="text-xs font-semibold text-stone-500">{statusMode === "history" ? notificationHistoryLabel(item) : notificationTaskLabel(item)}</span>
        </div>
        <p className={compact ? "mt-1 truncate text-sm font-black text-ink" : "mt-2 truncate font-black text-ink"}>{notificationDisplayTitle(item)}</p>
        <p className={`mt-1 font-semibold text-stone-600 ${compact ? "truncate text-xs" : "line-clamp-2 text-sm"}`}>
          {notification.body ? `${notification.body} • ` : ""}{thaiDate(notification.createdAt)}
        </p>
      </div>
      {notification.actionHref ? <ArrowRight size={compact ? 15 : 17} className="shrink-0 text-leaf" /> : null}
    </>
  );

  if (notification.actionHref && !readonly) {
    return (
      <Link to={notification.actionHref} className={`flex items-start gap-3 rounded-md border border-stone-200 transition hover:bg-stone-50 ${compact ? "p-2" : "p-3"}`}>
        {content}
      </Link>
    );
  }

  return <div className={`flex items-start gap-3 rounded-md border border-stone-200 ${compact ? "p-2" : "p-3"}`}>{content}</div>;
}

function notificationTaskLabel(item: NotificationItem) {
  if (isStockAdjustmentRequestNotification(item)) return "ต้องจัดการ";
  const type = item.notification.type;
  if (type === "SYSTEM" || type === "TRANSFER_STATUS") return "แจ้งเพื่อทราบ";
  return "ต้องจัดการ";
}

function notificationHistoryLabel(item: NotificationItem) {
  if (item.notification.resolvedAt) return "ปิดแล้ว";
  if (item.archivedAt) return "เก็บถาวร";
  return notificationTaskLabel(item);
}

function transferTaskPath(status: TransferTask["status"], side: "source" | "destination", branchId?: string) {
  const params = new URLSearchParams({ status, side });
  if (branchId) params.set("branchId", branchId);
  return `/inventory/transfers?${params.toString()}`;
}

function transferBranch(transfer: TransferTask, direction: "request" | "receive") {
  const warehouse = direction === "receive" ? transfer.destinationWarehouse : transfer.sourceWarehouse;
  const branchId = warehouse.branchId ?? warehouse.branch?.id ?? null;
  return branchId ? { id: branchId, name: warehouse.branch?.name ?? "สาขา", code: warehouse.branch?.code ?? null } : null;
}

function transferTaskNotificationItem(transfer: TransferTask, direction: "request" | "receive"): NotificationItem {
  const branch = transferBranch(transfer, direction);
  const sourceName = transfer.sourceWarehouse.branch?.name ?? "ต้นทาง";
  const destinationName = transfer.destinationWarehouse.branch?.name ?? "ปลายทาง";
  const dedupeKey = direction === "receive" ? `transfer-receive:${transfer.id}` : `transfer-request:${transfer.id}`;
  const title = direction === "receive" ? `คำขอโอน ${transfer.documentNo} รอยืนยันรับของ` : `คำขอโอน ${transfer.documentNo} รออนุมัติ`;
  return {
    id: `live:${dedupeKey}`,
    readAt: null,
    archivedAt: null,
    createdAt: transfer.createdAt,
    notification: {
      id: `live:${dedupeKey}`,
      businessId: "",
      branchId: branch?.id ?? null,
      type: "TRANSFER_REQUEST",
      severity: "WARNING",
      title,
      body: `${sourceName} ไป ${destinationName}`,
      actionHref: direction === "receive" ? "/app/transfers/requests" : "/app/activity-approvals",
      entityType: "StockTransfer",
      entityId: transfer.id,
      dedupeKey,
      resolvedAt: null,
      createdAt: transfer.createdAt,
      updatedAt: transfer.createdAt,
      branch
    }
  };
}

function mergeNotificationItems(items: NotificationItem[]) {
  const byKey = new Map<string, NotificationItem>();
  for (const item of items) {
    const key = item.notification.dedupeKey || item.notification.entityId || item.notification.id || item.id;
    byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort(compareNotificationItems);
}

function compareNotificationItems(a: NotificationItem, b: NotificationItem) {
  const priorityDiff = notificationPriority(a) - notificationPriority(b);
  if (priorityDiff !== 0) return priorityDiff;
  const notificationTimeDiff = new Date(b.notification.createdAt).getTime() - new Date(a.notification.createdAt).getTime();
  if (notificationTimeDiff !== 0) return notificationTimeDiff;
  const recipientTimeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (recipientTimeDiff !== 0) return recipientTimeDiff;
  return b.id.localeCompare(a.id);
}

function notificationPriority(item: NotificationItem) {
  const notification = item.notification;
  if (isApprovalNotification(item)) return 0;
  if (notification.type === "STOCK_ALERT" && (notification.severity === "CRITICAL" || notification.title.includes("หมดสต็อก"))) return 1;
  if (notification.type === "STOCK_ALERT") return 2;
  return 3;
}

function isApprovalNotification(item: NotificationItem) {
  const notification = item.notification;
  return (
    isStockAdjustmentRequestNotification(item) ||
    notification.type === "STAFF_REQUEST" ||
    notification.title.includes("รออนุมัติ")
  );
}

function InventoryPlanCard({ inventory, business, isLoading }: { inventory: Dashboard["inventory"]; business?: Business; isLoading: boolean }) {
  const productLimit = business?.subscription?.plan.productLimit;
  return (
    <Card className="bg-stone-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-ink">มูลค่าสต็อกโดยประมาณ {baht(inventory.stockValue)}</p>
          <p className="mt-1 text-sm text-stone-600">คำนวณจากราคาทุนของสินค้าที่คงเหลือ</p>
          {productLimit !== undefined ? (
            <p className="mt-1 text-sm text-stone-600">ใช้สินค้าในแพ็กเกจแล้ว {number(inventory.totalProducts)} / {number(productLimit)} รายการ</p>
          ) : (
            <p className="mt-1 text-sm text-stone-600">{isLoading ? "กำลังโหลดข้อมูลแพ็กเกจ..." : "นับจากสินค้าที่ใช้งานอยู่ ไม่รวมรายการที่เก็บประวัติแล้ว"}</p>
          )}
        </div>
        <Link to="/app/profile/billing">
          <Button type="button" variant="secondary">ดูแพ็กเกจ</Button>
        </Link>
      </div>
    </Card>
  );
}

function SalesTrendCard({ trend }: { trend: NonNullable<Dashboard["sales"]["trend30Days"]> }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">เทรนด์ยอดขาย 30 วัน</h2>
          <p className="mt-1 text-sm font-semibold text-stone-500">ดูภาพรวมก่อนเปิดรายงานแบบละเอียด</p>
        </div>
        <Link to="/app/reports/sales" className="text-sm font-bold text-leaf hover:text-teal-800">รายงานยอดขาย</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TrendStat label="ยอดขาย 30 วัน" value={baht(trend.total)} />
        <TrendStat label="เฉลี่ยต่อวัน" value={baht(trend.averageDailySales)} />
        <TrendStat label="บิลใน 30 วัน" value={number(trend.receiptCount)} />
        <TrendStat
          label="7 วันล่าสุด"
          value={signedPercent(trend.last7DaysChangePercent)}
          detail={`เทียบ 7 วันก่อน ${baht(trend.previous7DaysTotal)}`}
          tone={trend.last7DaysChangePercent < 0 ? "risk" : "good"}
        />
      </div>
      <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm font-semibold text-stone-600">
        {trend.bestDay ? (
          <p>วันที่ขายดีที่สุดคือ <span className="font-black text-ink">{formatTrendDate(trend.bestDay.date)}</span> ทำยอด <span className="font-black text-ink">{baht(trend.bestDay.total)}</span></p>
        ) : (
          <p>ยังไม่มีรายการขายใน 30 วันล่าสุด</p>
        )}
      </div>
    </Card>
  );
}

function TrendStat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "risk" }) {
  const toneClass = tone === "risk" ? "text-red-700" : tone === "good" ? "text-leaf" : "text-ink";
  return (
    <div className="rounded-md border border-stone-200 p-3">
      <p className="text-xs font-black uppercase text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-stone-500">{detail}</p> : null}
    </div>
  );
}

function CashierDashboard({ data, dashboardScope, onDashboardScopeChange }: { data: Dashboard; dashboardScope: DashboardScope; onDashboardScopeChange: (scope: DashboardScope) => void }) {
  return (
    <div className="space-y-6">
      <DashboardHeader title="Cashier Dashboard" subtitle="งานขายหน้าร้านวันนี้และใบขายล่าสุด">
        <DashboardScopeSelector scope={dashboardScope} canSelectAllBranches={false} onScopeChange={onDashboardScopeChange} />
        <Link to="/app/pos"><Button icon={<ShoppingBag size={18} />}>เปิด POS</Button></Link>
      </DashboardHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="ยอดขายวันนี้" value={baht(data.sales.todayTotal)} icon={Wallet} />
        <MetricCard label="บิลวันนี้" value={number(data.sales.todayReceiptCount)} icon={FileClock} />
        <MetricCard label="ยอดเดือนนี้" value={baht(data.sales.monthTotal)} icon={BarChart3} />
      </div>
      {data.sales.todayReceiptCount === 0 ? <EmptyAction text="ยังไม่มีรายการขายวันนี้" action="เปิด POS เพื่อเริ่มขาย" to="/app/pos" /> : null}
      <RecentSalesPanel sales={data.recentSales} />
    </div>
  );
}

function StockDashboard({ data, dashboardScope, onDashboardScopeChange }: { data: Dashboard; dashboardScope: DashboardScope; onDashboardScopeChange: (scope: DashboardScope) => void }) {
  return (
    <div className="space-y-6">
      <DashboardHeader title="Stock Dashboard" subtitle="ของใกล้หมด ของหมด และความเคลื่อนไหวล่าสุด">
        <DashboardScopeSelector scope={dashboardScope} canSelectAllBranches={false} onScopeChange={onDashboardScopeChange} />
      </DashboardHeader>
      <QuickActions actions={[
        { label: "รับสินค้าเข้า", to: "/app/inventory/receipts", icon: Boxes, primary: true },
        { label: "ปรับสต็อก", to: "/app/inventory/adjustments", icon: ClipboardList },
        { label: "ประวัติสต็อก", to: "/app/inventory/movements", icon: FileClock }
      ]} />
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="สินค้าใกล้หมด/ควรเติม" value={number(data.inventory.lowStockProducts)} icon={AlertTriangle} />
        <MetricCard label="สินค้าหมด" value={number(data.inventory.outOfStockProducts)} icon={PackageX} />
        <MetricCard label="สินค้าทั้งหมด" value={number(data.inventory.totalProducts)} icon={Package} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <StockAlertsPanel inventory={data.inventory} readonly={false} />
        <RecentMovementsPanel movements={data.recentMovements} />
      </div>
    </div>
  );
}

function ViewerDashboard({ data, dashboardScope, onDashboardScopeChange }: { data: Dashboard; dashboardScope: DashboardScope; onDashboardScopeChange: (scope: DashboardScope) => void }) {
  return (
    <div className="space-y-6">
      <DashboardHeader title="Viewer Dashboard" subtitle="ภาพรวมร้านแบบอ่านอย่างเดียว">
        <DashboardScopeSelector scope={dashboardScope} canSelectAllBranches={false} onScopeChange={onDashboardScopeChange} />
      </DashboardHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="ยอดขายวันนี้" value={baht(data.sales.todayTotal)} icon={Wallet} />
        <MetricCard label="ยอดเดือนนี้" value={baht(data.sales.monthTotal)} icon={BarChart3} />
        <MetricCard label="สินค้าใกล้หมด/ควรเติม" value={number(data.inventory.lowStockProducts)} icon={AlertTriangle} />
        <MetricCard label="สินค้าหมด" value={number(data.inventory.outOfStockProducts)} icon={PackageX} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SalesChart title="ยอดขาย 7 วัน" data={data.sales.last7Days} />
        <RecentSalesPanel sales={data.recentSales} />
      </div>
      <StockAlertsPanel inventory={data.inventory} readonly />
    </div>
  );
}

function TargetCard({ data, canEditGoals, isOpen, onToggle }: { data: Dashboard; canEditGoals: boolean; isOpen: boolean; onToggle: () => void }) {
  const progress = data.sales.dailyTargetProgress;
  const hasTarget = Boolean(progress.target && progress.target > 0);
  return (
    <Card id="goals" className="space-y-3 !p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-black text-leaf">ยอดขายเทียบเป้าวันนี้</p>
          <h2 className="mt-1 text-2xl font-black">{baht(data.sales.todayTotal)}</h2>
          <p className="text-sm font-semibold text-stone-500">{hasTarget ? `เป้าวันนี้ ${baht(progress.target)}` : "ยังไม่ได้ตั้งเป้ายอดขายวันนี้"}</p>
        </div>
        {canEditGoals ? <Button type="button" variant="secondary" icon={<Target size={16} />} onClick={onToggle}>{hasTarget ? "ปรับเป้า" : "ตั้งเป้า"}</Button> : null}
      </div>
      {hasTarget ? (
        <div>
          <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${progress.reached ? "bg-emerald-600" : "bg-leaf"}`} style={{ width: `${Math.min(progress.percent ?? 0, 100)}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-stone-600">
            {progress.reached ? `ถึงเป้าแล้ว ${number(progress.percent)}%` : `เหลืออีก ${baht(progress.remaining)} ถึงเป้า`}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-600">
          ตั้งเป้าเพื่อให้เจ้าของร้านเห็นทันทีว่าวันนี้ร้านกำลังวิ่งทันเป้าหรือยัง
        </div>
      )}
      {isOpen ? <GoalEditor goals={data.goals} /> : null}
    </Card>
  );
}

function GoalEditor({ goals }: { goals: Dashboard["goals"] }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<SalesTargetMode>(goals.salesTargetMode ?? "ANNUAL");
  const [target, setTarget] = useState(getTargetSourceValue(goals, goals.salesTargetMode ?? "ANNUAL")?.toString() ?? "");
  const sourceTarget = target.trim() ? Math.max(0, Number(target) || 0) : null;
  const preview = calculateSalesTargetPreview(mode, sourceTarget, goals.daysInCurrentMonth);
  const mutation = useMutation({
    mutationFn: () => patch("/businesses/dashboard-goals", {
      salesTargetMode: mode,
      annualSalesTarget: mode === "ANNUAL" ? sourceTarget : null,
      monthlySalesTarget: mode === "MONTHLY" ? sourceTarget : null,
      dailySalesTarget: mode === "DAILY" ? sourceTarget : null
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  });
  const modeOptions: Array<{ value: SalesTargetMode; label: string; placeholder: string }> = [
    { value: "ANNUAL", label: "ต่อปี", placeholder: "เป้ายอดขายต่อปี" },
    { value: "MONTHLY", label: "ต่อเดือน", placeholder: "เป้ายอดขายต่อเดือน" },
    { value: "DAILY", label: "ต่อวัน", placeholder: "เป้ายอดขายต่อวัน" }
  ];

  function changeMode(nextMode: SalesTargetMode) {
    const currentPreview = calculateSalesTargetPreview(mode, sourceTarget, goals.daysInCurrentMonth);
    const nextSource = getTargetSourceValue(currentPreview, nextMode);
    setMode(nextMode);
    setTarget(nextSource ? String(Math.round(nextSource * 100) / 100) : "");
  }

  return (
    <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 md:grid-cols-[1fr_auto]">
      <div className="flex rounded-md border border-stone-200 bg-white p-1 md:col-span-2">
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`h-9 flex-1 rounded px-3 text-sm font-black transition ${mode === option.value ? "bg-leaf text-white" : "text-stone-600 hover:bg-stone-50"}`}
            onClick={() => changeMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <input className="field" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={modeOptions.find((option) => option.value === mode)?.placeholder} />
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>บันทึก</Button>
      <div className="rounded-md bg-white p-3 text-sm font-semibold text-stone-600 md:col-span-2">
        {sourceTarget ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <p>เป้าต่อปี: <span className="font-black text-ink">{baht(preview.annualSalesTarget)}</span></p>
            <p>เป้าต่อเดือน: <span className="font-black text-ink">{baht(preview.monthlySalesTarget)}</span></p>
            <p>เดือนนี้มี <span className="font-black text-ink">{number(goals.daysInCurrentMonth)}</span> วัน</p>
            <p>เป้าต่อวันเดือนนี้: <span className="font-black text-ink">{baht(preview.dailySalesTarget)}</span></p>
          </div>
        ) : (
          <p>ล้างค่าเป้าเพื่อปิดการเทียบเป้ายอดขาย</p>
        )}
      </div>
      {mutation.error ? <p className="text-sm font-semibold text-red-700 md:col-span-2">{mutation.error.message}</p> : null}
    </div>
  );
}

function getTargetSourceValue(goals: Pick<Dashboard["goals"], "annualSalesTarget" | "monthlySalesTarget" | "dailySalesTarget">, mode: SalesTargetMode) {
  if (mode === "MONTHLY") return goals.monthlySalesTarget;
  if (mode === "DAILY") return goals.dailySalesTarget;
  return goals.annualSalesTarget;
}

function QuickActions({ actions }: { actions: Array<{ label: string; to: string; icon: typeof ShoppingBag; primary?: boolean; disabled?: boolean; onClick?: () => void }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {actions.filter((action) => !action.disabled).map((action) => {
        const className = `flex min-h-14 items-center justify-between rounded-lg px-4 text-sm font-black shadow-sm transition ${action.primary ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-stone-200 bg-white text-ink hover:bg-stone-50"}`;
        const content = (
          <>
            <span className="inline-flex min-w-0 items-center gap-3">
              <action.icon className="shrink-0" size={19} />
              <span className="truncate">{action.label}</span>
            </span>
            <ArrowRight className="shrink-0" size={17} />
          </>
        );
        if (action.onClick) return <button key={action.label} type="button" className={className} onClick={action.onClick}>{content}</button>;
        return <Link key={action.label} to={action.to} className={className}>{content}</Link>;
      })}
    </div>
  );
}

function SalesChart({ title, data }: { title: string; data: SalesPoint[] }) {
  const chart = data.map((point) => ({ ...point, label: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${point.date}T00:00:00+07:00`)) }));
  return (
    <Card>
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(value) => baht(Number(value))} />
            <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TopProductsPanel({ data }: { data: Dashboard["topProducts"] }) {
  return (
    <Card>
      <h2 className="text-xl font-black">สินค้าขายดี</h2>
      <ProductList title="วันนี้" products={data.today} />
      <ProductList title="7 วันล่าสุด" products={data.last7Days} />
    </Card>
  );
}

function ProductList({ title, products }: { title: string; products: TopProduct[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-black text-stone-500">{title}</p>
      <div className="mt-2 space-y-2">
        {products.map((product) => (
          <div key={product.productId} className="rounded-md border border-stone-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{product.name}</p>
                <p className="text-xs text-stone-500">{product.sku} • {number(product.quantity)} ชิ้น</p>
              </div>
              <p className="shrink-0 font-black text-leaf">{baht(product.revenue)}</p>
            </div>
            <p className="mt-1 text-xs font-semibold text-stone-500">กำไรขั้นต้น {baht(product.grossProfit)}</p>
          </div>
        ))}
        {products.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีข้อมูลสินค้า</p> : null}
      </div>
    </div>
  );
}

function RecentSalesPanel({ sales }: { sales: RecentSale[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">ใบขายล่าสุด</h2>
        <Link to="/app/sales" className="text-sm font-bold text-leaf hover:text-teal-800">ดูทั้งหมด</Link>
      </div>
      <div className="mt-4 space-y-3">
        {sales.map((sale) => (
          <div key={sale.id} className="rounded-md border border-stone-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{sale.receiptNo}</p>
                <p className="text-sm text-stone-500">{thaiDate(sale.createdAt)}</p>
              </div>
              <p className="shrink-0 font-black text-leaf">{baht(sale.total)}</p>
            </div>
          </div>
        ))}
        {sales.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีใบขายล่าสุด</p> : null}
      </div>
    </Card>
  );
}

function StockAlertsPanel({ inventory, readonly }: { inventory: Dashboard["inventory"]; readonly: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">สต็อกที่ต้องดูแล</h2>
        {!readonly ? <Link to="/app/reports/stock" className="text-sm font-bold text-leaf hover:text-teal-800">ดูทั้งหมด</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StockPreviewList title="ใกล้หมด/ควรเติม" items={inventory.lowStockPreview} emptyText="ไม่มีสินค้าใกล้หมด/ควรเติม" />
        <StockPreviewList title="หมดสต็อก" items={inventory.outOfStockPreview} emptyText="ไม่มีสินค้าหมด" />
      </div>
    </Card>
  );
}

function StockPreviewList({ title, items, emptyText }: { title: string; items: StockPreview[]; emptyText: string }) {
  return (
    <div>
      <p className="text-sm font-black text-stone-500">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-stone-200 p-3">
            <p className="truncate font-semibold">{item.name}</p>
            <p className="text-xs text-stone-500">{item.sku} • คงเหลือ {number(item.quantity)} / จุดเตือน {number(item.minStock)}</p>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-stone-500">{emptyText}</p> : null}
      </div>
    </div>
  );
}

function RecentMovementsPanel({ movements }: { movements: RecentMovement[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">ความเคลื่อนไหวล่าสุด</h2>
        <Link to="/app/inventory/movements" className="text-sm font-bold text-leaf hover:text-teal-800">ดูทั้งหมด</Link>
      </div>
      <div className="mt-4 space-y-3">
        {movements.map((movement) => (
          <div key={movement.id} className="rounded-md border border-stone-200 p-3">
            <p className="truncate font-semibold">{movement.product.name}</p>
            <p className="text-sm text-stone-500">{movement.type} • {number(movement.quantity)} • {thaiDate(movement.createdAt)}</p>
          </div>
        ))}
        {movements.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีรายการเคลื่อนไหวสต็อก</p> : null}
      </div>
    </Card>
  );
}

function DashboardHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-stone-600">{subtitle}</p>
      </div>
      {children ? <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">{children}</div> : null}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, subtitle, priority = false }: { label: string; value: string; icon: typeof Wallet; subtitle?: string; priority?: boolean }) {
  return (
    <Card className={priority ? "!p-4" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-500">{label}</p>
          <p className={priority ? "mt-1 text-3xl font-black" : "mt-2 text-3xl font-black"}>{value}</p>
        </div>
        <Icon className="shrink-0 text-leaf" size={priority ? 20 : 24} />
      </div>
      {subtitle ? <p className="mt-1 truncate text-sm font-semibold text-stone-500">{subtitle}</p> : null}
    </Card>
  );
}

function EmptyAction({ text, action, to }: { text: string; action: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg border border-dashed border-stone-300 bg-white p-4 text-sm font-bold text-ink transition hover:bg-stone-50">
      <span><span className="block">{text}</span><span className="block text-stone-500">{action}</span></span>
      <ArrowRight size={18} className="text-leaf" />
    </Link>
  );
}

function DashboardScopeSelector({ scope, canSelectAllBranches, onScopeChange }: { scope: DashboardScope; canSelectAllBranches: boolean; onScopeChange: (scope: DashboardScope) => void }) {
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<BranchOption[]>("/branches")
  });
  const activeBranches = (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE");
  const isMultiBranch = activeBranches.length > 1;
  const showAllBranchMode = canSelectAllBranches && isMultiBranch;
  const showBranchModeToggle = isMultiBranch;
  const branchSelectValue = scope.mode === "BRANCH" ? scope.branchId ?? workingBranchId : "";
  const fallbackBranchId = branchSelectValue || activeBranches[0]?.id || workingBranchId || "";
  const canPickBranch = activeBranches.length > 0 || Boolean(fallbackBranchId);
  const isBranchPickerDisabled = (showAllBranchMode && scope.mode !== "BRANCH") || branches.isLoading || activeBranches.length === 0;
  const gridColumns = showBranchModeToggle ? "sm:grid-cols-[15.5rem_14rem_auto]" : "sm:grid-cols-[auto]";

  useEffect(() => {
    if (showAllBranchMode || scope.mode !== "ALL") return;
    onScopeChange(fallbackBranchId ? { mode: "BRANCH", branchId: fallbackBranchId } : { mode: "BRANCH" });
  }, [fallbackBranchId, onScopeChange, scope.mode, showAllBranchMode]);

  function selectAllBranches() {
    if (!canSelectAllBranches) return;
    onScopeChange({ mode: "ALL" });
  }

  function selectBranchMode() {
    onScopeChange(fallbackBranchId ? { mode: "BRANCH", branchId: fallbackBranchId } : { mode: "BRANCH" });
  }

  function selectWorkingBranch() {
    if (!workingBranchId) return;
    onScopeChange({ mode: "BRANCH", branchId: workingBranchId });
  }

  if (!isMultiBranch) return null;

  return (
    <div className={`grid w-full grid-cols-1 gap-2 sm:w-auto ${gridColumns}`}>
      {showBranchModeToggle ? (
        <div className="grid h-10 grid-cols-2 rounded-md border border-stone-200 bg-stone-100/80 p-1 shadow-sm">
          <button
            type="button"
            className={`h-8 rounded text-center text-sm font-black transition ${scope.mode === "ALL" ? "bg-leaf text-white shadow-sm" : "text-stone-600 hover:bg-white"} ${!canSelectAllBranches ? "cursor-not-allowed opacity-60" : ""}`}
            disabled={!canSelectAllBranches}
            onClick={selectAllBranches}
          >
            รวมทุกสาขา
          </button>
          <button
            type="button"
            className={`h-8 rounded text-center text-sm font-black transition ${scope.mode === "BRANCH" ? "bg-leaf text-white shadow-sm" : "text-stone-600 hover:bg-white"} ${!canPickBranch ? "cursor-not-allowed opacity-60" : ""}`}
            disabled={!canPickBranch}
            onClick={selectBranchMode}
          >
            รายสาขา
          </button>
        </div>
      ) : null}
      {isMultiBranch ? (
        <>
          <Dropdown
            className="min-w-0"
            buttonClassName={`h-10 min-h-0 transition ${scope.mode === "BRANCH" || !showAllBranchMode ? "text-ink" : "bg-stone-50 text-stone-400"}`}
            options={[
              ...(showAllBranchMode && scope.mode !== "BRANCH" ? [{ value: "", label: "เลือกดูรายสาขา" }] : []),
              ...activeBranches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.code ? ` (${branch.code})` : ""}` }))
            ]}
            value={scope.mode === "BRANCH" ? branchSelectValue : fallbackBranchId}
            disabled={isBranchPickerDisabled}
            onValueChange={(value) => onScopeChange({ mode: "BRANCH", branchId: value || undefined })}
            aria-label="เลือกสาขาสำหรับ Dashboard"
          />
          <Button type="button" variant="secondary" className="w-full whitespace-nowrap sm:w-auto" disabled={!workingBranchId} onClick={selectWorkingBranch}>
            สาขาปัจจุบัน
          </Button>
        </>
      ) : null}
    </div>
  );
}

function signedPercent(value: number) {
  if (value > 0) return `+${number(value)}%`;
  return `${number(value)}%`;
}

function targetPercentLabel(progress: TargetProgress) {
  if (progress.percent === null) return "ยังไม่ตั้งเป้า";
  return `${number(progress.percent)}%`;
}

function formatTrendDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${date}T00:00:00+07:00`));
}
