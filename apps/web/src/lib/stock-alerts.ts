export type StockAlertRow = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  minStock: number;
  status: "OK" | "LOW" | "OUT";
};

export type StockAlertStatus = StockAlertRow["status"];

const statusOrder: Record<StockAlertStatus, number> = {
  OUT: 0,
  LOW: 1,
  OK: 2
};

function numberOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function getStockAlertStatus(row: StockAlertRow): StockAlertStatus {
  const quantity = numberOrZero(row.quantity);
  const minStock = numberOrZero(row.minStock);

  if (quantity <= 0) return "OUT";
  if (quantity <= minStock) return "LOW";
  return "OK";
}

export function getStockAlertSummary(rows: StockAlertRow[]) {
  const alerts = rows
    .map((row) => ({ ...row, status: getStockAlertStatus(row) }))
    .filter((row) => row.status !== "OK")
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return {
    alerts,
    lowCount: alerts.filter((row) => row.status === "LOW").length,
    outCount: alerts.filter((row) => row.status === "OUT").length,
    total: alerts.length
  };
}

export function getStockAlertPreview(rows: StockAlertRow[], limit = 3) {
  const summary = getStockAlertSummary(rows);

  return {
    alerts: summary.alerts.slice(0, limit),
    lowCount: summary.lowCount,
    outCount: summary.outCount,
    total: summary.total
  };
}

export function getStockAlertHref(row: StockAlertRow) {
  if (!row.productId) return undefined;
  return `/app/products/${row.productId}`;
}

export function getRestockHref(row: StockAlertRow) {
  if (!row.productId) return undefined;
  return `/app/inventory/receipts?productId=${encodeURIComponent(row.productId)}`;
}
