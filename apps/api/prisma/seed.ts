import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const free = await prisma.subscriptionPlan.upsert({
    where: { code: "FREE" },
    create: { code: "FREE", name: "Free", productLimit: 30, userLimit: 1, branchLimit: 1, priceMonthly: 0 },
    update: {}
  });
  await prisma.subscriptionPlan.upsert({
    where: { code: "PRO" },
    create: { code: "PRO", name: "Pro", productLimit: 1000, userLimit: 5, branchLimit: 1, priceMonthly: 590 },
    update: {}
  });

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
      branches: { create: { name: "หน้าร้านหลัก", code: "MAIN", type: "MAIN_WAREHOUSE", status: "ACTIVE", isDefault: true } },
      subscription: { create: { planId: free.id } },
      members: { create: { userId: owner.id, role: "OWNER" } }
    },
    include: { branches: true }
  });
  await prisma.category.create({ data: { businessId: business.id, name: "เครื่องดื่ม", color: "#0f766e" } });
  console.log("Seeded admin@zentory.test and owner@demo.test with password password123");
}

main().finally(async () => prisma.$disconnect());
