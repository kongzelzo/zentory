import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("status") status?: string, @Query("type") type?: string, @Query("branchId") branchId?: string, @Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.notifications.list(user, { status, type, branchId, limit, cursor });
  }

  @Get("summary")
  summary(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string) {
    return this.notifications.summary(user, { branchId });
  }

  @Get("audit")
  audit(@CurrentUser() user: CurrentUser, @Query("type") type?: string, @Query("branchId") branchId?: string, @Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.notifications.audit(user, { type, branchId, limit, cursor });
  }

  @Patch("read-all")
  readAll(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string) {
    return this.notifications.markAllRead(user, { branchId });
  }

  @Patch(":id/read")
  read(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }

  @Patch(":id/archive")
  archive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.notifications.archive(user, id);
  }
}
