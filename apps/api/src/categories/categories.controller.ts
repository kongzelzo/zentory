import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { CategoryDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("categories")
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  @UseGuards(PermissionGuard("products.read"))
  list(@CurrentUser() user: CurrentUser, @Query("branchId") branchId?: string) {
    return this.service.listCategories(user, branchId);
  }

  @Post()
  @UseGuards(PermissionGuard("products.update"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: CategoryDto) {
    return this.service.createCategory(user, dto);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard("products.update"))
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: Partial<CategoryDto>) {
    return this.service.updateCategory(user, id, dto);
  }

  @Delete(":id")
  @UseGuards(PermissionGuard("products.update"))
  remove(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.deleteCategory(user, id);
  }
}
