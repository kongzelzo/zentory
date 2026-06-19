import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { MemberApprovalDto, MemberBranchesDto, MemberPermissionsDto, MemberRoleDto, MemberStatusDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("members")
@UseGuards(AuthGuard, PermissionGuard("members.manage"))
export class MembersController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string) {
    return this.service.members(user, branchId);
  }

  @Patch(":id/role")
  role(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberRoleDto) {
    return this.service.updateMemberRole(user, id, dto.role as RoleName);
  }

  @Patch(":id/status")
  status(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberStatusDto) {
    return this.service.updateMemberStatus(user, id, dto.status);
  }

  @Patch(":id/permissions")
  permissions(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberPermissionsDto) {
    return this.service.updateMemberPermissions(user, id, dto.overrides);
  }

  @Patch(":id/branches")
  branches(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberBranchesDto) {
    return this.service.updateMemberBranches(user, id, dto.branchIds);
  }

  @Patch(":id/approve")
  approve(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: MemberApprovalDto) {
    return this.service.approveMemberRequest(user, id, dto);
  }

  @Patch(":id/reject")
  reject(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.rejectMemberRequest(user, id);
  }
}
