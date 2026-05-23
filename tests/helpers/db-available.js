/**
 * Shared DB-availability helper for the vitest db/no-db project split.
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-1).
 *
 * Consolidates the `HAS_REAL_DB` + `describe.skipIf(!HAS_REAL_DB)` snippet that
 * was copy-pasted inline across ~53 test files (CAPA CA-1 of
 * SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001). Tests that touch a live Supabase
 * connection should wrap their suite in `describeDb` (or guard with
 * `HAS_REAL_DB`) so the default no-DB `unit` vitest project skips them cleanly
 * instead of hanging against the synthetic `test.invalid.local` sentinel that
 * `tests/setup.js` injects when no real credentials are present.
 *
 * This supersedes the never-implemented `TEST_REQUIRES_DB` note in
 * tests/setup.js (0 usages historically).
 *
 * Usage:
 *   import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
 *   describeDb('queries the venture table', () => { ... });  // skipped without a DB
 */
import { describe, it } from 'vitest';

/**
 * True only when a real Supabase connection is configured:
 *   - SUPABASE_URL is set and is NOT the synthetic 'test.invalid.local' sentinel, AND
 *   - SUPABASE_SERVICE_ROLE_KEY is set and is NOT the synthetic 'test-service-role-key-not-real' fake.
 *
 * This mirrors the exact inline convention used across the existing guarded
 * tests so behavior is byte-for-byte unchanged — only the definition site moves.
 */
export const HAS_REAL_DB = Boolean(
  process.env.SUPABASE_URL &&
    !process.env.SUPABASE_URL.includes('test.invalid.local') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real')
);

/**
 * `describe()` that runs only when a real DB is available and is SKIPPED
 * (not failed) otherwise. Drop-in replacement for `describe` in DB-dependent
 * suites. Preserves the chainable API (`.each`, `.only`, etc.) by delegating
 * to `describe.skipIf`, matching the existing convention exactly.
 */
export const describeDb = describe.skipIf(!HAS_REAL_DB);

/**
 * `it()` that runs only when a real DB is available; skipped otherwise.
 */
export const itDb = it.skipIf(!HAS_REAL_DB);
