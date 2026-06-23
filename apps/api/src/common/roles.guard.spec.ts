import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { resolveEffectivePermissions } from "@zentory/shared";
import { AnyRoleGuard, MinRoleGuard, PermissionGuard } from "./roles.guard";

function context(role: string, isSystemAdmin = false, permissionOverrides?: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId: "user_1", businessId: "business_1", role, isSystemAdmin, permissionOverrides } })
    })
  } as unknown as ExecutionContext;
}

describe("MinRoleGuard", () => {
  const prisma = {
    businessMember: {
      findFirst: jest.fn()
    }
  };

  beforeEach(() => {
    prisma.businessMember.findFirst.mockReset();
  });

  it("allows higher ranked roles from the active membership", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "OWNER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = MinRoleGuard("STOCK_STAFF");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).resolves.toBe(true);
  });

  it("allows system admins", async () => {
    const Guard = MinRoleGuard("OWNER");
    await expect(new (Guard as any)(prisma).canActivate(context("VIEWER", true))).resolves.toBe(true);
    expect(prisma.businessMember.findFirst).not.toHaveBeenCalled();
  });

  it("blocks lower ranked active membership roles", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = MinRoleGuard("MANAGER");
    await expect(new (Guard as any)(prisma).canActivate(context("MANAGER"))).rejects.toThrow(ForbiddenException);
  });

  it("blocks cashiers from stock staff capabilities", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).rejects.toThrow(ForbiddenException);
  });

  it("allows cashiers to sell", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = AnyRoleGuard("OWNER", "MANAGER", "CASHIER");
    await expect(new (Guard as any)(prisma).canActivate(context("VIEWER"))).resolves.toBe(true);
  });

  it("refreshes assigned branches from the active membership", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({
      role: "BRANCH_MANAGER",
      permissionOverrides: {},
      branchAssignments: [{ branchId: "branch_fresh" }]
    });
    const request = { user: { userId: "user_1", businessId: "business_1", role: "BRANCH_MANAGER", assignedBranchIds: ["branch_stale"] } };
    const staleContext = {
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext;
    const Guard = MinRoleGuard("MANAGER");
    await expect(new (Guard as any)(prisma).canActivate(staleContext)).resolves.toBe(true);
    expect(request.user.assignedBranchIds).toEqual(["branch_fresh"]);
  });
});

describe("permission resolver", () => {
  it("applies role defaults", () => {
    expect(resolveEffectivePermissions("CASHIER")["sales.create"]).toBe(true);
    expect(resolveEffectivePermissions("CASHIER")["inventory.adjust"]).toBe(false);
    expect(resolveEffectivePermissions("STOCK_STAFF")["inventory.adjust"]).toBe(true);
    expect(resolveEffectivePermissions("BRANCH_MANAGER")["inventory.adjust"]).toBe(true);
    expect(resolveEffectivePermissions("BRANCH_MANAGER")["warehouses.manage"]).toBe(true);
    expect(resolveEffectivePermissions("BRANCH_MANAGER")["branches.manage"]).toBe(false);
    expect(resolveEffectivePermissions("BRANCH_MANAGER")["members.manage"]).toBe(false);
  });

  it("allows overrides to grant and remove permissions", () => {
    const effective = resolveEffectivePermissions("CASHIER", {
      "reports.sales.read": true,
      "sales.create": false
    });
    expect(effective["reports.sales.read"]).toBe(true);
    expect(effective["sales.create"]).toBe(false);
  });
});

describe("PermissionGuard", () => {
  const prisma = {
    businessMember: {
      findFirst: jest.fn()
    }
  };

  beforeEach(() => {
    prisma.businessMember.findFirst.mockReset();
  });

  it("allows system admins", async () => {
    const Guard = PermissionGuard("inventory.adjust");
    await expect(new (Guard as any)(prisma).canActivate(context("VIEWER", true))).resolves.toBe(true);
  });

  it("allows users with an override grant", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: { "inventory.adjust": true }, branchAssignments: [] });
    const Guard = PermissionGuard("inventory.adjust");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).resolves.toBe(true);
  });

  it("blocks users without permission", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = PermissionGuard("inventory.adjust");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).rejects.toThrow(ForbiddenException);
  });

  it("blocks dashboard goal updates for roles without business update permission", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "MANAGER", permissionOverrides: {}, branchAssignments: [] });
    const Guard = PermissionGuard("business.update");
    await expect(new (Guard as any)(prisma).canActivate(context("MANAGER"))).rejects.toThrow(ForbiddenException);
  });
});
