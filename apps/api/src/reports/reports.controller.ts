import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { PermissionGuard } from "../common/roles.guard";
import { ExportQueryDto, SaleListQueryDto } from "../common/dto";
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
  sales(@CurrentUser() user: CurrentUser, @Query() query: SaleListQueryDto) {
    return this.service.salesReport(user, query);
  }

  @Get("profit-loss")
  @UseGuards(PermissionGuard("reports.sales.read"))
  profitLoss(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.profitLossReport(user, { branchId, warehouseId });
  }

  @Get("export.xls")
  @Header("Content-Type", "application/vnd.ms-excel; charset=utf-8")
  @Header("Content-Disposition", "attachment; filename=\"zentory-export.xls\"")
  @UseGuards(PermissionGuard("reports.sales.read"))
  exportExcel(@CurrentUser() user: CurrentUser, @Query() query: ExportQueryDto) {
    return this.service.exportExcel(user, query.type ?? "sales");
  }
}
