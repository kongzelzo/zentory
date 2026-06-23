import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditLogQueryDto } from "../common/dto";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZentoryService } from "../zentory.service";

@Controller("audit-logs")
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query() query: AuditLogQueryDto) {
    return this.service.listAuditLogs(user, query);
  }
}
