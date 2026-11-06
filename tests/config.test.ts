import { afterEach, expect, it, vi } from 'vitest';
import { config } from '../src/lib/config';

afterEach(() => vi.unstubAllEnvs());

it('uses the dedicated database only for explicitly enabled integration tests', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/application');
  vi.stubEnv('TEST_DATABASE_URL', 'postgresql://localhost/test');
  vi.stubEnv('RUN_DB_TESTS', '1');
  vi.stubEnv('NODE_ENV', 'production');
  expect(config.databaseUrl).toBe('postgresql://localhost/application');
  vi.stubEnv('NODE_ENV', 'test');
  expect(config.databaseUrl).toBe('postgresql://localhost/test');
  vi.stubEnv('RUN_DB_TESTS', '0');
  expect(config.databaseUrl).toBe('postgresql://localhost/application');
  vi.stubEnv('RUN_DB_TESTS', '1');
  vi.stubEnv('TEST_DATABASE_URL', '');
  expect(config.runDbTests).toBe(false);
  expect(config.databaseUrl).toBe('postgresql://localhost/application');
});


it('uses configured defaults when environment values are absent and allows overrides', () => {
  for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'VIEWER_EMAIL', 'VIEWER_PASSWORD']) {
    vi.stubEnv(key, undefined);
  }
  vi.stubEnv('RUN_DB_TESTS', '0');
  expect(config.databaseUrl).toBeTruthy();
  expect(config.testDatabaseUrl).toBeTruthy();
  expect(config.sessionSecret!.length).toBeGreaterThanOrEqual(32);
  expect(config.adminEmail).toContain('@');
  expect(config.viewerEmail).toContain('@');
  expect(config.adminPassword).toBeTruthy();
  expect(config.viewerPassword).toBeTruthy();
  vi.stubEnv('SESSION_SECRET', 'override');
  vi.stubEnv('ADMIN_EMAIL', 'ADMIN@example.com');
  expect(config.sessionSecret).toBe('override');
  expect(config.adminEmail).toBe('admin@example.com');
});
