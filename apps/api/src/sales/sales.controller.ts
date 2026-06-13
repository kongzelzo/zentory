import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { SaleDto } from "../common/dto";
import { AnyRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("sales")
@UseGuards(AuthGuard)
export class SalesController {
  constructor(private readonly service: ZentoryService) {}

  @Post()
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "CASHIER"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: SaleDto) {
    return this.service.createSale(user, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.service.listSales(user);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getSale(user, id);
  }
}
