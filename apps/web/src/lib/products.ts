export type ProductStatus = "ACTIVE" | "PAUSED" | "DISCONTINUED" | "ARCHIVED";

export type ProductBalance = {
  warehouseId?: string;
  quantity: number;
  branch?: { name: string } | null;
  warehouse?: { id?: string; name: string; branch?: { name: string } | null } | null;
};

export type ProductForSummary = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  variantColor?: string | null;
  variantSize?: string | null;
  productGroup?: { id: string; name: string; skuPrefix?: string } | null;
  imagePath?: string | null;
  unit: string;
  costPrice: string | number;
  salePrice: string | number;
  minStock: number;
  status: ProductStatus;
  category?: { name: string };
  brand?: { name: string };
  balances: ProductBalance[];
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProductBadgeTone = "success" | "warning" | "danger" | "neutral" | "muted";
export type StockState = "OK" | "LOW" | "OUT";

export type ProductBadge = {
  label: string;
  tone: ProductBadgeTone;
  className: string;
};

export type ProductProfitMetrics = {
  costPrice?: number;
  salePrice?: number;
  profit?: number;
  marginPercent?: number;
};

export type ProductStockAlert = {
  title: string;
  description: string;
  tone: "warning" | "danger";
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, ProductBadge> = {
  ACTIVE: { label: "เปิดขาย", tone: "success", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  PAUSED: { label: "หยุดขายชั่วคราว", tone: "warning", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  DISCONTINUED: { label: "ปิดขายถาวร", tone: "neutral", className: "bg-stone-100 text-stone-700 ring-1 ring-stone-200" },
  ARCHIVED: { label: "เก็บประวัติ", tone: "muted", className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" }
};

export function stockOf(product: Pick<ProductForSummary, "balances">) {
  return product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
}

export function balanceMatchesWarehouse(balance: ProductBalance, warehouseId: string) {
  return balance.warehouseId === warehouseId || balance.warehouse?.id === warehouseId;
}

export function stockInWarehouse(product: Pick<ProductForSummary, "balances">, warehouseId: string) {
  return product.balances
    .filter((balance) => balanceMatchesWarehouse(balance, warehouseId))
    .reduce((sum, balance) => sum + balance.quantity, 0);
}

export function getBalanceWarehouseName(balance: ProductBalance) {
  return balance.warehouse?.name?.trim() || balance.branch?.name?.trim() || "คลังหลัก";
}

export function getProductStockLocationSummary(product: Pick<ProductForSummary, "balances" | "unit">, maxLocations = 2) {
  const stockedBalances = product.balances.filter((balance) => balance.quantity > 0);
  if (stockedBalances.length === 0) return "ยังไม่มีในคลัง";

  const visibleBalances = stockedBalances.slice(0, maxLocations);
  const summary = visibleBalances
    .map((balance) => `${getBalanceWarehouseName(balance)} ${balance.quantity.toLocaleString("th-TH")} ${product.unit}`)
    .join(", ");
  const hiddenCount = stockedBalances.length - visibleBalances.length;
  return hiddenCount > 0 ? `${summary} + อีก ${hiddenCount.toLocaleString("th-TH")} คลัง` : summary;
}

export function getProductDisplayName(product: Pick<ProductForSummary, "name" | "variantColor" | "variantSize">) {
  const options = [product.variantColor, product.variantSize].map((value) => value?.trim()).filter(Boolean);
  return options.length > 0 ? `${product.name} / ${options.join(" / ")}` : product.name;
}

export function countsTowardProductLimit(product: ProductForSummary) {
  return product.status === "ACTIVE" || product.status === "PAUSED" || (product.status === "DISCONTINUED" && stockOf(product) > 0);
}

export function getStockState(product: Pick<ProductForSummary, "balances" | "minStock">): StockState {
  const stock = stockOf(product);
  if (stock <= 0) return "OUT";
  if (stock <= product.minStock) return "LOW";
  return "OK";
}

export function getStockBadge(product: Pick<ProductForSummary, "balances" | "minStock">): ProductBadge {
  const stockState = getStockState(product);
  if (stockState === "OUT") return { label: "หมดสต็อก", tone: "danger", className: "bg-red-50 text-red-700 ring-1 ring-red-100" };
  if (stockState === "LOW") return { label: "ใกล้หมด", tone: "warning", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" };
  return { label: "ปกติ", tone: "success", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
}

export function getProductStockAlert(product: Pick<ProductForSummary, "balances" | "minStock" | "unit">): ProductStockAlert | undefined {
  const stock = stockOf(product);
  if (stock <= 0) {
    return {
      title: "สินค้าหมดสต็อก",
      description: `สินค้านี้เหลือ 0 ${product.unit} ต่ำกว่าจุดแจ้งเตือน ${product.minStock} ${product.unit}`,
      tone: "danger"
    };
  }
  if (stock <= product.minStock) {
    return {
      title: "สินค้าใกล้หมด",
      description: `สินค้านี้เหลือต่ำกว่าหรือเท่ากับจุดแจ้งเตือน ${product.minStock} ${product.unit}`,
      tone: "warning"
    };
  }
  return undefined;
}

export function getProductProfitMetrics(product: Pick<ProductForSummary, "costPrice" | "salePrice">): ProductProfitMetrics {
  const costPrice = Number(product.costPrice);
  const salePrice = Number(product.salePrice);
  const hasCostPrice = Number.isFinite(costPrice);
  const hasSalePrice = Number.isFinite(salePrice);
  const profit = hasCostPrice && hasSalePrice ? salePrice - costPrice : undefined;
  const marginPercent = profit !== undefined && salePrice > 0 ? (profit / salePrice) * 100 : undefined;

  return {
    costPrice: hasCostPrice ? costPrice : undefined,
    salePrice: hasSalePrice ? salePrice : undefined,
    profit,
    marginPercent
  };
}

export function getProductSummary(products: ProductForSummary[]) {
  const managedProducts = products.filter((product) => product.status !== "ARCHIVED");
  return {
    totalManaged: managedProducts.length,
    active: products.filter((product) => product.status === "ACTIVE").length,
    lowStock: managedProducts.filter((product) => {
      const stock = stockOf(product);
      return stock > 0 && stock <= product.minStock;
    }).length,
    outOfStock: managedProducts.filter((product) => stockOf(product) <= 0).length,
    stockValue: managedProducts.reduce((sum, product) => sum + stockOf(product) * Number(product.costPrice), 0)
  };
}

export function matchesProductSearch(product: ProductForSummary, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [product.name, product.variantColor, product.variantSize, product.sku, product.barcode, product.category?.name, product.brand?.name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function getProductReceiptHref(productId: string) {
  return `/app/inventory/receipts?productId=${encodeURIComponent(productId)}`;
}

export function getProductImageUrl(product: Pick<ProductForSummary, "imagePath">) {
  if (!product.imagePath) return undefined;
  if (/^(https?:|blob:|data:)/i.test(product.imagePath)) return product.imagePath;
  return `${new URL(apiBaseUrl).origin}${product.imagePath}`;
}

export function validateProductImageFile(file?: File | null) {
  if (!file) return undefined;
  if (!PRODUCT_IMAGE_TYPES.has(file.type)) return "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP";
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return "ขนาดรูปสินค้าต้องไม่เกิน 5MB";
  return undefined;
}
