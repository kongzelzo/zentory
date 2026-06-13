import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, PackageX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { number } from "../lib/format";
import { getRestockHref, getStockAlertHref, getStockAlertSummary, type StockAlertRow, type StockAlertStatus } from "../lib/stock-alerts";

type AlertFilter = "ALL" | "OUT" | "LOW";

const filters: Array<{ label: string; value: AlertFilter }> = [
  { label: "ทั้งหมด", value: "ALL" },
  { label: "หมดสต็อก", value: "OUT" },
  { label: "ใกล้หมด", value: "LOW" }
];

export function AlertsPage() {
  const [filter, setFilter] = useState<AlertFilter>("ALL");
  const stock = useQuery({ queryKey: ["stock-report"], queryFn: () => api<StockAlertRow[]>("/reports/stock") });
  const summary = getStockAlertSummary(stock.data ?? []);
  const alerts = filter === "ALL" ? summary.alerts : summary.alerts.filter((row) => row.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">แจ้งเตือนสินค้า</h1>
          <p className="text-stone-600">สินค้าหมดสต็อกและใกล้หมด</p>
        </div>
        {summary.total > 0 ? <span className="rounded bg-teal-50 px-3 py-2 text-sm font-black text-leaf">{number(summary.total)} รายการ</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="หมดสต็อก" value={summary.outCount} tone="OUT" />
        <SummaryCard label="ใกล้หมด" value={summary.lowCount} tone="LOW" />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button key={item.value} type="button" variant={filter === item.value ? "primary" : "secondary"} onClick={() => setFilter(item.value)}>
            {item.label}
          </Button>
        ))}
      </div>

      {stock.isLoading ? <Card>กำลังโหลดแจ้งเตือน...</Card> : null}

      {!stock.isLoading && alerts.length === 0 ? (
        <Card>
          <p className="font-semibold">ยังไม่มีสินค้าใกล้หมดหรือหมดสต็อก</p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {alerts.map((row) => (
          <AlertCard key={row.productId || `${row.sku}-${row.name}`} row={row} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: Exclude<StockAlertStatus, "OK"> }) {
  return (
    <Card className={tone === "OUT" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}>
      <p className={`text-sm font-black ${tone === "OUT" ? "text-red-700" : "text-amber-700"}`}>{label}</p>
      <p className="mt-2 text-3xl font-black text-ink">{number(value)}</p>
    </Card>
  );
}

function AlertCard({ row }: { row: StockAlertRow }) {
  const isOut = row.status === "OUT";
  const Icon = isOut ? PackageX : AlertTriangle;
  const productHref = getStockAlertHref(row);
  const restockHref = getRestockHref(row);

  return (
    <Card className={isOut ? "border-red-200" : "border-amber-200"}>
      <div className="flex items-start gap-3">
        <Icon className={isOut ? "text-red-700" : "text-amber-700"} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black">{row.name}</h2>
          <p className="text-stone-600">{row.sku}</p>
          <p className="mt-3 text-sm">คงเหลือ {number(row.quantity)} / จุดแจ้งเตือน {number(row.minStock)}</p>
          <p className={`mt-2 text-sm font-bold ${isOut ? "text-red-700" : "text-amber-700"}`}>{isOut ? "หมดสต็อก" : "ใกล้หมด"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {productHref ? (
              <Link to={productHref}>
                <Button variant="secondary">ดูสินค้า</Button>
              </Link>
            ) : null}
            {restockHref ? (
              <Link to={restockHref}>
                <Button>เติมสต็อก</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
