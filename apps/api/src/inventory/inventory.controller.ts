import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { AdjustmentDto, ReceiptDto, StockCountCreateDto, StockCountItemsUpdateDto, TransferDto } from "../common/dto";
import { MinRoleGuard, PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("inventory")
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly service: ZentoryService) {}

  @Get("balances")
  @UseGuards(PermissionGuard("inventory.read"))
  balances(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.balances(user, { branchId, warehouseId });
  }

  @Get("search")
  @UseGuards(PermissionGuard("inventory.read"))
  search(@CurrentUser() user: CurrentUser, @Query("q") q?: string, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.searchInventory(user, q, { branchId, warehouseId });
  }

  @Post("receipts")
  @UseGuards(PermissionGuard("inventory.receive"))
  receive(@CurrentUser() user: CurrentUser, @Body() dto: ReceiptDto) {
    return this.service.receive(user, dto);
  }

  @Post("adjustments")
  @UseGuards(PermissionGuard("inventory.adjust"))
  adjust(@CurrentUser() user: CurrentUser, @Body() dto: AdjustmentDto) {
    return this.service.adjust(user, dto);
  }

  @Get("stock-counts")
  @UseGuards(PermissionGuard("inventory.read"))
  stockCounts(@CurrentUser() user: CurrentUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.listStockCounts(user, { warehouseId });
  }

  @Post("stock-counts")
  @UseGuards(PermissionGuard("inventory.adjust"))
  createStockCount(@CurrentUser() user: CurrentUser, @Body() dto: StockCountCreateDto) {
    return this.service.createStockCount(user, dto);
  }

  @Get("stock-counts/:id")
  @UseGuards(PermissionGuard("inventory.read"))
  stockCount(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getStockCount(user, id);
  }

  @Patch("stock-counts/:id/items")
  @UseGuards(PermissionGuard("inventory.adjust"))
  updateStockCountItems(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: StockCountItemsUpdateDto) {
    return this.service.updateStockCountItems(user, id, dto);
  }

  @Patch("stock-counts/:id/review")
  @UseGuards(PermissionGuard("inventory.adjust"))
  reviewStockCount(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.reviewStockCount(user, id);
  }

  @Post("stock-counts/:id/apply")
  @UseGuards(PermissionGuard("inventory.adjust"))
  applyStockCount(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.applyStockCount(user, id);
  }

  @Patch("stock-counts/:id/cancel")
  @UseGuards(PermissionGuard("inventory.adjust"))
  cancelStockCount(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.cancelStockCount(user, id);
  }

  @Get("transfers")
  @UseGuards(PermissionGuard("inventory.read"))
  transfers(@CurrentUser() user: CurrentUser, @Query("status") status?: string, @Query("warehouseId") warehouseId?: string, @Query("branchId") branchId?: string, @Query("side") side?: string) {
    return this.service.listTransfers(user, { status, warehouseId, branchId, side });
  }

  @Get("transfers/:id")
  @UseGuards(PermissionGuard("inventory.read"))
  transfer(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getTransfer(user, id);
  }

  @Post("transfers")
  @UseGuards(PermissionGuard("inventory.read"))
  createTransfer(@CurrentUser() user: CurrentUser, @Body() dto: TransferDto) {
    return this.service.createTransfer(user, dto);
  }

  @Patch("transfers/:id/source-approve")
  @UseGuards(MinRoleGuard("MANAGER"))
  approveTransferSource(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.approveTransferSource(user, id);
  }

  @Patch("transfers/:id/source-reject")
  @UseGuards(MinRoleGuard("MANAGER"))
  rejectTransferSource(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.rejectTransferSource(user, id);
  }

  @Patch("transfers/:id/receive")
  @UseGuards(MinRoleGuard("MANAGER"))
  receiveTransfer(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.receiveTransfer(user, id);
  }

  @Patch("transfers/:id/cancel")
  @UseGuards(MinRoleGuard("MANAGER"))
  cancelTransfer(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.cancelTransfer(user, id);
  }

  @Get("movements")
  @UseGuards(PermissionGuard("inventory.movements.read"))
  movements(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.movements(user, { branchId, warehouseId });
  }
}
