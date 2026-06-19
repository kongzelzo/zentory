import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { resolve } from "path";
import { AdminController } from "./admin/admin.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { BranchesController } from "./branches/branches.controller";
import { MailerService } from "./auth/mailer.service";
import { BusinessController } from "./business/business.controller";
import { CategoriesController } from "./categories/categories.controller";
import { InventoryController } from "./inventory/inventory.controller";
import { MembersController } from "./members/members.controller";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { NotificationsController } from "./notifications/notifications.controller";
import { NotificationService } from "./notifications/notification.service";
import { PaymentsController } from "./payments/payments.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsController } from "./products/products.controller";
import { ProductImageStorageService } from "./products/product-image-storage.service";
import { ReportsController } from "./reports/reports.controller";
import { SalesController } from "./sales/sales.controller";
import { WarehousesController } from "./warehouses/warehouses.controller";
import { AuthGuard } from "./common/auth.guard";
import { ZentoryService } from "./zentory.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]
    }),
    JwtModule.register({}),
    PrismaModule
  ],
  controllers: [
    AuthController,
    BusinessController,
    CategoriesController,
    BranchesController,
    WarehousesController,
    ProductsController,
    InventoryController,
    SalesController,
    ReportsController,
    PaymentsController,
    OnboardingController,
    NotificationsController,
    MembersController,
    AdminController
  ],
  providers: [AuthService, MailerService, ZentoryService, NotificationService, ProductImageStorageService, AuthGuard]
})
export class AppModule {}
