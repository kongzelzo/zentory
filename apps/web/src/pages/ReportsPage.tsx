import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";

type StockRow = { productId: string; sku: string; name: string; quantity: number; minStock: number; stockValue: number; status: "OK" | "LOW" | "OUT" };
type SaleGroup = { createdAt: string; _sum: { total: string } };

export function StockReportPage() {
  const query = useQuery({ queryKey: ["stock-report"], queryFn: () => api<StockRow[]>("/reports/stock") });
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">รายงานสินค้าคงเหลือ</h1>
      <div className="table-shell">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr><th className="p-3">สินค้า</th><th className="p-3">SKU</th><th className="p-3">คงเหลือ</th><th className="p-3">จุดแจ้งเตือน</th><th className="p-3">มูลค่า</th><th className="p-3">สถานะ</th></tr>
          </thead>
          <tbody>
            {query.data?.map((row) => (
              <tr key={row.productId} className="border-t border-stone-100">
                <td className="p-3 font-semibold">{row.name}</td>
                <td className="p-3">{row.sku}</td>
                <td className="p-3">{number(row.quantity)}</td>
                <td className="p-3">{number(row.minStock)}</td>
                <td className="p-3">{baht(row.stockValue)}</td>
                <td className="p-3"><span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold">{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesReportPage() {
  const query = useQuery({ queryKey: ["sales-report"], queryFn: () => api<SaleGroup[]>("/reports/sales") });
  useEffect(() => {
    post("/onboarding/report-viewed", {}).catch(() => undefined);
  }, []);
  const data = (query.data ?? []).map((row) => ({ date: thaiDate(row.createdAt), total: Number(row._sum.total ?? 0) })).reverse();
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">รายงานยอดขาย</h1>
      <Card>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="date" hide />
              <YAxis />
              <Tooltip formatter={(value) => baht(Number(value))} />
              <Bar dataKey="total" fill="#d97706" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
