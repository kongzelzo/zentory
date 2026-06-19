import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { SaleDto, SaleListQueryDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("sales")
@UseGuards(AuthGuard)
export class SalesController {
  constructor(private readonly service: ZentoryService) {}

  @Post()
  @UseGuards(PermissionGuard("sales.create"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: SaleDto) {
    return this.service.createSale(user, dto);
  }

  @Get()
  @UseGuards(PermissionGuard("sales.read"))
  list(@CurrentUser() user: CurrentUser, @Query() query: SaleListQueryDto) {
    return this.service.listSales(user, query);
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", "attachment; filename=\"sales-history.csv\"")
  @UseGuards(PermissionGuard("sales.read"))
  export(@CurrentUser() user: CurrentUser, @Query() query: SaleListQueryDto) {
    return this.service.exportSalesCsv(user, query);
  }

  @Get(":id")
  @UseGuards(PermissionGuard("sales.read"))
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getSale(user, id);
  }
}
