import { getPreferredWarehouseId } from "./warehouses";
import type { WarehouseForSelection } from "./warehouses";

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  salePrice: string;
  balances: Array<{ warehouseId?: string; quantity: number }>;
};

export type CartLine<TProduct extends PosProduct = PosProduct> = TProduct & { quantity: number };
export type DiscountMode = "PERCENT" | "AMOUNT";

export { getPreferredWarehouseId };
export type PosWarehouse = WarehouseForSelection;

export function stockOf(product: PosProduct, warehouseId?: string) {
  const hasWarehouseBalances = product.balances.some((balance) => balance.warehouseId);
  return product.balances.reduce((sum, balance) => {
    if (warehouseId && hasWarehouseBalances && balance.warehouseId !== warehouseId) return sum;
    return sum + balance.quantity;
  }, 0);
}

export function findExactScannedProduct<TProduct extends PosProduct>(products: TProduct[], value: string) {
  const query = value.trim().toLowerCase();
  if (!query) return undefined;
  return products.find((product) => product.sku.toLowerCase() === query || product.barcode?.toLowerCase() === query);
}

function searchableFields(product: PosProduct) {
  const variantProduct = product as PosProduct & { variantColor?: string | null; variantSize?: string | null };
  return [product.name, product.sku, product.barcode, variantProduct.variantColor, variantProduct.variantSize].filter(Boolean).map((field) => String(field).toLowerCase());
}

function searchRank(product: PosProduct, query: string) {
  if (!query) return 0;
  const fields = searchableFields(product);
  if (product.sku.toLowerCase() === query || product.barcode?.toLowerCase() === query) return 0;
  if (fields.some((field) => field === query)) return 1;
  if (fields.some((field) => field.startsWith(query))) return 2;
  if (fields.some((field) => field.includes(query))) return 3;
  return 4;
}

export function sortPosProductsForSale<TProduct extends PosProduct>(products: TProduct[], warehouseId?: string, searchValue = "") {
  const query = searchValue.trim().toLowerCase();
  return [...products].sort((left, right) => {
    if (query) {
      const rank = searchRank(left, query) - searchRank(right, query);
      if (rank) return rank;
    }
    const leftStock = stockOf(left, warehouseId);
    const rightStock = stockOf(right, warehouseId);
    const availability = Number(rightStock > 0) - Number(leftStock > 0);
    if (availability) return availability;
    return left.name.localeCompare(right.name, "th") || left.sku.localeCompare(right.sku, "th");
  });
}

export function canAddToCart(product: PosProduct, currentQuantity: number, warehouseId?: string): { ok: true } | { ok: false; reason: "out-of-stock" | "stock-limit" } {
  const available = stockOf(product, warehouseId);
  if (available <= 0) return { ok: false, reason: "out-of-stock" };
  if (currentQuantity >= available) return { ok: false, reason: "stock-limit" };
  return { ok: true };
}

export function getCartLineStockState(product: PosProduct, quantity: number, warehouseId?: string) {
  const available = stockOf(product, warehouseId);
  if (quantity > available) return "over";
  if (quantity === available) return "maxed";
  return "available";
}

export function sanitizeCartQuantity(value: string | number, availableStock: number) {
  const quantity = value === "" ? 0 : Math.trunc(Number(value));
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(quantity, Math.max(0, availableStock)));
}

export function getDiscountAmount(subtotal: number, discountValue: number, discountMode: DiscountMode = "AMOUNT") {
  const value = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
  if (discountMode === "PERCENT") return subtotal * Math.min(value, 100) / 100;
  return value;
}

export function getSaleTotals(cart: Array<CartLine>, discountValue: number, discountMode: DiscountMode = "AMOUNT") {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.salePrice) * item.quantity, 0);
  const discount = getDiscountAmount(subtotal, discountValue, discountMode);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

export function getCheckoutIssue(cart: Array<CartLine>, warehouseId?: string) {
  if (cart.length === 0) return "empty-cart";
  if (cart.some((item) => item.quantity < 1 || item.quantity > stockOf(item, warehouseId))) return "stock-exceeded";
  return undefined;
}

export function buildSalePayload(cart: Array<CartLine>, branchId: string, warehouseId: string, discount: number, paymentMethod: string) {
  return {
    branchId: branchId || undefined,
    warehouseId: warehouseId || undefined,
    discount,
    paymentMethod,
    items: cart.map((item) => ({ productId: item.id, quantity: item.quantity }))
  };
}
