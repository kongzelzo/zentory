import { validateProductionEnv } from "./env";

describe("validateProductionEnv", () => {
  it("rejects production boot when required secrets are missing or still use placeholders", () => {
    expect(() => validateProductionEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://zentory:zentory@localhost:5432/zentory",
      JWT_ACCESS_SECRET: "replace-with-access-secret",
      JWT_REFRESH_SECRET: "real-refresh-secret",
      WEB_APP_URL: "https://zentory.app",
      STRIPE_SECRET_KEY: "sk_live_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123"
    })).toThrow("Production environment is missing safe values");
  });

  it("allows non-production local defaults", () => {
    expect(() => validateProductionEnv({
      NODE_ENV: "development",
      JWT_ACCESS_SECRET: "replace-with-access-secret"
    })).not.toThrow();
  });
});
