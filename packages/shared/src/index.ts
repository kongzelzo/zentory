export const roles = ["OWNER", "MANAGER", "BRANCH_MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "products.read",
  "products.create",
  "products.update",
  "products.update_price",
  "products.update_cost",
  "products.archive",
  "inventory.read",
  "inventory.receive",
  "inventory.adjust",
  "inventory.movements.read",
  "sales.create",
  "sales.read",
  "sales.void",
  "reports.dashboard.read",
  "reports.sales.read",
  "reports.stock.read",
  "branches.manage",
  "warehouses.manage",
  "members.manage",
  "business.update",
  "subscription.manage"
] as const;
export type Permission = (typeof permissions)[number];
export type PermissionOverrides = Partial<Record<Permission, boolean>>;
export type EffectivePermissions = Record<Permission, boolean>;

const productMasterPermissions = ["products.create", "products.update", "products.update_price", "products.update_cost", "products.archive"];
const managerPermissions = permissions.filter((permission) => ![...productMasterPermissions, "members.manage", "business.update", "subscription.manage"].includes(permission));
const branchManagerPermissions = permissions.filter((permission) => ![...productMasterPermissions, "branches.manage", "members.manage", "business.update", "subscription.manage"].includes(permission));
const cashierPermissions = ["products.read", "inventory.read", "sales.create", "sales.read", "reports.dashboard.read"] as const;
const stockStaffPermissions = [
  "products.read",
  "inventory.read",
  "inventory.receive",
  "inventory.adjust",
  "inventory.movements.read",
  "reports.dashboard.read",
  "reports.stock.read"
] as const;
const viewerPermissions = [
  "products.read",
  "inventory.read",
  "inventory.movements.read",
  "sales.read",
  "reports.dashboard.read",
  "reports.sales.read",
  "reports.stock.read"
] as const;

export const rolePermissionSets = {
  OWNER: permissions,
  MANAGER: managerPermissions,
  BRANCH_MANAGER: branchManagerPermissions,
  CASHIER: cashierPermissions,
  STOCK_STAFF: stockStaffPermissions,
  VIEWER: viewerPermissions
} satisfies Record<Role, readonly Permission[]>;

export const permissionGroups = [
  { title: "สินค้า", permissions: ["products.read", "products.create", "products.update", "products.update_price", "products.update_cost", "products.archive"] },
  { title: "สต็อก", permissions: ["inventory.read", "inventory.receive", "inventory.adjust", "inventory.movements.read"] },
  { title: "ขาย", permissions: ["sales.create", "sales.read", "sales.void"] },
  { title: "รายงาน", permissions: ["reports.dashboard.read", "reports.sales.read", "reports.stock.read"] },
  { title: "สาขา/คลัง", permissions: ["branches.manage", "warehouses.manage"] },
  { title: "พนักงาน/ร้าน", permissions: ["members.manage", "business.update", "subscription.manage"] }
] satisfies Array<{ title: string; permissions: Permission[] }>;

export const permissionLabels = {
  "products.read": "ดูสินค้า",
  "products.create": "เพิ่มสินค้า",
  "products.update": "แก้ไขสินค้า",
  "products.update_price": "แก้ราคาขาย",
  "products.update_cost": "แก้ต้นทุน",
  "products.archive": "เก็บ/เลิกขายสินค้า",
  "inventory.read": "ดูสต็อก",
  "inventory.receive": "รับสินค้าเข้า",
  "inventory.adjust": "ปรับสต็อก",
  "inventory.movements.read": "ดูประวัติสต็อก",
  "sales.create": "ขายหน้าร้าน",
  "sales.read": "ดูประวัติขาย",
  "sales.void": "ยกเลิกการขาย",
  "reports.dashboard.read": "ดู Dashboard",
  "reports.sales.read": "ดูรายงานยอดขาย",
  "reports.stock.read": "ดูสินค้าต้องเติม",
  "branches.manage": "จัดการสาขา",
  "warehouses.manage": "จัดการคลัง",
  "members.manage": "จัดการพนักงาน",
  "business.update": "ตั้งค่าร้าน",
  "subscription.manage": "จัดการแพ็กเกจ"
} satisfies Record<Permission, string>;

export function normalizePermissionOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return permissions.reduce<PermissionOverrides>((overrides, permission) => {
    if (typeof input[permission] === "boolean") overrides[permission] = input[permission];
    return overrides;
  }, {});
}

export function resolveEffectivePermissions(role: Role, overrides: unknown = {}): EffectivePermissions {
  const base = new Set(rolePermissionSets[role] ?? []);
  const normalizedOverrides = normalizePermissionOverrides(overrides);
  return permissions.reduce<EffectivePermissions>((effective, permission) => {
    effective[permission] = normalizedOverrides[permission] ?? base.has(permission);
    return effective;
  }, {} as EffectivePermissions);
}

export function hasPermission(role: Role | undefined, overrides: unknown, permission: Permission) {
  if (!role || !roles.includes(role)) return false;
  return resolveEffectivePermissions(role, overrides)[permission];
}

export const paymentMethods = ["CASH", "TRANSFER"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const movementTypes = [
  "RECEIVE_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "SALE_OUT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "TRANSFER_CANCEL"
] as const;
export type MovementType = (typeof movementTypes)[number];

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    authProviders?: {
      password: boolean;
      google: boolean;
    };
    isSystemAdmin: boolean;
  };
  business?: {
    id: string;
    name: string;
    role: Role;
    effectivePermissions?: EffectivePermissions;
    province?: string | null;
    businessType?: string | null;
    branchCount?: string | null;
    onboardingCompleted?: boolean;
    onboardingProgress?: Record<string, boolean>;
    assignedBranchIds?: string[];
  };
  membershipRequest?: {
    id: string;
    businessId: string;
    businessName: string;
    employeeName?: string | null;
    employeePhone?: string | null;
    preferredRole?: string | null;
    preferredBranch?: string | null;
    requestedBranchId?: string | null;
    requestedBranch?: {
      id: string;
      name: string;
      code?: string | null;
    } | null;
    availableStartDate?: string | null;
    applicationNote?: string | null;
    status: "PENDING" | "REJECTED";
    createdAt?: string;
  };
};

export type DashboardSummary = {
  salesToday: number;
  salesThisMonth: number;
  stockValue: number;
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
};
