import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Download, Printer, ReceiptText, Search, ShoppingBag, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, downloadApi } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";
import { buildSalesQuery, getPaymentMethodLabel, getReceiptSummary, type SaleForReceipt, type SalesDateFilter } from "../lib/sales";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type Sale = Omit<SaleForReceipt, "items"> & {
  status?: string;
  branch?: { name: string };
  warehouse?: { name: string };
  user?: { name: string | null };
  items: Array<SaleForReceipt["items"][number] & { id?: string }>;
};

const dateFilters = [
  { value: "all", label: "ทั้งหมด" },
  { value: "today", label: "วันนี้" },
  { value: "7d", label: "7 วัน" },
  { value: "30d", label: "30 วัน" }
] as const;

const pageLimitOptions = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" }
];

type SalesResponse = {
  data: Sale[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: { total: number; units: number };
};

function getSaleStatusLabel(status?: string) {
  if (status === "VOID") return "ยกเลิก";
  return "ชำระแล้ว";
}

export function SalesPage() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<SalesDateFilter>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const queryString = useMemo(() => buildSalesQuery({ page, limit, search, dateFilter, branchId: workingBranchId }), [dateFilter, limit, page, search, workingBranchId]);
  const sales = useQuery({ queryKey: ["sales", queryString], queryFn: () => api<SalesResponse>(`/sales?${queryString}`) });

  const rows = sales.data?.data ?? [];
  const meta = sales.data?.meta ?? { page, limit, total: 0, totalPages: 1 };
  const summary = sales.data?.summary ?? { total: 0, units: 0 };

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateDateFilter(value: SalesDateFilter) {
    setDateFilter(value);
    setPage(1);
  }

  function updateLimit(value: number) {
    setLimit(value);
    setPage(1);
  }

  async function exportCsv() {
    setIsExporting(true);
    setExportError("");
    try {
      const exportQuery = buildSalesQuery({ page: 1, limit, search, dateFilter, branchId: workingBranchId });
      const blob = await downloadApi(`/sales/export?${exportQuery}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "ดาวน์โหลดไฟล์ไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">ประวัติการขาย</h1>
          <p className="text-stone-600">ตรวจใบขาย ยอดชำระ สาขา คลัง และรายการสินค้าย้อนหลัง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" icon={<Download size={16} />} onClick={exportCsv} disabled={isExporting || meta.total === 0}>
            {isExporting ? "กำลังส่งออก..." : "Export CSV"}
          </Button>
          <Link to="/app/pos"><Button icon={<ShoppingBag size={16} />}>เปิด POS</Button></Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-bold text-stone-500">ยอดขายตามตัวกรอง</p>
          <p className="mt-1 text-2xl font-black text-ink">{baht(summary.total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-stone-500">ใบขายทั้งหมด</p>
          <p className="mt-1 text-2xl font-black text-leaf">{number(meta.total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-stone-500">หน้าปัจจุบัน</p>
          <p className="mt-1 text-2xl font-black text-ink">{number(rows.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-stone-500">จำนวนสินค้าที่ขาย</p>
          <p className="mt-1 text-2xl font-black text-ink">{number(summary.units)}</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              className="field pl-10"
              placeholder="ค้นหาเลขใบขาย สินค้า SKU สาขา คลัง หรือคนขาย"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {dateFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => updateDateFilter(filter.value)}
                className={`h-10 shrink-0 rounded-md px-4 text-sm font-bold transition ${dateFilter === filter.value ? "bg-leaf text-white" : "border border-stone-300 bg-white text-ink hover:bg-stone-50"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {sales.isLoading ? <p className="text-sm text-stone-500">กำลังโหลดประวัติการขาย...</p> : null}
        {sales.isFetching && !sales.isLoading ? <p className="text-sm text-stone-500">กำลังอัปเดตรายการ...</p> : null}
        {sales.error ? <p className="text-sm text-red-700">โหลดประวัติการขายไม่สำเร็จ: {sales.error.message}</p> : null}
        {exportError ? <p className="text-sm text-red-700">{exportError}</p> : null}

        <div className="table-shell -mx-5 border-x-0 shadow-none sm:mx-0 sm:border-x sm:shadow-sm">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3 text-right">ลำดับ</th>
                <th className="p-3">เลขที่</th>
                <th className="p-3">เวลา</th>
                <th className="p-3">ช่องทาง</th>
                <th className="p-3">คลัง</th>
                <th className="p-3">คนขาย</th>
                <th className="p-3">รายการ</th>
                <th className="p-3 text-right">ส่วนลด</th>
                <th className="p-3 text-right">ยอดสุทธิ</th>
                <th className="p-3 text-right">ดู</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sale, index) => {
                const receipt = getReceiptSummary(sale);
                const previewItems = sale.items.slice(0, 2).map((item) => item.product.name).join(", ");
                return (
                  <tr key={sale.id} className="border-t border-stone-100 align-top hover:bg-stone-50">
                    <td className="p-3 text-right font-semibold text-stone-500">{number((meta.page - 1) * meta.limit + index + 1)}</td>
                    <td className="p-3">
                      <p className="font-bold text-ink">{sale.receiptNo}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${sale.status === "VOID" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {getSaleStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2 text-stone-700"><CalendarDays size={15} />{thaiDate(sale.createdAt)}</span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2"><CreditCard size={15} />{getPaymentMethodLabel(sale.paymentMethod)}</span>
                    </td>
                    <td className="p-3 font-semibold text-ink">{sale.warehouse?.name ?? "ไม่ระบุคลัง"}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2"><UserRound size={15} />{sale.user?.name ?? "-"}</span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{number(receipt.itemCount)} รายการ / {number(receipt.unitCount)} ชิ้น</p>
                      <p className="mt-1 max-w-xs truncate text-xs text-stone-500">{previewItems || "ไม่มีรายการสินค้า"}</p>
                    </td>
                    <td className="p-3 text-right">{baht(receipt.discount)}</td>
                    <td className="p-3 text-right font-black text-ink">{baht(receipt.total)}</td>
                    <td className="p-3 text-right"><Link className="font-bold text-leaf hover:text-teal-800" to={`/app/sales/${sale.id}`}>รายละเอียด</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!sales.isLoading && rows.length === 0 && !search && dateFilter === "all" ? <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold">ยังไม่มีประวัติการขาย ลองขายสินค้าจากหน้า POS ก่อน</p> : null}
        {!sales.isLoading && rows.length === 0 && (Boolean(search) || dateFilter !== "all") ? <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold">ไม่พบใบขายที่ตรงกับตัวกรอง</p> : null}

        <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span>แสดง</span>
            <Dropdown options={pageLimitOptions} value={String(limit)} onValueChange={(value) => updateLimit(Number(value))} className="w-24" buttonClassName="h-10 min-h-0 py-0" menuClassName="w-24" aria-label="จำนวนรายการต่อหน้า" />
            <span>รายการต่อหน้า</span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-sm font-semibold text-stone-600">หน้า {number(meta.page)} / {number(meta.totalPages)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" icon={<ChevronLeft size={16} />} disabled={meta.page <= 1 || sales.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
              <Button type="button" variant="secondary" icon={<ChevronRight size={16} />} disabled={meta.page >= meta.totalPages || sales.isFetching} onClick={() => setPage((current) => current + 1)}>ถัดไป</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function SaleDetailPage() {
  const { id } = useParams();
  const session = useAuth((state) => state.session);
  const sale = useQuery({ queryKey: ["sale", id], queryFn: () => api<Sale>(`/sales/${id}`), enabled: Boolean(id) });

  if (sale.isLoading) return <p>กำลังโหลดใบขาย...</p>;
  if (sale.error) return <p className="text-red-700">{sale.error.message}</p>;
  if (!sale.data) return null;
  const summary = getReceiptSummary(sale.data);
  const storeName = session?.business?.name ?? "Zentory";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link to="/app/pos" className="inline-flex">
            <Button type="button" className="h-11 px-5 text-base font-black shadow-sm shadow-teal-900/15" icon={<ArrowLeft size={18} />}>
              กลับไปขายหน้าร้าน
            </Button>
          </Link>
          <h1 className="mt-3 text-3xl font-black">ใบขาย {sale.data.receiptNo}</h1>
          <p className="text-stone-600">{thaiDate(sale.data.createdAt)} • {getPaymentMethodLabel(sale.data.paymentMethod)}</p>
        </div>
        <Button type="button" variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>พิมพ์ใบขาย</Button>
      </div>

      <Card className="print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex items-center gap-2 text-leaf">
              <ReceiptText size={22} />
              <p className="text-sm font-black uppercase">Sales Receipt</p>
            </div>
            <h2 className="mt-2 text-2xl font-black text-ink">{storeName}</h2>
            <p className="mt-1 text-sm text-stone-500">ใบขายสำหรับตรวจสอบรายการขายและสต็อก</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-stone-500">เลขที่ใบขาย</p>
            <p className="text-xl font-black text-ink">{sale.data.receiptNo}</p>
            <p className="mt-2 text-sm text-stone-600">{thaiDate(sale.data.createdAt)}</p>
            <p className="text-sm font-bold text-stone-700">{getPaymentMethodLabel(sale.data.paymentMethod)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold text-stone-500">รายการสินค้า</p>
            <p className="text-2xl font-black text-ink">{number(summary.itemCount)}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold text-stone-500">จำนวนรวม</p>
            <p className="text-2xl font-black text-ink">{number(summary.unitCount)}</p>
          </div>
          <div className="rounded-md bg-teal-50 p-3">
            <p className="text-xs font-bold text-leaf">ยอดสุทธิ</p>
            <p className="text-2xl font-black text-leaf">{baht(summary.total)}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th className="py-3 pr-3">สินค้า</th>
                <th className="p-3 text-right">ราคา</th>
                <th className="p-3 text-right">จำนวน</th>
                <th className="py-3 pl-3 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
          {sale.data.items.map((item, index) => (
            <tr key={item.id ?? index} className="border-b border-stone-100">
              <td className="py-3 pr-3">
                <p className="font-bold text-ink">{item.product.name}</p>
                <p className="text-xs text-stone-500">{item.product.sku ?? "-"}</p>
              </td>
              <td className="p-3 text-right">{baht(item.unitPrice ?? Number(item.total) / item.quantity)}</td>
              <td className="p-3 text-right">{number(item.quantity)}</td>
              <td className="py-3 pl-3 text-right font-black">{baht(item.total)}</td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-6 max-w-sm space-y-2 border-t border-stone-200 pt-4 text-sm">
          <p className="flex justify-between"><span>รวมก่อนส่วนลด</span><b>{baht(summary.subtotal)}</b></p>
          <p className="flex justify-between"><span>ส่วนลด</span><b>{baht(summary.discount)}</b></p>
          <p className="flex justify-between text-2xl font-black text-ink"><span>สุทธิ</span><span>{baht(summary.total)}</span></p>
        </div>
      </Card>
    </div>
  );
}
