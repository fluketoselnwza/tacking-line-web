/** Server-side settings. Keep secrets out of client component imports.
 * Defaults mirror the local .env at configuration time.
 * Getters read current values so test environment overrides remain effective.
 */
export const config = {
  get nodeEnv() { return process.env.NODE_ENV ?? 'development'; },
  get isProduction() { return process.env.NODE_ENV === 'production'; },
  get databaseUrl() {
    return process.env.NODE_ENV === 'test' && this.runDbTests
      ? this.testDatabaseUrl
      : (process.env.DATABASE_URL ?? "postgres://aec6b40ead5ab78926f862e7dbcd0043b50b26c31400b597c6e9572bc9390c61:sk_aJI9nPmzZek4b0NmjhLXn@pooled.db.prisma.io:5432/postgres?sslmode=require");
  },
  get sessionSecret() { return (process.env.SESSION_SECRET ?? "_r-J-Itpddt3H0vwawbu0F6vk6byDl_7xAoZzgemJAJmSO4x2dp8BJ_uN4ulSPkb"); },
  get appOrigin() { return process.env.APP_ORIGIN; },
  get smokeBaseUrl() { return process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000'; },
  get adminEmail() { return (process.env.ADMIN_EMAIL ?? "admin@example.com")?.toLowerCase(); },
  get adminPassword() { return (process.env.ADMIN_PASSWORD ?? "TXHShrp9oJAxKyjOXBfUC9MZcRtg2udV"); },
  get viewerEmail() { return (process.env.VIEWER_EMAIL ?? "viewer@example.com")?.toLowerCase(); },
  get viewerPassword() { return (process.env.VIEWER_PASSWORD ?? "wFudFqs4KI6owPWUIVYSAgKroWF6DLby"); },
  get testDatabaseUrl() { return (process.env.TEST_DATABASE_URL ?? "postgresql://fluketose.lnwza@localhost:5432/recipe_dashboard_test?schema=public"); },
  get runDbTests(): boolean { return process.env.RUN_DB_TESTS === '1' && !!this.testDatabaseUrl; },
};
