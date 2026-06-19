export type BranchRecord = {
  id: string;
  branchId?: string;
  name: string;
  code: string;
  type: BranchType;
  status: BranchStatus;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  note?: string | null;
  isDefault?: boolean;
  branch?: {
    id: string;
    name: string;
    code: string;
    status: BranchStatus;
  };
};

export type BranchType = "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH_WAREHOUSE" | "SECONDARY_WAREHOUSE";
export type BranchStatus = "ACTIVE" | "INACTIVE";

export type BranchProductRecord = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  costPrice: string | number;
  minStock: number;
};

export type BranchBalanceRecord = {
  warehouseId?: string;
  quantity: number;
  product: BranchProductRecord;
};

export type BranchStatusFilter = "all" | "active" | "inactive" | "hasLowStock" | "hasOutOfStock";

export type BranchSummary = BranchRecord & {
  typeLabel: string;
  statusLabel: "เปิดใช้งาน" | "ปิดใช้งาน";
  productCount: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export function branchCode(branch: BranchRecord) {
  return branch.code;
}

export function branchTypeLabel(branch: BranchRecord) {
  const labels: Record<BranchType, string> = {
    MAIN_WAREHOUSE: "คลังหลัก",
    STORE_FRONT: "หน้าร้าน",
    BRANCH_WAREHOUSE: "คลังประจำสาขา",
    SECONDARY_WAREHOUSE: "คลังสำรอง"
  };
  return labels[branch.type] ?? "สาขา/คลัง";
}

export function branchStatusLabel(branch: BranchRecord) {
  return branch.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน";
}

export function buildBranchSummaries(branches: BranchRecord[], balances: BranchBalanceRecord[]): BranchSummary[] {
  return branches.map((branch) => {
    const branchBalances = balances.filter((balance) => balance.warehouseId === branch.id);
    return {
      ...branch,
      code: branchCode(branch),
      typeLabel: branchTypeLabel(branch),
      statusLabel: branchStatusLabel(branch),
      productCount: branchBalances.length,
      stockValue: branchBalances.reduce((sum, balance) => sum + balance.quantity * Number(balance.product.costPrice ?? 0), 0),
      lowStockCount: branchBalances.filter((balance) => balance.quantity > 0 && balance.quantity <= balance.product.minStock).length,
      outOfStockCount: branchBalances.filter((balance) => balance.quantity <= 0).length
    };
  });
}

export function buildBranchTotals(summaries: BranchSummary[]) {
  return {
    totalBranches: summaries.length,
    activeBranches: summaries.filter((branch) => branch.status === "ACTIVE").length,
    lowStockProducts: summaries.reduce((sum, branch) => sum + branch.lowStockCount, 0),
    outOfStockProducts: summaries.reduce((sum, branch) => sum + branch.outOfStockCount, 0),
    stockValue: summaries.reduce((sum, branch) => sum + branch.stockValue, 0)
  };
}

export function filterBranchSummaries(summaries: BranchSummary[], filters: { search: string; status: BranchStatusFilter }) {
  const search = filters.search.trim().toLowerCase();
  return summaries.filter((branch) => {
    const matchesSearch = !search || [branch.name, branch.code, branch.typeLabel].some((value) => value.toLowerCase().includes(search));
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "active" && branch.status === "ACTIVE") ||
      (filters.status === "inactive" && branch.status === "INACTIVE") ||
      (filters.status === "hasLowStock" && branch.lowStockCount > 0) ||
      (filters.status === "hasOutOfStock" && branch.outOfStockCount > 0);
    return matchesSearch && matchesStatus;
  });
}

export function stockStatusOf(balance: BranchBalanceRecord) {
  if (balance.quantity <= 0) return "หมดสต็อก";
  if (balance.quantity <= balance.product.minStock) return "ใกล้หมด";
  return "ปกติ";
}
