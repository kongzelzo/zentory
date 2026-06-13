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
