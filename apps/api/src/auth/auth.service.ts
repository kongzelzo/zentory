import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RoleName } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { BusinessDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { MailerService } from "./mailer.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("Email is already registered");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        phone: dto.phone,
        passwordHash
      },
      include: { memberships: { include: { business: true } } }
    });

    return this.issueSession(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueSession(user.id);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true };

    const token = randomBytes(32).toString("base64url");
    const passwordResetTokenHash = this.hashResetToken(token);
    const passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const webAppUrl = this.config.get("WEB_APP_URL", "http://localhost:5173").replace(/\/$/, "");
    const resetUrl = `${webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash, passwordResetExpiresAt }
    });

    await this.mailer.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl
    });

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: this.hashResetToken(dto.token),
        passwordResetExpiresAt: { gt: new Date() }
      }
    });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 12),
        refreshHash: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    });

    return { ok: true };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync<{ userId: string }>(refreshToken, {
      secret: this.config.get("JWT_REFRESH_SECRET", "dev-refresh-secret")
    });
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.refreshHash || !(await bcrypt.compare(refreshToken, user.refreshHash))) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return this.issueSession(user.id);
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshHash: null } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { business: true },
          take: 1
        }
      }
    });
    const membership = user.memberships[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSystemAdmin: user.isSystemAdmin,
      business: membership
        ? {
            id: membership.businessId,
            name: membership.business.name,
            role: membership.role,
            province: membership.business.province,
            businessType: membership.business.businessType,
            branchCount: membership.business.branchCount,
            onboardingCompleted: membership.business.onboardingCompleted,
            onboardingProgress: this.normalizeProgress(membership.business.onboardingProgress)
          }
        : undefined
    };
  }

  async createBusiness(userId: string, dto: BusinessDto) {
    if (!dto.name?.trim()) throw new BadRequestException("Store name is required");
    if (!dto.province?.trim()) throw new BadRequestException("Province is required");
    if (!dto.businessType?.trim()) throw new BadRequestException("Business type is required");

    const freePlan = await this.ensurePlans();
    await this.prisma.business.create({
      data: {
        name: dto.name.trim(),
        province: dto.province.trim(),
        businessType: dto.businessType.trim(),
        branchCount: dto.branchCount ?? "1",
        onboardingProgress: { setupStore: true },
        onboardingCompleted: false,
        branches: { create: { name: "หน้าร้านหลัก", code: "MAIN", type: "MAIN_WAREHOUSE", status: "ACTIVE", isDefault: true } },
        subscription: { create: { planId: freePlan.id } },
        members: { create: { userId, role: "OWNER" } }
      }
    });
    return this.issueSession(userId);
  }

  private async issueSession(userId: string) {
    const me = await this.me(userId);
    const payload = {
      userId: me.id,
      email: me.email,
      isSystemAdmin: me.isSystemAdmin,
      businessId: me.business?.id,
      role: me.business?.role
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get("JWT_ACCESS_SECRET", "dev-access-secret"),
        expiresIn: "15m"
      }),
      this.jwt.signAsync({ userId: me.id }, {
        secret: this.config.get("JWT_REFRESH_SECRET", "dev-refresh-secret"),
        expiresIn: "30d"
      })
    ]);
    await this.prisma.user.update({
      where: { id: me.id },
      data: { refreshHash: await bcrypt.hash(refreshToken, 12) }
    });
    return { accessToken, refreshToken, user: { id: me.id, name: me.name, email: me.email, isSystemAdmin: me.isSystemAdmin }, business: me.business };
  }

  private async ensurePlans() {
    const free = await this.prisma.subscriptionPlan.upsert({
      where: { code: "FREE" },
      create: { code: "FREE", name: "Free", productLimit: 30, userLimit: 1, branchLimit: 1, priceMonthly: 0 },
      update: {}
    });
    await this.prisma.subscriptionPlan.upsert({
      where: { code: "PRO" },
      create: { code: "PRO", name: "Pro", productLimit: 1000, userLimit: 5, branchLimit: 1, priceMonthly: 590 },
      update: {}
    });
    return free;
  }

  private hashResetToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private normalizeProgress(progress: unknown) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return {};
    return progress as Record<string, boolean>;
  }
}
