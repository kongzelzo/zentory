import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";
import { getPaymentMethodLabel, getReceiptSummary, type SaleForReceipt } from "../lib/sales";
import { useAuth } from "../state/auth";

type Sale = Omit<SaleForReceipt, "items"> & { items: Array<SaleForReceipt["items"][number] & { id?: string }> };

export function SalesPage() {
  const sales = useQuery({ queryKey: ["sales"], queryFn: () => api<Sale[]>("/sales") });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">ประวัติการขาย</h1>
          <p className="text-stone-600">ใบขายและยอดชำระย้อนหลัง</p>
        </div>
        <Link to="/app/pos"><Button>เปิด POS</Button></Link>
      </div>
      <div className="table-shell">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="p-3">เลขที่</th>
              <th className="p-3">เวลา</th>
              <th className="p-3">ยอดรวม</th>
              <th className="p-3">รายการ</th>
              <th className="p-3">ดู</th>
            </tr>
          </thead>
          <tbody>
            {sales.data?.map((sale) => (
              <tr key={sale.id} className="border-t border-stone-100">
                <td className="p-3 font-bold">{sale.receiptNo}</td>
                <td className="p-3">{thaiDate(sale.createdAt)}</td>
                <td className="p-3">{baht(sale.total)}</td>
                <td className="p-3">{number(sale.items.length)}</td>
                <td className="p-3"><Link className="font-bold text-leaf" to={`/app/sales/${sale.id}`}>รายละเอียด</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sales.data?.length === 0 ? <Card><p className="font-semibold">ยังไม่มีประวัติการขาย ลองขายสินค้าจากหน้า POS ก่อน</p></Card> : null}
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
          <Link to="/app/sales" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-ink"><ArrowLeft size={16} /> กลับประวัติการขาย</Link>
          <h1 className="mt-2 text-3xl font-black">ใบขาย {sale.data.receiptNo}</h1>
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
