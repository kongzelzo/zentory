import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly service: ZentoryService) {}

  @Get("dashboard")
  @UseGuards(PermissionGuard("reports.dashboard.read"))
  dashboard(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string) {
    return this.service.dashboard(user, { branchId });
  }

  @Get("stock")
  @UseGuards(PermissionGuard("reports.stock.read"))
  stock(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.stockReport(user, { branchId, warehouseId });
  }

  @Get("stock/planning")
  @UseGuards(PermissionGuard("reports.stock.read"))
  stockPlanning(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.stockPlanningReport(user, { branchId, warehouseId });
  }

  @Get("sales")
  @UseGuards(PermissionGuard("reports.sales.read"))
  sales(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.salesReport(user, { branchId, warehouseId });
  }
}
