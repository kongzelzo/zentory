import { resolveEffectivePermissions, type AuthSession, type Permission, type Role } from "@zentory/shared";
import { shouldShowProfileSetup } from "./onboarding";

type RoutePolicy =
  | { kind: "permission"; permission: Permission }
  | { kind: "systemAdminOnly" }
  | { kind: "ownerOrSystemAdminOnly" }
  | { kind: "branchSettings" }
  | { kind: "roles"; roles: Role[] };

type RouteAccessRule = {
  matches: (pathname: string) => boolean;
  policy: RoutePolicy;
};

function exact(path: string) {
  return (pathname: string) => pathname === path;
}

function under(path: string) {
  return (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);
}

function pattern(regex: RegExp) {
  return (pathname: string) => regex.test(pathname);
}

const routeAccessRules: RouteAccessRule[] = [
  { matches: under("/admin"), policy: { kind: "systemAdminOnly" } },
  { matches: exact("/app/products/new"), policy: { kind: "ownerOrSystemAdminOnly" } },
  { matches: pattern(/^\/app\/products\/[^/]+\/edit$/), policy: { kind: "ownerOrSystemAdminOnly" } },
  { matches: under("/app/dashboard"), policy: { kind: "permission", permission: "reports.dashboard.read" } },
  { matches: exact("/app/reports/stock"), policy: { kind: "permission", permission: "reports.stock.read" } },
  { matches: exact("/app/pos"), policy: { kind: "permission", permission: "sales.create" } },
  { matches: exact("/app/pos/payment"), policy: { kind: "permission", permission: "sales.create" } },
  { matches: under("/app/sales"), policy: { kind: "permission", permission: "sales.read" } },
  { matches: exact("/app/reports/sales"), policy: { kind: "permission", permission: "sales.read" } },
  { matches: under("/app/products"), policy: { kind: "permission", permission: "products.read" } },
  { matches: exact("/app/categories"), policy: { kind: "permission", permission: "products.read" } },
  { matches: exact("/app/inventory/receipts"), policy: { kind: "permission", permission: "inventory.receive" } },
  { matches: exact("/app/inventory/adjustments"), policy: { kind: "permission", permission: "inventory.adjust" } },
  { matches: exact("/app/inventory/movements"), policy: { kind: "permission", permission: "inventory.movements.read" } },
  { matches: exact("/app/stock-search"), policy: { kind: "permission", permission: "inventory.read" } },
  { matches: exact("/app/transfers"), policy: { kind: "permission", permission: "inventory.read" } },
  { matches: exact("/app/transfers/requests"), policy: { kind: "roles", roles: ["OWNER", "MANAGER", "BRANCH_MANAGER"] } },
  { matches: exact("/app/stock-counts"), policy: { kind: "permission", permission: "inventory.read" } },
  { matches: under("/app/warehouses"), policy: { kind: "permission", permission: "warehouses.manage" } },
  { matches: under("/app/branches"), policy: { kind: "ownerOrSystemAdminOnly" } },
  { matches: exact("/app/branch-settings"), policy: { kind: "branchSettings" } },
  { matches: exact("/app/settings"), policy: { kind: "permission", permission: "business.update" } },
  { matches: exact("/app/billing"), policy: { kind: "permission", permission: "subscription.manage" } },
  { matches: exact("/app/profile/billing"), policy: { kind: "permission", permission: "subscription.manage" } }
];

function hasSessionPermission(session: AuthSession, permission: Permission) {
  if (session.user.isSystemAdmin) return true;
  if (!session.business) return false;
  const permissions = session.business.effectivePermissions ?? resolveEffectivePermissions(session.business.role);
  return permissions[permission];
}

function canManageProductMaster(session: AuthSession) {
  return Boolean(session.user.isSystemAdmin || session.business?.role === "OWNER");
}

function canAccessRoute(session: AuthSession, policy: RoutePolicy) {
  if (policy.kind === "systemAdminOnly") return session.user.isSystemAdmin;
  if (policy.kind === "ownerOrSystemAdminOnly") return canManageProductMaster(session);
  if (policy.kind === "branchSettings") return Boolean(session.user.isSystemAdmin || (session.business?.role && ["OWNER", "BRANCH_MANAGER"].includes(session.business.role)) || hasSessionPermission(session, "members.manage"));
  if (policy.kind === "roles") return Boolean(session.user.isSystemAdmin || (session.business?.role && policy.roles.includes(session.business.role)));
  return hasSessionPermission(session, policy.permission);
}

function getRoutePolicy(pathname: string) {
  return routeAccessRules.find((rule) => rule.matches(pathname))?.policy;
}

function getPermissionFallback(session: AuthSession) {
  return hasSessionPermission(session, "reports.dashboard.read") ? "/app/dashboard" : "/app/profile";
}

export function getProtectedRouteRedirect(pathname: string, session?: AuthSession) {
  if (!session) return "/login";
  const policy = getRoutePolicy(pathname);
  if (policy?.kind === "systemAdminOnly") return canAccessRoute(session, policy) ? undefined : getPermissionFallback(session);
  const publicSetupPaths = new Set(["/account-setup", "/join-or-create", "/join-store", "/setup-store"]);
  if (!session.business) {
    if (session.membershipRequest?.status === "PENDING" && pathname !== "/join-request/pending") return "/join-request/pending";
    if (session.membershipRequest?.status === "REJECTED" && pathname !== "/join-request/rejected" && !publicSetupPaths.has(pathname)) return "/join-request/rejected";
    if (!session.membershipRequest && shouldShowProfileSetup(session) && pathname !== "/account-setup") return "/account-setup";
    if (!session.membershipRequest && !publicSetupPaths.has(pathname)) return "/join-or-create";
  }
  if (policy && !canAccessRoute(session, policy)) return getPermissionFallback(session);
  return undefined;
}
