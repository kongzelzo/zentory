import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";
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

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class BusinessDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() branchCount?: string;
  @IsOptional() @IsString() setupMode?: string;
}

export class BranchDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) code!: string;
  @IsOptional() @IsEnum(["MAIN_WAREHOUSE", "STORE_FRONT", "BRANCH", "SECONDARY_WAREHOUSE"]) type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH" | "SECONDARY_WAREHOUSE";
  @IsOptional() @IsEnum(["ACTIVE", "INACTIVE"]) status?: "ACTIVE" | "INACTIVE";
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() note?: string;
}

export class ProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() categoryName?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) costPrice!: number;
  @IsNumber() @Min(0) salePrice!: number;
  @IsInt() @Min(0) minStock!: number;
  @IsOptional() @IsEnum(["ACTIVE", "PAUSED", "DISCONTINUED"]) status?: "ACTIVE" | "PAUSED" | "DISCONTINUED";
  @IsOptional() @IsInt() @Min(0) initialStock?: number;
}

export class ReceiptItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsNumber() @Min(0) unitCost!: number;
}

export class ReceiptDto {
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiptItemDto) items!: ReceiptItemDto[];
}

export class AdjustmentDto {
  @IsString() productId!: string;
  @IsInt() quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
}

export class SaleItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class SaleDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items!: SaleItemDto[];
  @IsNumber() @Min(0) discount!: number;
  @IsEnum(["CASH", "TRANSFER"]) paymentMethod!: "CASH" | "TRANSFER";
}

export class MemberDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(["MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"]) role!: "MANAGER" | "CASHIER" | "STOCK_STAFF" | "VIEWER";
}

export class MemberRoleDto {
  @IsEnum(["MANAGER", "CASHIER", "STOCK_STAFF", "VIEWER"]) role!: "MANAGER" | "CASHIER" | "STOCK_STAFF" | "VIEWER";
}

export class MemberStatusDto {
  @IsEnum(["ACTIVE", "DISABLED"]) status!: "ACTIVE" | "DISABLED";
}

export class SubscriptionDto {
  @IsString() planCode!: string;
}
