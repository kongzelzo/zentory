import { matchesProductSearch, type ProductForSummary } from "./products";

export type StockSearchWarehouse = {
  id?: string;
  name: string;
  branch?: {
    id?: string;
    name: string;
  } | null;
};

export type StockSearchBalance = {
  id?: string;
  warehouseId?: string;
  quantity: number;
  warehouse?: StockSearchWarehouse | null;
};

export type StockSearchProduct = Omit<ProductForSummary, "balances"> & {
  description?: string | null;
  balances: StockSearchBalance[];
};

export function totalStock(product: Pick<StockSearchProduct, "balances">) {
  return product.balances.reduce((sum, balance) => sum + Number(balance.quantity || 0), 0);
}

export function stockedLocations(product: Pick<StockSearchProduct, "balances">) {
  return product.balances
    .filter((balance) => Number(balance.quantity || 0) > 0)
    .sort((left, right) => Number(right.quantity || 0) - Number(left.quantity || 0));
}

export function allLocations(product: Pick<StockSearchProduct, "balances">) {
  return product.balances.slice().sort((left, right) => Number(right.quantity || 0) - Number(left.quantity || 0));
}

export function buildTransferHref(productId: string, sourceWarehouseId?: string, destinationWarehouseId?: string) {
  const params = new URLSearchParams({ productId });
  if (sourceWarehouseId) params.set("sourceWarehouseId", sourceWarehouseId);
  if (destinationWarehouseId) params.set("destinationWarehouseId", destinationWarehouseId);
  return `/app/transfers?${params.toString()}`;
}

export function matchesStockSearchQuery(product: StockSearchProduct, query: string) {
  return matchesProductSearch(product, query);
}
