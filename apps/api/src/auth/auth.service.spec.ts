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
