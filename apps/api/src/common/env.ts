const productionRequiredKeys = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "WEB_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET"
] as const;

const unsafeValuePattern = /^(|replace-|dev-|change-me|changeme)/i;

export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;

  const unsafeKeys = productionRequiredKeys.filter((key) => {
    const value = env[key]?.trim() ?? "";
    return unsafeValuePattern.test(value) || value.includes("localhost");
  });

  if (unsafeKeys.length > 0) {
    throw new Error(`Production environment is missing safe values for: ${unsafeKeys.join(", ")}`);
  }
}
