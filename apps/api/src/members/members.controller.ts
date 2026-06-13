import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { MemberDto, MemberRoleDto, MemberStatusDto } from "../common/dto";
import { MinRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("members")
@UseGuards(AuthGuard, MinRoleGuard("OWNER"))
export class MembersController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.service.members(user);
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: MemberDto) {
    return this.service.createMember(user, dto);
  }

  @Patch(":id/role")
  role(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberRoleDto) {
    return this.service.updateMemberRole(user, id, dto.role as RoleName);
  }

  @Patch(":id/status")
  status(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberStatusDto) {
    return this.service.updateMemberStatus(user, id, dto.status);
  }
}
