export const roles = ["OWNER", "MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"] as const;
export type Role = (typeof roles)[number];

export const paymentMethods = ["CASH", "TRANSFER"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const movementTypes = [
  "RECEIVE_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "SALE_OUT"
] as const;
export type MovementType = (typeof movementTypes)[number];

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    isSystemAdmin: boolean;
  };
  business?: {
    id: string;
    name: string;
    role: Role;
    province?: string | null;
    businessType?: string | null;
    branchCount?: string | null;
    onboardingCompleted?: boolean;
    onboardingProgress?: Record<string, boolean>;
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
