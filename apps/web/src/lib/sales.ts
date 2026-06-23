export type SaleForReceipt = {
  id: string;
  receiptNo: string;
  total: string;
  subtotal?: string;
  discount?: string;
  paymentMethod?: string;
  createdAt: string;
  items: Array<{ quantity: number; unitPrice?: string; total: string; product: { name: string; sku?: string } }>;
};

export type SalesDateFilter = "all" | "today" | "7d" | "30d";

export type SalesQueryInput = {
  page?: number;
  limit?: number;
  search?: string;
  dateFilter?: SalesDateFilter;
  branchId?: string;
  warehouseId?: string;
  allTime?: boolean;
};

function money(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getReceiptSummary(sale: SaleForReceipt) {
  const fallbackSubtotal = sale.items.reduce((sum, item) => sum + Number(item.total), 0);
  const subtotal = money(sale.subtotal) ?? fallbackSubtotal;
  const discount = money(sale.discount) ?? Math.max(0, subtotal - Number(sale.total));
  return {
    subtotal,
    discount,
    total: Number(sale.total),
    itemCount: sale.items.length,
    unitCount: sale.items.reduce((sum, item) => sum + item.quantity, 0)
  };
}

export function getPaymentMethodLabel(method?: string) {
  if (method === "TRANSFER") return "โอนเงิน";
  return "เงินสด";
}

export function getSalesDateRange(filter: SalesDateFilter = "all", now = new Date()) {
  if (filter === "all") return {};
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start =
    filter === "today" ? today :
    filter === "7d" ? new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000) :
    new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function buildSalesQuery(input: SalesQueryInput) {
  const params = new URLSearchParams();
  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 20));
  const search = input.search?.trim();
  if (search) params.set("q", search);
  const range = getSalesDateRange(input.dateFilter ?? "all");
  if (range.dateFrom) params.set("dateFrom", range.dateFrom);
  if (range.dateTo) params.set("dateTo", range.dateTo);
  if (input.allTime) params.set("allTime", "1");
  if (input.branchId) params.set("branchId", input.branchId);
  if (input.warehouseId) params.set("warehouseId", input.warehouseId);
  return params.toString();
}
