import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { BranchDto } from "../common/dto";
import { MinRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("branches")
@UseGuards(AuthGuard)
export class BranchesController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.service.listBranches(user);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getBranch(user, id);
  }

  @Post()
  @UseGuards(MinRoleGuard("MANAGER"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: BranchDto) {
    return this.service.createBranch(user, dto);
  }

  @Patch(":id")
  @UseGuards(MinRoleGuard("MANAGER"))
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: Partial<BranchDto>) {
    return this.service.updateBranch(user, id, dto);
  }
}
