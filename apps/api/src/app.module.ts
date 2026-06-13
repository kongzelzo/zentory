import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AdminController } from "./admin/admin.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { BranchesController } from "./branches/branches.controller";
import { MailerService } from "./auth/mailer.service";
import { BusinessController } from "./business/business.controller";
import { InventoryController } from "./inventory/inventory.controller";
import { MembersController } from "./members/members.controller";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsController } from "./products/products.controller";
import { ProductImageStorageService } from "./products/product-image-storage.service";
import { ReportsController } from "./reports/reports.controller";
import { SalesController } from "./sales/sales.controller";
import { AuthGuard } from "./common/auth.guard";
import { ZentoryService } from "./zentory.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({}), PrismaModule],
  controllers: [
    AuthController,
    BusinessController,
    BranchesController,
    ProductsController,
    InventoryController,
    SalesController,
    ReportsController,
    OnboardingController,
    MembersController,
    AdminController
  ],
  providers: [AuthService, MailerService, ZentoryService, ProductImageStorageService, AuthGuard]
})
export class AppModule {}
