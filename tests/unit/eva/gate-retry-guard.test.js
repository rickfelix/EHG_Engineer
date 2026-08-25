/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-1/FR-2/FR-5) -- bounded retry ceiling + backoff.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  GATE_RETRY_CEILING,
  GATE_RETRY_BACKOFF_START,
  shouldSkipForBackoff,
  getGateAttemptCount,
  terminalizeVentureForRetryExhaustion,
  checkGateRetryCeiling,
} from '../../../lib/eva/gate-retry-guard.js';

describe('shouldSkipForBackoff (FR-1: backoff schedule)', () => {
  it('never skips below GATE_RETRY_BACKOFF_START', () => {
    for (let n = 0; n < GATE_RETRY_BACKOFF_START; n++) {
      expect(shouldSkipForBackoff(n)).toBe(false);
    }
  });

  it('produces an increasing gap between evaluated attempts as the count grows', () => {
    // Count how many of the next 15 ticks past the backoff start are actually evaluated
    // (not skipped) in each of two windows -- the later window must evaluate strictly less
    // often than the earlier window, proving genuine backoff (not a flat no-op skip).
    const evaluated = (from, to) => {
      let n = 0;
      for (let i = from; i < to; i++) if (!shouldSkipForBackoff(i)) n++;
      return n;
    };
    const early = evaluated(GATE_RETRY_BACKOFF_START, GATE_RETRY_BACKOFF_START + 6);
    const late = evaluated(GATE_RETRY_CEILING - 6, GATE_RETRY_CEILING);
    expect(late).toBeLessThan(early);
  });

  it('a no-backoff hard stop would fail this: at least one attempt between start and ceiling is skipped', () => {
    let sawSkip = false;
    for (let n = GATE_RETRY_BACKOFF_START; n < GATE_RETRY_CEILING; n++) {
      if (shouldSkipForBackoff(n)) sawSkip = true;
    }
    expect(sawSkip).toBe(true);
  });
});

function makeSupabaseMock({ attemptCount = 0, ventureMetadata = {} } = {}) {
  const updates = [];
  const api = {
    from: vi.fn((table) => {
      if (table === 'eva_stage_gate_attempts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: attemptCount, error: null })),
            })),
          })),
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

describe('getGateAttemptCount (TR-3: DB-sourced, not cached)', () => {
  it('returns the fresh count from eva_stage_gate_attempts', async () => {
    const { api } = makeSupabaseMock({ attemptCount: 951 });
    const count = await getGateAttemptCount(api, { ventureId: 'v1', stageNumber: 21 });
    expect(count).toBe(951);
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

  it('terminalizes at or above GATE_RETRY_CEILING', async () => {
    const { api, updates } = makeSupabaseMock({ attemptCount: GATE_RETRY_CEILING, ventureMetadata: {} });
    const result = await checkGateRetryCeiling(api, { ventureId: 'v1', stageNumber: 21, logger: console });
    expect(result.action).toBe('terminalize');
    expect(updates).toHaveLength(1);
  });
});
