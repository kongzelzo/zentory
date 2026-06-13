import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { BusinessDto } from "../common/dto";
import { MinRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("businesses")
@UseGuards(AuthGuard)
export class BusinessController {
  constructor(private readonly service: ZentoryService) {}

  @Get("current")
  current(@CurrentUser() user: CurrentUser) {
    return this.service.currentBusiness(user);
  }

  @Patch("current")
  @UseGuards(MinRoleGuard("OWNER"))
  update(@CurrentUser() user: CurrentUser, @Body() dto: Partial<BusinessDto>) {
    return this.service.updateBusiness(user, dto);
  }
}
