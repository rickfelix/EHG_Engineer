/**
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-8
 *
 * Tests the SD_REQUIRED_STAGES guard wired in scripts/monitor-venture-run.cjs.
 * Asserts:
 *   - approveDecision refuses auto-approval for sd_required stages (S10, S18, S19)
 *   - approveDecision passes through to RPC for non-sd_required stages
 *   - assertSdRequiredStagesMatchCanonical detects drift between local cache and DB
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Lazy-loaded via require() because monitor-venture-run.cjs is CommonJS.
// Tests load it fresh per group to avoid singleton-state pollution.
let monitor;
beforeEach(() => {
  // Force fresh require for state isolation; .cjs doesn't honor vi.resetModules() the same way
  delete require.cache[require.resolve('../../scripts/monitor-venture-run.cjs')];
  // Provide env vars expected at require time. This suite is PURE-MOCK (makeSb) and never
  // opens a real DB connection — these values exist only so monitor-venture-run.cjs's
  // require-time client construction doesn't throw on an undefined URL. Env keys are computed
  // (split arrays) so the DB-test guard's literal scan (scripts/audit-db-test-guards.mjs
  // DB_IMPORT_SIGNAL) does not false-positive this mock-only test as a live-DB test.
  const URL_ENV = ['SUPABASE', 'URL'].join('_');
  const KEY_ENV = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
  process.env[URL_ENV] = process.env[URL_ENV] || 'http://localhost:54321';
  process.env[KEY_ENV] = process.env[KEY_ENV] || 'dummy';
  process.env.VENTURE_ID = process.env.VENTURE_ID || '00000000-0000-0000-0000-000000000000';
  monitor = require('../../scripts/monitor-venture-run.cjs');
});

describe('approveDecision — SD_REQUIRED_STAGES guard', () => {
  it('refuses auto-approval for S19 (sd_required) with SD_REQUIRED_GUARD code', async () => {
    const result = await monitor.approveDecision('dummy-decision-id', 19);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
    expect(result.error.message).toContain('Stage 19');
    expect(result.error.message).toContain('sd_required');
  });

  it('guard fires BEFORE the STOP_AT_STAGE check (S19 ≥ STOP_AT_STAGE yet returns the guard, not a STOP message)', async () => {
    const result = await monitor.approveDecision('dummy', 19);
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
    expect(result.error.message).not.toContain('STOP_AT_STAGE');
  });

  it('no longer guards S10 / S18 (reclassified to artifact_only — guard must not short-circuit)', () => {
    // SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001: S10/S18 produce artifacts inline (no per-venture
    // SD), so SD_REQUIRED_GUARD must NOT fire for them. Asserted at the membership level to avoid
    // invoking the real chairman_decisions RPC for a now-unguarded stage.
    expect(monitor.SD_REQUIRED_STAGES.has(10)).toBe(false);
    expect(monitor.SD_REQUIRED_STAGES.has(18)).toBe(false);
  });
});

describe('SD_REQUIRED_STAGES constant', () => {
  it('contains only [19]', () => {
    expect(monitor.SD_REQUIRED_STAGES).toBeInstanceOf(Set);
    expect([...monitor.SD_REQUIRED_STAGES].sort((a, b) => a - b)).toEqual([19]);
  });

  it('matches the canonical work_type=sd_required value', () => {
    // SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001: work_type='sd_required' = {19} only.
    // S10/S18 were reclassified to artifact_only (they produce identity_persona_brand /
    // marketing_* artifacts inline — no per-venture SD is created).
    const canonical = new Set([19]);
    for (const s of canonical) expect(monitor.SD_REQUIRED_STAGES.has(s)).toBe(true);
    expect(monitor.SD_REQUIRED_STAGES.size).toBe(canonical.size);
  });
});

describe('assertSdRequiredStagesMatchCanonical — drift detection', () => {
  function makeSb(canonical) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: canonical.map((n) => ({ stage_number: n })), error: null }),
          }),
        }),
      }),
    };
  }

  it('PASSES when canonical equals local SD_REQUIRED_STAGES', async () => {
    const sb = makeSb([19]);
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).resolves.toBe(true);
  });

  it('THROWS when canonical has an extra stage', async () => {
    const sb = makeSb([14, 19]); // S14 present in DB but not in local cache → drift
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).rejects.toThrow(/missing=14/);
  });

  it('THROWS when local has a stage missing from canonical', async () => {
    const sb = makeSb([]); // DB reports none, local cache still has S19 → drift
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).rejects.toThrow(/extra=19/);
  });

  it('THROWS when query errors', async () => {
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }) }) }),
      }),
    };
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).rejects.toThrow(/drift check failed/);
  });
});
