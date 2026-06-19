export type TransferStatus = "REQUESTED" | "SOURCE_APPROVED" | "IN_TRANSIT" | "RECEIVED" | "SOURCE_REJECTED" | "CANCELED";

export type TransferDraftRow = {
  id: string;
  productId: string;
  quantity: number;
};

export type TransferProductOption = {
  id: string;
  name: string;
  sku: string;
  variantColor?: string | null;
  variantSize?: string | null;
  imagePath?: string | null;
  unit?: string;
  balances?: Array<{ warehouseId?: string; quantity: number }>;
};

export type TransferPayload = {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  note?: string;
  items: Array<{ productId: string; quantity: number }>;
};

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, { label: string; className: string }> = {
  REQUESTED: { label: "รอต้นทางอนุมัติ", className: "bg-sky-50 text-sky-800 ring-1 ring-sky-100" },
  SOURCE_APPROVED: { label: "ต้นทางอนุมัติ", className: "bg-amber-50 text-amber-800 ring-1 ring-amber-100" },
  IN_TRANSIT: { label: "ระหว่างทาง", className: "bg-amber-50 text-amber-800 ring-1 ring-amber-100" },
  RECEIVED: { label: "รับเข้าแล้ว", className: "bg-teal-50 text-teal-700 ring-1 ring-teal-100" },
  SOURCE_REJECTED: { label: "ต้นทางปฏิเสธ", className: "bg-red-50 text-red-700 ring-1 ring-red-100" },
  CANCELED: { label: "ยกเลิกแล้ว", className: "bg-stone-100 text-stone-600 ring-1 ring-stone-200" }
};

export function stockAtWarehouse(product: TransferProductOption | undefined, warehouseId: string) {
  if (!product || !warehouseId) return 0;
  return (product.balances ?? [])
    .filter((balance) => balance.warehouseId === warehouseId)
    .reduce((sum, balance) => sum + Number(balance.quantity || 0), 0);
}

export function getTransferFormIssue(input: {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  rows: TransferDraftRow[];
  products: TransferProductOption[];
}) {
  if (!input.sourceWarehouseId || !input.destinationWarehouseId) return "กรุณาเลือกคลังต้นทางและปลายทาง";
  if (input.sourceWarehouseId === input.destinationWarehouseId) return "ต้นทางและปลายทางต้องเป็นคนละคลัง";
  const productMap = new Map(input.products.map((product) => [product.id, product]));
  const selectedRows = input.rows.filter((row) => row.productId);
  if (selectedRows.length === 0) return "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ";
  for (const row of selectedRows) {
    if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1) return "จำนวนโอนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป";
    const stock = stockAtWarehouse(productMap.get(row.productId), input.sourceWarehouseId);
    if (Number(row.quantity) > stock) return "จำนวนโอนมากกว่าสต็อกต้นทาง";
  }
  return undefined;
}

export function buildTransferPayload(input: {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  note?: string;
  rows: TransferDraftRow[];
}): TransferPayload {
  return {
    sourceWarehouseId: input.sourceWarehouseId,
    destinationWarehouseId: input.destinationWarehouseId,
    note: input.note?.trim() || undefined,
    items: input.rows
      .filter((row) => row.productId)
      .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) }))
  };
}

export function initialTransferRows(productId?: string | null): TransferDraftRow[] {
  return [{ id: crypto.randomUUID(), productId: productId ?? "", quantity: 1 }];
}
