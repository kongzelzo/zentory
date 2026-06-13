import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { SubscriptionDto } from "../common/dto";
import { ZentoryService } from "../zentory.service";

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly service: ZentoryService) {}

  @Get("businesses")
  businesses(@CurrentUser() user: CurrentUser) {
    return this.service.adminBusinesses(user);
  }

  @Get("users")
  users(@CurrentUser() user: CurrentUser) {
    return this.service.adminUsers(user);
  }

  @Get("subscriptions")
  subscriptions(@CurrentUser() user: CurrentUser) {
    return this.service.adminSubscriptions(user);
  }

  @Patch("businesses/:id/subscription")
  updateSubscription(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: SubscriptionDto) {
    return this.service.updateSubscription(user, id, dto.planCode);
  }
}
