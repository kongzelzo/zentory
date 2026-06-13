export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  salePrice: string;
  balances: Array<{ quantity: number }>;
};

export type CartLine<TProduct extends PosProduct = PosProduct> = TProduct & { quantity: number };

export function stockOf(product: PosProduct) {
  return product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
}

export function findExactScannedProduct<TProduct extends PosProduct>(products: TProduct[], value: string) {
  const query = value.trim().toLowerCase();
  if (!query) return undefined;
  return products.find((product) => product.sku.toLowerCase() === query || product.barcode?.toLowerCase() === query);
}

export function canAddToCart(product: PosProduct, currentQuantity: number): { ok: true } | { ok: false; reason: "out-of-stock" | "stock-limit" } {
  const available = stockOf(product);
  if (available <= 0) return { ok: false, reason: "out-of-stock" };
  if (currentQuantity >= available) return { ok: false, reason: "stock-limit" };
  return { ok: true };
}

export function getCartLineStockState(product: PosProduct, quantity: number) {
  const available = stockOf(product);
  if (quantity > available) return "over";
  if (quantity === available) return "maxed";
  return "available";
}

export function sanitizeCartQuantity(value: string | number, availableStock: number) {
  const quantity = value === "" ? 0 : Math.trunc(Number(value));
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(quantity, Math.max(0, availableStock)));
}

export function getSaleTotals(cart: Array<CartLine>, discountValue: number) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.salePrice) * item.quantity, 0);
  const discount = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

export function getCheckoutIssue(cart: Array<CartLine>) {
  if (cart.length === 0) return "empty-cart";
  if (cart.some((item) => item.quantity < 1 || item.quantity > stockOf(item))) return "stock-exceeded";
  return undefined;
}
