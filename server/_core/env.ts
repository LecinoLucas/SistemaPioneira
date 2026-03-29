function parseCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

const frontendUrls = parseCsv(process.env.FRONTEND_URL).length
  ? parseCsv(process.env.FRONTEND_URL)
  : ["http://localhost:5173", "http://localhost:5174"];

function assertSameSiteValue(value: string) {
  if (!value) return;
  if (value === "lax" || value === "strict" || value === "none") return;
  throw new Error(
    "SESSION_COOKIE_SAME_SITE inválido. Use apenas: lax, strict ou none."
  );
}

function assertStockReadMode(value: string) {
  if (!value) return;
  if (value === "legacy" || value === "shadow" || value === "v2") return;
  throw new Error(
    "STOCK_V2_READ_MODE inválido. Use apenas: legacy, shadow ou v2."
  );
}

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  frontendUrl: frontendUrls[0] ?? "http://localhost:5173",
  frontendUrls,
  corsAllowedHeaders: parseCsv(process.env.CORS_ALLOWED_HEADERS),
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN ?? "",
  sessionCookieSameSite: (process.env.SESSION_COOKIE_SAME_SITE ?? "").toLowerCase(),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/google/callback",
  salesImportDir: process.env.SALES_IMPORT_DIR ?? "",
  // Demo user passwords — only relevant in local/development mode.
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD ?? "",
  demoGerentePassword: process.env.DEMO_GERENTE_PASSWORD ?? "",
  demoUserPassword: process.env.DEMO_USER_PASSWORD ?? "",
  stockV2DualWrite:
    (process.env.STOCK_V2_DUAL_WRITE ?? "").toLowerCase() === "true" ||
    process.env.STOCK_V2_DUAL_WRITE === "1",
  stockV2ReadMode: (process.env.STOCK_V2_READ_MODE ?? "legacy").toLowerCase(),
  legacyMarcasRouterEnabled:
    process.env.LEGACY_MARCAS_ROUTER_ENABLED == null
      ? true
      : ["1", "true", "yes", "on"].includes(
          String(process.env.LEGACY_MARCAS_ROUTER_ENABLED).toLowerCase()
        ),
};

export function validateEnvironment() {
  assertSameSiteValue(ENV.sessionCookieSameSite);
  assertStockReadMode(ENV.stockV2ReadMode);

  const hasGoogleId = Boolean(ENV.googleClientId);
  const hasGoogleSecret = Boolean(ENV.googleClientSecret);
  if (hasGoogleId !== hasGoogleSecret) {
    throw new Error(
      "Configuração OAuth inconsistente: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem ser definidos juntos."
    );
  }

  if (ENV.isProduction) {
    if (!ENV.databaseUrl) {
      throw new Error("DATABASE_URL é obrigatório em produção.");
    }

    if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
      throw new Error(
        "JWT_SECRET inválido para produção. Use um segredo forte com pelo menos 32 caracteres."
      );
    }

    if (!ENV.frontendUrls.length) {
      throw new Error(
        "FRONTEND_URL é obrigatório em produção (aceita múltiplas URLs separadas por vírgula)."
      );
    }
  }
}
