import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Barcode,
  Bell,
  Boxes,
  Building2,
  ChartColumn,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Coins,
  DatabaseBackup,
  FileClock,
  FileSpreadsheet,
  Handshake,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageX,
  Plus,
  ReceiptText,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Truck,
  UserCircle,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { number } from "../lib/format";
import { shouldShowOnboardingNav } from "../lib/onboarding";
import { getRestockHref, getStockAlertHref, getStockAlertPreview, type StockAlertRow } from "../lib/stock-alerts";
import { useAuth } from "../state/auth";

const navGroups = [
  {
    title: "ภาพรวม",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/alerts", label: "แจ้งเตือน", icon: AlertTriangle },
      { to: "/app/onboarding", label: "เริ่มต้นใช้งาน", icon: ShoppingBag }
    ]
  },
  {
    title: "งานประจำวัน",
    items: [
      { to: "/app/pos", label: "ขายหน้าร้าน / POS", icon: ReceiptText, featured: true },
      { to: "/app/inventory/receipts", label: "รับสินค้าเข้า", icon: Boxes, featured: true },
      { to: "/app/inventory/adjustments", label: "ปรับสต็อก", icon: ClipboardList, featured: true },
      { to: "/app/products", label: "สินค้า", icon: Package, featured: true },
      { to: "/app/sales", label: "ประวัติขาย", icon: FileClock },
      { to: "/app/stock-counts", label: "นับสต็อก (เตรียมใช้งาน)", icon: CheckCircle2 },
      { to: "/app/receipts", label: "ใบเสร็จ", icon: ReceiptText },
      { to: "/app/returns", label: "คืนสินค้า", icon: RotateCcw }
    ]
  },
  {
    title: "ข้อมูลส่วนกลาง",
    items: [
      { to: "/app/suppliers", label: "ซัพพลายเออร์", icon: Truck },
      { to: "/app/customers", label: "ลูกค้า", icon: Handshake },
      { to: "/app/barcode", label: "บาร์โค้ด", icon: Barcode },
      { to: "/app/import-export", label: "นำเข้า / ส่งออก (Bulk)", icon: FileSpreadsheet }
    ]
  },
  {
    title: "รายงานและตรวจสอบ",
    items: [
      { to: "/app/inventory/movements", label: "ประวัติสต็อก", icon: Repeat },
      { to: "/app/reports/stock", label: "รายงานสต็อก", icon: ChartColumn },
      { to: "/app/reports/sales", label: "รายงานยอดขาย", icon: ChartColumn },
      { to: "/app/profit-loss", label: "กำไรขาดทุน", icon: Coins },
      { to: "/app/activity-approvals", label: "อนุมัติรายการ", icon: ShieldCheck },
      { to: "/app/audit-log", label: "Audit Log", icon: FileClock }
    ]
  },
  {
    title: "จัดการร้าน",
    items: [
      { to: "/app/purchase-orders", label: "ใบสั่งซื้อ / PO", icon: ClipboardList },
      { to: "/app/transfers", label: "โอนสินค้า", icon: Repeat },
      { to: "/app/branches", label: "สาขา / คลัง", icon: Building2 },
      { to: "/app/discounts", label: "ส่วนลด / โปรโมชัน", icon: Tags },
      { to: "/app/payment-methods", label: "วิธีชำระเงิน", icon: WalletCards },
      { to: "/app/tax-invoices", label: "ใบกำกับภาษี", icon: ReceiptText },
      { to: "/app/staff", label: "พนักงาน", icon: Users },
      { to: "/app/settings", label: "ตั้งค่าร้าน", icon: Settings }
    ]
  },
  {
    title: "บัญชี",
    items: [
      { to: "/app/notifications/settings", label: "ตั้งค่าแจ้งเตือน", icon: AlertTriangle },
      { to: "/app/data-backup", label: "Backup / Restore", icon: DatabaseBackup },
      { to: "/app/api-keys", label: "API Keys", icon: KeyRound },
      { to: "/app/billing", label: "แพ็กเกจ / ชำระเงิน", icon: WalletCards },
      { to: "/app/profile", label: "โปรไฟล์", icon: UserCircle },
      { to: "/app/support", label: "ช่วยเหลือ", icon: HelpCircle }
    ]
  }
];

const allNavItems = navGroups.flatMap((group) => group.items);
const quickActions = allNavItems.filter((item) => item.featured);

export function filterSidebarNavGroups<TItem extends { label: string; to: string }, TGroup extends { title: string; items: TItem[] }>(
  groups: TGroup[],
  searchQuery: string,
  showOnboarding: boolean
) {
  const query = searchQuery.trim().toLocaleLowerCase();

  return groups
    .map((group) => {
      const visibleItems = group.items.filter((item) => item.to !== "/app/onboarding" || showOnboarding);
      if (visibleItems.length === 0) return undefined;
      if (!query) return { ...group, items: visibleItems };
      if (group.title.toLocaleLowerCase().includes(query)) return { ...group, items: visibleItems };

      const matchingItems = visibleItems.filter((item) => item.label.toLocaleLowerCase().includes(query));
      return matchingItems.length > 0 ? { ...group, items: matchingItems } : undefined;
    })
    .filter((group): group is TGroup => Boolean(group));
}

function getCurrentPage(pathname: string) {
  return allNavItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.label ?? "Dashboard";
}

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const session = useAuth((state) => state.session);
  const clear = useAuth((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = getCurrentPage(location.pathname);
  const hideQuickActions = /^\/app\/products\/[^/]+\/edit$/.test(location.pathname);
  const userName = session?.user.name ?? "ผู้ใช้";
  const userEmail = session?.user.email ?? "";
  const storeName = session?.business?.name ?? "ยังไม่มีร้าน";
  const sidebar = <StoreSidebarContent onNavigate={() => setIsSidebarOpen(false)} />;
  const stockReport = useQuery({
    queryKey: ["stock-report"],
    queryFn: () => api<StockAlertRow[]>("/reports/stock"),
    enabled: Boolean(session?.business)
  });
  const notificationPreview = getStockAlertPreview(stockReport.data ?? [], 3);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
      if (!notificationMenuRef.current?.contains(event.target as Node)) setIsNotificationOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setIsNotificationOpen(false);
  }, [location.pathname]);

  function signOut() {
    setIsUserMenuOpen(false);
    clear();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 overflow-y-auto border-r border-stone-200 bg-white p-4 lg:block">{sidebar}</aside>

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
            <p className="text-xs text-stone-500">สาขาหลัก • Pro</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-stone-200 text-stone-700" aria-label="ปิดเมนู" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        {sidebar}
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-ink shadow-sm lg:hidden"
              aria-label="เปิดเมนู"
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-black leading-tight text-ink">{pageTitle}</p>
              <p className="truncate text-xs font-semibold text-stone-500">{storeName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={notificationMenuRef}>
              <button
                type="button"
                className={`relative grid h-10 w-10 place-items-center rounded-md border bg-white text-stone-700 hover:bg-stone-50 ${
                  isNotificationOpen || location.pathname.startsWith("/app/alerts") ? "border-leaf text-leaf shadow-sm" : "border-stone-200"
                }`}
                aria-label="แจ้งเตือน"
                aria-expanded={isNotificationOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsNotificationOpen((open) => !open);
                }}
              >
                <Bell size={18} />
                {notificationPreview.total > 0 ? (
                  <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-black leading-none text-white ring-2 ring-white">
                    {notificationPreview.total > 9 ? "9+" : notificationPreview.total}
                  </span>
                ) : null}
              </button>

              <div
                className={`fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 ${
                  isNotificationOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                }`}
                role="dialog"
                aria-label="แจ้งเตือนสินค้า"
              >
                <div className="flex items-center justify-between gap-3 border-b border-stone-100 p-4">
                  <div>
                    <p className="text-sm font-black text-ink">แจ้งเตือนสินค้า</p>
                    <p className="mt-0.5 text-xs text-stone-500">สินค้าใกล้หมดและหมดสต็อก</p>
                  </div>
                  {notificationPreview.total > 0 ? <span className="rounded bg-teal-50 px-2 py-1 text-xs font-black text-leaf">{number(notificationPreview.total)} รายการ</span> : null}
                </div>

                {notificationPreview.total > 0 ? (
                  <div className="grid grid-cols-2 gap-2 border-b border-stone-100 p-3">
                    <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-black text-red-700">หมดสต็อก {number(notificationPreview.outCount)}</div>
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">ใกล้หมด {number(notificationPreview.lowCount)}</div>
                  </div>
                ) : null}

                <div className="max-h-[60vh] overflow-y-auto">
                  {stockReport.isLoading ? <p className="p-4 text-sm font-semibold text-stone-500">กำลังโหลดแจ้งเตือน...</p> : null}
                  {!stockReport.isLoading && notificationPreview.alerts.length === 0 ? (
                    <div className="p-4">
                      <p className="text-sm font-semibold text-ink">ยังไม่มีสินค้าใกล้หมดหรือหมดสต็อก</p>
                      <p className="mt-1 text-xs leading-5 text-stone-500">สินค้าทั้งหมดยังอยู่เหนือจุดแจ้งเตือน</p>
                    </div>
                  ) : null}

                  {notificationPreview.alerts.map((row) => {
                    const isOut = row.status === "OUT";
                    const Icon = isOut ? PackageX : AlertTriangle;
                    const productHref = getStockAlertHref(row);
                    const restockHref = getRestockHref(row);
                    return (
                      <div
                        key={row.productId || `${row.sku}-${row.name}`}
                        className={`flex gap-3 border-b border-stone-100 p-4 text-left transition hover:bg-stone-50 ${productHref ? "cursor-pointer" : ""}`}
                        role={productHref ? "link" : undefined}
                        tabIndex={productHref ? 0 : undefined}
                        onClick={() => {
                          if (!productHref) return;
                          setIsNotificationOpen(false);
                          navigate(productHref);
                        }}
                        onKeyDown={(event) => {
                          if (!productHref || event.key !== "Enter") return;
                          setIsNotificationOpen(false);
                          navigate(productHref);
                        }}
                      >
                        <Icon size={18} className={`mt-0.5 shrink-0 ${isOut ? "text-red-700" : "text-amber-700"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-ink">{row.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-stone-500">{row.sku}</span>
                          <span className="mt-2 block text-xs font-semibold text-stone-700">
                            คงเหลือ {number(row.quantity)} / จุดแจ้งเตือน {number(row.minStock)}
                          </span>
                          <span className={`mt-1 block text-xs font-black ${isOut ? "text-red-700" : "text-amber-700"}`}>{isOut ? "หมดสต็อก" : "ใกล้หมด"}</span>
                          {restockHref ? (
                            <button
                              type="button"
                              className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-stone-50"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setIsNotificationOpen(false);
                                navigate(restockHref);
                              }}
                            >
                              เติมสต็อก
                            </button>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end border-t border-stone-100 p-3">
                  <Link to="/app/alerts" className="rounded-md border border-stone-200 px-3 py-2 text-sm font-bold text-ink transition hover:bg-stone-50" onClick={() => setIsNotificationOpen(false)}>
                    ดูทั้งหมด
                  </Link>
                </div>
              </div>
            </div>
            <div className="hidden min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 lg:flex">
              <span className="max-w-36 truncate text-sm font-semibold text-ink">{storeName}</span>
              <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-leaf">Pro</span>
            </div>
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-2 text-ink hover:bg-stone-50 sm:px-3"
                aria-label="เมนูผู้ใช้"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setIsNotificationOpen(false);
                  setIsUserMenuOpen((open) => !open);
                }}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-50 text-sm font-black text-leaf">{userName.slice(0, 1).toUpperCase()}</span>
                <span className="hidden max-w-28 truncate text-sm font-semibold sm:inline">{userName}</span>
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
                  <p className="mt-2 truncate rounded bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-600">{storeName} • Pro</p>
                </div>
                <Link to="/app/profile" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                  <UserCircle size={17} className="text-stone-500" />
                  โปรไฟล์
                </Link>
                <Link to="/app/support" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                  <HelpCircle size={17} className="text-stone-500" />
                  ช่วยเหลือ
                </Link>
                <button type="button" className="flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50" role="menuitem" onClick={signOut}>
                  <LogOut size={17} />
                  ออกจากระบบ
                </button>
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
          {quickActions.map((item) => (
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

function StoreSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const session = useAuth((state) => state.session);
  const showOnboarding = shouldShowOnboardingNav(session);
  const progress = session?.business?.onboardingProgress ?? {};
  const completedSteps = ["setupStore", "firstProduct", "stockIn", "firstSale", "firstReport"].filter((key) => progress[key]).length;
  const visibleNavGroups = filterSidebarNavGroups(navGroups, searchQuery, showOnboarding);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const showAdminLink = Boolean(session?.user.isSystemAdmin) && (!hasSearchQuery || "zentory admin".includes(normalizedSearchQuery));

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
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                      isActive ? "bg-teal-50 text-leaf" : item.featured ? "bg-stone-50 text-ink hover:bg-teal-50 hover:text-leaf" : "text-stone-700 hover:bg-stone-100"
                    }`
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.to === "/app/onboarding" ? <span className="ml-auto rounded bg-teal-100 px-2 py-0.5 text-xs font-black text-leaf">{completedSteps}/5</span> : null}
                </NavLink>
              ))}
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
