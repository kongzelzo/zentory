import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { basename, extname, join } from "path";

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProductImageFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class ProductImageStorageService {
  private readonly uploadRoot = join(process.cwd(), "uploads", "products");

  async saveProductImage(file: ProductImageFile) {
    this.validate(file);
    await mkdir(this.uploadRoot, { recursive: true });
    const filename = `${randomUUID()}${this.extensionFor(file)}`;
    await writeFile(join(this.uploadRoot, filename), file.buffer);
    return `/uploads/products/${filename}`;
  }

  async deleteProductImage(imagePath?: string | null) {
    if (!imagePath?.startsWith("/uploads/products/")) return;
    const filename = basename(imagePath);
    await rm(join(this.uploadRoot, filename), { force: true });
  }

  validate(file?: ProductImageFile | null) {
    if (!file) throw new BadRequestException("กรุณาเลือกรูปสินค้า");
    if (!PRODUCT_IMAGE_MIME_TYPES.has(file.mimetype)) throw new BadRequestException("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP");
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw new BadRequestException("ขนาดรูปสินค้าต้องไม่เกิน 5MB");
  }

  private extensionFor(file: ProductImageFile) {
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    if (file.mimetype === "image/webp") return ".webp";
    const extension = extname(file.originalname).toLowerCase();
    return extension || ".jpg";
  }
}
