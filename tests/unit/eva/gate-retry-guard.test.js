/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-1/FR-2/FR-5) -- bounded retry ceiling + backoff.
 *
 * Backoff is time-based (elapsed since the last recorded attempt), not attempt-count-based --
 * see gate-retry-guard.js's header comment for why a count-based design self-freezes (evidence
 * 11345782-ebd6-4e74-82ff-b0bd0342809c).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  GATE_RETRY_CEILING,
  GATE_RETRY_BACKOFF_START,
  GATE_RETRY_BACKOFF_MAX_MS,
  computeBackoffDelayMs,
  shouldSkipForBackoff,
  getGateAttemptState,
  terminalizeVentureForRetryExhaustion,
  checkGateRetryCeiling,
} from '../../../lib/eva/gate-retry-guard.js';

describe('computeBackoffDelayMs (FR-1: backoff schedule)', () => {
  it('is zero below GATE_RETRY_BACKOFF_START', () => {
    for (let n = 0; n < GATE_RETRY_BACKOFF_START; n++) {
      expect(computeBackoffDelayMs(n)).toBe(0);
    }
  });

  it('strictly increases as the attempt count grows past the backoff start (real exponential schedule, not a flat skip)', () => {
    const d0 = computeBackoffDelayMs(GATE_RETRY_BACKOFF_START);
    const d3 = computeBackoffDelayMs(GATE_RETRY_BACKOFF_START + 3);
    const d6 = computeBackoffDelayMs(GATE_RETRY_BACKOFF_START + 6);
    expect(d0).toBeGreaterThan(0);
    expect(d3).toBeGreaterThan(d0);
    expect(d6).toBeGreaterThan(d3);
  });

  it('is capped at GATE_RETRY_BACKOFF_MAX_MS, never unbounded', () => {
    expect(computeBackoffDelayMs(GATE_RETRY_CEILING - 1)).toBeLessThanOrEqual(GATE_RETRY_BACKOFF_MAX_MS);
    expect(computeBackoffDelayMs(1000)).toBe(GATE_RETRY_BACKOFF_MAX_MS);
  });
});

describe('shouldSkipForBackoff (FR-1: does not self-freeze)', () => {
  it('never skips below GATE_RETRY_BACKOFF_START regardless of timestamp', () => {
    expect(shouldSkipForBackoff(0, new Date().toISOString())).toBe(false);
  });

  it('never skips when there is no prior attempt timestamp', () => {
    expect(shouldSkipForBackoff(GATE_RETRY_BACKOFF_START, null)).toBe(false);
  });

  it('skips immediately after the last attempt, past the backoff start', () => {
    const now = Date.parse('2026-08-25T00:00:00Z');
    const lastAttemptAt = new Date(now - 1000).toISOString(); // 1s ago
    expect(shouldSkipForBackoff(GATE_RETRY_BACKOFF_START, lastAttemptAt, now)).toBe(true);
  });

  it('CRITICAL: eventually clears the backoff window as wall-clock time passes -- attemptCount frozen, only `now` advances', () => {
    // This is the exact fixed-point failure mode the corrected design must NOT reproduce: the
    // worker skips evaluation while backing off, so attemptCount cannot increment during the
    // wait. If skip were still keyed on attemptCount alone, this would never clear.
    const lastAttemptAt = new Date('2026-08-25T00:00:00Z').toISOString();
    const delay = computeBackoffDelayMs(GATE_RETRY_BACKOFF_START);
    const stillWaiting = Date.parse(lastAttemptAt) + delay - 1;
    const cleared = Date.parse(lastAttemptAt) + delay + 1;
    expect(shouldSkipForBackoff(GATE_RETRY_BACKOFF_START, lastAttemptAt, stillWaiting)).toBe(true);
    expect(shouldSkipForBackoff(GATE_RETRY_BACKOFF_START, lastAttemptAt, cleared)).toBe(false);
  });
});

function makeSupabaseMock({ attemptCount = 0, lastAttemptAt = null, ventureMetadata = {} } = {}) {
  const updates = [];
  const api = {
    from: vi.fn((table) => {
      if (table === 'eva_stage_gate_attempts') {
        return {
          select: vi.fn((_cols, opts) => {
            if (opts?.head) {
              return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ count: attemptCount, error: null })) })) };
            }
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: lastAttemptAt ? { created_at: lastAttemptAt } : null, error: null })),
                    })),
                  })),
                })),
              })),
            };
          }),
        };
      }
      if (table === 'ventures') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { metadata: ventureMetadata }, error: null })),
            })),
          })),
          update: vi.fn((payload) => {
            updates.push(payload);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { api, updates };
}

describe('getGateAttemptState (TR-3: DB-sourced, not cached)', () => {
  it('returns the fresh count and latest timestamp from eva_stage_gate_attempts', async () => {
    const { api } = makeSupabaseMock({ attemptCount: 951, lastAttemptAt: '2026-08-24T20:48:18Z' });
    const state = await getGateAttemptState(api, { ventureId: 'v1', stageNumber: 21 });
    expect(state).toEqual({ attemptCount: 951, lastAttemptAt: '2026-08-24T20:48:18Z' });
  });
});

describe('terminalizeVentureForRetryExhaustion (FR-2: terminal MANUAL_REQUIRED state)', () => {
  it('writes a reason-carrying gating_decision and preserves prior history', async () => {
    const { api, updates } = makeSupabaseMock({
      ventureMetadata: { gating_decision: { parked: false, decision: 'prior' } },
    });
    const ok = await terminalizeVentureForRetryExhaustion(api, {
      ventureId: 'v1', stageNumber: 21, attemptCount: 25, logger: console,
    });
    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);
    const meta = updates[0].metadata;
    expect(meta.gating_decision.parked).toBe(true);
    expect(meta.gating_decision.reason).toBe('gate_retry_ceiling_exceeded');
    expect(meta.gating_decision.decision).toMatch(/25 attempts/);
    expect(meta.gating_decision_history).toContainEqual({ parked: false, decision: 'prior' });
  });

  it('does not duplicate history when already terminalized for the same reason', async () => {
    const { api, updates } = makeSupabaseMock({
      ventureMetadata: { gating_decision: { parked: true, reason: 'gate_retry_ceiling_exceeded' } },
    });
    const ok = await terminalizeVentureForRetryExhaustion(api, {
      ventureId: 'v1', stageNumber: 21, attemptCount: 30, logger: console,
    });
    expect(ok).toBe(true);
    expect(updates).toHaveLength(0);
  });
});

describe('checkGateRetryCeiling (FR-1/FR-2 integration)', () => {
  it('proceeds when below backoff start', async () => {
    const { api } = makeSupabaseMock({ attemptCount: 2 });
    const result = await checkGateRetryCeiling(api, { ventureId: 'v1', stageNumber: 21, logger: console });
    expect(result).toEqual({ action: 'proceed', attemptCount: 2 });
  });

  it('skips when past backoff start and within the wait window', async () => {
    const { api } = makeSupabaseMock({ attemptCount: GATE_RETRY_BACKOFF_START, lastAttemptAt: new Date().toISOString() });
    const result = await checkGateRetryCeiling(api, { ventureId: 'v1', stageNumber: 21, logger: console });
    expect(result.action).toBe('skip');
  });

  it('proceeds again once the backoff window has elapsed, even with attemptCount unchanged', async () => {
    const longAgo = new Date(Date.now() - GATE_RETRY_BACKOFF_MAX_MS - 1000).toISOString();
    const { api } = makeSupabaseMock({ attemptCount: GATE_RETRY_BACKOFF_START, lastAttemptAt: longAgo });
    const result = await checkGateRetryCeiling(api, { ventureId: 'v1', stageNumber: 21, logger: console });
    expect(result.action).toBe('proceed');
  });

  it('terminalizes at or above GATE_RETRY_CEILING', async () => {
    const { api, updates } = makeSupabaseMock({ attemptCount: GATE_RETRY_CEILING, ventureMetadata: {} });
    const result = await checkGateRetryCeiling(api, { ventureId: 'v1', stageNumber: 21, logger: console });
    expect(result.action).toBe('terminalize');
    expect(updates).toHaveLength(1);
  });
});
