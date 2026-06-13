import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ProductDto } from "../common/dto";
import { AnyRoleGuard, MinRoleGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";
import { MAX_PRODUCT_IMAGE_BYTES, ProductImageFile } from "./product-image-storage.service";

@Controller("products")
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("q") q?: string, @Query("status") status?: string) {
    return this.service.listProducts(user, q, status);
  }

  @Post()
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: ProductDto) {
    return this.service.createProduct(user, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.getProduct(user, id);
  }

  @Patch(":id")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: Partial<ProductDto>) {
    return this.service.updateProduct(user, id, dto);
  }

  @Post(":id/image")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES } }))
  updateImage(@CurrentUser() user: CurrentUser, @Param("id") id: string, @UploadedFile() file: ProductImageFile) {
    return this.service.updateProductImage(user, id, file);
  }

  @Delete(":id/image")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  deleteImage(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.deleteProductImage(user, id);
  }

  @Patch(":id/archive")
  @UseGuards(MinRoleGuard("MANAGER"))
  archive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.archiveProduct(user, id);
  }

  @Patch(":id/pause")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  pause(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.pauseProduct(user, id);
  }

  @Patch(":id/discontinue")
  @UseGuards(MinRoleGuard("MANAGER"))
  discontinue(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.discontinueProduct(user, id);
  }

  @Patch(":id/reactivate")
  @UseGuards(AnyRoleGuard("OWNER", "MANAGER", "STOCK_STAFF"))
  reactivate(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.reactivateProduct(user, id);
  }
}
