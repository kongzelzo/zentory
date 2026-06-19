import { normalizePermissionOverrides, resolveEffectivePermissions, type AuthSession, type PermissionOverrides, type Role } from "@zentory/shared";
import { calculateSalesTargetPreview, type SalesTargetMode } from "./dashboard";
import { matchesProductSearch } from "./products";

type DemoProduct = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  imagePath?: string | null;
  unit: string;
  costPrice: string;
  salePrice: string;
  minStock: number;
  status: ProductStatus;
  category?: { name: string };
  brand?: { name: string };
  balances: Array<{ warehouseId?: string; quantity: number }>;
};

type ProductStatus = "ACTIVE" | "PAUSED" | "DISCONTINUED" | "ARCHIVED";

type DemoSale = {
  id: string;
  receiptNo: string;
  total: string;
  subtotal?: string;
  discount?: string;
  paymentMethod?: string;
  createdAt: string;
  items: Array<{ product: DemoProduct; quantity: number; unitPrice?: string; unitCost?: string; total: string }>;
};

type DemoTransfer = {
  id: string;
  documentNo: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  status: "REQUESTED" | "SOURCE_APPROVED" | "IN_TRANSIT" | "RECEIVED" | "SOURCE_REJECTED" | "CANCELED";
  note?: string | null;
  createdAt: string;
  sourceApprovedAt?: string | null;
  sourceRejectedAt?: string | null;
  destinationConfirmedAt?: string | null;
  receivedAt?: string | null;
  canceledAt?: string | null;
  createdBy?: { id?: string; name: string } | null;
  requestedBy?: { id?: string; name: string } | null;
  sourceApprovedBy?: { id?: string; name: string } | null;
  sourceRejectedBy?: { id?: string; name: string } | null;
  destinationConfirmedBy?: { id?: string; name: string } | null;
  receivedBy?: { id?: string; name: string } | null;
  canceledBy?: { id?: string; name: string } | null;
  items: Array<{ id: string; productId: string; quantity: number; unitCost: string }>;
};

type DemoStockCount = {
  id: string;
  documentNo: string;
  warehouseId: string;
  status: "COUNTING" | "REVIEW" | "APPLIED" | "CANCELED";
  note?: string | null;
  startedAt: string;
  completedAt?: string | null;
  appliedAt?: string | null;
  user?: { name: string };
  items: Array<{ id: string; productId: string; systemQuantity: number; countedQuantity: number | null; difference: number | null; note?: string | null }>;
};

type DemoMember = {
  id: string;
  employeeName?: string | null;
  employeePhone?: string | null;
  preferredRole?: string | null;
  preferredBranch?: string | null;
  requestedBranchId?: string | null;
  availableStartDate?: string | null;
  applicationNote?: string | null;
  role: Role;
  status: string;
  permissionOverrides?: PermissionOverrides;
  assignedBranchIds?: string[];
  user?: { id: string; name: string; email: string };
  createdAt?: string;
};

type DemoBranch = {
  id: string;
  name: string;
  code?: string;
  type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH_WAREHOUSE" | "SECONDARY_WAREHOUSE";
  status?: "ACTIVE" | "INACTIVE";
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  note?: string | null;
  isDefault: boolean;
  createdAt: string;
};

type DemoCategory = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

type DemoState = {
  session?: AuthSession;
  business?: { id: string; name: string; province?: string; businessType?: string; branchCount?: string; onboardingCompleted?: boolean; onboardingProgress?: Record<string, boolean>; salesTargetMode?: SalesTargetMode; annualSalesTarget?: number | null; dailySalesTarget?: number | null; monthlySalesTarget?: number | null };
  branches: DemoBranch[];
  categories: DemoCategory[];
  products: DemoProduct[];
  sales: DemoSale[];
  transfers: DemoTransfer[];
  stockCounts: DemoStockCount[];
  movements: Array<{ id: string; type: string; quantity: number; balanceBefore?: number; balanceAfter?: number; reason?: string; adjustmentMode?: "SET_ACTUAL" | "INCREASE" | "DECREASE"; targetQuantity?: number; reference?: string; createdAt: string; product: { name: string }; user?: { name: string }; warehouse?: { id?: string; name: string; branch?: { name: string } }; branch?: { name: string } }>;
  members: DemoMember[];
};

const key = "zentory.local-demo.v1";
const storeBranchId = "local_store_branch_main";
const defaultWarehouseId = "local_branch_main";
const managementStatuses: ProductStatus[] = ["ACTIVE", "PAUSED", "DISCONTINUED"];

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function withDemoAccountMetadata(user: AuthSession["user"]): AuthSession["user"] {
  const now = new Date().toISOString();
  return {
    ...user,
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
    authProviders: user.authProviders ?? { password: true, google: false }
  };
}

function initialState(): DemoState {
  return {
    business: undefined,
    branches: [],
    categories: [],
    products: [],
    sales: [],
    transfers: [],
    stockCounts: [],
    movements: [],
    members: []
  };
}

function load() {
  const raw = localStorage.getItem(key);
  if (!raw) return initialState();
  try {
    return { ...initialState(), ...JSON.parse(raw) } as DemoState;
  } catch {
    return initialState();
  }
}

function save(state: DemoState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function activeProducts(state: DemoState) {
  return state.products.filter((product) => product.status === "ACTIVE");
}

function serializeMember(state: DemoState, member: DemoMember) {
  const permissionOverrides = normalizePermissionOverrides(member.permissionOverrides);
  const assignedBranches = member.role === "OWNER"
    ? state.branches.filter((branch) => (branch.status ?? "ACTIVE") === "ACTIVE")
    : state.branches.filter((branch) => member.assignedBranchIds?.includes(branch.id));
  return {
    ...member,
    assignedBranches,
    permissionOverrides,
    effectivePermissions: resolveEffectivePermissions(member.role, permissionOverrides)
  };
}

function normalizeMemberBranchText(value?: string | null) {
  return value?.trim().toLocaleLowerCase("th-TH") || "";
}

function accessibleBranchIds(state: DemoState) {
  const business = state.session?.business;
  if (!business || business.role === "OWNER" || state.session?.user.isSystemAdmin) return undefined;
  return business.assignedBranchIds ?? [];
}

function canManageProductMasterInDemo(state: DemoState) {
  return Boolean(state.session?.user.isSystemAdmin || state.session?.business?.role === "OWNER");
}

function memberBranchTokens(state: DemoState, branchIds: string[]) {
  return new Set(
    state.branches
      .filter((branch) => branchIds.includes(branch.id) && (branch.status ?? "ACTIVE") === "ACTIVE")
      .flatMap((branch) => [branch.id, branch.name, branch.code].map((value) => normalizeMemberBranchText(value)).filter(Boolean))
  );
}

function canAccessMemberInDemo(state: DemoState, member: DemoMember) {
  if (member.role === "OWNER") return true;
  const branchIds = accessibleBranchIds(state);
  if (!branchIds) return true;
  if (branchIds.length === 0) return false;
  if (member.status === "PENDING") {
    if (member.requestedBranchId && branchIds.includes(member.requestedBranchId)) return true;
    const preferredBranch = normalizeMemberBranchText(member.preferredBranch);
    return Boolean(preferredBranch && memberBranchTokens(state, branchIds).has(preferredBranch));
  }
  return (member.assignedBranchIds ?? []).some((branchId) => branchIds.includes(branchId));
}

function memberMatchesBranchInDemo(state: DemoState, member: DemoMember, branchId?: string | null) {
  if (!branchId) return true;
  if (member.role === "OWNER") return false;
  const branch = state.branches.find((item) => item.id === branchId);
  if (!branch) return false;
  if (member.status === "PENDING") {
    if (member.requestedBranchId === branch.id) return true;
    const preferredBranch = normalizeMemberBranchText(member.preferredBranch);
    return Boolean(preferredBranch && memberBranchTokens(state, [branch.id]).has(preferredBranch));
  }
  return (member.assignedBranchIds ?? []).includes(branch.id);
}

function assertCanAccessMemberInDemo(state: DemoState, member: DemoMember) {
  if (!canAccessMemberInDemo(state, member)) throw new Error("Branch is not assigned to this user");
}

function assertCanAssignMemberBranchesInDemo(state: DemoState, branchIds: string[]) {
  const accessibleIds = accessibleBranchIds(state);
  if (!accessibleIds) return;
  if (branchIds.some((branchId) => !accessibleIds.includes(branchId))) throw new Error("Branch is not assigned to this user");
}

function assertBranchAccess(state: DemoState, branchId: string) {
  const branch = state.branches.find((item) => item.id === branchId && (item.status ?? "ACTIVE") === "ACTIVE");
  if (!branch) throw new Error("Branch not found");
  const accessibleIds = accessibleBranchIds(state);
  if (accessibleIds && !accessibleIds.includes(branchId)) throw new Error("Branch is not assigned to this user");
}

function resolveDemoMembershipTarget(state: DemoState, uid: string, branchId?: string | null) {
  const input = normalizeText(uid);
  const requestedBranchId = normalizeText(branchId);
  if (!input) throw new Error("กรุณากรอก UID ร้านหรือสาขา");
  if (!state.business) throw new Error("ไม่พบร้านหรือสาขาจาก UID นี้");
  const activeBranches = state.branches.filter((branch) => (branch.status ?? "ACTIVE") === "ACTIVE");
  if (state.business.id === input) {
    const selectedBranch = requestedBranchId ? activeBranches.find((branch) => branch.id === requestedBranchId) : activeBranches.length === 1 ? activeBranches[0] : undefined;
    if (requestedBranchId && !selectedBranch) throw new Error("ไม่พบสาขานี้ในร้าน หรือสาขาไม่พร้อมใช้งาน");
    return { business: state.business, branches: activeBranches, selectedBranch };
  }
  const selectedBranch = activeBranches.find((branch) => branch.id === input);
  if (!selectedBranch) throw new Error("ไม่พบร้านหรือสาขาจาก UID นี้");
  return { business: state.business, branches: activeBranches, selectedBranch };
}

function stockOf(product: DemoProduct) {
  return product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
}

function productsByStatus(state: DemoState, status?: string) {
  const statuses = status ? status.split(",").map((item) => item.trim()) as ProductStatus[] : managementStatuses;
  return state.products.filter((product) => statuses.includes(product.status));
}

function queryProducts(state: DemoState, status?: string | null, query?: string | null, branchId?: string | null) {
  ensureDefaultBranch(state);
  if (!locationMatches(state, branchId)) return [];
  return productsByStatus(state, status ?? undefined)
    .filter((product) => matchesProductSearch(product, query ?? ""))
    .map((product) => ({ ...product, balances: scopedProductBalances(state, product, branchId) }));
}

function categoryRows(state: DemoState, branchId?: string | null) {
  if (!locationMatches(state, branchId)) return [];
  const byName = new Map<string, DemoCategory>();
  for (const category of state.categories) byName.set(category.name.toLowerCase(), category);
  for (const product of state.products) {
    const name = normalizeText(product.category?.name);
    if (name && !byName.has(name.toLowerCase())) {
      const category = { id: id("category"), name, color: "#2563eb", createdAt: new Date().toISOString() };
      state.categories.push(category);
      byName.set(name.toLowerCase(), category);
    }
  }
  const categoryProducts = (category: DemoCategory) => state.products
    .filter((product) => product.category?.name?.toLowerCase() === category.name.toLowerCase());
  return [...byName.values()].map((category) => ({
    ...category,
    products: categoryProducts(category)
      .sort((left, right) => left.name.localeCompare(right.name, "th"))
      .slice(0, 5)
      .map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        imagePath: product.imagePath ?? null,
        unit: product.unit,
        balances: product.balances
          .filter((balance) => balanceMatchesBranch(state, balance, branchId))
          .map((balance) => ({ quantity: balance.quantity }))
      })),
    _count: { products: categoryProducts(category).length }
  }));
}

function assertUniqueCategoryName(state: DemoState, name: string, currentCategoryId?: string) {
  const normalizedName = name.toLowerCase();
  const duplicate = categoryRows(state).some((category) => category.id !== currentCategoryId && category.name.toLowerCase() === normalizedName);
  if (duplicate) throw new Error("ชื่อหมวดหมู่นี้มีอยู่แล้ว");
}

function usedProductLimit(state: DemoState) {
  return state.products.filter((product) => {
    if (product.status === "ACTIVE" || product.status === "PAUSED") return true;
    return product.status === "DISCONTINUED" && stockOf(product) > 0;
  }).length;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeBranchCode(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "-");
}

function hydrateBranch(branch: Partial<DemoBranch>, index = 0): DemoBranch {
  const isDefault = Boolean(branch.isDefault);
  const branchId = branch.id ?? (isDefault ? defaultWarehouseId : id("branch"));
  return {
    id: branchId,
    name: branch.name ?? (isDefault ? "หน้าร้านหลัก" : "คลัง"),
    code: branch.code ?? (isDefault ? "MAIN" : `BR-${index + 1}`),
    type: branch.type ?? (isDefault ? "STORE_FRONT" : "BRANCH_WAREHOUSE"),
    status: branch.status ?? "ACTIVE",
    address: branch.address ?? null,
    contactName: branch.contactName ?? null,
    contactPhone: branch.contactPhone ?? null,
    note: branch.note ?? null,
    isDefault,
    createdAt: branch.createdAt ?? new Date().toISOString()
  };
}

function ensureDefaultBranch(state: DemoState) {
  let branch = state.branches.find((item) => item.isDefault);
  if (!branch) {
    branch = { id: defaultWarehouseId, name: "หน้าร้านหลัก", isDefault: true, createdAt: new Date().toISOString() };
    state.branches.unshift(branch);
  }
  return branch;
}

function warehouseIdForBalance(state: DemoState, balance: { warehouseId?: string }) {
  return balance.warehouseId ?? ensureDefaultBranch(state).id;
}

function branchWarehouseIds(state: DemoState, branchId?: string | null) {
  if (!branchId) return undefined;
  ensureDefaultBranch(state);
  const ids = state.branches
    .map((branch, index) => hydrateBranch(branch, index))
    .filter((warehouse) => demoBranchForWarehouse(warehouse).id === branchId)
    .map((warehouse) => warehouse.id);
  return new Set(ids);
}

function balanceMatchesBranch(state: DemoState, balance: { warehouseId?: string }, branchId?: string | null) {
  const warehouseIds = branchWarehouseIds(state, branchId);
  return !warehouseIds || warehouseIds.has(warehouseIdForBalance(state, balance));
}

function productMatchesBranch(state: DemoState, product: DemoProduct, branchId?: string | null) {
  const warehouseIds = branchWarehouseIds(state, branchId);
  return !warehouseIds || product.balances.some((balance) => warehouseIds.has(warehouseIdForBalance(state, balance)));
}

function scopedProductBalances(state: DemoState, product: DemoProduct, branchId?: string | null, warehouseId?: string | null) {
  return product.balances.filter((balance) => {
    const balanceWarehouseId = warehouseIdForBalance(state, balance);
    if (warehouseId) return balanceWarehouseId === warehouseId;
    return balanceMatchesBranch(state, balance, branchId);
  });
}

function productMatchesLocation(state: DemoState, product: DemoProduct, branchId?: string | null, warehouseId?: string | null) {
  if (warehouseId) return product.balances.some((balance) => warehouseIdForBalance(state, balance) === warehouseId);
  return productMatchesBranch(state, product, branchId);
}

function locationMatches(state: DemoState, branchId?: string | null, warehouseId?: string | null) {
  const warehouseIds = branchWarehouseIds(state, branchId);
  if (warehouseIds && warehouseIds.size === 0) return false;
  if (!warehouseId) return true;
  if (warehouseIds) return warehouseIds.has(warehouseId);
  return state.branches.some((branch, index) => hydrateBranch(branch, index).id === warehouseId);
}

function balanceRows(state: DemoState) {
  const branch = ensureDefaultBranch(state);
  return productsByStatus(state).map((product) => ({
    warehouseId: branch.id,
    warehouse: { ...branch, branch: { name: "สาขาหลัก" } },
    product,
    productId: product.id,
    quantity: product.balances[0]?.quantity ?? 0
  }));
}

function warehouseProductRows(state: DemoState, warehouse: DemoBranch) {
  return productsByStatus(state).map((product) => {
    const balance = product.balances.find((item) => warehouseIdForBalance(state, item) === warehouse.id);
    return {
      warehouseId: warehouse.id,
      warehouse: { ...warehouse, branch: demoBranchForWarehouse(warehouse) },
      product,
      productId: product.id,
      quantity: balance?.quantity ?? 0
    };
  });
}

function warehouseById(state: DemoState, warehouseId?: string) {
  ensureDefaultBranch(state);
  const warehouse = state.branches.find((item, index) => hydrateBranch(item, index).id === warehouseId);
  return hydrateBranch(warehouse ?? state.branches[0]);
}

function balanceForWarehouse(product: DemoProduct, warehouseId: string) {
  let balance = product.balances.find((item) => (item.warehouseId ?? defaultWarehouseId) === warehouseId);
  if (!balance) {
    balance = { warehouseId, quantity: 0 };
    product.balances.push(balance);
  }
  return balance;
}

function serializeTransfer(state: DemoState, transfer: DemoTransfer) {
  const sourceWarehouse = warehouseById(state, transfer.sourceWarehouseId);
  const destinationWarehouse = warehouseById(state, transfer.destinationWarehouseId);
  const withBranch = (warehouse: DemoBranch) => ({ ...warehouse, branch: demoBranchForWarehouse(warehouse) });
  return {
    ...transfer,
    sourceWarehouse: withBranch(sourceWarehouse),
    destinationWarehouse: withBranch(destinationWarehouse),
    items: transfer.items.map((item) => ({
      ...item,
      product: state.products.find((product) => product.id === item.productId)
    })).filter((item) => item.product)
  };
}

function applyLocalTransferOut(state: DemoState, transfer: DemoTransfer) {
  const sourceWarehouse = warehouseById(state, transfer.sourceWarehouseId);
  for (const item of transfer.items) {
    const product = state.products.find((row) => row.id === item.productId);
    if (!product) continue;
    const sourceBalance = balanceForWarehouse(product, sourceWarehouse.id);
    if (sourceBalance.quantity < item.quantity) throw new Error("Insufficient stock");
    const balanceBefore = sourceBalance.quantity;
    sourceBalance.quantity -= item.quantity;
    state.movements.push({
      id: id("movement"),
      type: "TRANSFER_OUT",
      quantity: item.quantity,
      balanceBefore,
      balanceAfter: sourceBalance.quantity,
      reference: transfer.documentNo,
      createdAt: new Date().toISOString(),
      product: { name: product.name },
      user: { name: "Demo User" },
      warehouse: { id: sourceWarehouse.id, name: sourceWarehouse.name, branch: demoBranchForWarehouse(sourceWarehouse) }
    });
  }
}

function demoBranchForWarehouse(warehouse: DemoBranch) {
  return warehouse.isDefault
    ? { id: storeBranchId, name: "สาขาหลัก" }
    : { id: warehouse.id, name: warehouse.name };
}

function serializeDemoStoreBranch(warehouse: DemoBranch) {
  const demoBranch = demoBranchForWarehouse(warehouse);
  return {
    id: demoBranch.id,
    name: demoBranch.name,
    code: warehouse.isDefault ? "MAIN" : warehouse.code,
    status: warehouse.status,
    address: warehouse.address ?? null,
    contactName: warehouse.contactName ?? null,
    contactPhone: warehouse.contactPhone ?? null,
    note: warehouse.note ?? null,
    isDefault: warehouse.isDefault,
    createdAt: warehouse.createdAt,
    warehouses: [warehouse]
  };
}

function stockCountSummary(items: DemoStockCount["items"]) {
  const countedItems = items.filter((item) => item.countedQuantity !== null).length;
  const differentItems = items.filter((item) => item.difference !== null && item.difference !== 0).length;
  return {
    totalItems: items.length,
    countedItems,
    uncountedItems: items.length - countedItems,
    differentItems,
    increaseQuantity: items.reduce((sum, item) => sum + Math.max(item.difference ?? 0, 0), 0),
    decreaseQuantity: items.reduce((sum, item) => sum + Math.abs(Math.min(item.difference ?? 0, 0)), 0)
  };
}

function serializeStockCount(state: DemoState, stockCount: DemoStockCount) {
  const warehouse = warehouseById(state, stockCount.warehouseId);
  return {
    ...stockCount,
    warehouse: { ...warehouse, branch: { id: storeBranchId, name: "สาขาหลัก" } },
    user: stockCount.user ?? { name: "Demo User" },
    items: stockCount.items.map((item) => ({
      ...item,
      product: state.products.find((product) => product.id === item.productId)
    })).filter((item) => item.product),
    summary: stockCountSummary(stockCount.items)
  };
}

function inventorySearchRows(state: DemoState, query?: string | null, branchId?: string | null, warehouseId?: string | null) {
  ensureDefaultBranch(state);
  const search = normalizeText(query);
  if (search.length < 2) return [];
  const matchesLocation = locationMatches(state, branchId, warehouseId);
  const warehouses = new Map(state.branches.map((branch, index) => {
    const warehouse = hydrateBranch(branch, index);
    return [warehouse.id, warehouse];
  }));
  return (matchesLocation ? productsByStatus(state) : [])
    .filter((product) => matchesProductSearch(product, search))
    .map((product) => ({
      ...product,
      balances: product.balances.filter((balance) => {
        const balanceWarehouseId = warehouseIdForBalance(state, balance);
        if (warehouseId) return balanceWarehouseId === warehouseId;
        return balanceMatchesBranch(state, balance, branchId);
      }).map((balance) => {
        const warehouseId = warehouseIdForBalance(state, balance);
        const warehouse = warehouses.get(warehouseId) ?? hydrateBranch({ id: warehouseId, name: "หน้าร้านหลัก", isDefault: true });
        return {
          warehouseId,
          quantity: balance.quantity,
          warehouse: { ...warehouse, branch: demoBranchForWarehouse(warehouse) }
        };
      })
    }))
    .sort((left, right) => stockOf(right) - stockOf(left) || left.name.localeCompare(right.name, "th"))
    .slice(0, 30);
}

function assertUniqueSku(state: DemoState, sku: string, currentProductId?: string) {
  const normalizedSku = sku.toLowerCase();
  const duplicate = state.products.some((product) => product.id !== currentProductId && product.sku.toLowerCase() === normalizedSku);
  if (duplicate) throw new Error("SKU นี้ถูกใช้แล้ว กรุณาใช้ SKU อื่น");
}

function assertUniqueBarcode(state: DemoState, barcode?: string, currentProductId?: string) {
  if (!barcode) return;
  const normalizedBarcode = barcode.toLowerCase();
  const duplicate = state.products.some((product) => product.id !== currentProductId && product.barcode?.toLowerCase() === normalizedBarcode);
  if (duplicate) throw new Error("Barcode นี้ถูกใช้แล้ว กรุณาใช้ barcode อื่น");
}

function dashboard(state: DemoState) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weekStart = today - 6 * 24 * 60 * 60 * 1000;
  const trendStart = today - 29 * 24 * 60 * 60 * 1000;
  const todaySales = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= today);
  const yesterdaySales = state.sales.filter((sale) => {
    const saleTime = new Date(sale.createdAt).getTime();
    return saleTime >= today - 24 * 60 * 60 * 1000 && saleTime < today;
  });
  const weekSales = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= weekStart);
  const trendSales = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= trendStart);
  const salesToday = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const salesYesterday = yesterdaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const salesThisMonth = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= month).reduce((sum, sale) => sum + Number(sale.total), 0);
  const todayGrossProfit = todaySales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.total) - Number(item.unitCost ?? item.product.costPrice) * item.quantity, 0), 0);
  const products = productsByStatus(state);
  const stockValue = products.reduce((sum, product) => sum + product.balances.reduce((total, balance) => total + balance.quantity, 0) * Number(product.costPrice), 0);
  const stockRows = products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    quantity: product.balances.reduce((total, balance) => total + balance.quantity, 0),
    minStock: product.minStock
  }));
  const lowStock = stockRows.filter((product) => product.quantity > 0 && product.quantity <= product.minStock);
  const outOfStock = stockRows.filter((product) => product.quantity <= 0);
  const salesTargetMode = state.business?.salesTargetMode ?? "ANNUAL";
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const targets = calculateSalesTargetPreview(
    salesTargetMode,
    salesTargetMode === "MONTHLY" ? state.business?.monthlySalesTarget ?? null :
      salesTargetMode === "DAILY" ? state.business?.dailySalesTarget ?? null :
      state.business?.annualSalesTarget ?? null,
    daysInCurrentMonth
  );
  return {
    role: state.session?.business?.role ?? "OWNER",
    goals: { salesTargetMode, ...targets, daysInCurrentMonth },
    sales: {
      todayTotal: salesToday,
      yesterdayTotal: salesYesterday,
      todayReceiptCount: todaySales.length,
      averageReceiptValue: todaySales.length ? salesToday / todaySales.length : 0,
      todayGrossProfit,
      todayChangePercent: percentChange(salesToday, salesYesterday),
      monthTotal: salesThisMonth,
      last7Days: Array.from({ length: 7 }, (_, index) => {
        const dayStart = weekStart + index * 24 * 60 * 60 * 1000;
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        return {
          date: new Date(dayStart).toISOString().slice(0, 10),
          total: state.sales.filter((sale) => {
            const saleTime = new Date(sale.createdAt).getTime();
            return saleTime >= dayStart && saleTime < dayEnd;
          }).reduce((sum, sale) => sum + Number(sale.total), 0)
        };
      }),
      trend30Days: summarizeDemoSalesTrend(trendStart, weekStart, trendSales),
      dailyTargetProgress: targetProgress(salesToday, targets.dailySalesTarget),
      monthlyTargetProgress: targetProgress(salesThisMonth, targets.monthlySalesTarget)
    },
    inventory: {
      stockValue,
      totalProducts: usedProductLimit(state),
      lowStockProducts: lowStock.length,
      outOfStockProducts: outOfStock.length,
      lowStockPreview: lowStock.slice(0, 5),
      outOfStockPreview: outOfStock.slice(0, 5)
    },
    topProducts: {
      today: summarizeDemoTopProducts(todaySales.filter((sale) => new Date(sale.createdAt).getTime() < tomorrow)),
      last7Days: summarizeDemoTopProducts(weekSales)
    },
    summary: {
      salesToday,
      salesThisMonth,
      stockValue,
      totalProducts: usedProductLimit(state),
      lowStockProducts: lowStock.length,
      outOfStockProducts: outOfStock.length
    },
    recentSales: state.sales.slice(-5).reverse(),
    recentMovements: state.movements.slice(-5).reverse()
  };
}

function targetProgress(current: number, target: number | null) {
  if (!target || target <= 0) return { target, current, percent: null, remaining: null, reached: false };
  return { target, current, percent: Math.round((current / target) * 100), remaining: Math.max(target - current, 0), reached: current >= target };
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function summarizeDemoTopProducts(sales: DemoSale[]) {
  const map = new Map<string, { productId: string; name: string; sku: string; quantity: number; revenue: number; grossProfit: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const current = map.get(item.product.id) ?? { productId: item.product.id, name: item.product.name, sku: item.product.sku, quantity: 0, revenue: 0, grossProfit: 0 };
      current.quantity += item.quantity;
      current.revenue += Number(item.total);
      current.grossProfit += Number(item.total) - Number(item.unitCost ?? item.product.costPrice) * item.quantity;
      map.set(item.product.id, current);
    }
  }
  return [...map.values()].sort((left, right) => right.revenue - left.revenue).slice(0, 5);
}

function demoDateKey(value: string | number | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildDemoSalesSeries(start: number, sales: DemoSale[], days: number) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = start + index * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return {
      date: demoDateKey(dayStart),
      total: sales
        .filter((sale) => {
          const saleTime = new Date(sale.createdAt).getTime();
          return saleTime >= dayStart && saleTime < dayEnd;
        })
        .reduce((sum, sale) => sum + Number(sale.total), 0)
    };
  });
}

function summarizeDemoSalesTrend(trendStart: number, weekStart: number, sales: DemoSale[]) {
  const series = buildDemoSalesSeries(trendStart, sales, 30);
  const total = series.reduce((sum, day) => sum + day.total, 0);
  const previous7Start = weekStart - 7 * 24 * 60 * 60 * 1000;
  const last7DaysTotal = sales
    .filter((sale) => new Date(sale.createdAt).getTime() >= weekStart)
    .reduce((sum, sale) => sum + Number(sale.total), 0);
  const previous7DaysTotal = sales
    .filter((sale) => {
      const saleTime = new Date(sale.createdAt).getTime();
      return saleTime >= previous7Start && saleTime < weekStart;
    })
    .reduce((sum, sale) => sum + Number(sale.total), 0);
  const bestDay = series.reduce<{ date: string; total: number } | null>((best, day) => {
    if (day.total <= 0) return best;
    if (!best || day.total > best.total) return day;
    return best;
  }, null);
  return {
    total,
    averageDailySales: total / 30,
    receiptCount: sales.length,
    last7DaysTotal,
    previous7DaysTotal,
    last7DaysChangePercent: percentChange(last7DaysTotal, previous7DaysTotal),
    bestDay
  };
}

function summarizeDemoSalesBreakdown(sales: DemoSale[], getLabel: (sale: DemoSale) => string) {
  const rows = new Map<string, { label: string; total: number; count: number }>();
  for (const sale of sales) {
    const label = getLabel(sale);
    const current = rows.get(label) ?? { label, total: 0, count: 0 };
    current.total += Number(sale.total);
    current.count += 1;
    rows.set(label, current);
  }
  return [...rows.values()].sort((left, right) => right.total - left.total);
}

function demoStockPlanningReport(state: DemoState, branchId: string | null, warehouseId: string | null) {
  const defaultWarehouse = ensureDefaultBranch(state);
  const matchesLocation = locationMatches(state, branchId, warehouseId);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = today - 29 * 24 * 60 * 60 * 1000;
  const sales = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= start && matchesLocation);
  const soldByProduct = new Map<string, number>();
  for (const sale of sales) {
    for (const item of sale.items) {
      soldByProduct.set(item.product.id, (soldByProduct.get(item.product.id) ?? 0) + item.quantity);
    }
  }
  const rows = (matchesLocation ? productsByStatus(state) : []).map((product) => {
    const quantity = scopedProductBalances(state, product, branchId, warehouseId).reduce((sum, balance) => sum + balance.quantity, 0);
    const costPrice = Number(product.costPrice);
    const sold30Days = soldByProduct.get(product.id) ?? 0;
    const avgDailySales30 = sold30Days / 30;
    const daysOfStock = avgDailySales30 > 0 ? quantity / avgDailySales30 : null;
    const suggestedRestockQty = Math.max(product.minStock * 2 - quantity, product.minStock - quantity, 0);
    const status = quantity === 0 ? "OUT" : quantity <= product.minStock ? "LOW" : "OK";
    const reason = status === "OUT" ? "OUT" : status === "LOW" ? "LOW" : daysOfStock !== null && daysOfStock <= 7 && suggestedRestockQty > 0 ? "FAST_MOVING" : "HEALTHY";
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      imagePath: product.imagePath ?? null,
      quantity,
      minStock: product.minStock,
      costPrice,
      stockValue: quantity * costPrice,
      status,
      sold30Days,
      avgDailySales30,
      daysOfStock,
      suggestedRestockQty,
      estimatedCost: suggestedRestockQty * costPrice,
      reason
    };
  });
  const reasonRank = { OUT: 0, LOW: 1, FAST_MOVING: 2, HEALTHY: 3 } as const;
  const replenishmentRows = rows
    .filter((row) => row.reason !== "HEALTHY" && row.suggestedRestockQty > 0)
    .sort((left, right) => reasonRank[left.reason as keyof typeof reasonRank] - reasonRank[right.reason as keyof typeof reasonRank] || right.estimatedCost - left.estimatedCost);
  const valueRows = rows.filter((row) => row.stockValue > 0).sort((left, right) => right.stockValue - left.stockValue).slice(0, 8);
  return {
    scope: {
      branchId: branchId ?? null,
      branchName: branchId && matchesLocation ? "สาขาหลัก" : null,
      warehouseId: warehouseId ?? null,
      warehouseName: warehouseId ? defaultWarehouse.name : null
    },
    summary: {
      replenishmentCount: replenishmentRows.length,
      estimatedRestockCost: replenishmentRows.reduce((sum, row) => sum + row.estimatedCost, 0),
      stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      outOfStockCount: rows.filter((row) => row.status === "OUT").length,
      lowStockCount: rows.filter((row) => row.status === "LOW").length,
      fastMovingCount: rows.filter((row) => row.reason === "FAST_MOVING").length,
      totalProducts: rows.length
    },
    replenishmentRows,
    valueRows
  };
}

export async function localDemo<T>(path: string, init: RequestInit = {}) {
  const state = load();
  const method = init.method ?? "GET";
  const body: any = init.body instanceof FormData ? init.body : init.body ? JSON.parse(String(init.body)) : {};
  const url = new URL(path, "http://local-demo");
  const route = url.pathname;

  if (route === "/auth/register" && method === "POST") {
    const session: AuthSession = {
      accessToken: "local-demo-access",
      refreshToken: "local-demo-refresh",
      user: withDemoAccountMetadata({ id: "local_user", name: body.name, email: body.email, isSystemAdmin: false })
    };
    state.session = session;
    save(state);
    return session as T;
  }

  if (route === "/auth/login" && method === "POST") {
    const session = state.session ?? {
      accessToken: "local-demo-access",
      refreshToken: "local-demo-refresh",
      user: withDemoAccountMetadata({ id: "local_user", name: "Demo User", email: body.email, isSystemAdmin: false }),
      business: state.business
        ? {
            id: state.business.id,
            name: state.business.name,
            role: "OWNER" as const,
            effectivePermissions: resolveEffectivePermissions("OWNER"),
            assignedBranchIds: [],
            onboardingCompleted: state.business.onboardingCompleted,
            onboardingProgress: state.business.onboardingProgress
          }
        : undefined
    };
    state.session = session;
    save(state);
    return session as T;
  }

  if (route === "/auth/google" && method === "POST") {
    const session = state.session ?? {
      accessToken: "local-demo-access",
      refreshToken: "local-demo-refresh",
      user: withDemoAccountMetadata({ id: "local_user", name: "Demo User", email: "demo@zentory.local", authProviders: { password: false, google: true }, isSystemAdmin: false }),
      business: state.business
        ? {
            id: state.business.id,
            name: state.business.name,
            role: "OWNER" as const,
            effectivePermissions: resolveEffectivePermissions("OWNER"),
            assignedBranchIds: [],
            onboardingCompleted: state.business.onboardingCompleted,
            onboardingProgress: state.business.onboardingProgress
          }
        : undefined
    };
    state.session = session;
    save(state);
    return session as T;
  }

  if (route === "/auth/forgot-password" && method === "POST") {
    return { ok: true } as T;
  }

  if (route === "/auth/reset-password" && method === "POST") {
    return { ok: true } as T;
  }

  if (route === "/me/profile" && method === "PATCH") {
    if (!state.session) throw new Error("กรุณาเข้าสู่ระบบ");
    const name = normalizeText(body.name);
    if (name.length < 2) throw new Error("ชื่อต้องมีอย่างน้อย 2 ตัวอักษร");
    const phone = normalizeText(body.phone) || null;
    const updatedAt = new Date().toISOString();
    const nextSession: AuthSession = {
      ...state.session,
      user: withDemoAccountMetadata({
        ...state.session.user,
        name,
        phone,
        updatedAt
      })
    };
    state.session = nextSession;
    save(state);
    return nextSession as T;
  }

  if (route === "/reports/dashboard") return dashboard(state) as T;
  if (route === "/categories" && method === "GET") return categoryRows(state, url.searchParams.get("branchId")).sort((left, right) => left.name.localeCompare(right.name)) as T;
  if (route === "/categories" && method === "POST") {
    const name = normalizeText(body.name);
    if (!name) throw new Error("Category name is required");
    assertUniqueCategoryName(state, name);
    const category = { id: id("category"), name, color: normalizeText(body.color) || "#2563eb", createdAt: new Date().toISOString() };
    state.categories.push(category);
    save(state);
    return { ...category, products: [], _count: { products: 0 } } as T;
  }
  if (route.startsWith("/categories/") && method === "PATCH") {
    const categoryId = route.split("/")[2];
    const category = categoryRows(state).find((item) => item.id === categoryId);
    if (!category) throw new Error("Category not found");
    const nextName = body.name === undefined ? category.name : normalizeText(body.name);
    if (!nextName) throw new Error("Category name is required");
    assertUniqueCategoryName(state, nextName, category.id);
    const storedCategory = state.categories.find((item) => item.id === category.id);
    if (storedCategory) {
      const previousName = storedCategory.name;
      storedCategory.name = nextName;
      storedCategory.color = body.color === undefined ? storedCategory.color : normalizeText(body.color) || "#2563eb";
      state.products.forEach((product) => {
        if (product.category?.name.toLowerCase() === previousName.toLowerCase()) product.category = { name: nextName };
      });
    }
    save(state);
    return categoryRows(state).find((item) => item.id === category.id) as T;
  }
  if (route.startsWith("/categories/") && method === "DELETE") {
    const categoryId = route.split("/")[2];
    const category = categoryRows(state).find((item) => item.id === categoryId);
    if (!category) throw new Error("Category not found");
    if (category._count.products > 0) throw new Error("หมวดหมู่นี้ยังมีสินค้าใช้งานอยู่ กรุณาย้ายสินค้าออกก่อนลบ");
    state.categories = state.categories.filter((item) => item.id !== categoryId);
    save(state);
    return category as T;
  }
  if (route === "/products" && method === "GET") return queryProducts(state, url.searchParams.get("status"), url.searchParams.get("q"), url.searchParams.get("branchId")) as T;
  if (route.startsWith("/products/") && method === "GET") {
    const productId = route.split("/")[2];
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    const balances = product.balances.filter((balance) => {
      const balanceWarehouseId = warehouseIdForBalance(state, balance);
      if (warehouseId) return balanceWarehouseId === warehouseId;
      return balanceMatchesBranch(state, balance, branchId);
    });
    const movements = state.movements
      .filter((movement) => movement.product.name === product.name)
      .filter((movement) => locationMatches(state, branchId, warehouseId || movement.warehouse?.id))
      .slice()
      .reverse();
    return { ...product, balances, movements } as T;
  }
  if (route === "/branches" && method === "GET") {
    ensureDefaultBranch(state);
    return state.branches.map((branch, index) => {
      const warehouse = hydrateBranch(branch, index);
      return serializeDemoStoreBranch(warehouse);
    }) as T;
  }
  if (route === "/branches" && method === "POST") {
    return { id: storeBranchId, name: normalizeText(body.name), code: normalizeBranchCode(body.code), status: body.status ?? "ACTIVE", isDefault: true, warehouses: state.branches } as T;
  }
  if (route.startsWith("/branches/") && method === "GET") {
    ensureDefaultBranch(state);
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item, index) => demoBranchForWarehouse(hydrateBranch(item, index)).id === branchId);
    if (!branch) throw new Error("Branch not found");
    const warehouse = hydrateBranch(branch);
    return serializeDemoStoreBranch(warehouse) as T;
  }
  if (route.startsWith("/branches/") && method === "PATCH") {
    ensureDefaultBranch(state);
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item, index) => demoBranchForWarehouse(hydrateBranch(item, index)).id === branchId);
    if (!branch) throw new Error("Branch not found");
    branch.name = normalizeText(body.name) || branch.name;
    branch.code = normalizeBranchCode(body.code) || branch.code;
    branch.status = body.status ?? branch.status ?? "ACTIVE";
    branch.address = normalizeText(body.address) || null;
    branch.contactName = normalizeText(body.contactName) || null;
    branch.contactPhone = normalizeText(body.contactPhone) || null;
    branch.note = normalizeText(body.note) || null;
    return serializeDemoStoreBranch(hydrateBranch(branch)) as T;
  }
  if (route === "/warehouses" && method === "GET") {
    ensureDefaultBranch(state);
    const branchId = url.searchParams.get("branchId");
    if (!locationMatches(state, branchId)) return [] as T;
    const balances = balanceRows(state);
    const movements = state.movements.slice().reverse();
    return state.branches.map((branch, index) => {
      const warehouse = hydrateBranch(branch, index);
      const demoBranch = demoBranchForWarehouse(warehouse);
      return {
        ...warehouse,
        branchId: demoBranch.id,
        branch: { ...demoBranch, code: warehouse.isDefault ? "MAIN" : warehouse.code, status: warehouse.status },
        balances: balances.filter((balance) => balance.warehouseId === warehouse.id),
        movements: movements.filter((movement) => (movement.warehouse?.name ?? movement.branch?.name ?? "หน้าร้านหลัก") === warehouse.name)
      };
    }) as T;
  }
  if (route.startsWith("/warehouses/") && method === "GET") {
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item) => item.id === branchId);
    if (!branch) throw new Error("Warehouse not found");
    const warehouse = hydrateBranch(branch);
    const demoBranch = demoBranchForWarehouse(warehouse);
    const balances = warehouseProductRows(state, warehouse);
    const movements = state.movements.slice().reverse().filter((movement) => (movement.warehouse?.name ?? movement.branch?.name ?? "หน้าร้านหลัก") === warehouse.name);
    return { ...warehouse, branchId: demoBranch.id, branch: { ...demoBranch, code: warehouse.isDefault ? "MAIN" : warehouse.code, status: warehouse.status }, balances, movements } as T;
  }
  if (route === "/warehouses" && method === "POST") {
    const code = normalizeBranchCode(body.code);
    if (state.branches.some((item) => (item.code ?? "").toLowerCase() === code.toLowerCase())) throw new Error("รหัสคลังนี้ถูกใช้แล้ว");
    const branch: DemoBranch = {
      id: id("branch"),
      name: normalizeText(body.name),
      code,
      type: body.type ?? "BRANCH_WAREHOUSE",
      status: body.status ?? "ACTIVE",
      address: normalizeText(body.address) || null,
      contactName: normalizeText(body.contactName) || null,
      contactPhone: normalizeText(body.contactPhone) || null,
      note: normalizeText(body.note) || null,
      isDefault: state.branches.length === 0,
      createdAt: new Date().toISOString()
    };
    state.branches.push(branch);
    save(state);
    return branch as T;
  }
  if (route.startsWith("/warehouses/") && method === "PATCH") {
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item) => item.id === branchId);
    if (!branch) throw new Error("Branch not found");
    const nextCode = body.code === undefined ? branch.code : normalizeBranchCode(body.code);
    if (nextCode && state.branches.some((item) => item.id !== branch.id && (item.code ?? "").toLowerCase() === nextCode.toLowerCase())) throw new Error("รหัสคลังนี้ถูกใช้แล้ว");
    const nextStatus = body.status ?? branch.status ?? "ACTIVE";
    if (branch.isDefault && (branch.status ?? "ACTIVE") === "ACTIVE" && nextStatus === "INACTIVE") {
      const hasStock = state.products.some((product) => (product.balances[0]?.quantity ?? 0) > 0);
      if (hasStock) throw new Error("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
    }
    if ((branch.status ?? "ACTIVE") === "ACTIVE" && nextStatus === "INACTIVE") {
      const demoBranchId = demoBranchForWarehouse(hydrateBranch(branch)).id;
      const activeSiblings = state.branches
        .map((item, index) => hydrateBranch(item, index))
        .filter((warehouse) => warehouse.id !== branch.id)
        .filter((warehouse) => demoBranchForWarehouse(warehouse).id === demoBranchId)
        .filter((warehouse) => (warehouse.status ?? "ACTIVE") === "ACTIVE");
      if (activeSiblings.length === 0) throw new Error("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");
    }
    branch.name = normalizeText(body.name) || branch.name;
    branch.code = nextCode || branch.code;
    branch.type = body.type ?? branch.type;
    branch.status = nextStatus;
    branch.address = body.address === undefined ? branch.address : normalizeText(body.address) || null;
    branch.contactName = body.contactName === undefined ? branch.contactName : normalizeText(body.contactName) || null;
    branch.contactPhone = body.contactPhone === undefined ? branch.contactPhone : normalizeText(body.contactPhone) || null;
    branch.note = body.note === undefined ? branch.note : normalizeText(body.note) || null;
    save(state);
    return branch as T;
  }
  if (route.startsWith("/warehouses/") && method === "DELETE") {
    const branchId = route.split("/")[2];
    const branchIndex = state.branches.findIndex((item) => item.id === branchId);
    const branch = state.branches[branchIndex];
    if (!branch) throw new Error("Warehouse not found");
    if (branch.isDefault) throw new Error("ไม่สามารถลบคลังหลักได้ กรุณาปิดใช้งานแทน");
    if (state.branches.length <= 1) throw new Error("ต้องมีคลังอย่างน้อย 1 คลัง");
    if ((branch.status ?? "ACTIVE") === "ACTIVE") {
      const demoBranchId = demoBranchForWarehouse(hydrateBranch(branch)).id;
      const activeSiblings = state.branches
        .map((item, index) => hydrateBranch(item, index))
        .filter((warehouse) => warehouse.id !== branch.id)
        .filter((warehouse) => demoBranchForWarehouse(warehouse).id === demoBranchId)
        .filter((warehouse) => (warehouse.status ?? "ACTIVE") === "ACTIVE");
      if (activeSiblings.length === 0) throw new Error("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลังในสาขานี้");
    }
    const hasStock = state.products.some((product) => product.balances.some((balance) => balance.warehouseId === branch.id && balance.quantity > 0));
    const hasMovements = state.movements.some((movement) => movement.warehouse?.id === branch.id || movement.warehouse?.name === branch.name);
    const hasSales = state.sales.some((sale) => sale.items.some((item) => item.product.balances.some((balance) => balance.warehouseId === branch.id)));
    if (hasStock || hasMovements || hasSales) throw new Error("คลังนี้มีสต็อกหรือประวัติรายการแล้ว กรุณาปิดใช้งานแทนการลบ");
    state.branches.splice(branchIndex, 1);
    save(state);
    return branch as T;
  }
  if (route === "/inventory/balances") {
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    const rows = balanceRows(state);
    return rows
      .filter((balance) => locationMatches(state, branchId, warehouseId || balance.warehouseId))
      .filter((balance) => !warehouseId || balance.warehouseId === warehouseId) as T;
  }
  if (route === "/inventory/search" && method === "GET") return inventorySearchRows(state, url.searchParams.get("q"), url.searchParams.get("branchId"), url.searchParams.get("warehouseId")) as T;
  if (route === "/inventory/movements") {
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    if (!locationMatches(state, branchId, warehouseId)) return [] as T;
    return state.movements.slice().reverse().map((movement) => {
      const transfer = state.transfers.find((item) => item.documentNo === movement.reference);
      return transfer ? { ...movement, transfer: serializeTransfer(state, transfer) } : movement;
    }) as T;
  }
  if (route === "/inventory/stock-counts" && method === "GET") {
    const warehouseId = url.searchParams.get("warehouseId");
    return state.stockCounts
      .filter((count) => !warehouseId || count.warehouseId === warehouseId)
      .slice()
      .reverse()
      .map((count) => serializeStockCount(state, count)) as T;
  }
  if (route === "/inventory/stock-counts" && method === "POST") {
    const warehouse = warehouseById(state, body.warehouseId);
    const items = state.products
      .filter((product) => managementStatuses.includes(product.status))
      .filter((product) => product.balances.some((balance) => warehouseIdForBalance(state, balance) === warehouse.id))
      .sort((left, right) => {
        const category = (left.category?.name ?? "").localeCompare(right.category?.name ?? "", "th");
        if (category !== 0) return category;
        return left.name.localeCompare(right.name, "th");
      })
      .map((product) => ({
        id: id("stock_count_item"),
        productId: product.id,
        systemQuantity: product.balances.find((balance) => warehouseIdForBalance(state, balance) === warehouse.id)?.quantity ?? 0,
        countedQuantity: null,
        difference: null,
        note: null
      }));
    if (items.length === 0) throw new Error("คลังนี้ยังไม่มีรายการสต็อกให้เริ่มนับ");
    const stockCount: DemoStockCount = {
      id: id("stock_count"),
      documentNo: `CNT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${state.stockCounts.length + 1}`,
      warehouseId: warehouse.id,
      status: "COUNTING",
      note: normalizeText(body.note) || null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      appliedAt: null,
      user: { name: "Demo User" },
      items
    };
    state.stockCounts.push(stockCount);
    save(state);
    return serializeStockCount(state, stockCount) as T;
  }
  if (route.startsWith("/inventory/stock-counts/")) {
    const [, , , stockCountId, action] = route.split("/");
    const stockCount = state.stockCounts.find((count) => count.id === stockCountId);
    if (!stockCount) throw new Error("Stock count not found");
    if (!action && method === "GET") return serializeStockCount(state, stockCount) as T;
    if (action === "items" && method === "PATCH") {
      if (stockCount.status !== "COUNTING") throw new Error("รอบนับนี้แก้ไขไม่ได้แล้ว");
      for (const row of body.items ?? []) {
        const item = stockCount.items.find((current) => current.productId === row.productId);
        if (!item) throw new Error("พบสินค้าที่ไม่ได้อยู่ในรอบนับนี้");
        const countedQuantity = row.countedQuantity === null || row.countedQuantity === undefined ? null : Math.trunc(Number(row.countedQuantity));
        if (countedQuantity !== null && (!Number.isFinite(countedQuantity) || countedQuantity < 0)) throw new Error("ยอดนับจริงต้องเป็นจำนวนเต็ม 0 ขึ้นไป");
        item.countedQuantity = countedQuantity;
        item.difference = countedQuantity === null ? null : countedQuantity - item.systemQuantity;
        item.note = normalizeText(row.note) || null;
      }
      save(state);
      return serializeStockCount(state, stockCount) as T;
    }
    if (action === "review" && method === "PATCH") {
      if (stockCount.status === "APPLIED" || stockCount.status === "CANCELED") throw new Error("รอบนับนี้ปิดแล้ว");
      if (stockCount.items.some((item) => item.countedQuantity === null)) throw new Error("กรุณากรอกยอดนับจริงให้ครบก่อนตรวจทาน");
      stockCount.status = "REVIEW";
      stockCount.completedAt = stockCount.completedAt ?? new Date().toISOString();
      save(state);
      return serializeStockCount(state, stockCount) as T;
    }
    if (action === "apply" && method === "POST") {
      if (stockCount.status === "APPLIED") throw new Error("รอบนับนี้ปรับสต็อกไปแล้ว");
      if (stockCount.status === "CANCELED") throw new Error("รอบนับนี้ถูกยกเลิกแล้ว");
      if (stockCount.status !== "REVIEW") throw new Error("กรุณาตรวจทานส่วนต่างก่อนยืนยันปรับสต็อก");
      if (stockCount.items.some((item) => item.countedQuantity === null)) throw new Error("กรุณากรอกยอดนับจริงให้ครบก่อนปรับสต็อก");
      for (const item of stockCount.items.filter((row) => row.difference !== 0 && row.countedQuantity !== null)) {
        const product = state.products.find((row) => row.id === item.productId);
        if (!product) continue;
        const balance = balanceForWarehouse(product, stockCount.warehouseId);
        const balanceBefore = balance.quantity;
        const countedQuantity = item.countedQuantity ?? 0;
        const delta = countedQuantity - balanceBefore;
        if (delta === 0) continue;
        balance.quantity = countedQuantity;
        state.movements.push({
          id: id("movement"),
          type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: Math.abs(delta),
          balanceBefore,
          balanceAfter: countedQuantity,
          reason: `นับสต็อก ${stockCount.documentNo}`,
          adjustmentMode: "SET_ACTUAL",
          targetQuantity: countedQuantity,
          reference: `LOCAL-ADJ-${Date.now()}`,
          createdAt: new Date().toISOString(),
          product: { name: product.name },
          user: { name: "Demo User" },
          warehouse: { id: stockCount.warehouseId, name: warehouseById(state, stockCount.warehouseId).name, branch: { name: "สาขาหลัก" } }
        });
      }
      stockCount.status = "APPLIED";
      stockCount.appliedAt = new Date().toISOString();
      save(state);
      return serializeStockCount(state, stockCount) as T;
    }
    if (action === "cancel" && method === "PATCH") {
      if (stockCount.status === "APPLIED") throw new Error("ยกเลิกรอบนับที่ปรับสต็อกแล้วไม่ได้");
      stockCount.status = "CANCELED";
      save(state);
      return serializeStockCount(state, stockCount) as T;
    }
  }
  if (route === "/inventory/transfers" && method === "GET") {
    const status = url.searchParams.get("status");
    const warehouseId = url.searchParams.get("warehouseId");
    const branchId = url.searchParams.get("branchId");
    const warehouseIds = branchWarehouseIds(state, branchId);
    return state.transfers
      .filter((transfer) => !status || transfer.status === status)
      .filter((transfer) => !warehouseId || transfer.sourceWarehouseId === warehouseId || transfer.destinationWarehouseId === warehouseId)
      .filter((transfer) => !warehouseIds || warehouseIds.has(transfer.sourceWarehouseId) || warehouseIds.has(transfer.destinationWarehouseId))
      .slice()
      .reverse()
      .map((transfer) => serializeTransfer(state, transfer)) as T;
  }
  if (route.startsWith("/inventory/transfers/") && method === "GET") {
    const transferId = route.split("/")[3];
    const transfer = state.transfers.find((item) => item.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    return serializeTransfer(state, transfer) as T;
  }
  if (route === "/inventory/transfers" && method === "POST") {
    const sourceWarehouse = warehouseById(state, body.sourceWarehouseId);
    const destinationWarehouse = warehouseById(state, body.destinationWarehouseId);
    if (!body.sourceWarehouseId || !body.destinationWarehouseId) throw new Error("กรุณาเลือกคลังต้นทางและปลายทาง");
    if (sourceWarehouse.id === destinationWarehouse.id) throw new Error("ต้นทางและปลายทางต้องเป็นคนละคลัง");
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
    const transfer: DemoTransfer = {
      id: id("transfer"),
      documentNo: `TRF-LOCAL-${Date.now()}`,
      sourceWarehouseId: sourceWarehouse.id,
      destinationWarehouseId: destinationWarehouse.id,
      status: "REQUESTED",
      note: normalizeText(body.note) || null,
      createdAt: new Date().toISOString(),
      createdBy: { id: state.session?.user.id, name: "Demo User" },
      requestedBy: { id: state.session?.user.id, name: "Demo User" },
      items: []
    };
    for (const item of body.items) {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product || !managementStatuses.includes(product.status)) throw new Error("Product is not available for this operation");
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error("จำนวนโอนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
      transfer.items.push({ id: id("transfer_item"), productId: product.id, quantity, unitCost: product.costPrice });
    }
    if (state.session?.user.isSystemAdmin || state.session?.business?.role === "OWNER") {
      applyLocalTransferOut(state, transfer);
      transfer.status = "IN_TRANSIT";
      transfer.sourceApprovedAt = new Date().toISOString();
      transfer.sourceApprovedBy = { id: state.session?.user.id, name: "Demo User" };
    }
    state.transfers.push(transfer);
    save(state);
    return serializeTransfer(state, transfer) as T;
  }
  if (route.startsWith("/inventory/transfers/") && route.endsWith("/source-approve") && method === "PATCH") {
    const transferId = route.split("/")[3];
    const transfer = state.transfers.find((item) => item.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new Error("อนุมัติได้เฉพาะคำขอโอนที่รออนุมัติ");
    applyLocalTransferOut(state, transfer);
    transfer.status = "IN_TRANSIT";
    transfer.sourceApprovedAt = new Date().toISOString();
    transfer.sourceApprovedBy = { id: state.session?.user.id, name: "Demo User" };
    save(state);
    return serializeTransfer(state, transfer) as T;
  }
  if (route.startsWith("/inventory/transfers/") && route.endsWith("/source-reject") && method === "PATCH") {
    const transferId = route.split("/")[3];
    const transfer = state.transfers.find((item) => item.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new Error("ปฏิเสธได้เฉพาะคำขอโอนที่รออนุมัติ");
    transfer.status = "SOURCE_REJECTED";
    transfer.sourceRejectedAt = new Date().toISOString();
    transfer.sourceRejectedBy = { id: state.session?.user.id, name: "Demo User" };
    save(state);
    return serializeTransfer(state, transfer) as T;
  }
  if (route.startsWith("/inventory/transfers/") && route.endsWith("/receive") && method === "PATCH") {
    const transferId = route.split("/")[3];
    const transfer = state.transfers.find((item) => item.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "IN_TRANSIT") throw new Error("รับได้เฉพาะเอกสารที่อยู่ระหว่างทาง");
    const destinationWarehouse = warehouseById(state, transfer.destinationWarehouseId);
    for (const item of transfer.items) {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product) continue;
      const destinationBalance = balanceForWarehouse(product, destinationWarehouse.id);
      const balanceBefore = destinationBalance.quantity;
      destinationBalance.quantity += item.quantity;
      state.movements.push({
        id: id("movement"),
        type: "TRANSFER_IN",
        quantity: item.quantity,
        balanceBefore,
        balanceAfter: destinationBalance.quantity,
        reference: transfer.documentNo,
        createdAt: new Date().toISOString(),
        product: { name: product.name },
        user: { name: "Demo User" },
        warehouse: { id: destinationWarehouse.id, name: destinationWarehouse.name, branch: demoBranchForWarehouse(destinationWarehouse) }
      });
    }
    transfer.status = "RECEIVED";
    transfer.destinationConfirmedAt = new Date().toISOString();
    transfer.destinationConfirmedBy = { id: state.session?.user.id, name: "Demo User" };
    transfer.receivedAt = new Date().toISOString();
    transfer.receivedBy = { id: state.session?.user.id, name: "Demo User" };
    save(state);
    return serializeTransfer(state, transfer) as T;
  }
  if (route.startsWith("/inventory/transfers/") && route.endsWith("/cancel") && method === "PATCH") {
    const transferId = route.split("/")[3];
    const transfer = state.transfers.find((item) => item.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status === "REQUESTED") {
      transfer.status = "CANCELED";
      transfer.canceledAt = new Date().toISOString();
      transfer.canceledBy = { id: state.session?.user.id, name: "Demo User" };
      save(state);
      return serializeTransfer(state, transfer) as T;
    }
    if (transfer.status !== "IN_TRANSIT") throw new Error("ยกเลิกได้เฉพาะคำขอที่รออนุมัติหรือเอกสารที่อยู่ระหว่างทาง");
    const sourceWarehouse = warehouseById(state, transfer.sourceWarehouseId);
    for (const item of transfer.items) {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product) continue;
      const sourceBalance = balanceForWarehouse(product, sourceWarehouse.id);
      const balanceBefore = sourceBalance.quantity;
      sourceBalance.quantity += item.quantity;
      state.movements.push({
        id: id("movement"),
        type: "TRANSFER_CANCEL",
        quantity: item.quantity,
        balanceBefore,
        balanceAfter: sourceBalance.quantity,
        reference: transfer.documentNo,
        createdAt: new Date().toISOString(),
        product: { name: product.name },
        user: { name: "Demo User" },
        warehouse: { id: sourceWarehouse.id, name: sourceWarehouse.name, branch: demoBranchForWarehouse(sourceWarehouse) }
      });
    }
    transfer.status = "CANCELED";
    transfer.canceledAt = new Date().toISOString();
    transfer.canceledBy = { id: state.session?.user.id, name: "Demo User" };
    save(state);
    return serializeTransfer(state, transfer) as T;
  }
  if (route === "/sales/export" && method === "GET") {
    const rows = state.sales.slice().reverse().map((sale) => [
      sale.receiptNo,
      sale.createdAt,
      sale.paymentMethod ?? "CASH",
      sale.items.map((item) => `${item.product.name} x ${item.quantity}`).join("; "),
      String(sale.items.reduce((sum, item) => sum + item.quantity, 0)),
      sale.subtotal ?? sale.total,
      sale.discount ?? "0",
      sale.total
    ]);
    return `\uFEFF${[["เลขที่", "วันที่", "ช่องทาง", "รายการ", "จำนวนชิ้น", "รวมก่อนส่วนลด", "ส่วนลด", "ยอดสุทธิ"], ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n")}\n` as T;
  }
  if (route === "/sales" && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    const filtered = state.sales.slice().reverse().filter((sale) => {
      const createdAt = new Date(sale.createdAt).getTime();
      const matchesSearch = !q || [
        sale.receiptNo,
        sale.paymentMethod,
        ...sale.items.flatMap((item) => [item.product.name, item.product.sku])
      ].some((value) => value?.toLowerCase().includes(q));
      const matchesDateFrom = !dateFrom || createdAt >= new Date(dateFrom).getTime();
      const matchesDateTo = !dateTo || createdAt <= new Date(dateTo).getTime();
      const matchesLocation = locationMatches(state, branchId, warehouseId);
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesLocation;
    });
    const data = filtered.slice((page - 1) * limit, page * limit);
    return {
      data,
      meta: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
      summary: {
        total: filtered.reduce((sum, sale) => sum + Number(sale.total), 0),
        units: filtered.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)
      }
    } as T;
  }
  if (route.startsWith("/sales/") && method === "GET") {
    const saleId = route.split("/")[2];
    const sale = state.sales.find((item) => item.id === saleId);
    if (!sale) throw new Error("Sale not found");
    return sale as T;
  }
  if (route === "/members" && method === "GET") {
    const branchId = url.searchParams.get("branchId");
    if (branchId) assertBranchAccess(state, branchId);
    return state.members
      .filter((member) => canAccessMemberInDemo(state, member) && memberMatchesBranchInDemo(state, member, branchId))
      .map((member) => serializeMember(state, member)) as T;
  }
  if (route === "/businesses/current" && method === "GET") {
    if (!state.business) throw new Error("ยังไม่ได้ตั้งค่าร้าน");
    ensureDefaultBranch(state);
    save(state);
    return { ...state.business, branches: state.branches, subscription: { plan: { name: "Local Demo", productLimit: 30, userLimit: 5 } } } as T;
  }
  if (route === "/businesses/dashboard-goals" && method === "PATCH") {
    if (!state.business) throw new Error("ยังไม่ได้ตั้งค่าร้าน");
    if (body.salesTargetMode !== undefined) state.business.salesTargetMode = body.salesTargetMode;
    if (body.annualSalesTarget !== undefined) state.business.annualSalesTarget = body.annualSalesTarget === null ? null : Math.max(0, Number(body.annualSalesTarget));
    if (body.dailySalesTarget !== undefined) state.business.dailySalesTarget = body.dailySalesTarget === null ? null : Math.max(0, Number(body.dailySalesTarget));
    if (body.monthlySalesTarget !== undefined) state.business.monthlySalesTarget = body.monthlySalesTarget === null ? null : Math.max(0, Number(body.monthlySalesTarget));
    save(state);
    return state.business as T;
  }
  if (route === "/reports/stock/planning") {
    return demoStockPlanningReport(state, url.searchParams.get("branchId"), url.searchParams.get("warehouseId")) as T;
  }
  if (route === "/reports/stock") {
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    const matchesLocation = locationMatches(state, branchId, warehouseId);
    return (matchesLocation ? productsByStatus(state) : []).map((product) => {
      const quantity = scopedProductBalances(state, product, branchId, warehouseId).reduce((sum, balance) => sum + balance.quantity, 0);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        minStock: product.minStock,
        stockValue: quantity * Number(product.costPrice),
        status: quantity === 0 ? "OUT" : quantity <= product.minStock ? "LOW" : "OK"
      };
    }) as T;
  }
  if (route === "/reports/sales") {
    const branchId = url.searchParams.get("branchId");
    const warehouseId = url.searchParams.get("warehouseId");
    const currentDefaultWarehouseId = ensureDefaultBranch(state).id;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = today - 29 * 24 * 60 * 60 * 1000;
    const sales = state.sales
      .filter((sale) => new Date(sale.createdAt).getTime() >= start)
      .filter(() => locationMatches(state, branchId, warehouseId))
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + Number(sale.discount ?? 0), 0);
    const totalUnits = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const branchName = state.branches.find((branch) => branch.isDefault)?.name ?? "หน้าร้านหลัก";
    return {
      range: { start: demoDateKey(start), end: demoDateKey(now), days: 30 },
      summary: {
        totalRevenue,
        receiptCount: sales.length,
        averageReceipt: sales.length ? totalRevenue / sales.length : 0,
        totalDiscount,
        totalUnits
      },
      dailySales: buildDemoSalesSeries(start, sales, 30),
      paymentMethods: summarizeDemoSalesBreakdown(sales, (sale) => sale.paymentMethod ?? "CASH"),
      branches: summarizeDemoSalesBreakdown(sales, () => branchName),
      topProducts: summarizeDemoTopProducts(sales),
      recentSales: sales.slice(0, 8).map((sale) => ({
        id: sale.id,
        receiptNo: sale.receiptNo,
        createdAt: sale.createdAt,
        total: sale.total,
        discount: sale.discount ?? "0",
        paymentMethod: sale.paymentMethod ?? "CASH",
        branch: { id: storeBranchId, name: branchName },
        warehouse: { id: currentDefaultWarehouseId, name: branchName },
        sellerName: "Demo User",
        itemCount: sale.items.length,
        unitCount: sale.items.reduce((sum, item) => sum + item.quantity, 0)
      }))
    } as T;
  }

  if (route === "/products" && method === "POST") {
    if (!canManageProductMasterInDemo(state)) throw new Error("เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มหรือแก้ข้อมูลหลักของสินค้าได้");
    const sku = normalizeText(body.sku);
    const name = normalizeText(body.name);
    const barcode = normalizeText(body.barcode) || undefined;
    assertUniqueSku(state, sku);
    assertUniqueBarcode(state, barcode);
    const initialStock = Number(body.initialStock ?? 0);
    const receiveNow = body.receiveNow && typeof body.receiveNow === "object" ? body.receiveNow : undefined;
    const receivedQuantity = receiveNow ? Number(receiveNow.quantity ?? 0) : initialStock;
    const warehouse = state.branches.find((item) => item.id === body.warehouseId) ?? ensureDefaultBranch(state);
    const product: DemoProduct = {
      id: id("product"),
      sku,
      barcode,
      name,
      description: normalizeText(body.description) || undefined,
      unit: normalizeText(body.unit) || "ชิ้น",
      costPrice: String(body.costPrice),
      salePrice: String(body.salePrice),
      minStock: Number(body.minStock ?? 0),
      status: "ACTIVE",
      category: normalizeText(body.categoryName) ? { name: normalizeText(body.categoryName) } : undefined,
      brand: normalizeText(body.brandName) ? { name: normalizeText(body.brandName) } : undefined,
      balances: [{ warehouseId: warehouse.id, quantity: Math.max(0, receivedQuantity) }]
    };
    state.products.unshift(product);
    if (receivedQuantity > 0) {
      const reference = receiveNow ? `LOCAL-REC-${Date.now()}` : "INITIAL-STOCK";
      state.movements.push({
        id: id("movement"),
        type: "RECEIVE_IN",
        quantity: receivedQuantity,
        balanceBefore: 0,
        balanceAfter: receivedQuantity,
        reference,
        createdAt: new Date().toISOString(),
        product: { name: product.name },
        user: { name: "Demo User" },
        warehouse: { id: warehouse.id, name: warehouse.name, branch: { name: "สาขาหลัก" } }
      });
    }
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/pause") && method === "PATCH") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (product) product.status = "PAUSED";
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/discontinue") && method === "PATCH") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (product) product.status = "DISCONTINUED";
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/reactivate") && method === "PATCH") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    const counted = product.status === "ACTIVE" || product.status === "PAUSED" || (product.status === "DISCONTINUED" && stockOf(product) > 0);
    if (!counted && usedProductLimit(state) >= 30) throw new Error("แพ็กเกจของคุณถึงขีดจำกัดจำนวนสินค้าแล้ว กรุณาปิด/เก็บสินค้าอื่นก่อน หรืออัปเกรดแพ็กเกจ");
    product.status = product.status === "ARCHIVED" ? "PAUSED" : "ACTIVE";
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/image") && method === "POST") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    const file = body instanceof FormData ? body.get("image") : null;
    product.imagePath = file instanceof File ? URL.createObjectURL(file) : null;
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/image") && method === "DELETE") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    product.imagePath = null;
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && route.endsWith("/archive") && method === "PATCH") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (product && stockOf(product) > 0) throw new Error(`ยังมีสต็อกเหลือ ${stockOf(product)}`);
    if (product) product.status = "ARCHIVED";
    save(state);
    return product as T;
  }

  if (route.startsWith("/products/") && method === "PATCH") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    const nextSku = normalizeText(body.sku) || product.sku;
    const nextBarcode = normalizeText(body.barcode) || undefined;
    assertUniqueSku(state, nextSku, product.id);
    assertUniqueBarcode(state, nextBarcode, product.id);
    product.name = normalizeText(body.name) || product.name;
    product.sku = nextSku;
    product.barcode = nextBarcode;
    product.description = normalizeText(body.description) || undefined;
    product.unit = normalizeText(body.unit) || product.unit;
    product.costPrice = String(body.costPrice ?? product.costPrice);
    product.salePrice = String(body.salePrice ?? product.salePrice);
    product.minStock = Number(body.minStock ?? product.minStock);
    product.category = normalizeText(body.categoryName) ? { name: normalizeText(body.categoryName) } : product.category;
    product.brand = normalizeText(body.brandName) ? { name: normalizeText(body.brandName) } : product.brand;
    save(state);
    return product as T;
  }

  if (route === "/inventory/receipts" && method === "POST") {
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
    if ((body.items ?? []).some((item: { newProduct?: unknown }) => item.newProduct) && !canManageProductMasterInDemo(state)) {
      throw new Error("เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มสินค้าใหม่ผ่านใบรับเข้าได้");
    }
    const reference = `LOCAL-REC-${Date.now()}`;
    const warehouse = state.branches.find((item) => item.id === body.warehouseId) ?? ensureDefaultBranch(state);
    for (const item of body.items ?? []) {
      const product = item.newProduct
        ? (() => {
            const sku = normalizeText(item.newProduct.sku);
            const name = normalizeText(item.newProduct.name);
            const barcode = normalizeText(item.newProduct.barcode) || undefined;
            assertUniqueSku(state, sku);
            assertUniqueBarcode(state, barcode);
            const next: DemoProduct = {
              id: id("product"),
              sku,
              barcode,
              name,
              description: normalizeText(item.newProduct.description) || undefined,
              unit: normalizeText(item.newProduct.unit) || "ชิ้น",
              costPrice: String(item.unitCost),
              salePrice: String(item.newProduct.salePrice),
              minStock: Number(item.newProduct.minStock ?? 0),
              status: "ACTIVE",
              category: normalizeText(item.newProduct.categoryName) ? { name: normalizeText(item.newProduct.categoryName) } : undefined,
              brand: normalizeText(item.newProduct.brandName) ? { name: normalizeText(item.newProduct.brandName) } : undefined,
              balances: []
            };
            state.products.unshift(next);
            return next;
          })()
        : state.products.find((row) => row.id === item.productId);
      if (!product) continue;
      if (!["ACTIVE", "PAUSED"].includes(product.status)) throw new Error("Product is not available for this operation");
      const balanceBefore = product.balances[0]?.quantity ?? 0;
      const nextQuantity = balanceBefore + Number(item.quantity);
      product.balances[0] = { warehouseId: warehouse.id, quantity: nextQuantity };
      state.movements.push({ id: id("movement"), type: "RECEIVE_IN", quantity: Number(item.quantity), balanceBefore, balanceAfter: nextQuantity, reference, createdAt: new Date().toISOString(), product: { name: product.name }, user: { name: "Demo User" }, warehouse: { id: warehouse.id, name: warehouse.name, branch: { name: "สาขาหลัก" } } });
    }
    save(state);
    return { id: id("receipt"), documentNo: reference } as T;
  }

  if (route === "/inventory/adjustments" && method === "POST") {
    const product = state.products.find((row) => row.id === body.productId);
    if (product) {
      const warehouse = state.branches.find((item) => item.id === body.warehouseId) ?? ensureDefaultBranch(state);
      const balanceBefore = product.balances[0]?.quantity ?? 0;
      const next = balanceBefore + Number(body.quantity);
      const adjustmentMode = body.adjustmentMode === "SET_ACTUAL" || body.adjustmentMode === "INCREASE" || body.adjustmentMode === "DECREASE"
        ? body.adjustmentMode
        : Number(body.quantity) >= 0 ? "INCREASE" : "DECREASE";
      product.balances[0] = { warehouseId: warehouse.id, quantity: Math.max(0, next) };
      state.movements.push({
        id: id("movement"),
        type: Number(body.quantity) >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        quantity: Math.abs(Number(body.quantity)),
        balanceBefore,
        balanceAfter: product.balances[0].quantity,
        reason: normalizeText(body.reason),
        adjustmentMode,
        targetQuantity: body.targetQuantity === undefined ? undefined : Number(body.targetQuantity),
        reference: `LOCAL-ADJ-${Date.now()}`,
        createdAt: new Date().toISOString(),
        product: { name: product.name },
        user: { name: "Demo User" },
        warehouse: { id: warehouse.id, name: warehouse.name, branch: { name: "สาขาหลัก" } }
      });
    }
    save(state);
    return { id: id("adjustment") } as T;
  }

  if (route === "/sales" && method === "POST") {
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
    const receiptNo = `LOCAL-${state.sales.length + 1}`;
    const warehouse = state.branches.find((item) => item.id === body.warehouseId) ?? ensureDefaultBranch(state);
    const items = (body.items ?? []).map((item: { productId: string; quantity: number }) => {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product) throw new Error("ไม่พบสินค้า");
      if ((product.balances[0]?.quantity ?? 0) < item.quantity) throw new Error("สินค้าไม่พอขาย");
      if (product.status !== "ACTIVE") throw new Error(`Invalid product ${item.productId}`);
      const balanceBefore = product.balances[0].quantity;
      product.balances[0] = { warehouseId: warehouse.id, quantity: balanceBefore - item.quantity };
      state.movements.push({ id: id("movement"), type: "SALE_OUT", quantity: item.quantity, balanceBefore, balanceAfter: product.balances[0].quantity, reference: receiptNo, createdAt: new Date().toISOString(), product: { name: product.name }, user: { name: "Demo User" }, warehouse: { id: warehouse.id, name: warehouse.name, branch: { name: "สาขาหลัก" } } });
      return { product, quantity: item.quantity, unitPrice: product.salePrice, unitCost: product.costPrice, total: String(Number(product.salePrice) * item.quantity) };
    });
    const subtotal = items.reduce((sum: number, item: { total: string }) => sum + Number(item.total), 0);
    const discount = Math.max(0, Number(body.discount ?? 0));
    const sale: DemoSale = {
      id: id("sale"),
      receiptNo,
      subtotal: String(subtotal),
      discount: String(discount),
      total: String(Math.max(0, subtotal - discount)),
      paymentMethod: body.paymentMethod ?? "CASH",
      createdAt: new Date().toISOString(),
      items
    };
    state.sales.push(sale);
    save(state);
    return sale as T;
  }

  if (route === "/membership-requests/target" && method === "GET") {
    const target = resolveDemoMembershipTarget(state, url.searchParams.get("businessId") ?? "", url.searchParams.get("branchId"));
    return {
      businessId: target.business.id,
      businessName: target.business.name,
      branches: target.branches.map((branch) => ({ id: branch.id, name: branch.name, code: branch.code, isDefault: branch.isDefault })),
      selectedBranchId: target.selectedBranch?.id ?? null
    } as T;
  }

  if (route === "/membership-requests" && method === "POST") {
    const target = resolveDemoMembershipTarget(state, body.businessId, body.requestedBranchId);
    const businessId = target.business.id;
    const requestedBranchId = target.selectedBranch?.id ?? null;
    const employeeName = normalizeText(body.employeeName);
    const employeePhone = normalizeText(body.employeePhone);
    const preferredRole = normalizeText(body.preferredRole);
    const preferredBranch = target.selectedBranch?.name ?? normalizeText(body.preferredBranch);
    const availableStartDate = normalizeText(body.availableStartDate);
    const applicationNote = normalizeText(body.applicationNote);
    if (!employeeName) throw new Error("กรุณากรอกชื่อพนักงาน");
    if (!employeePhone) throw new Error("กรุณากรอกเบอร์โทร");
    const activeMembership = state.members.find((member) => member.user?.id === "local_user" && member.status === "ACTIVE");
    if (activeMembership) throw new Error("บัญชีนี้มีร้านที่ใช้งานอยู่แล้ว");
    if (state.session?.user) {
      state.session.user.name = employeeName;
      state.session.user.phone = employeePhone;
    }
    let member = state.members.find((item) => item.user?.id === "local_user" && item.status === "REJECTED");
    if (member) {
      member.status = "PENDING";
      member.role = "VIEWER";
      member.employeeName = employeeName;
      member.employeePhone = employeePhone;
      member.preferredRole = preferredRole || null;
      member.preferredBranch = preferredBranch || null;
      member.requestedBranchId = requestedBranchId;
      member.availableStartDate = availableStartDate || null;
      member.applicationNote = applicationNote || null;
      member.permissionOverrides = {};
    } else {
      member = {
        id: id("member"),
        employeeName,
        employeePhone,
        preferredRole: preferredRole || null,
        preferredBranch: preferredBranch || null,
        requestedBranchId,
        availableStartDate: availableStartDate || null,
        applicationNote: applicationNote || null,
        role: "VIEWER",
        status: "PENDING",
        permissionOverrides: {},
        user: { id: "local_user", name: employeeName, email: state.session?.user.email ?? "demo@zentory.local" },
        createdAt: new Date().toISOString()
      };
      state.members.push(member);
    }
    const session: AuthSession = {
      ...(state.session ?? {
        accessToken: "local-demo-access",
        refreshToken: "local-demo-refresh",
        user: withDemoAccountMetadata({ id: "local_user", name: employeeName, email: "demo@zentory.local", phone: employeePhone, isSystemAdmin: false })
      }),
      business: undefined,
      membershipRequest: {
        id: member.id,
        businessId: target.business.id,
        businessName: target.business.name,
        employeeName,
        employeePhone,
        preferredRole: preferredRole || null,
        preferredBranch: preferredBranch || null,
        requestedBranchId,
        availableStartDate: availableStartDate || null,
        applicationNote: applicationNote || null,
        status: "PENDING",
        createdAt: member.createdAt
      }
    };
    state.session = session;
    save(state);
    return session as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/approve") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member || member.status !== "PENDING") throw new Error("อนุมัติได้เฉพาะคำขอที่รออนุมัติ");
    assertCanAccessMemberInDemo(state, member);
    const nextBranchIds = Array.isArray(body.branchIds) ? body.branchIds : [];
    assertCanAssignMemberBranchesInDemo(state, nextBranchIds);
    member.status = "ACTIVE";
    member.role = body.role;
    member.permissionOverrides = normalizePermissionOverrides(body.overrides);
    member.assignedBranchIds = nextBranchIds;
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/reject") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member || member.status !== "PENDING") throw new Error("ปฏิเสธได้เฉพาะคำขอที่รออนุมัติ");
    assertCanAccessMemberInDemo(state, member);
    member.status = "REJECTED";
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/role") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member) throw new Error("Member not found");
    if (member.role === "OWNER") throw new Error("Owner role cannot be changed");
    assertCanAccessMemberInDemo(state, member);
    member.role = body.role;
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/status") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member) throw new Error("Member not found");
    if (member.role === "OWNER") throw new Error("Owner status cannot be changed");
    assertCanAccessMemberInDemo(state, member);
    if (body.status === "ACTIVE" && !member.assignedBranchIds?.length) throw new Error("กรุณาเลือกสาขาให้พนักงานก่อนเปิดใช้งาน");
    member.status = body.status;
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/permissions") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member) throw new Error("Member not found");
    if (member.role === "OWNER") throw new Error("Owner permissions cannot be changed");
    assertCanAccessMemberInDemo(state, member);
    member.permissionOverrides = normalizePermissionOverrides(body.overrides);
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route.startsWith("/members/") && route.endsWith("/branches") && method === "PATCH") {
    const memberId = route.split("/")[2];
    const member = state.members.find((item) => item.id === memberId);
    if (!member) throw new Error("Member not found");
    if (member.role === "OWNER") throw new Error("Owner branch access cannot be changed");
    assertCanAccessMemberInDemo(state, member);
    const rawBranchIds: unknown = body.branchIds;
    const requestedBranchIds = Array.isArray(rawBranchIds) ? rawBranchIds.filter((branchId): branchId is string => typeof branchId === "string") : [];
    const branchIds = [...new Set(requestedBranchIds.filter((branchId) => state.branches.some((branch) => branch.id === branchId && (branch.status ?? "ACTIVE") === "ACTIVE")))];
    assertCanAssignMemberBranchesInDemo(state, branchIds);
    if (member.status === "ACTIVE" && branchIds.length === 0) throw new Error("กรุณาเลือกสาขาให้พนักงานอย่างน้อย 1 สาขา");
    member.assignedBranchIds = branchIds;
    save(state);
    return serializeMember(state, member) as T;
  }

  if (route === "/businesses/current" && method === "PATCH") {
    state.business = { ...(state.business ?? { id: "local_business", name: "" }), ...body };
    save(state);
    return state.business as T;
  }

  if (route === "/businesses" && method === "POST") {
    state.business = {
      id: "local_business",
      name: body.name,
      province: body.province,
      businessType: body.businessType,
      branchCount: body.branchCount ?? "1",
      onboardingCompleted: false,
      onboardingProgress: { setupStore: true }
    };
    ensureDefaultBranch(state);
    const session: AuthSession = {
      ...(state.session ?? {
        accessToken: "local-demo-access",
        refreshToken: "local-demo-refresh",
        user: withDemoAccountMetadata({ id: "local_user", name: "Demo User", email: "demo@zentory.app", isSystemAdmin: false })
      }),
      membershipRequest: undefined,
      business: {
        id: state.business.id,
        name: state.business.name,
        role: "OWNER",
        effectivePermissions: resolveEffectivePermissions("OWNER"),
        assignedBranchIds: [],
        province: state.business.province,
        businessType: state.business.businessType,
        branchCount: state.business.branchCount,
        onboardingCompleted: false,
        onboardingProgress: state.business.onboardingProgress
      }
    };
    if (!state.members.some((member) => member.user?.id === session.user.id && member.status === "ACTIVE")) {
      state.members = [{ id: "local_member", role: "OWNER", status: "ACTIVE", permissionOverrides: {}, user: session.user, createdAt: new Date().toISOString() }, ...state.members];
    }
    state.session = session;
    save(state);
    return session as T;
  }

  if (route === "/onboarding/status" && method === "GET") {
    if (!state.business) throw new Error("ยังไม่ได้ตั้งค่าร้าน");
    const progress = state.business.onboardingProgress ?? {};
    const steps = {
      setupStore: Boolean(state.business.name && state.business.province && state.business.businessType),
      firstProduct: productsByStatus(state).length > 0,
      stockIn: state.movements.some((movement) => movement.type === "RECEIVE_IN"),
      firstSale: state.sales.length > 0,
      firstReport: Boolean(progress.firstReport)
    };
    const completedSteps = Object.values(steps).filter(Boolean).length;
    state.business.onboardingCompleted = completedSteps === 5;
    state.business.onboardingProgress = { ...progress, ...steps };
    save(state);
    return { completed: state.business.onboardingCompleted, completedSteps, totalSteps: 5, percent: Math.round((completedSteps / 5) * 100), steps } as T;
  }

  if (route === "/onboarding/report-viewed" && method === "POST") {
    if (!state.business) throw new Error("ยังไม่ได้ตั้งค่าร้าน");
    state.business.onboardingProgress = { ...(state.business.onboardingProgress ?? {}), firstReport: true };
    save(state);
    return localDemo<T>("/onboarding/status", { method: "GET" });
  }

  if (route === "/onboarding/sample-data" && method === "POST") {
    const samples = [
      ["น้ำดื่ม 600ml", "DRINK-001", 5, 10, 12, 48],
      ["ขนมถุงเล็ก", "SNACK-001", 8, 15, 10, 30],
      ["สบู่ก้อน", "SOAP-001", 14, 25, 8, 20],
      ["กาแฟกระป๋อง", "COFFEE-001", 12, 20, 12, 36],
      ["กระดาษทิชชู่", "TISSUE-001", 18, 29, 10, 24]
    ] as const;
    for (const [name, sku, costPrice, salePrice, minStock, stock] of samples) {
      const product: DemoProduct = {
        id: id("product"),
        sku,
        name,
        unit: "ชิ้น",
        costPrice: String(costPrice),
        salePrice: String(salePrice),
        minStock,
        status: "ACTIVE",
        balances: [{ quantity: stock }]
      };
      state.products.unshift(product);
      state.movements.push({ id: id("movement"), type: "RECEIVE_IN", quantity: stock, balanceBefore: 0, balanceAfter: stock, reference: "SAMPLE-DATA", createdAt: new Date().toISOString(), product: { name }, user: { name: "Demo User" }, branch: { name: "หน้าร้าน" } });
    }
    save(state);
    return localDemo<T>("/onboarding/status", { method: "GET" });
  }

  throw new Error("Local demo does not support this action yet");
}
