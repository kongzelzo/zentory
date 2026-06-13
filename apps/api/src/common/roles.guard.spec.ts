import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AnyRoleGuard, MinRoleGuard } from "./roles.guard";

function context(role: string, isSystemAdmin = false) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { role, isSystemAdmin } })
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
