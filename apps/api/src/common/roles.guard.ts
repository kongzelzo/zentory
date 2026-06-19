import { CanActivate, ExecutionContext, ForbiddenException, Injectable, mixin, Type } from "@nestjs/common";
import { hasPermission, type Permission, type Role } from "@zentory/shared";
import { PrismaService } from "../prisma/prisma.service";

const rank: Record<string, number> = {
  VIEWER: 1,
  CASHIER: 2,
  STOCK_STAFF: 2,
  BRANCH_MANAGER: 3,
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

export function PermissionGuard(permission: Permission): Type<CanActivate> {
  @Injectable()
  class PermissionRoleGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{
        user?: { userId?: string; businessId?: string; role?: string; isSystemAdmin?: boolean; permissionOverrides?: unknown; assignedBranchIds?: string[] };
      }>();
      if (request.user?.isSystemAdmin) return true;
      if (!request.user?.userId || !request.user.businessId) throw new ForbiddenException(`Requires ${permission} permission`);

      const membership = await this.prisma.businessMember.findFirst({
        where: { userId: request.user.userId, businessId: request.user.businessId, status: "ACTIVE" },
        select: {
          role: true,
          permissionOverrides: true,
          branchAssignments: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } }
        }
      });
      if (!membership) throw new ForbiddenException(`Requires ${permission} permission`);

      request.user.role = membership.role;
      request.user.permissionOverrides = membership.permissionOverrides;
      request.user.assignedBranchIds = membership.role === "OWNER" ? [] : (membership.branchAssignments ?? []).map((assignment) => assignment.branchId);
      if (hasPermission(membership.role as Role, membership.permissionOverrides, permission)) return true;
      throw new ForbiddenException(`Requires ${permission} permission`);
    }
  }

  return mixin(PermissionRoleGuard);
}
