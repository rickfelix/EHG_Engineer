// Test setup file (ES module compatible)
import { config } from 'dotenv';
import { vi } from 'vitest';

config({ path: '.env.test' });

// Synthetic env defaults so module-load createSupabaseServiceClient() factories
// don't throw during vitest collection in environments without real credentials
// (e.g. CI test-coverage runs without secrets, fork PRs). Real env vars from
// .env.test or the host shell take precedence via ||=. Tests that need a live
// DB connection should set TEST_REQUIRES_DB=1 and skip when the URL still
// matches the synthetic sentinel.
process.env.SUPABASE_URL ||= 'https://test.invalid.local';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key-not-real';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key-not-real';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};