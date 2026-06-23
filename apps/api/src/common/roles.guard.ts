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

type RequestUser = {
  userId?: string;
  businessId?: string;
  role?: string;
  isSystemAdmin?: boolean;
  permissionOverrides?: unknown;
  assignedBranchIds?: string[];
};

async function refreshActiveMembership(prisma: PrismaService, user?: RequestUser) {
  if (!user?.userId || !user.businessId) throw new ForbiddenException("Active membership is required");
  const membership = await prisma.businessMember.findFirst({
    where: { userId: user.userId, businessId: user.businessId, status: "ACTIVE" },
    select: {
      role: true,
      permissionOverrides: true,
      branchAssignments: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } }
    }
  });
  if (!membership) throw new ForbiddenException("Active membership is required");
  user.role = membership.role;
  user.permissionOverrides = membership.permissionOverrides;
  user.assignedBranchIds = membership.role === "OWNER" ? [] : (membership.branchAssignments ?? []).map((assignment) => assignment.branchId);
  return membership;
}

export function MinRoleGuard(minRole: keyof typeof rank): Type<CanActivate> {
  @Injectable()
  class RoleGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
      if (request.user?.isSystemAdmin) return true;
      const membership = await refreshActiveMembership(this.prisma, request.user);
      if ((rank[membership.role] ?? 0) >= rank[minRole]) return true;
      throw new ForbiddenException(`Requires ${minRole} permission`);
    }
  }

  return mixin(RoleGuard);
}

export function AnyRoleGuard(...allowedRoles: Array<keyof typeof rank>): Type<CanActivate> {
  @Injectable()
  class RoleGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
      if (request.user?.isSystemAdmin) return true;
      const membership = await refreshActiveMembership(this.prisma, request.user);
      if (allowedRoles.includes(membership.role as keyof typeof rank)) return true;
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
      const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
      if (request.user?.isSystemAdmin) return true;
      const membership = await refreshActiveMembership(this.prisma, request.user);
      if (hasPermission(membership.role as Role, membership.permissionOverrides, permission)) return true;
      throw new ForbiddenException(`Requires ${permission} permission`);
    }
  }

  return mixin(PermissionRoleGuard);
}
