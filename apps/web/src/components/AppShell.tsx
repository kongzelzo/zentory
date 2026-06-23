import { resolveEffectivePermissions, type AuthSession, type EffectivePermissions, type Permission, type Role } from "@zentory/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Building2,
  ChartColumn,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileClock,
  Handshake,
  HelpCircle,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageX,
  Plus,
  ReceiptText,
  Repeat,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Tags,
  Truck,
  UserPlus,
  UserCircle,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSessionDashboardPath } from "../lib/dashboard";
import { number } from "../lib/format";
import { clearLocalDemo, isDemoSession, resetLocalDemo } from "../lib/local-demo";
import { getNotificationBranchId, notificationSummaryPath, type NotificationSummary } from "../lib/notifications";
import { shouldShowOnboardingNav } from "../lib/onboarding";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  featured?: boolean;
  permission?: Permission;
  roles?: Role[];
};

export function shouldResetWarehouseDetailOnBranchChange(pathname: string) {
  return /^\/app\/warehouses\/[^/]+$/.test(pathname);
}

export const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "ภาพรวม",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "reports.dashboard.read" },
      { to: "/app/onboarding", label: "เริ่มต้นใช้งาน", icon: ShoppingBag }
    ]
  },
  {
    title: "งานประจำวัน",
    items: [
      { to: "/app/pos", label: "ขายหน้าร้าน / POS", icon: ReceiptText, featured: true, permission: "sales.create" },
      { to: "/app/inventory/receipts", label: "รับสินค้าเข้า", icon: Boxes, featured: true, permission: "inventory.receive" },
      { to: "/app/inventory/adjustments", label: "ปรับสต็อก", icon: ClipboardList, featured: true, permission: "inventory.adjust" },
      { to: "/app/products", label: "สินค้า", icon: Package, featured: true, permission: "products.read" },
      { to: "/app/sales", label: "ประวัติขาย", icon: FileClock, permission: "sales.read" }
    ]
  },
  {
    title: "งานคลัง",
    items: [
      { to: "/app/stock-search", label: "ค้นหาคลัง", icon: Search, featured: true, permission: "inventory.read" },
      { to: "/app/transfers", label: "โอนสินค้า", icon: Repeat, permission: "inventory.read" }
    ]
  },
  {
    title: "รายงาน",
    items: [
      { to: "/app/inventory/movements", label: "ประวัติสต็อก", icon: Repeat, permission: "inventory.movements.read" },
      { to: "/app/reports/stock", label: "สินค้าต้องเติม", icon: ChartColumn, permission: "reports.stock.read" },
      { to: "/app/reports/sales", label: "รายงานยอดขาย", icon: ChartColumn, permission: "reports.sales.read" },
      { to: "/app/profit-loss", label: "กำไรขั้นต้น", icon: ChartColumn, permission: "reports.sales.read" }
    ]
  },
  {
    title: "จัดการร้าน",
    items: [
      { to: "/app/branch-settings", label: "ตั้งค่าสาขา", icon: Settings, roles: ["OWNER", "BRANCH_MANAGER"] },
      { to: "/app/activity-approvals", label: "รออนุมัติ", icon: Shield, roles: ["OWNER", "MANAGER", "BRANCH_MANAGER"], permission: "inventory.read" },
      { to: "/app/audit-log", label: "Audit Log", icon: History, roles: ["OWNER"] },
      { to: "/app/import-export", label: "Import / Export", icon: History, roles: ["OWNER", "MANAGER"] },
      { to: "/app/data-backup", label: "Backup", icon: History, roles: ["OWNER"] },
      { to: "/app/support", label: "ช่วยเหลือ", icon: HelpCircle }
    ]
  },
  {
    title: "กำลังพัฒนา",
    items: [
      { to: "/app/suppliers", label: "ซัพพลายเออร์", icon: Truck },
      { to: "/app/customers", label: "ลูกค้า", icon: Handshake },
      { to: "/app/purchase-orders", label: "ใบสั่งซื้อ / PO", icon: ClipboardList },
      { to: "/app/api-keys", label: "API Keys", icon: KeyRound }
    ]
  },
  {
    title: "บัญชี",
    items: []
  }
];

const allNavItems = navGroups.flatMap((group) => group.items);
const demoCoreNavPaths = [
  "/app/dashboard",
  "/app/onboarding",
  "/app/pos",
  "/app/inventory/receipts",
  "/app/inventory/adjustments",
  "/app/products",
  "/app/sales",
  "/app/stock-search",
  "/app/transfers",
  "/app/inventory/movements",
  "/app/reports/stock",
  "/app/reports/sales",
  "/app/warehouses",
  "/app/support"
];

function isDemoNavItem(to: string) {
  const [pathname] = to.split("?");
  return demoCoreNavPaths.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

type CurrentBusiness = {
  name: string;
  subscription?: {
    plan?: {
      name: string;
    };
  };
};

type StaffNotificationMember = {
  id: string;
  employeeName?: string | null;
  status: "ACTIVE" | "PENDING" | "REJECTED" | "DISABLED";
  createdAt?: string;
  user?: { name?: string | null; email?: string | null };
};
type BranchOption = { id: string; name: string; code?: string; status?: string; isDefault?: boolean };

export function filterSidebarNavGroups<TItem extends { label: string; to: string; permission?: Permission; roles?: Role[] }, TGroup extends { title: string; items: TItem[] }>(
  groups: TGroup[],
  searchQuery: string,
  showOnboarding: boolean,
  effectivePermissions?: EffectivePermissions,
  role?: Role,
  isSystemAdmin = false,
  isDemoMode = false
) {
  const query = searchQuery.trim().toLocaleLowerCase();

  return groups
    .map((group) => {
      const visibleItems = group.items.filter((item) => {
        if (isDemoMode && !isDemoNavItem(item.to)) return false;
        if (item.to === "/app/onboarding" && !showOnboarding) return false;
        if (item.roles && !isSystemAdmin && (!role || !item.roles.includes(role))) return false;
        if (!item.permission) return true;
        return effectivePermissions?.[item.permission] ?? true;
      });
      if (visibleItems.length === 0) return undefined;
      if (!query) return { ...group, items: visibleItems };
      if (group.title.toLocaleLowerCase().includes(query)) return { ...group, items: visibleItems };

      const matchingItems = visibleItems.filter((item) => item.label.toLocaleLowerCase().includes(query));
      return matchingItems.length > 0 ? { ...group, items: matchingItems } : undefined;
    })
    .filter((group): group is TGroup => Boolean(group));
}

export function getPendingStaffRequests(members: StaffNotificationMember[]) {
  return members.filter((member) => member.status === "PENDING");
}

export function getStoreMenuActions(effectivePermissions?: EffectivePermissions) {
  return {
    canEditStore: Boolean(effectivePermissions?.["business.update"])
  };
}

function getCurrentPage(pathname: string) {
  if (pathname.startsWith("/app/dashboard")) return "Dashboard";
  if (pathname === "/app/notifications") return "ประวัติการแจ้งเตือนของฉัน";
  if (pathname === "/app/transfers/requests") return "รอยืนยันรับของ";
  if (pathname === "/app/settings/staff") return "พนักงานทั้งร้าน";
  if (pathname === "/app/branches") return "จัดการสาขา";
  if (pathname === "/app/billing" || pathname === "/app/profile/billing") return "แพ็กเกจบัญชี";
  if (pathname === "/app/categories") return "หมวดหมู่";
  if (pathname.startsWith("/app/warehouses")) return "จัดการคลัง";
  return allNavItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.label ?? "Dashboard";
}

function isSidebarItemActive(itemTo: string, pathname: string, search: string) {
  const [itemPath, itemSearch = ""] = itemTo.split("?");
  if (itemPath === "/app/branch-settings") {
    const isStaffItem = itemSearch === "section=staff";
    return pathname === itemPath && (isStaffItem ? search === "?section=staff" : search !== "?section=staff");
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function getSessionPermissions(session?: AuthSession | null) {
  if (!session?.business) return undefined;
  return session.business.effectivePermissions ?? resolveEffectivePermissions(session.business.role);
}

function withSessionDashboardPath(groups: Array<{ title: string; items: NavItem[] }>, session?: AuthSession | null) {
  const dashboardPath = getSessionDashboardPath(session);
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => (item.to === "/app/dashboard" ? { ...item, to: dashboardPath } : item))
  }));
}

function NotificationShortcutRow({
  count,
  href,
  icon: Icon,
  label,
  tone,
  onOpen
}: {
  count: number;
  href: string;
  icon: typeof Bell;
  label: string;
  tone: "red" | "amber" | "teal" | "sky" | "indigo" | "stone";
  onOpen: (href: string) => void;
}) {
  const toneClass = {
    red: "bg-red-50 text-red-700 ring-red-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    stone: "bg-stone-100 text-stone-700 ring-stone-200"
  }[tone];
  return (
    <button type="button" className="flex w-full items-center gap-3 border-b border-stone-100 p-4 text-left transition hover:bg-stone-50" onClick={() => onOpen(href)}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ring-1 ${toneClass}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-black text-ink">{label}</span>
      <span className={`shrink-0 rounded px-2.5 py-1 text-sm font-black ring-1 ${toneClass}`}>
        {number(count)}
      </span>
    </button>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isWorkingBranchOpen, setIsWorkingBranchOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const storeMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const workingBranchRef = useRef<HTMLDivElement>(null);
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const clear = useAuth((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = getCurrentPage(location.pathname);
  const isStoreLevelPage = location.pathname === "/app/settings" || location.pathname === "/app/settings/staff" || location.pathname === "/app/branches" || location.pathname === "/app/profile" || location.pathname === "/app/profile/billing";
  const hideQuickActions = /^\/app\/products\/[^/]+\/edit$/.test(location.pathname) || location.pathname.startsWith("/app/pos");
  const userName = session?.user.name ?? "ผู้ใช้";
  const isDemoMode = isDemoSession(session);
  const userEmail = session?.user.email ?? "";
  const storeName = session?.business?.name ?? "ยังไม่มีร้าน";
  const storeUid = session?.business?.id ?? "-";
  const effectivePermissions = getSessionPermissions(session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const setWorkingBranchId = useWorkingBranch((state) => state.setWorkingBranchId);
  const visibleQuickActions = allNavItems.filter((item) => item.featured && (!isDemoMode || isDemoNavItem(item.to)) && (!item.permission || (effectivePermissions?.[item.permission] ?? true)));
  const sidebar = <StoreSidebarContent isDemoMode={isDemoMode} onNavigate={() => setIsSidebarOpen(false)} />;
  const business = useQuery({
    queryKey: ["business"],
    queryFn: () => api<CurrentBusiness>("/businesses/current"),
    enabled: Boolean(session?.business)
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<BranchOption[]>("/branches"),
    enabled: Boolean(session?.business)
  });
  const planName = business.data?.subscription?.plan?.name ?? (business.isLoading && session?.business ? "แพ็กเกจ..." : "-");
  const activeBranches = (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE");
  const workingBranch = activeBranches.find((branch) => branch.id === workingBranchId);
  const notificationBranchId = getNotificationBranchId(activeBranches, workingBranchId, isStoreLevelPage);
  const notifications = useQuery({
    queryKey: ["notifications", "summary", notificationBranchId],
    queryFn: () => api<NotificationSummary>(notificationSummaryPath(notificationBranchId)),
    enabled: Boolean(session?.business && (!isStoreLevelPage ? notificationBranchId : true)),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const notificationSummary = notifications.data;
  const notificationTotal = notificationSummary?.activeCount ?? notificationSummary?.unreadCount ?? 0;
  const stockReportHref = notificationBranchId ? `/app/reports/stock?branchId=${encodeURIComponent(notificationBranchId)}` : "/app/reports/stock";
  const notificationShortcuts = [
    {
      count: notificationSummary?.outOfStockCount ?? 0,
      href: stockReportHref,
      icon: PackageX,
      label: "มีสินค้าหมดคลัง",
      tone: "red" as const
    },
    {
      count: notificationSummary?.lowStockCount ?? 0,
      href: stockReportHref,
      icon: AlertTriangle,
      label: "สินค้าใกล้หมด/ควรเติม",
      tone: "amber" as const
    },
    {
      count: notificationSummary?.transferRequestCount ?? 0,
      href: "/app/activity-approvals",
      icon: Shield,
      label: "คำขอโอนสินค้า",
      tone: "indigo" as const
    },
    {
      count: notificationSummary?.transferReceiveCount ?? 0,
      href: "/app/transfers/requests",
      icon: CheckCircle2,
      label: "รอยืนยันรับของ",
      tone: "sky" as const
    },
    {
      count: notificationSummary?.staffRequestCount ?? 0,
      href: "/app/branch-settings?section=staff#staff-requests",
      icon: UserPlus,
      label: "คำขอสมัครทำงาน",
      tone: "stone" as const
    },
    {
      count: notificationSummary?.stockCountReviewCount ?? 0,
      href: "/app/stock-counts",
      icon: ClipboardList,
      label: "รอบนับสต็อกรอตรวจทาน",
      tone: "stone" as const
    },
    {
      count: notificationSummary?.stockAdjustmentRequestCount ?? 0,
      href: "/app/activity-approvals",
      icon: Shield,
      label: "งานรออนุมัติ: ปรับสต็อก",
      tone: "indigo" as const
    }
  ].filter((item) => item.count > 0);
  const storeMenuActions = isDemoMode ? { canEditStore: false } : getStoreMenuActions(effectivePermissions);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
      if (!storeMenuRef.current?.contains(event.target as Node)) setIsStoreMenuOpen(false);
      if (!notificationMenuRef.current?.contains(event.target as Node)) setIsNotificationOpen(false);
      if (!workingBranchRef.current?.contains(event.target as Node)) setIsWorkingBranchOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setIsNotificationOpen(false);
    setIsWorkingBranchOpen(false);
    setIsStoreMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (branches.isLoading) return;
    if (activeBranches.length === 0) {
      if (workingBranchId) setWorkingBranchId("");
      return;
    }
    if (!workingBranchId || !activeBranches.some((branch) => branch.id === workingBranchId)) {
      setWorkingBranchId(activeBranches[0].id);
    }
  }, [activeBranches, branches.isLoading, setWorkingBranchId, workingBranchId]);

  function signOut() {
    setIsUserMenuOpen(false);
    if (isDemoMode) clearLocalDemo();
    clear();
    navigate("/login");
  }

  async function resetDemo() {
    const nextSession = resetLocalDemo();
    setSession(nextSession);
    setIsUserMenuOpen(false);
    await queryClient.invalidateQueries();
    navigate("/app/dashboard");
  }

  function leaveDemo(target: "/" | "/register") {
    setIsUserMenuOpen(false);
    clearLocalDemo();
    clear();
    queryClient.clear();
    navigate(target);
  }

  function chooseWorkingBranch(branchId: string) {
    const changedBranch = branchId !== workingBranchId;
    setWorkingBranchId(branchId);
    setIsWorkingBranchOpen(false);
    if (changedBranch && shouldResetWarehouseDetailOnBranchChange(location.pathname)) {
      navigate("/app/warehouses");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {!isStoreLevelPage ? <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 overflow-y-auto border-r border-stone-200 bg-white p-4 lg:block">{sidebar}</aside> : null}

      {!isStoreLevelPage ? (
        <>
          <div
            className={`fixed inset-0 z-40 bg-ink/45 transition lg:hidden ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden="true"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,82vw)] overflow-y-auto border-r border-stone-200 bg-white p-4 shadow-2xl transition-transform duration-200 lg:hidden ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            aria-label="เมนูหลัก"
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-stone-200 pb-4">
              <div className="min-w-0">
                <p className="text-lg font-black text-ink">Zentory</p>
                <p className="truncate text-sm font-semibold text-stone-700">{storeName}</p>
                <p className="truncate text-[11px] font-semibold text-stone-500" title={storeUid}>UID {storeUid}</p>
                <p className="text-xs text-stone-500">สาขาหลัก • {planName}</p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-stone-200 text-stone-700" aria-label="ปิดเมนู" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {sidebar}
          </aside>
        </>
      ) : null}

      <main className={isStoreLevelPage ? "" : "lg:pl-72"}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {!isStoreLevelPage ? (
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-ink shadow-sm lg:hidden"
                aria-label="เปิดเมนู"
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={20} />
              </button>
            ) : null}
            {isStoreLevelPage ? (
              <Link to="/" className="flex h-10 shrink-0 items-center gap-2 rounded-md pr-2 text-ink transition hover:bg-stone-50" aria-label="กลับไปหน้าแรก Zentory">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-leaf text-sm font-black text-white">Z</span>
                <span className="hidden text-sm font-black sm:inline">Zentory</span>
              </Link>
            ) : null}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-base font-black leading-tight text-ink">{pageTitle}</p>
                {isDemoMode ? <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-black uppercase text-amber-800">Demo Mode</span> : null}
              </div>
              <p className="truncate text-xs font-semibold text-stone-500">
                {storeName} <span className="text-stone-400">UID {storeUid}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStoreLevelPage ? (
              <Link to="/app/dashboard" className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-bold text-ink transition hover:bg-stone-50">
                <LayoutDashboard size={17} className="text-leaf" />
                <span className="hidden sm:inline">กลับไป Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Link>
            ) : null}
            {activeBranches.length > 0 && !isStoreLevelPage ? (
              <div className="relative" ref={workingBranchRef}>
                <button
                  type="button"
                  className={`group flex h-11 max-w-[52vw] items-center gap-2 rounded-md border px-3 text-left shadow-sm ring-1 transition sm:max-w-72 ${
                    isWorkingBranchOpen ? "border-teal-500 bg-teal-100 ring-teal-200" : "border-teal-300 bg-teal-50 ring-teal-100 hover:border-teal-500 hover:bg-teal-100/70"
                  }`}
                  aria-label="เลือกสาขาทำงาน"
                  aria-expanded={isWorkingBranchOpen}
                  aria-haspopup="listbox"
                  onClick={() => {
                    setIsNotificationOpen(false);
                    setIsUserMenuOpen(false);
                    setIsStoreMenuOpen(false);
                    setIsWorkingBranchOpen((open) => !open);
                  }}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-white text-leaf shadow-sm">
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="hidden text-[10px] font-black uppercase leading-none text-teal-700 sm:block">สาขาทำงาน</span>
                    <span className="block truncate text-xs font-black leading-tight text-ink sm:text-sm">{workingBranch?.name ?? activeBranches[0]?.name ?? "เลือกสาขา"}</span>
                  </span>
                  <ChevronDown size={16} className={`ml-auto shrink-0 text-teal-700 transition ${isWorkingBranchOpen ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
                </button>

                <div
                  className={`absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition ${
                    isWorkingBranchOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                  }`}
                  role="listbox"
                  aria-label="เลือกสาขาทำงาน"
                >
                  <div className="border-b border-stone-100 p-3">
                    <p className="text-sm font-black text-ink">สาขาทำงาน</p>
                    <p className="mt-0.5 text-xs text-stone-500">ใช้กับ POS รับเข้า ปรับสต็อก และประวัติสต็อก</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1">
                    {activeBranches.map((branch) => {
                      const selected = branch.id === (workingBranchId || activeBranches[0]?.id);
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm font-semibold transition hover:bg-teal-50 ${selected ? "bg-teal-50 text-leaf" : "text-ink"}`}
                          onClick={() => chooseWorkingBranch(branch.id)}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-teal-50 text-leaf ring-1 ring-teal-100">
                            <Building2 size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-black">{branch.name}</span>
                            {branch.code ? <span className="block truncate text-xs font-medium text-stone-500">{branch.code}</span> : null}
                          </span>
                          {selected ? <Check size={17} className="shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : !isStoreLevelPage && session?.business ? (
              <div className="hidden rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 sm:block">
                ยังไม่ได้รับมอบหมายสาขา
              </div>
            ) : null}
            <div className="relative" ref={notificationMenuRef}>
              <button
                type="button"
                className={`relative grid h-10 w-10 place-items-center rounded-md border bg-white text-stone-700 hover:bg-stone-50 ${
                  isNotificationOpen ? "border-leaf text-leaf shadow-sm" : "border-stone-200"
                }`}
                aria-label="แจ้งเตือน"
                aria-expanded={isNotificationOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsStoreMenuOpen(false);
                  setIsNotificationOpen((open) => !open);
                }}
              >
                <Bell size={18} />
                {notificationTotal > 0 ? (
                  <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-black leading-none text-white ring-2 ring-white">
                    {notificationTotal > 9 ? "9+" : notificationTotal}
                  </span>
                ) : null}
              </button>

              <div
                className={`fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 ${
                  isNotificationOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                }`}
                role="dialog"
                aria-label="แจ้งเตือนร้าน"
              >
                <div className="flex items-center justify-between gap-3 border-b border-stone-100 p-4">
                  <div>
                    <p className="text-sm font-black text-ink">แจ้งเตือนร้าน</p>
                    <p className="mt-0.5 text-xs text-stone-500">{workingBranch?.name ? `สาขา ${workingBranch.name} • อัปเดตอัตโนมัติ` : "ทุกรายการที่เกี่ยวข้อง • อัปเดตอัตโนมัติ"}</p>
                  </div>
                  {notificationTotal > 0 ? <span className="rounded bg-teal-50 px-2 py-1 text-xs font-black text-leaf">{number(notificationTotal)} รายการ</span> : null}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.isLoading ? <p className="p-4 text-sm font-semibold text-stone-500">กำลังโหลดแจ้งเตือน...</p> : null}
                  {!notifications.isLoading && notificationTotal === 0 ? (
                    <div className="p-4">
                      <p className="text-sm font-semibold text-ink">ยังไม่มีแจ้งเตือนที่ต้องจัดการ</p>
                      <p className="mt-1 text-xs leading-5 text-stone-500">ถ้ามีสินค้าควรเติมหรือคำขอใหม่ ระบบจะแสดงปุ่มลัดให้ที่นี่</p>
                    </div>
                  ) : null}

                  {notificationShortcuts.map((item) => (
                    <NotificationShortcutRow
                      key={item.label}
                      count={item.count}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      tone={item.tone}
                      onOpen={(href) => {
                        setIsNotificationOpen(false);
                        navigate(href);
                      }}
                    />
                  ))}
                </div>

                <div className="border-t border-stone-100 p-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-black text-ink transition hover:bg-stone-50"
                    onClick={() => {
                      setIsNotificationOpen(false);
                      navigate("/app/notifications");
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <History size={17} className="shrink-0 text-leaf" />
                      <span className="truncate">ดูประวัติการแจ้งเตือนของฉัน</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-stone-400" />
                  </button>
                </div>
              </div>
            </div>
            {storeMenuActions.canEditStore ? (
              <div className="relative hidden lg:block" ref={storeMenuRef}>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-left hover:bg-stone-50"
                  aria-label="เมนูร้าน"
                  aria-expanded={isStoreMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsNotificationOpen(false);
                    setIsUserMenuOpen(false);
                    setIsWorkingBranchOpen(false);
                    setIsStoreMenuOpen((open) => !open);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block max-w-36 truncate text-sm font-semibold leading-tight text-ink">{storeName}</span>
                    <span className="block max-w-36 truncate text-[11px] font-semibold leading-tight text-stone-500" title={storeUid}>UID {storeUid}</span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-stone-500 transition ${isStoreMenuOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition ${
                    isStoreMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                  }`}
                  role="menu"
                >
                  <div className="border-b border-stone-100 p-3">
                    <p className="truncate text-sm font-black text-ink">{storeName}</p>
                    <p className="truncate text-xs text-stone-500" title={storeUid}>UID {storeUid}</p>
                  </div>
                  <Link to="/app/settings" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsStoreMenuOpen(false)}>
                    <Settings size={17} className="text-stone-500" />
                    แก้ไขร้าน
                  </Link>
                </div>
              </div>
            ) : (
              <div className="hidden min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 lg:flex">
                <span className="min-w-0">
                  <span className="block max-w-36 truncate text-sm font-semibold leading-tight text-ink">{storeName}</span>
                  <span className="block max-w-36 truncate text-[11px] font-semibold leading-tight text-stone-500" title={storeUid}>UID {storeUid}</span>
                </span>
              </div>
            )}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-2 text-ink hover:bg-stone-50 sm:px-3"
                aria-label="เมนูผู้ใช้"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setIsNotificationOpen(false);
                  setIsStoreMenuOpen(false);
                  setIsUserMenuOpen((open) => !open);
                }}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-50 text-sm font-black text-leaf">{userName.slice(0, 1).toUpperCase()}</span>
                <span className="hidden max-w-28 truncate text-sm font-semibold sm:inline">{userName}</span>
                <span className="hidden shrink-0 rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-leaf sm:inline">{planName}</span>
                <ChevronDown size={16} className={`hidden text-stone-500 transition sm:block ${isUserMenuOpen ? "rotate-180" : ""}`} />
              </button>

              <div
                className={`absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition ${
                  isUserMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                }`}
                role="menu"
              >
                <div className="border-b border-stone-100 p-3">
                  <p className="truncate text-sm font-black text-ink">{userName}</p>
                  <p className="truncate text-xs text-stone-500">{userEmail}</p>
                  <div className="mt-2 rounded bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-600">
                    <p className="truncate">{storeName} • {planName}</p>
                    <p className="truncate text-[11px] text-stone-500" title={storeUid}>UID {storeUid}</p>
                  </div>
                </div>
                {isDemoMode ? (
                  <div className="border-b border-amber-100 bg-amber-50 p-3">
                    <p className="text-xs font-black text-amber-900">Demo Mode</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">ข้อมูลอยู่เฉพาะในเครื่องนี้และรีเซ็ตได้ทุกเมื่อ</p>
                  </div>
                ) : null}
                <Link to="/app/profile" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                  <UserCircle size={17} className="text-stone-500" />
                  โปรไฟล์
                </Link>
                {!isDemoMode ? (
                  <Link to="/app/profile/billing" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                    <CreditCard size={17} className="text-stone-500" />
                    แพ็กเกจบัญชี
                  </Link>
                ) : null}
                <Link to="/app/support" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                  <HelpCircle size={17} className="text-stone-500" />
                  ช่วยเหลือ
                </Link>
                {isDemoMode ? (
                  <>
                    <button type="button" className="flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={resetDemo}>
                      <Repeat size={17} />
                      รีเซ็ตเดโม
                    </button>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-leaf hover:bg-teal-50" role="menuitem" onClick={() => leaveDemo("/register")}>
                      <UserPlus size={17} />
                      สมัครใช้งานจริง
                    </button>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50" role="menuitem" onClick={() => leaveDemo("/")}>
                      <LogOut size={17} />
                      ออกจากเดโม
                    </button>
                  </>
                ) : (
                  <button type="button" className="flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50" role="menuitem" onClick={signOut}>
                  <LogOut size={17} />
                  ออกจากระบบ
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>

      {!hideQuickActions ? <div className="fixed bottom-5 right-5 z-30 lg:hidden">
        <div className={`mb-3 grid gap-2 transition ${isQuickOpen ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}>
          {visibleQuickActions.map((item) => (
            <Link key={item.to} to={item.to} className="flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-bold text-ink shadow-soft ring-1 ring-stone-200" onClick={() => setIsQuickOpen(false)}>
              <item.icon size={18} className="text-leaf" />
              {item.label}
            </Link>
          ))}
        </div>
        <button type="button" className="grid h-14 w-14 place-items-center rounded-full bg-leaf text-white shadow-soft" aria-label="เปิดงานด่วน" aria-expanded={isQuickOpen} onClick={() => setIsQuickOpen((open) => !open)}>
          <Plus size={24} />
        </button>
      </div> : null}
    </div>
  );
}

function StoreSidebarContent({ isDemoMode = false, onNavigate }: { isDemoMode?: boolean; onNavigate?: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const session = useAuth((state) => state.session);
  const showOnboarding = shouldShowOnboardingNav(session);
  const progress = session?.business?.onboardingProgress ?? {};
  const completedSteps = ["setupStore", "firstProduct", "stockIn", "firstSale", "firstReport"].filter((key) => progress[key]).length;
  const visibleNavGroups = filterSidebarNavGroups(withSessionDashboardPath(navGroups, session), searchQuery, showOnboarding, getSessionPermissions(session), session?.business?.role, session?.user.isSystemAdmin, isDemoMode);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const showAdminLink = !isDemoMode && Boolean(session?.user.isSystemAdmin) && (!hasSearchQuery || "zentory admin".includes(normalizedSearchQuery));

  return (
    <>
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-5 hidden items-center gap-3 rounded-md px-2 py-1 text-ink transition hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-leaf/40 lg:flex"
        aria-label="กลับไปหน้าแรก Zentory"
      >
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-leaf text-white">Z</div>
        <div className="min-w-0">
          <p className="text-lg font-black">Zentory</p>
          <p className="truncate text-xs text-stone-500">{session?.business?.name ?? "ยังไม่มีร้าน"}</p>
        </div>
      </Link>

      <div className="mb-4">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-10 w-full rounded-md border border-stone-200 bg-white pl-9 pr-10 text-sm font-semibold text-ink outline-none transition placeholder:text-stone-400 focus:border-leaf focus:ring-2 focus:ring-leaf/15"
            placeholder="ค้นหาเมนู"
            aria-label="ค้นหาเมนู"
          />
          {hasSearchQuery ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-ink"
              aria-label="ล้างคำค้นหา"
              onClick={() => setSearchQuery("")}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="space-y-5">
        {visibleNavGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-xs font-black uppercase tracking-wide text-stone-400">{group.title}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = isSidebarItemActive(item.to, location.pathname, location.search);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                      isActive ? "bg-teal-50 text-leaf" : item.featured ? "bg-stone-50 text-ink hover:bg-teal-50 hover:text-leaf" : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <item.icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.to === "/app/onboarding" ? <span className="ml-auto rounded bg-teal-100 px-2 py-0.5 text-xs font-black text-leaf">{completedSteps}/5</span> : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
        {visibleNavGroups.length === 0 && !showAdminLink ? (
          <div className="rounded-md border border-dashed border-stone-200 px-3 py-4 text-sm font-semibold text-stone-500">ไม่พบเมนู</div>
        ) : null}
        {showAdminLink ? (
          <NavLink to="/admin" onClick={onNavigate} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100">
            <Shield size={18} className="shrink-0" />
            Zentory Admin
          </NavLink>
        ) : null}
      </nav>
    </>
  );
}
