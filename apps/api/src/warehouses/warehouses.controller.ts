import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { WarehouseDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("warehouses")
@UseGuards(AuthGuard)
export class WarehousesController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  @UseGuards(PermissionGuard("inventory.read"))
  list(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("scope") scope?: string) {
    return this.service.listWarehouses(user, branchId, { scope });
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getWarehouse(user, id);
  }

  @Post()
  @UseGuards(PermissionGuard("warehouses.manage"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: WarehouseDto) {
    return this.service.createWarehouse(user, dto);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard("warehouses.manage"))
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: Partial<WarehouseDto>) {
    return this.service.updateWarehouse(user, id, dto);
  }

  @Delete(":id")
  @UseGuards(PermissionGuard("warehouses.manage"))
  remove(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.deleteWarehouse(user, id);
  }
}
