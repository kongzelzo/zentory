import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { AdjustmentDto, ReceiptDto } from "../common/dto";
import { AnyRoleGuard, MinRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("inventory")
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly service: ZentoryService) {}

  @Get("balances")
  balances(@CurrentUser() user: CurrentUser) {
    return this.service.balances(user);
  }

  @Post("receipts")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  receive(@CurrentUser() user: CurrentUser, @Body() dto: ReceiptDto) {
    return this.service.receive(user, dto);
  }

  @Post("adjustments")
  @UseGuards(MinRoleGuard("MANAGER"))
  adjust(@CurrentUser() user: CurrentUser, @Body() dto: AdjustmentDto) {
    return this.service.adjust(user, dto);
  }

  @Get("movements")
  movements(@CurrentUser() user: CurrentUser) {
    return this.service.movements(user);
  }
}
