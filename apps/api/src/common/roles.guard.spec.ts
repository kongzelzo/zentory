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
  it("allows higher ranked roles", () => {
    const Guard = MinRoleGuard("STOCK_STAFF");
    expect(new Guard().canActivate(context("OWNER"))).toBe(true);
  });

  it("allows system admins", () => {
    const Guard = MinRoleGuard("OWNER");
    expect(new Guard().canActivate(context("VIEWER", true))).toBe(true);
  });

  it("blocks lower ranked roles", () => {
    const Guard = MinRoleGuard("MANAGER");
    expect(() => new Guard().canActivate(context("CASHIER"))).toThrow(ForbiddenException);
  });

  it("blocks cashiers from stock staff capabilities", () => {
    const Guard = AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF");
    expect(() => new Guard().canActivate(context("CASHIER"))).toThrow(ForbiddenException);
  });

  it("allows cashiers to sell", () => {
    const Guard = AnyRoleGuard("OWNER", "MANAGER", "CASHIER");
    expect(new Guard().canActivate(context("CASHIER"))).toBe(true);
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
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: { "inventory.adjust": true } });
    const Guard = PermissionGuard("inventory.adjust");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).resolves.toBe(true);
  });

  it("blocks users without permission", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "CASHIER", permissionOverrides: {} });
    const Guard = PermissionGuard("inventory.adjust");
    await expect(new (Guard as any)(prisma).canActivate(context("CASHIER"))).rejects.toThrow(ForbiddenException);
  });

  it("blocks dashboard goal updates for roles without business update permission", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({ role: "MANAGER", permissionOverrides: {} });
    const Guard = PermissionGuard("business.update");
    await expect(new (Guard as any)(prisma).canActivate(context("MANAGER"))).rejects.toThrow(ForbiddenException);
  });
});
