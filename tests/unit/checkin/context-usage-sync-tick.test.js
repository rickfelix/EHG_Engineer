/**
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C FR-3 (TS-4, TS-7): the context-usage sync piggybacked
 * on worker-checkin must be fail-soft by MECHANISM (its own try/catch), not proven by wall-clock
 * timing (TESTING flagged timing-based proof as flake risk).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { tickContextUsageSync } = require('../../../lib/checkin/context-usage-sync-tick.cjs');

describe('tickContextUsageSync', () => {
  it('TS-4/TS-7: is non-blocking by mechanism — a rejecting syncFn resolves ok:false rather than throwing', async () => {
    const result = await tickContextUsageSync({ syncFn: async () => { throw new Error('sync boom'); } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sync boom/);
  });

  it('resolves ok:true when the sync succeeds', async () => {
    const result = await tickContextUsageSync({ syncFn: async () => {} });
    expect(result.ok).toBe(true);
  });

  it('is fail-soft even against a hanging-then-rejecting syncFn — no unhandled rejection escapes', async () => {
    const syncFn = () => new Promise((_, reject) => reject(new Error('async boom')));
    await expect(tickContextUsageSync({ syncFn })).resolves.toEqual({ ok: false, error: 'async boom' });
  });
});
