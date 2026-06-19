import { resolveEffectivePermissions, type AuthSession, type Permission } from "@zentory/shared";

export function hasSessionPermission(session: AuthSession | undefined, permission: Permission) {
  if (session?.user.isSystemAdmin) return true;
  if (!session?.business) return false;
  const permissions = session.business.effectivePermissions ?? resolveEffectivePermissions(session.business.role);
  return permissions[permission];
}

export function canManageProductMaster(session: AuthSession | undefined) {
  return Boolean(session?.user.isSystemAdmin || session?.business?.role === "OWNER");
}
