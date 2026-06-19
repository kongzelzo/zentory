import { ArrayMinSize, IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class GoogleLoginDto {
  @IsString() credential!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}

export class ProfileDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() phone?: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class BusinessDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() branchCount?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== "") @IsEmail() email?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() receiptFooter?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() setupMode?: string;
}

export class DashboardGoalsDto {
  @IsOptional() @IsEnum(["ANNUAL", "MONTHLY", "DAILY"]) salesTargetMode?: "ANNUAL" | "MONTHLY" | "DAILY";
  @IsOptional() @IsNumber() @Min(0) annualSalesTarget?: number | null;
  @IsOptional() @IsNumber() @Min(0) dailySalesTarget?: number | null;
  @IsOptional() @IsNumber() @Min(0) monthlySalesTarget?: number | null;
}

export class BranchDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) code!: string;
  @IsOptional() @IsEnum(["ACTIVE", "INACTIVE"]) status?: "ACTIVE" | "INACTIVE";
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() note?: string;
}

export class WarehouseDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) code!: string;
  @IsString() branchId!: string;
  @IsOptional() @IsEnum(["MAIN_WAREHOUSE", "STORE_FRONT", "BRANCH_WAREHOUSE", "SECONDARY_WAREHOUSE"]) type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH_WAREHOUSE" | "SECONDARY_WAREHOUSE";
  @IsOptional() @IsEnum(["ACTIVE", "INACTIVE"]) status?: "ACTIVE" | "INACTIVE";
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() note?: string;
}

export class CategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() color?: string;
}

export class ProductReceiveNowDto {
  @IsString() @MinLength(1) warehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() note?: string;
}

export class ProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() categoryName?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) costPrice!: number;
  @IsNumber() @Min(0) salePrice!: number;
  @IsInt() @Min(0) minStock!: number;
  @IsOptional() @IsEnum(["ACTIVE", "PAUSED", "DISCONTINUED"]) status?: "ACTIVE" | "PAUSED" | "DISCONTINUED";
  @IsOptional() @IsInt() @Min(0) initialStock?: number;
  @IsOptional() @ValidateNested() @Type(() => ProductReceiveNowDto) receiveNow?: ProductReceiveNowDto;
}

export class ProductVariantRowDto {
  @IsString() @MinLength(1) color!: string;
  @IsString() @MinLength(1) size!: string;
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsInt() @Min(0) receiveQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) receiveUnitCost?: number;
}

export class ProductVariantsDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) skuPrefix!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsString() @MinLength(1) warehouseId!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) colors!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) sizes!: string[];
  @IsOptional() @IsString() categoryName?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) costPrice!: number;
  @IsNumber() @Min(0) salePrice!: number;
  @IsInt() @Min(0) minStock!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProductVariantRowDto) variants!: ProductVariantRowDto[];
  @IsOptional() @IsString() receiveSupplier?: string;
  @IsOptional() @IsString() receiveNote?: string;
}

export class ReceiptNewProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() categoryName?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) salePrice!: number;
  @IsInt() @Min(0) minStock!: number;
}

export class ReceiptItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @ValidateNested() @Type(() => ReceiptNewProductDto) newProduct?: ReceiptNewProductDto;
  @IsInt() @Min(1) quantity!: number;
  @IsNumber() @Min(0) unitCost!: number;
}

export class ReceiptDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiptItemDto) items!: ReceiptItemDto[];
}

export class AdjustmentDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsString() productId!: string;
  @IsInt() quantity!: number;
  @IsOptional() @IsEnum(["SET_ACTUAL", "INCREASE", "DECREASE"]) adjustmentMode?: "SET_ACTUAL" | "INCREASE" | "DECREASE";
  @IsOptional() @IsInt() @Min(0) targetQuantity?: number;
  @IsString() @IsNotEmpty() reason!: string;
}

export class StockCountCreateDto {
  @IsOptional() @IsString() branchId?: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() note?: string;
}

export class StockCountItemUpdateDto {
  @IsString() productId!: string;
  @IsOptional() @IsInt() @Min(0) countedQuantity?: number | null;
  @IsOptional() @IsString() note?: string;
}

export class StockCountItemsUpdateDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => StockCountItemUpdateDto) items!: StockCountItemUpdateDto[];
}

export class TransferItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class TransferDto {
  @IsString() sourceWarehouseId!: string;
  @IsString() destinationWarehouseId!: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TransferItemDto) items!: TransferItemDto[];
}

export class SaleItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class SaleDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items!: SaleItemDto[];
  @IsNumber() @Min(0) discount!: number;
  @IsEnum(["CASH", "TRANSFER"]) paymentMethod!: "CASH" | "TRANSFER";
}

export class SaleListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEnum(["CASH", "TRANSFER"]) paymentMethod?: "CASH" | "TRANSFER";
  @IsOptional() @IsEnum(["PAID", "VOID"]) status?: "PAID" | "VOID";
}

export class MembershipRequestDto {
  @IsString() @MinLength(1) businessId!: string;
  @IsOptional() @IsString() requestedBranchId?: string;
  @IsString() @MinLength(1) employeeName!: string;
  @IsOptional() @IsString() employeePhone?: string;
  @IsOptional() @IsString() preferredRole?: string;
  @IsOptional() @IsString() preferredBranch?: string;
  @IsOptional() @IsDateString() availableStartDate?: string;
  @IsOptional() @IsString() applicationNote?: string;
}

export class MemberRoleDto {
  @IsEnum(["MANAGER", "BRANCH_MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"]) role!: "MANAGER" | "BRANCH_MANAGER" | "CASHIER" | "STOCK_STAFF" | "VIEWER";
}

export class MemberStatusDto {
  @IsEnum(["ACTIVE", "DISABLED"]) status!: "ACTIVE" | "DISABLED";
}

export class MemberPermissionsDto {
  @IsObject() overrides!: Record<string, boolean>;
}

export class MemberBranchesDto {
  @IsArray() @IsString({ each: true }) branchIds!: string[];
}

export class MemberApprovalDto {
  @IsEnum(["MANAGER", "BRANCH_MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"]) role!: "MANAGER" | "BRANCH_MANAGER" | "CASHIER" | "STOCK_STAFF" | "VIEWER";
  @IsOptional() @IsArray() @IsString({ each: true }) branchIds?: string[];
  @IsOptional() @IsObject() overrides?: Record<string, boolean>;
}

export class SubscriptionDto {
  @IsString() planCode!: string;
}

export class CheckoutPaymentDto {
  @IsEnum(["PRO", "PREMIUM"]) planCode!: "PRO" | "PREMIUM";
  @IsOptional() @IsEnum(["monthly", "yearly"]) billingCycle?: "monthly" | "yearly";
  @IsOptional() @IsEnum(["subscription", "promptpay"]) checkoutMode?: "subscription" | "promptpay";
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() providerPaymentId?: string;
  @IsOptional() @IsString() checkoutUrl?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class PaymentWebhookDto {
  @IsString() reference!: string;
  @IsEnum(["PAID", "FAILED", "CANCELED"]) status!: "PAID" | "FAILED" | "CANCELED";
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() providerPaymentId?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
