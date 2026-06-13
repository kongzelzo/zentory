import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZentoryService } from "../zentory.service";

@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly service: ZentoryService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: CurrentUser) {
    return this.service.dashboard(user);
  }

  @Get("stock")
  stock(@CurrentUser() user: CurrentUser) {
    return this.service.stockReport(user);
  }

  @Get("sales")
  sales(@CurrentUser() user: CurrentUser) {
    return this.service.salesReport(user);
  }
}
