import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ProductDto, ProductVariantsDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";
import { MAX_PRODUCT_IMAGE_BYTES, ProductImageFile } from "./product-image-storage.service";

@Controller("products")
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(private readonly service: ZentoryService) {}

  @Get()
  @UseGuards(PermissionGuard("products.read"))
  list(@CurrentUser() user: CurrentUser, @Query("q") q?: string, @Query("status") status?: string, @Query("branchId") branchId?: string) {
    return this.service.listProducts(user, q, status, branchId);
  }

  @Post()
  @UseGuards(PermissionGuard("products.create"))
  create(@CurrentUser() user: CurrentUser, @Body() dto: ProductDto) {
    return this.service.createProduct(user, dto);
  }

  @Post("variants")
  @UseGuards(PermissionGuard("products.create"))
  createVariants(@CurrentUser() user: CurrentUser, @Body() dto: ProductVariantsDto) {
    return this.service.createProductVariants(user, dto);
  }

  @Get(":id")
  @UseGuards(PermissionGuard("products.read"))
  get(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Query("branchId") branchId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.service.getProduct(user, id, { branchId, warehouseId });
  }

  @Patch(":id")
  @UseGuards(PermissionGuard("products.update"))
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: Partial<ProductDto>) {
    return this.service.updateProduct(user, id, dto);
  }

  @Post(":id/image")
  @UseGuards(PermissionGuard("products.update"))
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES } }))
  updateImage(@CurrentUser() user: CurrentUser, @Param("id") id: string, @UploadedFile() file: ProductImageFile) {
    return this.service.updateProductImage(user, id, file);
  }

  @Delete(":id/image")
  @UseGuards(PermissionGuard("products.update"))
  deleteImage(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.deleteProductImage(user, id);
  }

  @Patch(":id/archive")
  @UseGuards(PermissionGuard("products.archive"))
  archive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.service.archiveProduct(user, id);
  }

  @Patch(":id/pause")
  @UseGuards(PermissionGuard("products.update"))
  pause(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Query("branchId") branchId?: string) {
    return this.service.pauseProduct(user, id, branchId);
  }

  @Patch(":id/discontinue")
  @UseGuards(PermissionGuard("products.archive"))
  discontinue(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Query("branchId") branchId?: string) {
    return this.service.discontinueProduct(user, id, branchId);
  }

  @Patch(":id/reactivate")
  @UseGuards(PermissionGuard("products.update"))
  reactivate(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Query("branchId") branchId?: string) {
    return this.service.reactivateProduct(user, id, branchId);
  }
}
