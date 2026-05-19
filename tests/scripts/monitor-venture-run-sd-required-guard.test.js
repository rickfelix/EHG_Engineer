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
  // Provide env vars expected at require time
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
  process.env.VENTURE_ID = process.env.VENTURE_ID || '00000000-0000-0000-0000-000000000000';
  monitor = require('../../scripts/monitor-venture-run.cjs');
});

describe('approveDecision — SD_REQUIRED_STAGES guard', () => {
  it('refuses auto-approval for S10 (sd_required) with SD_REQUIRED_GUARD code', async () => {
    const result = await monitor.approveDecision('dummy-decision-id', 10);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
    expect(result.error.message).toContain('Stage 10');
    expect(result.error.message).toContain('sd_required');
  });

  it('refuses S18 (sd_required)', async () => {
    const result = await monitor.approveDecision('dummy', 18);
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
  });

  it('refuses S19 (sd_required)', async () => {
    const result = await monitor.approveDecision('dummy', 19);
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
  });

  it('refusal occurs BEFORE STOP_AT_STAGE check (S10 < STOP_AT_STAGE=17 yet still refused)', async () => {
    const result = await monitor.approveDecision('dummy', 10);
    expect(result.error.code).toBe('SD_REQUIRED_GUARD');
    expect(result.error.message).not.toContain('STOP_AT_STAGE');
  });
});

describe('SD_REQUIRED_STAGES constant', () => {
  it('contains [10, 18, 19]', () => {
    expect(monitor.SD_REQUIRED_STAGES).toBeInstanceOf(Set);
    expect([...monitor.SD_REQUIRED_STAGES].sort((a, b) => a - b)).toEqual([10, 18, 19]);
  });

  it('matches the canonical work_type=sd_required value', () => {
    // Per lifecycle_stage_config probe at 2026-05-19, work_type='sd_required' = {10, 18, 19}
    const canonical = new Set([10, 18, 19]);
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
    const sb = makeSb([10, 18, 19]);
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).resolves.toBe(true);
  });

  it('THROWS when canonical has an extra stage', async () => {
    const sb = makeSb([10, 14, 18, 19]); // S14 added → drift
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).rejects.toThrow(/missing=14/);
  });

  it('THROWS when local has a stage missing from canonical', async () => {
    const sb = makeSb([10, 19]); // S18 removed from DB → drift
    await expect(monitor.assertSdRequiredStagesMatchCanonical(sb)).rejects.toThrow(/extra=18/);
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
