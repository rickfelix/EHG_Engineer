/**
 * TS-5 (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001): re-running the mechanical seed script is
 * idempotent -- no duplicate rows on a second run. Real DB, no fixtures needed (the seed script
 * itself only touches role_session/scheduler_round rows, upserting on process_key).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

describe.skipIf(!HAS_REAL_DB)('seed-periodic-process-registry.mjs -- idempotency (TS-5)', () => {
  it('running the seed script twice produces the same row count, no duplicates', async () => {
    const run1 = execSync('node scripts/seed-periodic-process-registry.mjs', { encoding: 'utf8', cwd: process.cwd() });
    const count1 = Number(run1.match(/Seeded\/updated (\d+) periodic_process_registry/)?.[1]);
    const run2 = execSync('node scripts/seed-periodic-process-registry.mjs', { encoding: 'utf8', cwd: process.cwd() });
    const count2 = Number(run2.match(/Seeded\/updated (\d+) periodic_process_registry/)?.[1]);

    expect(count1).toBeGreaterThan(0);
    expect(count2).toBe(count1);
  });
});
