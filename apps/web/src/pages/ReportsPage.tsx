import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Boxes, ClipboardList, CreditCard, Download, ImageIcon, Package, PackageX, ReceiptText, ShoppingBasket, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, downloadApi, post } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";
import { getProductDisplayName, getProductImageUrl } from "../lib/products";
import { buildSalesQuery, getPaymentMethodLabel, type SalesDateFilter } from "../lib/sales";
import { useWorkingBranch } from "../state/working-branch";

type SalesBreakdown = { label: string; total: number; count: number };
type WarehouseOption = { id: string; name: string; branchId?: string; branch?: { id: string; name: string } };
type StockPlanningReason = "OUT" | "LOW" | "FAST_MOVING" | "HEALTHY";
type StockPlanningRow = {
  productId: string;
  sku: string;
  name: string;
  variantColor?: string | null;
  variantSize?: string | null;
  imagePath?: string | null;
  quantity: number;
  minStock: number;
  costPrice: number;
  stockValue: number;
  status: "OK" | "LOW" | "OUT";
  sold30Days: number;
  avgDailySales30: number;
  daysOfStock: number | null;
  suggestedRestockQty: number;
  estimatedCost: number;
  reason: StockPlanningReason;
};
type StockPlanningReport = {
  scope: { branchId: string | null; branchName: string | null; warehouseId: string | null; warehouseName: string | null };
  summary: {
    replenishmentCount: number;
    estimatedRestockCost: number;
    stockValue: number;
    outOfStockCount: number;
    lowStockCount: number;
    fastMovingCount: number;
    totalProducts: number;
  };
  replenishmentRows: StockPlanningRow[];
  valueRows: StockPlanningRow[];
};
type SalesReport = {
  range: { start: string; end: string; days: number };
  summary: { totalRevenue: number; receiptCount: number; averageReceipt: number; totalDiscount: number; totalUnits: number };
  dailySales: Array<{ date: string; total: number }>;
  paymentMethods: SalesBreakdown[];
  topProducts: Array<{ productId: string; name: string; sku: string; quantity: number; revenue: number; grossProfit: number }>;
  recentSales: Array<{
    id: string;
    receiptNo: string;
    createdAt: string;
    total: string | number;
    discount: string | number;
    paymentMethod: string;
    branch?: { id: string; name: string } | null;
    warehouse?: { id: string; name: string } | null;
    sellerName?: string | null;
    itemCount: number;
    unitCount: number;
  }>;
};
type LegacySaleGroup = { createdAt: string; _sum: { total?: string | number | null } };
type StockUrgencyFilter = "ALL" | Exclude<StockPlanningReason, "HEALTHY">;

const stockUrgencyFilters: Array<{ value: StockUrgencyFilter; label: string }> = [
  { value: "ALL", label: "ควรเติมทั้งหมด" },
  { value: "OUT", label: "หมดสต็อก" },
  { value: "LOW", label: "ใกล้หมด" },
  { value: "FAST_MOVING", label: "ขายเร็ว" }
];

const salesDateFilterOptions: Array<{ value: SalesDateFilter; label: string }> = [
  { value: "today", label: "วันนี้" },
  { value: "7d", label: "7 วันล่าสุด" },
  { value: "30d", label: "30 วันล่าสุด" },
  { value: "all", label: "ทั้งหมด" }
];

const reasonLabels: Record<StockPlanningReason, string> = {
  OUT: "หมดสต็อก",
  LOW: "ใกล้หมด",
  FAST_MOVING: "ขายเร็ว",
  HEALTHY: "ปกติ"
};

const reasonClassNames: Record<StockPlanningReason, string> = {
  OUT: "bg-red-50 text-red-700 ring-1 ring-red-100",
  LOW: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  FAST_MOVING: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  HEALTHY: "bg-teal-50 text-leaf ring-1 ring-teal-100"
};

const replenishmentRowClassNames: Record<StockPlanningReason, string> = {
  OUT: "border-l-4 border-l-red-600 bg-red-50/45 hover:bg-red-50",
  LOW: "border-l-4 border-l-amber-500 bg-amber-50/45 hover:bg-amber-50",
  FAST_MOVING: "border-l-4 border-l-blue-500 bg-blue-50/35 hover:bg-blue-50",
  HEALTHY: "border-l-4 border-l-teal-600 bg-white hover:bg-stone-50"
};

const replenishmentTextClassNames: Record<StockPlanningReason, string> = {
  OUT: "text-red-700",
  LOW: "text-amber-700",
  FAST_MOVING: "text-blue-700",
  HEALTHY: "text-leaf"
};

const replenishmentGroups: Array<{ reason: Exclude<StockPlanningReason, "HEALTHY">; title: string; emptyText: string }> = [
  { reason: "OUT", title: "หมดคลัง", emptyText: "ไม่มีสินค้าหมดคลัง" },
  { reason: "LOW", title: "ใกล้หมด", emptyText: "ไม่มีสินค้าใกล้หมด" },
  { reason: "FAST_MOVING", title: "ขายเร็ว", emptyText: "ยังไม่มีสินค้าขายเร็วที่ควรเติม" }
];

function locationReportPath(path: string, filters: { branchId: string; warehouseId: string }) {
  const params = new URLSearchParams();
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);
  else if (filters.branchId) params.set("branchId", filters.branchId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function StockReportPage() {
  const [filter, setFilter] = useState<StockUrgencyFilter>("ALL");
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [warehouseId, setWarehouseId] = useState("");
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses") });
  const warehouseOptions = useMemo(() => (warehouses.data ?? []).filter((warehouse) => !workingBranchId || warehouse.branchId === workingBranchId || warehouse.branch?.id === workingBranchId), [warehouses.data, workingBranchId]);
  useEffect(() => {
    if (warehouseId && !warehouseOptions.some((warehouse) => warehouse.id === warehouseId)) setWarehouseId("");
  }, [warehouseId, warehouseOptions]);
  const query = useQuery({
    queryKey: ["stock-planning-report", workingBranchId, warehouseId],
    queryFn: () => api<StockPlanningReport>(locationReportPath("/reports/stock/planning", { branchId: workingBranchId, warehouseId })),
    enabled: Boolean(workingBranchId)
  });
  const report = query.data;
  const summary = report?.summary ?? { replenishmentCount: 0, estimatedRestockCost: 0, stockValue: 0, outOfStockCount: 0, lowStockCount: 0, fastMovingCount: 0, totalProducts: 0 };
  const replenishmentRows = useMemo(() => {
    const rows = report?.replenishmentRows ?? [];
    return filter === "ALL" ? rows : rows.filter((row) => row.reason === filter);
  }, [filter, report?.replenishmentRows]);
  const visibleReplenishmentGroups = useMemo(() => {
    return replenishmentGroups
      .filter((group) => filter === "ALL" || group.reason === filter)
      .map((group) => ({ ...group, rows: replenishmentRows.filter((row) => row.reason === group.reason) }));
  }, [filter, replenishmentRows]);
  const hasFilters = filter !== "ALL" || warehouseId !== "";
  const scopeLabel = warehouseId
    ? report?.scope.warehouseName ?? "คลังที่เลือก"
    : report?.scope.branchName ?? "สาขาทำงาน";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">สินค้าต้องเติม</h1>
          <p className="text-stone-600">ตัดสินใจว่าควรซื้ออะไรเพิ่ม เติมเท่าไร และใช้งบประมาณประมาณเท่าไร</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/inventory/receipts"><Button icon={<Boxes size={16} />}>รับสินค้าเข้า</Button></Link>
          <Link to="/app/inventory/adjustments"><Button variant="secondary" icon={<ClipboardList size={16} />}>ปรับสต็อก</Button></Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StockMetricCard icon={<AlertTriangle size={19} />} label="ต้องเติม" value={`${number(summary.replenishmentCount)} รายการ`} tone="warning" />
        <StockMetricCard icon={<Wallet size={19} />} label="งบเติมของโดยประมาณ" value={baht(summary.estimatedRestockCost)} />
        <StockMetricCard icon={<Boxes size={19} />} label="มูลค่าสต็อกปัจจุบัน" value={baht(summary.stockValue)} />
        <StockMetricCard icon={<PackageX size={19} />} label="หมด/ใกล้หมด" value={`${number(summary.outOfStockCount + summary.lowStockCount)} รายการ`} tone="danger" />
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-500">กำลังวางแผนสำหรับ</p>
            <p className="text-xl font-black text-ink">{scopeLabel}</p>
          </div>
          <p className="text-sm font-bold text-stone-500">ขายเร็ว {number(summary.fastMovingCount)} รายการ • สินค้ารวม {number(summary.totalProducts)} รายการ</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-[200px_1fr]">
          <Dropdown
            options={[{ value: "", label: "ทุกคลัง" }, ...warehouseOptions.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))]}
            value={warehouseId}
            onValueChange={setWarehouseId}
            buttonClassName="h-11"
            aria-label="เลือกคลังสำหรับรายงานเติมสินค้า"
          />
          <div className="flex flex-wrap gap-2">
            {stockUrgencyFilters.map((item) => (
              <Button key={item.value} type="button" variant={filter === item.value ? "primary" : "secondary"} onClick={() => setFilter(item.value)}>
                {item.label}
              </Button>
            ))}
            {hasFilters ? <Button type="button" variant="ghost" onClick={() => { setFilter("ALL"); setWarehouseId(""); }}>ล้างตัวกรอง</Button> : null}
          </div>
        </div>
      </Card>

      {!workingBranchId ? <Card>กำลังเตรียมสาขาที่ใช้งาน...</Card> : null}
      {query.isLoading ? <Card>กำลังโหลดสินค้าต้องเติม...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลดสินค้าต้องเติมไม่สำเร็จ: {query.error.message}</Card> : null}

      {!query.isLoading && !query.error ? (
        <div className="space-y-4">
          {visibleReplenishmentGroups.map((group) => (
            <ReplenishmentGroup
              key={group.reason}
              title={group.title}
              emptyText={group.emptyText}
              reason={group.reason}
              rows={group.rows}
              branchId={workingBranchId}
              warehouseId={warehouseId}
            />
          ))}
        </div>
      ) : null}

      {!query.isLoading && !query.error && report ? (
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-ink">มูลค่าสต็อกสูง</h2>
            <p className="text-sm text-stone-500">ช่วยดูว่าสินค้าไหนมีเงินจมในสต็อกมากที่สุด ไม่ใช่รายการที่ต้องแก้ทันที</p>
          </div>
          {report.valueRows.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {report.valueRows.map((row) => (
                <div key={row.productId} className="rounded-md border border-stone-200 p-4">
                  <p className="truncate font-black text-ink">{getProductDisplayName(row)}</p>
                  <p className="mt-1 text-xs font-semibold text-stone-500">{row.sku}</p>
                  <p className="mt-3 text-2xl font-black text-ink">{baht(row.stockValue)}</p>
                  <p className="mt-1 text-sm text-stone-600">คงเหลือ {number(row.quantity)} • ทุน/ชิ้น {baht(row.costPrice)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold text-stone-500">ยังไม่มีมูลค่าสต็อกในขอบเขตนี้</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function StockMetricCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass = {
    default: "text-leaf",
    warning: "text-amber-700",
    danger: "text-red-700"
  }[tone];
  return (
    <Card>
      <div className={`mb-3 inline-flex rounded-md bg-stone-50 p-2 ${toneClass}`}>{icon}</div>
      <p className="text-sm font-black text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink">{value}</p>
    </Card>
  );
}

function ReplenishmentEmptyState({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="py-3 text-center">
      <Boxes className="mx-auto text-stone-400" size={36} />
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{description}</p>
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

function ReplenishmentProductImage({ product }: { product: Pick<StockPlanningRow, "imagePath" | "name"> }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) {
    return <img src={imageUrl} alt={product.name} className="h-14 w-14 shrink-0 rounded-md border border-stone-200 object-cover" />;
  }
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-white/70 text-stone-400">
      <ImageIcon size={22} />
    </span>
  );
}

function ReplenishmentGroup({
  title,
  emptyText,
  reason,
  rows,
  branchId,
  warehouseId
}: {
  title: string;
  emptyText: string;
  reason: Exclude<StockPlanningReason, "HEALTHY">;
  rows: StockPlanningRow[];
  branchId: string;
  warehouseId: string;
}) {
  const countText = `${number(rows.length)} รายการ`;
  return (
    <Card className={`space-y-3 ${reason === "OUT" ? "border-red-200" : reason === "LOW" ? "border-amber-200" : "border-blue-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-sm font-black ${reasonClassNames[reason]}`}>{title}</span>
          <span className={`text-sm font-bold ${replenishmentTextClassNames[reason]}`}>{countText}</span>
        </div>
        {rows.length > 0 ? <p className="text-sm font-semibold text-stone-500">เรียงตามความเร่งด่วนและงบประมาณ</p> : null}
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={row.productId} className={`rounded-md border border-stone-200 p-4 ${replenishmentRowClassNames[row.reason]}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ReplenishmentProductImage product={row} />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-ink">{getProductDisplayName(row)}</p>
                    <p className="text-sm font-semibold text-stone-500">{row.sku}</p>
                  </div>
                </div>
                <Link to={locationReportPath("/app/inventory/receipts", { branchId, warehouseId }) + `${branchId || warehouseId ? "&" : "?"}productId=${row.productId}`}>
                  <Button variant="secondary">รับเข้า</Button>
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs font-bold text-stone-500">คงเหลือ</p>
                  <p className={`mt-1 text-xl font-black ${replenishmentTextClassNames[row.reason]}`}>{number(row.quantity)}</p>
                  <p className="text-xs text-stone-500">จุดเตือน {number(row.minStock)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">ควรรับเข้า</p>
                  <p className={`mt-1 text-xl font-black ${replenishmentTextClassNames[row.reason]}`}>{number(row.suggestedRestockQty)} ชิ้น</p>
                  <p className="text-xs text-stone-500">ถึงระดับปลอดภัย</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">งบประมาณ</p>
                  <p className="mt-1 font-black text-ink">{baht(row.estimatedCost)}</p>
                  <p className="text-xs text-stone-500">ทุน/ชิ้น {baht(row.costPrice)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">ขาย 30 วัน</p>
                  <p className="mt-1 font-black text-ink">{number(row.sold30Days)}</p>
                  <p className="text-xs text-stone-500">{row.daysOfStock === null ? "ไม่มีข้อมูลขาย" : `อยู่ได้ ${number(Math.ceil(row.daysOfStock))} วัน`}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ReplenishmentEmptyState
          title={emptyText}
          description="สต็อกในหมวดนี้ยังไม่เข้าเงื่อนไขที่ต้องเติม"
        />
      )}
    </Card>
  );
}

export function SalesReportPage() {
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [dateFilter, setDateFilter] = useState<SalesDateFilter>("30d");
  const [warehouseId, setWarehouseId] = useState("");
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses") });
  const warehouseOptions = useMemo(() => (warehouses.data ?? []).filter((warehouse) => !workingBranchId || warehouse.branchId === workingBranchId || warehouse.branch?.id === workingBranchId), [warehouses.data, workingBranchId]);
  useEffect(() => {
    if (warehouseId && !warehouseOptions.some((warehouse) => warehouse.id === warehouseId)) setWarehouseId("");
  }, [warehouseId, warehouseOptions]);
  const queryString = useMemo(() => buildSalesQuery({ page: 1, limit: 100, dateFilter, branchId: workingBranchId, warehouseId, allTime: dateFilter === "all" }), [dateFilter, warehouseId, workingBranchId]);
  const query = useQuery({
    queryKey: ["sales-report", queryString],
    queryFn: () => api<SalesReport | LegacySaleGroup[]>(`/reports/sales?${queryString}`),
    enabled: Boolean(workingBranchId)
  });
  useEffect(() => {
    post("/onboarding/report-viewed", {}).catch(() => undefined);
  }, []);
  const report = normalizeSalesReport(query.data);
  const paymentMethods = report?.paymentMethods ?? [];
  const topProducts = report?.topProducts ?? [];
  const recentSales = report?.recentSales ?? [];
  const dailySales = report?.dailySales ?? [];
  const maxPaymentTotal = Math.max(...paymentMethods.map((row) => row.total), 1);
  const hasFilters = dateFilter !== "30d" || warehouseId !== "";

  async function exportCsv() {
    setIsExporting(true);
    setExportError("");
    try {
      const blob = await downloadApi(`/sales/export?${queryString}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "ส่งออกรายงานไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">รายงานยอดขาย</h1>
          <p className="text-stone-600">สรุปยอดขายตามช่วงเวลาและสาขาที่ใช้งาน แยกตามวัน ช่องทาง และสินค้าขายดี</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" icon={<Download size={16} />} onClick={exportCsv} disabled={isExporting || !report || report.summary.receiptCount === 0}>
            {isExporting ? "กำลังส่งออก..." : "Export CSV"}
          </Button>
          <Link to="/app/sales"><Button variant="secondary" icon={<ReceiptText size={16} />}>ดูประวัติใบขาย</Button></Link>
        </div>
      </div>

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[180px_220px_1fr]">
          <Dropdown
            options={salesDateFilterOptions}
            value={dateFilter}
            onValueChange={(value) => setDateFilter(value as SalesDateFilter)}
            buttonClassName="h-11"
            aria-label="เลือกช่วงเวลารายงานยอดขาย"
          />
          <Dropdown
            options={[{ value: "", label: "ทุกคลังในสาขา" }, ...warehouseOptions.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))]}
            value={warehouseId}
            onValueChange={setWarehouseId}
            buttonClassName="h-11"
            aria-label="เลือกคลังสำหรับรายงานยอดขาย"
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-stone-500">นับเฉพาะใบขายที่ชำระแล้ว</p>
            {hasFilters ? <Button type="button" variant="ghost" onClick={() => { setDateFilter("30d"); setWarehouseId(""); }}>ล้างตัวกรอง</Button> : null}
          </div>
        </div>
        {exportError ? <p className="text-sm font-semibold text-red-700">{exportError}</p> : null}
      </Card>

      {!workingBranchId ? <Card>กำลังเตรียมสาขาที่ใช้งาน...</Card> : null}
      {query.isLoading ? <Card>กำลังโหลดรายงานยอดขาย...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลดรายงานยอดขายไม่สำเร็จ: {query.error.message}</Card> : null}

      {report ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SalesMetricCard label="ยอดขาย 30 วัน" value={baht(report.summary.totalRevenue)} icon={<Wallet size={19} />} tone="leaf" />
            <SalesMetricCard label="จำนวนใบขาย" value={number(report.summary.receiptCount)} icon={<ReceiptText size={19} />} />
            <SalesMetricCard label="เฉลี่ยต่อบิล" value={baht(report.summary.averageReceipt)} icon={<BarChart3 size={19} />} />
            <SalesMetricCard label="จำนวนสินค้าที่ขาย" value={`${number(report.summary.totalUnits)} ชิ้น`} icon={<Package size={19} />} />
            <SalesMetricCard label="ส่วนลดรวม" value={baht(report.summary.totalDiscount)} icon={<ShoppingBasket size={19} />} />
          </div>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-ink">ยอดขายรายวัน</h2>
                <p className="text-sm text-stone-500">{formatReportDate(report.range.start)} - {formatReportDate(report.range.end)}</p>
              </div>
              <p className="text-sm font-bold text-stone-500">{number(report.range.days)} วันล่าสุด</p>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => number(value)} tickLine={false} axisLine={false} width={72} />
                  <Tooltip labelFormatter={formatReportDate} formatter={(value) => baht(Number(value))} />
                  <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SalesBreakdownCard
            title="ช่องทางชำระเงิน"
            icon={<CreditCard size={18} />}
            rows={paymentMethods.map((row) => ({ ...row, label: getPaymentMethodLabel(row.label) }))}
            maxTotal={maxPaymentTotal}
          />

          <div className="grid min-w-0 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-ink">สินค้าขายดี</h2>
                <p className="text-sm text-stone-500">เรียงตามยอดขายรวมในช่วงรายงาน</p>
              </div>
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div key={product.productId} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md border border-stone-100 p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-sm font-black text-stone-600">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{product.name}</p>
                      <p className="text-xs font-semibold text-stone-500">{product.sku} · {number(product.quantity)} ชิ้น</p>
                    </div>
                    <p className="text-right font-black text-ink">{baht(product.revenue)}</p>
                  </div>
                ))}
                {topProducts.length === 0 ? <SalesEmptyNote text="ยังไม่มีสินค้าขายดีในช่วงนี้" /> : null}
              </div>
            </Card>

            <Card className="min-w-0 space-y-4">
              <div>
                <h2 className="text-lg font-black text-ink">รายการขายล่าสุด</h2>
                <p className="text-sm text-stone-500">ใบขายล่าสุดที่รวมอยู่ในรายงาน</p>
              </div>
              <div className="table-shell -mx-5 max-w-[calc(100%+2.5rem)] border-x-0 shadow-none sm:mx-0 sm:max-w-full sm:border-x sm:shadow-sm">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="p-3">เลขที่</th>
                      <th className="p-3">เวลา</th>
                      <th className="p-3">ช่องทาง</th>
                      <th className="p-3">คลัง</th>
                      <th className="p-3 text-right">รายการ</th>
                      <th className="p-3 text-right">ยอดสุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="p-3"><Link className="font-bold text-leaf hover:text-teal-800" to={`/app/sales/${sale.id}`}>{sale.receiptNo}</Link></td>
                        <td className="p-3">{thaiDate(sale.createdAt)}</td>
                        <td className="p-3">{getPaymentMethodLabel(sale.paymentMethod)}</td>
                        <td className="p-3">{sale.warehouse?.name ?? "ไม่ระบุคลัง"}</td>
                        <td className="p-3 text-right">{number(sale.itemCount)} รายการ / {number(sale.unitCount)} ชิ้น</td>
                        <td className="p-3 text-right font-black">{baht(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recentSales.length === 0 ? <SalesEmptyNote text="ยังไม่มีใบขายในช่วง 30 วันล่าสุด" /> : null}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function normalizeSalesReport(data: SalesReport | LegacySaleGroup[] | undefined): SalesReport | undefined {
  if (!data) return undefined;
  if (Array.isArray(data)) {
    const dailySales = data
      .map((row) => ({ date: new Date(row.createdAt).toISOString().slice(0, 10), total: Number(row._sum.total ?? 0) }))
      .reverse();
    const totalRevenue = dailySales.reduce((sum, row) => sum + row.total, 0);
    const start = dailySales[0]?.date ?? new Date().toISOString().slice(0, 10);
    const end = dailySales.at(-1)?.date ?? start;
    return {
      range: { start, end, days: dailySales.length },
      summary: {
        totalRevenue,
        receiptCount: data.length,
        averageReceipt: data.length ? totalRevenue / data.length : 0,
        totalDiscount: 0,
        totalUnits: 0
      },
      dailySales,
      paymentMethods: [],
      topProducts: [],
      recentSales: []
    };
  }
  return {
    range: data.range ?? { start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10), days: 0 },
    summary: {
      totalRevenue: Number(data.summary?.totalRevenue ?? 0),
      receiptCount: Number(data.summary?.receiptCount ?? 0),
      averageReceipt: Number(data.summary?.averageReceipt ?? 0),
      totalDiscount: Number(data.summary?.totalDiscount ?? 0),
      totalUnits: Number(data.summary?.totalUnits ?? 0)
    },
    dailySales: data.dailySales ?? [],
    paymentMethods: data.paymentMethods ?? [],
    topProducts: data.topProducts ?? [],
    recentSales: data.recentSales ?? []
  };
}

function SalesMetricCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "leaf" }) {
  return (
    <Card>
      <div className={`mb-3 inline-flex rounded-md bg-stone-50 p-2 ${tone === "leaf" ? "text-leaf" : "text-stone-500"}`}>{icon}</div>
      <p className="text-sm font-black text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone === "leaf" ? "text-leaf" : "text-ink"}`}>{value}</p>
    </Card>
  );
}

function SalesBreakdownCard({ title, icon, rows, maxTotal }: { title: string; icon: ReactNode; rows: SalesBreakdown[]; maxTotal: number }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2 text-ink">
        {icon}
        <h2 className="text-lg font-black">{title}</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-ink">{row.label}</span>
              <span className="font-black">{baht(row.total)} <span className="font-semibold text-stone-500">({number(row.count)} บิล)</span></span>
            </div>
            <div className="h-2 rounded-full bg-stone-100">
              <div className="h-2 rounded-full bg-amber-600" style={{ width: `${Math.max(4, (row.total / maxTotal) * 100)}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 ? <SalesEmptyNote text="ยังไม่มีข้อมูลในช่วงนี้" /> : null}
      </div>
    </Card>
  );
}

function SalesEmptyNote({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold text-stone-500">{text}</p>;
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(value));
}
