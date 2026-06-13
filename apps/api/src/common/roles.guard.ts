import { CanActivate, ExecutionContext, ForbiddenException, Injectable, mixin, Type } from "@nestjs/common";

const rank: Record<string, number> = {
  VIEWER: 1,
  CASHIER: 2,
  STOCK_STAFF: 2,
  MANAGER: 3,
  OWNER: 4
};

export function MinRoleGuard(minRole: keyof typeof rank): Type<CanActivate> {
  @Injectable()
  class RoleGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ user?: { role?: string; isSystemAdmin?: boolean } }>();
      if (request.user?.isSystemAdmin) return true;
      if ((rank[request.user?.role ?? ""] ?? 0) >= rank[minRole]) return true;
      throw new ForbiddenException(`Requires ${minRole} permission`);
    }
  }

  return mixin(RoleGuard);
}

export function AnyRoleGuard(...allowedRoles: Array<keyof typeof rank>): Type<CanActivate> {
  @Injectable()
  class RoleGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ user?: { role?: string; isSystemAdmin?: boolean } }>();
      if (request.user?.isSystemAdmin) return true;
      if (allowedRoles.includes(request.user?.role as keyof typeof rank)) return true;
      throw new ForbiddenException(`Requires one of: ${allowedRoles.join(", ")}`);
    }
  }

  return mixin(RoleGuard);
}
