import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "../common/auth.guard";
import { PaymentsController } from "./payments.controller";

function context(role: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId: "user_1", businessId: "business_1", role }
      })
    })
  } as any;
}

describe("PaymentsController guards", () => {
  const prisma = {
    businessMember: {
      findFirst: jest.fn()
    }
  };

  beforeEach(() => {
    prisma.businessMember.findFirst.mockReset();
  });

  function paymentPermissionGuard(methodName: "portal" | "cancelAtPeriodEnd") {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PaymentsController.prototype[methodName]) as any[] | undefined;
    expect(guards?.[0]).toBe(AuthGuard);
    expect(guards?.[1]).toBeDefined();
    return guards![1];
  }

  it.each(["portal", "cancelAtPeriodEnd"] as const)("requires subscription.manage before %s", async (methodName) => {
    const Guard = paymentPermissionGuard(methodName);

    prisma.businessMember.findFirst.mockResolvedValueOnce({ role: "OWNER", permissionOverrides: {}, branchAssignments: [] });
    await expect(new Guard(prisma).canActivate(context("OWNER"))).resolves.toBe(true);

    prisma.businessMember.findFirst.mockResolvedValueOnce({ role: "MANAGER", permissionOverrides: {}, branchAssignments: [] });
    await expect(new Guard(prisma).canActivate(context("MANAGER"))).rejects.toThrow(ForbiddenException);
  });
});

describe("PaymentsController checkout confirmation", () => {
  it("confirms a returned Stripe checkout session for the signed-in account", async () => {
    const service = {
      confirmStripeCheckoutSession: jest.fn().mockResolvedValue({ status: "PAID" })
    };
    const controller = new PaymentsController(service as any, { get: jest.fn() } as any);
    const user = { userId: "user_1", businessId: "business_1", role: "OWNER" } as any;

    await expect(controller.confirmCheckout(user, { sessionId: "cs_test_123", reference: "ZT-123" })).resolves.toEqual({ status: "PAID" });

    expect(service.confirmStripeCheckoutSession).toHaveBeenCalledWith(user, { sessionId: "cs_test_123", reference: "ZT-123" });
  });
});
