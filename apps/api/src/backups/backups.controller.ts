import { Controller, Get, Param, Post, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { BackupService } from "./backup.service";

@Controller("backups")
@UseGuards(AuthGuard)
export class BackupsController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.backups.list(user);
  }

  @Post()
  create(@CurrentUser() user: CurrentUser) {
    return this.backups.createManual(user);
  }

  @Get(":id/download")
  async download(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Res({ passthrough: true }) response: any) {
    const file = await this.backups.download(user, id);
    response.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.fileName}"`
    });
    return new StreamableFile(file.stream);
  }
}
