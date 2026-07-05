/**
 * QF-20260704-193: requires_human_action holds carried reasons under AD-HOC metadata
 * keys (not_worker_claimable_reason / review_hold_reason / dispatch_ineligible_reason /
 * deferred_by / pilot_throwaway) — no surface printed them, so a 3 AM operator could
 * not tell deliberate parking from an accidental freeze without hand-querying metadata
 * (live specimen: 47 rha-frozen sprint children, 2026-07-05).
 *
 * Under test: the SSOT coalescing reader in lib/fleet/claim-eligibility.cjs, its
 * formatter, and computeClaimableLeaves returning humanActionHolds for the dashboard.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveHoldProvenance, formatHoldProvenance } = require('../../../lib/fleet/claim-eligibility.cjs');
import { computeClaimableLeaves } from '../../../scripts/coordinator-backlog-rank.mjs';

describe('resolveHoldProvenance — coalesces every known writer key', () => {
  it('canonical requires_human_action_reason wins over every legacy key', () => {
    const p = resolveHoldProvenance({
      requires_human_action_reason: 'canonical reason',
      requires_human_action_by: 'coordinator-x',
      requires_human_action_at: '2026-07-05T00:00:00Z',
      not_worker_claimable_reason: 'legacy reason',
    });
    expect(p).toEqual({ reason: 'canonical reason', set_by: 'coordinator-x', set_at: '2026-07-05T00:00:00Z', source_key: 'requires_human_action_reason' });
  });

  it('reads the coordinator-defer keys (the 47 frozen sprint children shape)', () => {
    const p = resolveHoldProvenance({
      requires_human_action: true,
      not_worker_claimable_reason: 'PARKED VENTURE — prove-one-venture mission (chairman-anchored 07-02)',
      deferred_by: 'coordinator-3323e19a',
      deferred_at: '2026-07-03T16:30:00Z',
    });
    expect(p.reason).toMatch(/PARKED VENTURE/);
    expect(p.set_by).toBe('coordinator-3323e19a');
    expect(p.source_key).toBe('not_worker_claimable_reason');
  });

  it('reads review_hold_reason (bridge child path) and dispatch_ineligible_reason', () => {
    expect(resolveHoldProvenance({ review_hold_reason: 'needs coordinator review' }).source_key).toBe('review_hold_reason');
    expect(resolveHoldProvenance({ dispatch_ineligible_reason: 'repo mismatch' }).source_key).toBe('dispatch_ineligible_reason');
  });

  it('reads pilot_throwaway and bare deferred_by as last-resort provenance', () => {
    expect(resolveHoldProvenance({ pilot_throwaway: true }).reason).toBe('pilot throwaway venture');
    const d = resolveHoldProvenance({ deferred_by: 'adam-1' });
    expect(d.reason).toBe('deferred by adam-1');
    expect(d.source_key).toBe('deferred_by');
  });

  it('returns null for a bare boolean hold (deliberate-vs-accidental genuinely undecidable)', () => {
    expect(resolveHoldProvenance({ requires_human_action: true })).toBeNull();
    expect(resolveHoldProvenance({})).toBeNull();
    expect(resolveHoldProvenance(null)).toBeNull();
    expect(resolveHoldProvenance({ not_worker_claimable_reason: '   ' })).toBeNull();
  });
});

describe('formatHoldProvenance — one-line render', () => {
  it('composes reason + by + at, and attests when provenance is absent', () => {
    expect(formatHoldProvenance({ reason: 'parked', set_by: 'coord-1', set_at: '2026-07-03' })).toBe('parked — by coord-1 @ 2026-07-03');
    expect(formatHoldProvenance({ reason: 'parked', set_by: null, set_at: null })).toBe('parked');
    expect(formatHoldProvenance(null)).toBe('no reason recorded');
  });
});

describe('computeClaimableLeaves — returns humanActionHolds with provenance (dashboard feed)', () => {
  it('held rows land in humanActionHolds with their coalesced provenance; clean rows stay claimable', async () => {
    const rows = [
      {
        sd_key: 'SD-HELD-001', title: 'held', status: 'draft', sd_type: 'feature', priority: 'high',
        created_at: '2026-07-01T00:00:00Z', current_phase: 'LEAD', claiming_session_id: null, dependencies: null, parent_sd_id: null,
        metadata: { requires_human_action: true, not_worker_claimable_reason: 'PARKED VENTURE', deferred_by: 'coordinator-3323e19a' },
      },
      {
        sd_key: 'SD-CLEAN-001', title: 'clean draft with a real description long enough to not be a bare shell', status: 'draft', sd_type: 'feature', priority: 'high',
        created_at: '2026-07-01T00:00:00Z', current_phase: 'LEAD', claiming_session_id: null, dependencies: null, parent_sd_id: null,
        metadata: {}, description: 'a genuine description of the work to be done here',
      },
    ];
    const sb = {
      from: () => ({
        select: () => ({
          not: () => Promise.resolve({ data: rows, error: null }),
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };
    const result = await computeClaimableLeaves(sb, { quiet: true });
    expect(result.humanActionHolds).toHaveLength(1);
    expect(result.humanActionHolds[0].sd_key).toBe('SD-HELD-001');
    expect(result.humanActionHolds[0].provenance.reason).toBe('PARKED VENTURE');
    expect(result.humanActionHolds[0].provenance.set_by).toBe('coordinator-3323e19a');
    expect(result.claimable.map((d) => d.sd_key)).toContain('SD-CLEAN-001');
    expect(result.claimable.map((d) => d.sd_key)).not.toContain('SD-HELD-001');
  });
});
