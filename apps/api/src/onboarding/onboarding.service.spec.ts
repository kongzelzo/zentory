import { ZentoryService } from "../zentory.service";

const user = { userId: "user_1", businessId: "business_1", role: "OWNER", email: "owner@example.com", isSystemAdmin: false };

describe("ZentoryService onboarding status", () => {
  it("derives progress from business setup, products, stock, sales, and first report", async () => {
    const prisma: any = {
      business: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "business_1",
          name: "ร้านก้องมาร์ท",
          province: "กรุงเทพฯ",
          businessType: "ร้านขายของชำ",
          onboardingProgress: { firstReport: true },
          onboardingCompleted: false
        }),
        update: jest.fn().mockResolvedValue({})
      },
      product: { findMany: jest.fn().mockResolvedValue([{ id: "product_1", status: "ACTIVE", balances: [] }]) },
      stockMovement: { count: jest.fn().mockResolvedValue(1) },
      sale: { count: jest.fn().mockResolvedValue(1) }
    };
    const service = new ZentoryService(prisma);

    await expect(service.onboardingStatus(user)).resolves.toMatchObject({
      completedSteps: 5,
      totalSteps: 5,
      percent: 100,
      completed: true,
      steps: {
        setupStore: true,
        firstProduct: true,
        stockIn: true,
        firstSale: true,
        firstReport: true
      }
    });
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "business_1" },
      data: expect.objectContaining({ onboardingCompleted: true })
    });
  });
});
