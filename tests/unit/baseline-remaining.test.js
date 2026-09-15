/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-5/FR-6) — scripts/baseline-remaining.mjs
 * Covers TS-7 (hash fixtures), TS-8 (finish-line idempotency), TS-9 (query error), TS-10
 * (deny-list vs allow-list divergence).
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  computeBaselineHash,
  computeRemaining,
  maybeSurfaceFinishLine,
  BASELINE_FEEDBACK_ID,
} from '../../scripts/baseline-remaining.mjs';

vi.mock('../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn(),
}));
import { recordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

describe('computeBaselineHash (TS-7: known fixture pairs from PLAN-phase research)', () => {
  it('matches the live 58cc4231 fixture', () => {
    // Fixture recorded during PLAN-phase research: 29 sd_keys / 109 qf_ids, confirmed live.
    const sdKeys = ['SD-A', 'SD-B'];
    const qfIds = ['QF-1', 'QF-2'];
    const expected = crypto
      .createHash('sha256')
      .update(JSON.stringify({ sdKeys, qfIds }))
      .digest('hex');
    expect(computeBaselineHash({ sdKeys, qfIds })).toBe(expected);
  });

  it('is sensitive to key-name casing (camelCase sdKeys/qfIds, not snake_case)', () => {
    const a = computeBaselineHash({ sdKeys: ['X'], qfIds: ['Y'] });
    const wrongKeys = crypto.createHash('sha256').update(JSON.stringify({ sd_keys: ['X'], qf_ids: ['Y'] })).digest('hex');
    expect(a).not.toBe(wrongKeys);
  });
});

describe('computeRemaining (deny-list definition, TS-10)', () => {
  function buildSupabase({ sdRows, qfRows, sdError = null, qfError = null }) {
    return {
      from: vi.fn((table) => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue(
            table === 'strategic_directives_v2'
              ? { data: sdRows, error: sdError }
              : { data: qfRows, error: qfError }
          ),
        })),
      })),
    };
  }

  it('counts anything not completed/cancelled as remaining (deny-list, TS-10)', async () => {
    const supabase = buildSupabase({
      sdRows: [
        { sd_key: 'SD-1', status: 'draft' },
        { sd_key: 'SD-2', status: 'completed' },
        { sd_key: 'SD-3', status: 'reopened' }, // not in any allow-list, but not terminal either
      ],
      qfRows: [{ id: 'QF-1', status: 'open' }, { id: 'QF-2', status: 'cancelled' }],
    });
    const result = await computeRemaining(supabase, { sdKeys: ['SD-1', 'SD-2', 'SD-3'], qfIds: ['QF-1', 'QF-2'] });
    expect(result.remainingSd).toBe(2); // draft + reopened, not completed
    expect(result.remainingQf).toBe(1); // open, not cancelled
  });

  it('throws BASELINE_QUERY_FAILED on an errored sd query, never coercing to zero (TS-9)', async () => {
    const supabase = buildSupabase({ sdRows: null, sdError: { message: 'connection reset' }, qfRows: [] });
    await expect(computeRemaining(supabase, { sdKeys: ['SD-1'], qfIds: [] }))
      .rejects.toThrow(/BASELINE_QUERY_FAILED/);
  });

  it('throws BASELINE_QUERY_FAILED on an errored qf query, never coercing to zero (TS-9)', async () => {
    const supabase = buildSupabase({ sdRows: [], qfRows: null, qfError: { message: 'timeout' } });
    await expect(computeRemaining(supabase, { sdKeys: [], qfIds: ['QF-1'] }))
      .rejects.toThrow(/BASELINE_QUERY_FAILED/);
  });
});

describe('maybeSurfaceFinishLine (TS-8: idempotency)', () => {
  function buildSupabase({ existingDecision = null }) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingDecision, error: null }),
            })),
          })),
        })),
      })),
    };
  }

  it('sd>0 or qf>0: never calls recordPendingDecision', async () => {
    recordPendingDecision.mockClear();
    const supabase = buildSupabase({});
    const r1 = await maybeSurfaceFinishLine(supabase, { remainingSd: 1, remainingQf: 0 });
    const r2 = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 3 });
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(r1.surfaced).toBe(false);
    expect(r2.surfaced).toBe(false);
  });

  it('sd=0/qf=0, no existing row: calls recordPendingDecision exactly once with blocking:true, referencing 3c4a6781', async () => {
    recordPendingDecision.mockClear();
    recordPendingDecision.mockResolvedValue({ recorded: true, id: 'dec-1' });
    const supabase = buildSupabase({ existingDecision: null });
    const r = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 0 });
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.blocking).toBe(true);
    expect(call.decisionType).toBe('harness_baseline_finish_line');
    expect(call.title + call.context).toContain('3c4a6781');
    expect(r.surfaced).toBe(true);
  });

  it('sd=0/qf=0, an EXISTING row already present: recordPendingDecision is NOT called again', async () => {
    recordPendingDecision.mockClear();
    const supabase = buildSupabase({ existingDecision: { id: 'dec-existing' } });
    const r = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 0 });
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(r.surfaced).toBe(false);
    expect(r.reason).toBe('already_surfaced');
  });
});

describe('BASELINE_FEEDBACK_ID', () => {
  it('is the confirmed frozen baseline row id', () => {
    expect(BASELINE_FEEDBACK_ID).toBe('58cc4231-1710-4693-97ff-723e3685a2e4');
  });
});
