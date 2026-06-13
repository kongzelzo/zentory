import type { AuthSession } from "@zentory/shared";
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
  balances: Array<{ quantity: number }>;
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
  items: Array<{ product: DemoProduct; quantity: number; unitPrice?: string; total: string }>;
};

type DemoMember = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

type DemoBranch = {
  id: string;
  name: string;
  code?: string;
  type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH" | "SECONDARY_WAREHOUSE";
  status?: "ACTIVE" | "INACTIVE";
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  note?: string | null;
  isDefault: boolean;
  createdAt: string;
};

type DemoState = {
  session?: AuthSession;
  business?: { id: string; name: string; province?: string; businessType?: string; branchCount?: string; onboardingCompleted?: boolean; onboardingProgress?: Record<string, boolean> };
  branches: DemoBranch[];
  products: DemoProduct[];
  sales: DemoSale[];
  movements: Array<{ id: string; type: string; quantity: number; balanceBefore?: number; balanceAfter?: number; reason?: string; reference?: string; createdAt: string; product: { name: string }; user?: { name: string }; branch?: { name: string } }>;
  members: DemoMember[];
};

const key = "zentory.local-demo.v1";
const managementStatuses: ProductStatus[] = ["ACTIVE", "PAUSED", "DISCONTINUED"];

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function initialState(): DemoState {
  return {
    business: undefined,
    branches: [],
    products: [],
    sales: [],
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

function stockOf(product: DemoProduct) {
  return product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
}

function productsByStatus(state: DemoState, status?: string) {
  const statuses = status ? status.split(",").map((item) => item.trim()) as ProductStatus[] : managementStatuses;
  return state.products.filter((product) => statuses.includes(product.status));
}

function queryProducts(state: DemoState, status?: string | null, query?: string | null) {
  return productsByStatus(state, status ?? undefined).filter((product) => matchesProductSearch(product, query ?? ""));
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
  const branchId = branch.id ?? (isDefault ? "local_branch_main" : id("branch"));
  return {
    id: branchId,
    name: branch.name ?? (isDefault ? "หน้าร้านหลัก" : "คลัง"),
    code: branch.code ?? (isDefault ? "MAIN" : `BR-${index + 1}`),
    type: branch.type ?? (isDefault ? "MAIN_WAREHOUSE" : "BRANCH"),
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
    branch = { id: "local_branch_main", name: "หน้าร้านหลัก", isDefault: true, createdAt: new Date().toISOString() };
    state.branches.unshift(branch);
  }
  return branch;
}

function balanceRows(state: DemoState) {
  const branch = ensureDefaultBranch(state);
  return productsByStatus(state).map((product) => ({
    branchId: branch.id,
    branch,
    product,
    productId: product.id,
    quantity: product.balances[0]?.quantity ?? 0
  }));
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
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const salesToday = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= today).reduce((sum, sale) => sum + Number(sale.total), 0);
  const salesThisMonth = state.sales.filter((sale) => new Date(sale.createdAt).getTime() >= month).reduce((sum, sale) => sum + Number(sale.total), 0);
  const products = productsByStatus(state);
  const stockValue = products.reduce((sum, product) => sum + product.balances.reduce((total, balance) => total + balance.quantity, 0) * Number(product.costPrice), 0);
  return {
    summary: {
      salesToday,
      salesThisMonth,
      stockValue,
      totalProducts: usedProductLimit(state),
      lowStockProducts: products.filter((product) => product.balances[0]?.quantity > 0 && product.balances[0].quantity <= product.minStock).length,
      outOfStockProducts: products.filter((product) => (product.balances[0]?.quantity ?? 0) <= 0).length
    },
    recentSales: state.sales.slice(-5).reverse(),
    recentMovements: state.movements.slice(-5).reverse()
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
      user: { id: "local_user", name: body.name, email: body.email, isSystemAdmin: false }
    };
    state.session = session;
    state.members = [{ id: "local_member", role: "OWNER", status: "ACTIVE", user: session.user }, ...state.members];
    save(state);
    return session as T;
  }

  if (route === "/auth/login" && method === "POST") {
    const session = state.session ?? {
      accessToken: "local-demo-access",
      refreshToken: "local-demo-refresh",
      user: { id: "local_user", name: "Demo User", email: body.email, isSystemAdmin: false },
      business: state.business ? { id: state.business.id, name: state.business.name, role: "OWNER" as const, onboardingCompleted: state.business.onboardingCompleted, onboardingProgress: state.business.onboardingProgress } : undefined
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

  if (route === "/reports/dashboard") return dashboard(state) as T;
  if (route === "/products" && method === "GET") return queryProducts(state, url.searchParams.get("status"), url.searchParams.get("q")) as T;
  if (route.startsWith("/products/") && method === "GET") {
    const productId = route.split("/")[2];
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Product not found");
    return { ...product, movements: state.movements.filter((movement) => movement.product.name === product.name).slice().reverse() } as T;
  }
  if (route === "/branches" && method === "GET") {
    ensureDefaultBranch(state);
    const balances = balanceRows(state);
    const movements = state.movements.slice().reverse();
    return state.branches.map((branch, index) => ({
      ...hydrateBranch(branch, index),
      balances: balances.filter((balance) => balance.branchId === branch.id),
      movements: movements.filter((movement) => (movement.branch?.name ?? "หน้าร้านหลัก") === branch.name)
    })) as T;
  }
  if (route.startsWith("/branches/") && method === "GET") {
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item) => item.id === branchId);
    if (!branch) throw new Error("Branch not found");
    const balances = balanceRows(state).filter((balance) => balance.branchId === branch.id);
    const movements = state.movements.slice().reverse().filter((movement) => (movement.branch?.name ?? "หน้าร้านหลัก") === branch.name);
    return { ...hydrateBranch(branch), balances, movements } as T;
  }
  if (route === "/branches" && method === "POST") {
    const code = normalizeBranchCode(body.code);
    if (state.branches.some((item) => (item.code ?? "").toLowerCase() === code.toLowerCase())) throw new Error("รหัสคลังนี้ถูกใช้แล้ว");
    const branch: DemoBranch = {
      id: id("branch"),
      name: normalizeText(body.name),
      code,
      type: body.type ?? "BRANCH",
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
  if (route.startsWith("/branches/") && method === "PATCH") {
    const branchId = route.split("/")[2];
    const branch = state.branches.find((item) => item.id === branchId);
    if (!branch) throw new Error("Branch not found");
    const nextCode = body.code === undefined ? branch.code : normalizeBranchCode(body.code);
    if (nextCode && state.branches.some((item) => item.id !== branch.id && (item.code ?? "").toLowerCase() === nextCode.toLowerCase())) throw new Error("รหัสคลังนี้ถูกใช้แล้ว");
    const nextStatus = body.status ?? branch.status ?? "ACTIVE";
    if (branch.isDefault && (branch.status ?? "ACTIVE") === "ACTIVE" && nextStatus === "INACTIVE") {
      const hasStock = state.products.some((product) => (product.balances[0]?.quantity ?? 0) > 0);
      const activeBranches = state.branches.filter((item) => (item.status ?? "ACTIVE") === "ACTIVE").length;
      if (hasStock) throw new Error("ไม่สามารถปิดใช้งานคลังหลักที่ยังมีสต็อกอยู่");
      if (activeBranches <= 1) throw new Error("ต้องมีคลังที่เปิดใช้งานอย่างน้อย 1 คลัง");
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
  if (route === "/inventory/balances") return balanceRows(state) as T;
  if (route === "/inventory/movements") return state.movements.slice().reverse() as T;
  if (route === "/sales" && method === "GET") return state.sales.slice().reverse() as T;
  if (route.startsWith("/sales/") && method === "GET") {
    const saleId = route.split("/")[2];
    const sale = state.sales.find((item) => item.id === saleId);
    if (!sale) throw new Error("Sale not found");
    return sale as T;
  }
  if (route === "/members" && method === "GET") return state.members as T;
  if (route === "/businesses/current" && method === "GET") {
    if (!state.business) throw new Error("ยังไม่ได้ตั้งค่าร้าน");
    ensureDefaultBranch(state);
    save(state);
    return { ...state.business, branches: state.branches, subscription: { plan: { name: "Local Demo", productLimit: 30, userLimit: 5 } } } as T;
  }
  if (route === "/reports/stock") {
    return productsByStatus(state).map((product) => {
      const quantity = product.balances[0]?.quantity ?? 0;
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
    return state.sales.map((sale) => ({ createdAt: sale.createdAt, _sum: { total: sale.total } })) as T;
  }

  if (route === "/products" && method === "POST") {
    const sku = normalizeText(body.sku);
    const name = normalizeText(body.name);
    const barcode = normalizeText(body.barcode) || undefined;
    assertUniqueSku(state, sku);
    assertUniqueBarcode(state, barcode);
    const initialStock = Number(body.initialStock ?? 0);
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
      balances: [{ quantity: Math.max(0, initialStock) }]
    };
    state.products.unshift(product);
    if (initialStock > 0) {
      state.movements.push({
        id: id("movement"),
        type: "RECEIVE_IN",
        quantity: initialStock,
        balanceBefore: 0,
        balanceAfter: initialStock,
        reference: "INITIAL-STOCK",
        createdAt: new Date().toISOString(),
        product: { name: product.name },
        user: { name: "Demo User" },
        branch: { name: "หน้าร้าน" }
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
    const reference = `LOCAL-REC-${Date.now()}`;
    for (const item of body.items ?? []) {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product) continue;
      if (!["ACTIVE", "PAUSED"].includes(product.status)) throw new Error("Product is not available for this operation");
      const balanceBefore = product.balances[0]?.quantity ?? 0;
      const nextQuantity = balanceBefore + Number(item.quantity);
      product.balances[0] = { quantity: nextQuantity };
      state.movements.push({ id: id("movement"), type: "RECEIVE_IN", quantity: Number(item.quantity), balanceBefore, balanceAfter: nextQuantity, reference, createdAt: new Date().toISOString(), product: { name: product.name }, user: { name: "Demo User" }, branch: { name: "หน้าร้าน" } });
    }
    save(state);
    return { id: id("receipt"), documentNo: reference } as T;
  }

  if (route === "/inventory/adjustments" && method === "POST") {
    const product = state.products.find((row) => row.id === body.productId);
    if (product) {
      const balanceBefore = product.balances[0]?.quantity ?? 0;
      const next = balanceBefore + Number(body.quantity);
      product.balances[0] = { quantity: Math.max(0, next) };
      state.movements.push({ id: id("movement"), type: Number(body.quantity) >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: Math.abs(Number(body.quantity)), balanceBefore, balanceAfter: product.balances[0].quantity, reason: normalizeText(body.reason), reference: `LOCAL-ADJ-${Date.now()}`, createdAt: new Date().toISOString(), product: { name: product.name }, user: { name: "Demo User" }, branch: { name: "หน้าร้าน" } });
    }
    save(state);
    return { id: id("adjustment") } as T;
  }

  if (route === "/sales" && method === "POST") {
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
    const receiptNo = `LOCAL-${state.sales.length + 1}`;
    const items = (body.items ?? []).map((item: { productId: string; quantity: number }) => {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product) throw new Error("ไม่พบสินค้า");
      if ((product.balances[0]?.quantity ?? 0) < item.quantity) throw new Error("สินค้าไม่พอขาย");
      if (product.status !== "ACTIVE") throw new Error(`Invalid product ${item.productId}`);
      const balanceBefore = product.balances[0].quantity;
      product.balances[0] = { quantity: balanceBefore - item.quantity };
      state.movements.push({ id: id("movement"), type: "SALE_OUT", quantity: item.quantity, balanceBefore, balanceAfter: product.balances[0].quantity, reference: receiptNo, createdAt: new Date().toISOString(), product: { name: product.name }, user: { name: "Demo User" }, branch: { name: "หน้าร้าน" } });
      return { product, quantity: item.quantity, unitPrice: product.salePrice, total: String(Number(product.salePrice) * item.quantity) };
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

  if (route === "/members" && method === "POST") {
    const member: DemoMember = { id: id("member"), role: body.role, status: "ACTIVE", user: { id: id("user"), name: body.name, email: body.email } };
    state.members.push(member);
    save(state);
    return member as T;
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
        user: { id: "local_user", name: "Demo User", email: "demo@zentory.app", isSystemAdmin: false }
      }),
      business: {
        id: state.business.id,
        name: state.business.name,
        role: "OWNER",
        province: state.business.province,
        businessType: state.business.businessType,
        branchCount: state.business.branchCount,
        onboardingCompleted: false,
        onboardingProgress: state.business.onboardingProgress
      }
    };
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
