import { AuthService } from "./auth.service";

describe("AuthService registration flow", () => {
  it("creates only the user account during registration", async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "user_1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "user_1",
          email: "owner@example.com",
          name: "Owner",
          phone: null,
          isSystemAdmin: false,
          memberships: []
        }),
        update: jest.fn().mockResolvedValue({})
      },
      subscriptionPlan: {
        upsert: jest.fn().mockResolvedValue({ id: "free_plan" })
      }
    };
    const jwt: any = { signAsync: jest.fn().mockResolvedValueOnce("access").mockResolvedValueOnce("refresh") };
    const config: any = { get: jest.fn((_key: string, fallback: string) => fallback) };
    const mailer: any = { sendPasswordReset: jest.fn() };
    const service = new AuthService(prisma, jwt, config, mailer);

    const session = await service.register({
      name: "Owner",
      email: "owner@example.com",
      password: "password123"
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        memberships: expect.anything()
      }),
      include: { memberships: { include: { business: true } } }
    });
    expect(session.business).toBeUndefined();
  });
});

describe("AuthService profile flow", () => {
  function serviceWithProfileUser(userOverride: Record<string, unknown> = {}) {
    const now = new Date("2026-06-16T00:00:00.000Z");
    const user = {
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      phone: "0812345678",
      passwordHash: "hash",
      googleSub: null,
      createdAt: now,
      updatedAt: now,
      isSystemAdmin: false,
      memberships: [],
      ...userOverride
    };
    const prisma: any = {
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue(user)
      }
    };
    const jwt: any = { signAsync: jest.fn().mockResolvedValueOnce("access").mockResolvedValueOnce("refresh") };
    const config: any = { get: jest.fn((_key: string, fallback: string) => fallback) };
    const mailer: any = { sendPasswordReset: jest.fn() };
    return { service: new AuthService(prisma, jwt, config, mailer), prisma };
  }

  it("updates trimmed profile fields and returns a refreshed session", async () => {
    const { service, prisma } = serviceWithProfileUser({ name: "Alice", phone: "0899999999" });

    const session = await service.updateProfile("user_1", { name: " Alice ", phone: " 0899999999 " });

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: "user_1" },
      data: { name: "Alice", phone: "0899999999" }
    });
    expect(session.user).toEqual(expect.objectContaining({
      name: "Alice",
      phone: "0899999999",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
      authProviders: { password: true, google: false }
    }));
  });

  it("stores an empty phone as null", async () => {
    const { service, prisma } = serviceWithProfileUser({ phone: null });

    await service.updateProfile("user_1", { name: "Owner", phone: " " });

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: "user_1" },
      data: { name: "Owner", phone: null }
    });
  });

  it("rejects blank or too-short names after trimming", async () => {
    const { service, prisma } = serviceWithProfileUser();

    await expect(service.updateProfile("user_1", { name: " a ", phone: "0812345678" })).rejects.toThrow("ชื่อต้องมีอย่างน้อย 2 ตัวอักษร");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not persist email, role, business, or admin fields from extra body data", async () => {
    const { service, prisma } = serviceWithProfileUser();

    await service.updateProfile("user_1", {
      name: "Owner",
      phone: "0812345678",
      email: "attacker@example.com",
      role: "OWNER",
      businessId: "business_2",
      isSystemAdmin: true
    } as any);

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: "user_1" },
      data: { name: "Owner", phone: "0812345678" }
    });
  });
});

describe("AuthService membership request flow", () => {
  function serviceWith(prismaOverrides: any = {}) {
    const prisma: any = {
      business: { findUnique: jest.fn(), ...prismaOverrides.business },
      branch: { findFirst: jest.fn(), ...prismaOverrides.branch },
      businessMember: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        ...prismaOverrides.businessMember
      },
      user: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        ...prismaOverrides.user
      }
    };
    const jwt: any = { signAsync: jest.fn().mockResolvedValueOnce("access").mockResolvedValueOnce("refresh") };
    const config: any = { get: jest.fn((_key: string, fallback: string) => fallback) };
    const mailer: any = { sendPasswordReset: jest.fn() };
    return { service: new AuthService(prisma, jwt, config, mailer), prisma };
  }

  it("rejects unknown store UIDs", async () => {
    const { service, prisma } = serviceWith({
      business: { findUnique: jest.fn().mockResolvedValue(null) },
      branch: { findFirst: jest.fn().mockResolvedValue(null) }
    });

    await expect(service.requestMembership("user_1", { businessId: "missing_business", employeeName: "Staff", employeePhone: "0812345678" })).rejects.toThrow("ไม่พบร้านหรือสาขาจาก UID นี้");
    expect(prisma.businessMember.create).not.toHaveBeenCalled();
  });

  it("accepts a branch UID as the membership target", async () => {
    const createdAt = new Date();
    const { service, prisma } = serviceWith({
      business: { findUnique: jest.fn().mockResolvedValue(null) },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: "branch_1",
          business: {
            id: "business_1",
            name: "Demo Store",
            branches: [{ id: "branch_1", name: "สาขาหลัก", code: "MAIN", isDefault: true }]
          }
        })
      },
      businessMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "member_1" })
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "user_1",
          email: "staff@example.com",
          name: "Staff",
          phone: "0812345678",
          isSystemAdmin: false,
          memberships: [{
            id: "member_1",
            businessId: "business_1",
            employeeName: "Staff",
            employeePhone: "0812345678",
            preferredRole: "แคชเชียร์",
            preferredBranch: "สาขาหลัก",
            requestedBranchId: "branch_1",
            requestedBranch: { id: "branch_1", name: "สาขาหลัก", code: "MAIN" },
            availableStartDate: null,
            applicationNote: null,
            status: "PENDING",
            createdAt,
            business: { name: "Demo Store" }
          }]
        }),
        update: jest.fn().mockResolvedValue({})
      }
    });

    const session = await service.requestMembership("user_1", {
      businessId: "branch_1",
      employeeName: "Staff",
      employeePhone: "0812345678",
      preferredRole: "แคชเชียร์"
    });

    expect(prisma.businessMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business_1",
        preferredBranch: "สาขาหลัก",
        requestedBranchId: "branch_1"
      })
    }));
    expect(session.membershipRequest?.businessId).toBe("business_1");
    expect(session.membershipRequest?.requestedBranchId).toBe("branch_1");
  });

  it("creates a pending request and returns it in the session", async () => {
    const createdAt = new Date();
    const { service, prisma } = serviceWith({
      business: { findUnique: jest.fn().mockResolvedValue({ id: "business_1", branches: [] }) },
      businessMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "member_1" })
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "user_1",
          email: "staff@example.com",
          name: "Staff",
          phone: "0812345678",
          isSystemAdmin: false,
          memberships: [{
            id: "member_1",
            businessId: "business_1",
            employeeName: "Staff",
            employeePhone: "0812345678",
            preferredRole: "แคชเชียร์",
            preferredBranch: "สาขาหลัก",
            requestedBranchId: null,
            requestedBranch: null,
            availableStartDate: null,
            applicationNote: "ทำงานวันเสาร์ได้",
            status: "PENDING",
            createdAt,
            business: { name: "Demo Store" }
          }]
        }),
        update: jest.fn().mockResolvedValue({})
      }
    });

    const session = await service.requestMembership("user_1", {
      businessId: "business_1",
      employeeName: "Staff",
      employeePhone: "0812345678",
      preferredRole: "แคชเชียร์",
      preferredBranch: "สาขาหลัก",
      applicationNote: "ทำงานวันเสาร์ได้"
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { name: "Staff", phone: "0812345678" }
    });

    expect(prisma.businessMember.create).toHaveBeenCalledWith({
      data: {
        businessId: "business_1",
        userId: "user_1",
        employeeName: "Staff",
        employeePhone: "0812345678",
        preferredRole: "แคชเชียร์",
        preferredBranch: "สาขาหลัก",
        requestedBranchId: null,
        availableStartDate: null,
        applicationNote: "ทำงานวันเสาร์ได้",
        role: "VIEWER",
        status: "PENDING",
        permissionOverrides: {}
      }
    });
    expect(session.business).toBeUndefined();
    expect(session.membershipRequest).toEqual({
      id: "member_1",
      businessId: "business_1",
      businessName: "Demo Store",
      employeeName: "Staff",
      employeePhone: "0812345678",
      preferredRole: "แคชเชียร์",
      preferredBranch: "สาขาหลัก",
      requestedBranchId: null,
      requestedBranch: null,
      availableStartDate: null,
      applicationNote: "ทำงานวันเสาร์ได้",
      status: "PENDING",
      createdAt
    });
  });
});

describe("AuthService password reset flow", () => {
  function serviceWith(prismaOverrides: any = {}) {
    const prisma: any = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        ...prismaOverrides.user
      },
      subscriptionPlan: {
        upsert: jest.fn()
      }
    };
    const jwt: any = { signAsync: jest.fn() };
    const config: any = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          WEB_APP_URL: "https://zentory.test"
        };
        return values[key] ?? fallback;
      })
    };
    const mailer: any = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

    return { service: new AuthService(prisma, jwt, config, mailer), prisma, mailer };
  }

  it("creates a one-hour reset token and sends email when account exists", async () => {
    const { service, prisma, mailer } = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user_1", email: "owner@example.com", name: "Owner" }),
        update: jest.fn().mockResolvedValue({})
      }
    });

    await expect(service.forgotPassword({ email: "OWNER@example.com" })).resolves.toEqual({ ok: true });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "owner@example.com" } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        passwordResetTokenHash: expect.any(String),
        passwordResetExpiresAt: expect.any(Date)
      }
    });
    const expiresAt = prisma.user.update.mock.calls[0][0].data.passwordResetExpiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 1000);
    expect(mailer.sendPasswordReset).toHaveBeenCalledWith({
      to: "owner@example.com",
      name: "Owner",
      resetUrl: expect.stringMatching(/^https:\/\/zentory\.test\/reset-password\?token=.+/)
    });
  });

  it("does not reveal when forgot password email is not registered", async () => {
    const { service, prisma, mailer } = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    });

    await expect(service.forgotPassword({ email: "missing@example.com" })).resolves.toEqual({ ok: true });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("resets password for a valid token and clears existing sessions", async () => {
    const { service, prisma } = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user_1",
          passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: "user_1",
          passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
        }),
        update: jest.fn().mockResolvedValue({})
      }
    });
    const token = "valid-reset-token";

    await expect(service.resetPassword({ token, password: "newpassword123" })).resolves.toEqual({ ok: true });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        passwordResetTokenHash: expect.any(String),
        passwordResetExpiresAt: { gt: expect.any(Date) }
      }
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        passwordHash: expect.any(String),
        refreshHash: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    });
  });

  it("rejects expired or invalid reset tokens", async () => {
    const { service, prisma } = serviceWith({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "user_1",
          passwordResetExpiresAt: new Date(Date.now() - 1000)
        })
      }
    });

    await expect(service.resetPassword({ token: "expired-token", password: "newpassword123" })).rejects.toThrow("Invalid or expired reset token");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
