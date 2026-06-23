import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { FreePlanSelectionDto, PlanLimitedSelectionDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("billing")
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly service: ZentoryService) {}

  @Get("plan-access")
  @UseGuards(PermissionGuard("subscription.manage"))
  planAccess(@CurrentUser() user: CurrentUser) {
    return this.service.billingPlanAccess(user);
  }

  @Patch("free-selection")
  @UseGuards(PermissionGuard("subscription.manage"))
  freeSelection(@CurrentUser() user: CurrentUser, @Body() dto: FreePlanSelectionDto) {
    return this.service.updateFreePlanSelection(user, dto);
  }

  @Patch("plan-limited-selection")
  @UseGuards(PermissionGuard("subscription.manage"))
  planLimitedSelection(@CurrentUser() user: CurrentUser, @Body() dto: PlanLimitedSelectionDto) {
    return this.service.updateFreePlanSelection(user, dto);
  }
}
