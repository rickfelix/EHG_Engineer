// Unit-project test setup — SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (FR-3).
//
// The no-DB `unit` vitest project must NOT see real database credentials, so
// unlike tests/setup.db.js this file does NOT load `.env`. Unit tests that
// touch a Supabase client hit the synthetic test.invalid.local sentinel and
// fail/skip loudly instead of silently mutating production data.
//
// Host-shell env vars still take precedence via ||= (CI workflows that
// deliberately pass secrets — e.g. protected-unit-suites.yml — keep working).
import { vi } from 'vitest';

// Synthetic env defaults so module-load createSupabaseServiceClient() factories
// don't throw during vitest collection in environments without real credentials
// (e.g. CI test-coverage runs without secrets, fork PRs).
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
