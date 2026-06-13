import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZentoryService } from "../zentory.service";

@Controller("onboarding")
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly service: ZentoryService) {}

  @Get("status")
  status(@CurrentUser() user: CurrentUser) {
    return this.service.onboardingStatus(user);
  }

  @Post("sample-data")
  sampleData(@CurrentUser() user: CurrentUser) {
    return this.service.createSampleData(user);
  }

  @Post("report-viewed")
  reportViewed(@CurrentUser() user: CurrentUser) {
    return this.service.markFirstReportViewed(user);
  }
}
