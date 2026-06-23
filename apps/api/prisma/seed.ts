import { PrismaClient } from "@prisma/client";
import { planCatalog } from "@zentory/shared";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const planData = (code: keyof typeof planCatalog) => {
    const plan = planCatalog[code];
    return {
      code: plan.code,
      name: plan.name,
      productLimit: plan.productLimit,
      userLimit: plan.userLimit,
      branchLimit: plan.branchLimit,
      warehouseLimit: plan.warehouseLimit,
      priceMonthly: plan.priceMonthly
    };
  };
  const starter = await prisma.subscriptionPlan.upsert({
    where: { code: "STARTER" },
    create: planData("STARTER"),
    update: planData("STARTER")
  });
  await prisma.subscriptionPlan.upsert({
    where: { code: "PROFESSIONAL" },
    create: planData("PROFESSIONAL"),
    update: planData("PROFESSIONAL")
  });
  await prisma.subscriptionPlan.upsert({
    where: { code: "MULTI_BRANCH" },
    create: planData("MULTI_BRANCH"),
    update: planData("MULTI_BRANCH")
  });
  await moveLegacyPlanLinks([
    { legacyCode: "FREE", targetCode: "STARTER", legacyName: "Legacy Free" },
    { legacyCode: "PRO", targetCode: "PROFESSIONAL", legacyName: "Legacy Pro" },
    { legacyCode: "PREMIUM", targetCode: "MULTI_BRANCH", legacyName: "Legacy Premium" }
  ]);

  const passwordHash = await bcrypt.hash("password123", 12);
  await prisma.user.upsert({
    where: { email: "admin@zentory.test" },
    create: { email: "admin@zentory.test", name: "Zentory Admin", passwordHash, isSystemAdmin: true },
    update: { isSystemAdmin: true }
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.test" },
    create: { email: "owner@demo.test", name: "เจ้าของร้าน Demo", passwordHash },
    update: {}
  });

  const business = await prisma.business.create({
    data: {
      name: "ร้าน Demo Market",
      province: "กรุงเทพมหานคร",
      businessType: "ร้านค้าปลีก",
      branches: {
        create: {
          name: "สาขาหลัก",
          code: "MAIN",
          status: "ACTIVE",
          isDefault: true
        }
      },
      subscription: { create: { planId: starter.id, paymentMode: "FREE" } },
      members: { create: { userId: owner.id, role: "OWNER" } }
    },
    include: { branches: true }
  });
  await prisma.warehouse.create({
    data: {
      businessId: business.id,
      branchId: business.branches[0].id,
      name: "หน้าร้าน",
      code: "WH-MAIN",
      type: "STORE_FRONT",
      status: "ACTIVE",
      isDefault: true
    }
  });
  await prisma.category.create({ data: { businessId: business.id, name: "เครื่องดื่ม", color: "#0f766e" } });
  console.log("Seeded admin@zentory.test and owner@demo.test with password password123");
}

async function moveLegacyPlanLinks(links: { legacyCode: string; targetCode: string; legacyName: string }[]) {
  for (const link of links) {
    const [legacyPlan, targetPlan] = await Promise.all([
      prisma.subscriptionPlan.findUnique({ where: { code: link.legacyCode } }),
      prisma.subscriptionPlan.findUnique({ where: { code: link.targetCode } })
    ]);
    if (!legacyPlan || !targetPlan || legacyPlan.id === targetPlan.id) continue;

    await prisma.businessSubscription.updateMany({
      where: { planId: legacyPlan.id },
      data: { planId: targetPlan.id }
    });
    await prisma.accountPaymentRequest.updateMany({
      where: { planId: legacyPlan.id },
      data: { planId: targetPlan.id, planCode: targetPlan.code }
    });
    await prisma.subscriptionPlan.update({
      where: { id: legacyPlan.id },
      data: { name: link.legacyName, isActive: false }
    });
  }
}

main().finally(async () => prisma.$disconnect());
