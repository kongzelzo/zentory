import { BadRequestException, ConflictException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RoleName } from "@prisma/client";
import { normalizePermissionOverrides, resolveEffectivePermissions, type Role } from "@zentory/shared";
import * as bcrypt from "bcryptjs";
import { createHash, createPublicKey, randomBytes, verify } from "crypto";
import { BusinessDto, ForgotPasswordDto, GoogleLoginDto, LoginDto, MembershipRequestDto, ProfileDto, RegisterDto, ResetPasswordDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notifications/notification.service";
import { MailerService } from "./mailer.service";

const noopAuthNotificationHooks = {
  createStaffRequestNotification: async () => undefined
} as unknown as NotificationService;

type GoogleIdTokenPayload = {
  aud: string | string[];
  exp: number;
  iss: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

type GoogleJwk = {
  kid: string;
  alg?: string;
  kty: string;
  n: string;
  e: string;
};

@Injectable()
export class AuthService {
  private googleJwks?: { expiresAt: number; keys: GoogleJwk[] };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    @Optional() private readonly notifications: NotificationService = noopAuthNotificationHooks
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
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueSession(user.id);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const profile = await this.verifyGoogleCredential(dto.credential);
    const email = profile.email?.toLowerCase();
    if (!email || !profile.email_verified) {
      throw new UnauthorizedException("Google account email is not verified");
    }

    const existingByGoogleSub = await this.prisma.user.findUnique({ where: { googleSub: profile.sub } });
    if (existingByGoogleSub) return this.issueSession(existingByGoogleSub.id);

    const existingByEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      if (existingByEmail.googleSub && existingByEmail.googleSub !== profile.sub) {
        throw new ConflictException("This email is already linked to another Google account");
      }
      const linkedUser = await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleSub: profile.sub }
      });
      return this.issueSession(linkedUser.id);
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: profile.name?.trim() || email.split("@")[0],
        googleSub: profile.sub
      }
    });
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
          where: { status: { in: ["ACTIVE", "PENDING", "REJECTED"] } },
          include: {
            business: true,
            requestedBranch: true,
            branchAssignments: { include: { branch: true } }
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }]
        }
      }
    });
    const membership = user.memberships.find((item) => item.status === "ACTIVE");
    const membershipRequest = membership ? undefined : user.memberships.find((item) => item.status === "PENDING" || item.status === "REJECTED");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
      authProviders: {
        password: Boolean(user.passwordHash),
        google: Boolean(user.googleSub)
      },
      isSystemAdmin: user.isSystemAdmin,
      business: membership
        ? {
            id: membership.businessId,
            name: membership.business.name,
            role: membership.role,
            effectivePermissions: resolveEffectivePermissions(membership.role as Role, normalizePermissionOverrides(membership.permissionOverrides)),
            province: membership.business.province,
            businessType: membership.business.businessType,
            branchCount: membership.business.branchCount,
            onboardingCompleted: membership.business.onboardingCompleted,
            onboardingProgress: this.normalizeProgress(membership.business.onboardingProgress),
            assignedBranchIds: membership.role === "OWNER"
              ? []
              : membership.branchAssignments.filter((assignment) => assignment.branch.status === "ACTIVE").map((assignment) => assignment.branchId)
          }
        : undefined,
      membershipRequest: membershipRequest
        ? {
            id: membershipRequest.id,
            businessId: membershipRequest.businessId,
            businessName: membershipRequest.business.name,
            employeeName: membershipRequest.employeeName,
            employeePhone: membershipRequest.employeePhone,
            preferredRole: membershipRequest.preferredRole,
            preferredBranch: membershipRequest.preferredBranch,
            requestedBranchId: membershipRequest.requestedBranchId,
            requestedBranch: membershipRequest.requestedBranch,
            availableStartDate: membershipRequest.availableStartDate,
            applicationNote: membershipRequest.applicationNote,
            status: membershipRequest.status,
            createdAt: membershipRequest.createdAt
          }
        : undefined
    };
  }

  async updateProfile(userId: string, dto: ProfileDto) {
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException("ชื่อต้องมีอย่างน้อย 2 ตัวอักษร");
    const phone = dto.phone?.trim() || null;

    await this.prisma.user.update({
      where: { id: userId },
      data: { name, phone }
    });

    return this.issueSession(userId);
  }

  async createBusiness(userId: string, dto: BusinessDto) {
    if (!dto.name?.trim()) throw new BadRequestException("Store name is required");
    if (!dto.province?.trim()) throw new BadRequestException("Province is required");
    if (!dto.businessType?.trim()) throw new BadRequestException("Business type is required");

    const freePlan = await this.ensurePlans();
    const business = await this.prisma.business.create({
      data: {
        name: dto.name.trim(),
        province: dto.province.trim(),
        businessType: dto.businessType.trim(),
        branchCount: dto.branchCount ?? "1",
        onboardingProgress: { setupStore: true },
        onboardingCompleted: false,
        branches: {
          create: {
            name: "สาขาหลัก",
            code: "MAIN",
            status: "ACTIVE",
            isDefault: true
          }
        },
        subscription: { create: { planId: freePlan.id } },
        members: { create: { userId, role: "OWNER" } }
      },
      include: { branches: true }
    });
    await this.prisma.warehouse.create({
      data: {
        businessId: business.id,
        branchId: business.branches[0].id,
        name: "หน้าร้าน",
        code: "WH-MAIN",
        type: "STORE_FRONT",
        status: "ACTIVE",
        isDefault: true
      }
    });
    return this.issueSession(userId);
  }

  async requestMembership(userId: string, dto: MembershipRequestDto) {
    const requestedBranchId = dto.requestedBranchId?.trim() || undefined;
    const employeeName = dto.employeeName.trim();
    if (!employeeName) throw new BadRequestException("กรุณากรอกชื่อพนักงาน");
    const employeePhone = dto.employeePhone?.trim() || null;
    if (!employeePhone) throw new BadRequestException("กรุณากรอกเบอร์โทร");
    const preferredRole = dto.preferredRole?.trim() || null;
    let preferredBranch = dto.preferredBranch?.trim() || null;
    const availableStartDate = dto.availableStartDate ? new Date(dto.availableStartDate) : null;
    const applicationNote = dto.applicationNote?.trim() || null;
    const target = await this.resolveMembershipTarget(dto.businessId, requestedBranchId);
    const business = target.business;
    const businessId = business.id;
    const defaultRequestedBranch = target.selectedBranch;
    if (defaultRequestedBranch) preferredBranch = defaultRequestedBranch.name;

    const activeMembership = await this.prisma.businessMember.findFirst({ where: { userId, status: "ACTIVE" } });
    if (activeMembership) throw new BadRequestException("บัญชีนี้มีร้านที่ใช้งานอยู่แล้ว");

    const pendingMembership = await this.prisma.businessMember.findFirst({ where: { userId, status: "PENDING" } });
    if (pendingMembership) return this.issueSession(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: employeeName,
        phone: employeePhone
      }
    });

    const applicationData = {
      employeeName,
      employeePhone,
      preferredRole,
      preferredBranch,
      requestedBranchId: defaultRequestedBranch?.id ?? null,
      availableStartDate,
      applicationNote
    };

    const existingForBusiness = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } }
    });
    if (existingForBusiness?.status === "REJECTED") {
      const member = await this.prisma.businessMember.update({
        where: { id: existingForBusiness.id },
        data: { status: "PENDING", role: "VIEWER", ...applicationData, permissionOverrides: {} }
      });
      await this.notifications.createStaffRequestNotification(businessId, member.id);
      return this.issueSession(userId);
    }
    if (existingForBusiness) throw new BadRequestException("บัญชีนี้มีคำขอกับร้านนี้อยู่แล้ว");

    const member = await this.prisma.businessMember.create({
      data: {
        businessId,
        userId,
        ...applicationData,
        role: "VIEWER",
        status: "PENDING",
        permissionOverrides: {}
      }
    });
    await this.notifications.createStaffRequestNotification(businessId, member.id);
    return this.issueSession(userId);
  }

  async membershipTarget(businessIdInput: string, branchIdInput?: string) {
    const target = await this.resolveMembershipTarget(businessIdInput, branchIdInput);
    return {
      businessId: target.business.id,
      businessName: target.business.name,
      branches: target.business.branches,
      selectedBranchId: target.selectedBranch?.id ?? null
    };
  }

  private async resolveMembershipTarget(uidInput: string, branchIdInput?: string) {
    const uid = uidInput.trim();
    const branchId = branchIdInput?.trim() || null;
    if (!uid) throw new BadRequestException("กรุณากรอก UID ร้านหรือสาขา");
    const business = await this.prisma.business.findUnique({
      where: { id: uid },
      select: {
        id: true,
        name: true,
        branches: {
          where: { status: "ACTIVE" },
          select: { id: true, name: true, code: true, isDefault: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
        }
      }
    });
    if (business) {
      const selectedBranch = branchId ? business.branches.find((branch) => branch.id === branchId) : business.branches.length === 1 ? business.branches[0] : null;
      if (branchId && !selectedBranch) throw new BadRequestException("ไม่พบสาขานี้ในร้าน หรือสาขาไม่พร้อมใช้งาน");
      return { business, selectedBranch };
    }
    if (branchId) throw new BadRequestException("ไม่พบร้านจาก UID นี้");
    const branch = await this.prisma.branch.findFirst({
      where: { id: uid, status: "ACTIVE" },
      select: {
        id: true,
        business: {
          select: {
            id: true,
            name: true,
            branches: {
              where: { status: "ACTIVE" },
              select: { id: true, name: true, code: true, isDefault: true },
              orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
            }
          }
        }
      }
    });
    if (!branch) throw new BadRequestException("ไม่พบร้านหรือสาขาจาก UID นี้");
    const selectedBranch = branch.business.branches.find((item) => item.id === branch.id) ?? null;
    const resolvedBusiness = branch.business;
    if (branchId && !selectedBranch) throw new BadRequestException("ไม่พบสาขานี้ในร้าน หรือสาขาไม่พร้อมใช้งาน");
    return { business: resolvedBusiness, selectedBranch };
  }

  private async issueSession(userId: string) {
    const me = await this.me(userId);
    const payload = {
      userId: me.id,
      email: me.email,
      isSystemAdmin: me.isSystemAdmin,
      businessId: me.business?.id,
      role: me.business?.role,
      assignedBranchIds: me.business?.assignedBranchIds
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
    return {
      accessToken,
      refreshToken,
      user: {
        id: me.id,
        name: me.name,
        email: me.email,
        phone: me.phone,
        createdAt: me.createdAt,
        updatedAt: me.updatedAt,
        authProviders: me.authProviders,
        isSystemAdmin: me.isSystemAdmin
      },
      business: me.business,
      membershipRequest: me.membershipRequest
    };
  }

  private async ensurePlans() {
    const free = await this.prisma.subscriptionPlan.upsert({
      where: { code: "FREE" },
      create: { code: "FREE", name: "Free", productLimit: 30, userLimit: 1, branchLimit: 1, warehouseLimit: 1, priceMonthly: 0 },
      update: { productLimit: 30, userLimit: 1, branchLimit: 1, warehouseLimit: 1, priceMonthly: 0 }
    });
    await this.prisma.subscriptionPlan.upsert({
      where: { code: "PRO" },
      create: { code: "PRO", name: "Pro", productLimit: 1000, userLimit: 5, branchLimit: 5, warehouseLimit: 3, priceMonthly: 590 },
      update: { productLimit: 1000, userLimit: 5, branchLimit: 5, warehouseLimit: 3, priceMonthly: 590 }
    });
    await this.prisma.subscriptionPlan.upsert({
      where: { code: "PREMIUM" },
      create: { code: "PREMIUM", name: "Premium", productLimit: 10000, userLimit: 25, branchLimit: 25, warehouseLimit: 25, priceMonthly: 0 },
      update: { productLimit: 10000, userLimit: 25, branchLimit: 25, warehouseLimit: 25, priceMonthly: 0 }
    });
    return free;
  }

  private hashResetToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async verifyGoogleCredential(credential: string) {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) throw new BadRequestException("Google login is not configured");

    const [encodedHeader, encodedPayload, encodedSignature] = credential.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException("Invalid Google credential");
    }

    const header = this.parseJwtPart<{ kid?: string; alg?: string }>(encodedHeader);
    if (!header.kid || header.alg !== "RS256") {
      throw new UnauthorizedException("Invalid Google credential");
    }

    const payload = this.parseJwtPart<GoogleIdTokenPayload>(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!payload.sub || !audiences.includes(clientId) || payload.exp <= now || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) {
      throw new UnauthorizedException("Invalid Google credential");
    }

    const jwk = (await this.getGoogleJwks()).find((key) => key.kid === header.kid);
    if (!jwk) throw new UnauthorizedException("Invalid Google credential");

    const isValid = verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: jwk as any, format: "jwk" }),
      this.base64UrlToBuffer(encodedSignature)
    );
    if (!isValid) throw new UnauthorizedException("Invalid Google credential");

    return payload;
  }

  private async getGoogleJwks() {
    if (this.googleJwks && this.googleJwks.expiresAt > Date.now()) return this.googleJwks.keys;

    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!response.ok) throw new UnauthorizedException("Could not verify Google credential");

    const body = (await response.json()) as { keys?: GoogleJwk[] };
    const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
    this.googleJwks = {
      expiresAt: Date.now() + Number(maxAge ?? 3600) * 1000,
      keys: body.keys ?? []
    };
    return this.googleJwks.keys;
  }

  private parseJwtPart<T>(value: string) {
    try {
      return JSON.parse(this.base64UrlToBuffer(value).toString("utf8")) as T;
    } catch {
      throw new UnauthorizedException("Invalid Google credential");
    }
  }

  private base64UrlToBuffer(value: string) {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  private normalizeProgress(progress: unknown) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return {};
    return progress as Record<string, boolean>;
  }
}
