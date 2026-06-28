/**
 * SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001
 *
 * The ranker's 'claimable' depth must match the actually-claimable set the worker resolver enforces.
 * Before this fix, coordinator-backlog-rank.mjs re-implemented a LOOSER filter that was MISSING the
 * requires_human_action skip — so RHA-held SDs (and, defensively, deferred/terminal) leaked onto
 * 'claimable', inflating belt depth and masking genuine starvation behind a deliberate all-held state.
 * The fix routes the DB-free axes through the SHARED claim-eligibility predicate
 * (classifyDispatchIneligibility) via the pure exported helper claimableDbFreeReason().
 *
 * Importing the module must NOT run the DB-touching backlog pass (entrypoint guard).
 */
import { describe, it, expect } from 'vitest';
import { claimableDbFreeReason } from '../../scripts/coordinator-backlog-rank.mjs';
import { classifyDispatchIneligibility } from '../../lib/fleet/claim-eligibility.cjs';

const cleanLeaf = (sd_key) => ({
  sd_key, sd_type: 'infrastructure', status: 'draft', current_phase: 'LEAD',
  claiming_session_id: null, metadata: {},
});

describe('claimableDbFreeReason — ranker claimable depth == worker claim-eligibility', () => {
  it('a genuinely-claimable draft leaf IS claimable (reason null)', () => {
    expect(claimableDbFreeReason(cleanLeaf('SD-LEO-INFRA-CLEAN-001'))).toBeNull();
  });

  it('THE FIX: requires_human_action=true is NOT claimable (was the leaking axis)', () => {
    const d = { ...cleanLeaf('SD-EHG-VENTURE1-X'), metadata: { requires_human_action: true } };
    expect(claimableDbFreeReason(d)).toBe('human_action_required');
  });

  it('co_author_pending=true is NOT claimable (awaiting convergence)', () => {
    const d = { ...cleanLeaf('SD-LEO-INFRA-CO-001'), metadata: { co_author_pending: true } };
    expect(claimableDbFreeReason(d)).toBe('co_author_pending');
  });

  it('an orchestrator parent is NOT claimable', () => {
    const d = { ...cleanLeaf('SD-EHG-PRODUCT-UIUX-REMEDIATION-001'), sd_type: 'orchestrator' };
    expect(claimableDbFreeReason(d)).toBe('orchestrator_parent');
  });

  it('a claimed SD (live session) is excluded', () => {
    const d = { ...cleanLeaf('SD-X'), claiming_session_id: 'sess-123' };
    expect(claimableDbFreeReason(d)).toBe('claimed');
  });

  it('an in-flight SD (started past LEAD draft) is excluded from FRESH ranking', () => {
    const d = { ...cleanLeaf('SD-Y'), current_phase: 'EXEC' };
    expect(claimableDbFreeReason(d)).toBe('in_flight');
  });

  it('belt depth == claim-eligibility-claimable depth (parity over a mixed set)', () => {
    const rows = [
      cleanLeaf('SD-CLEAN-A'),                                                              // claimable
      cleanLeaf('SD-CLEAN-B'),                                                              // claimable
      { ...cleanLeaf('SD-RHA'), metadata: { requires_human_action: true } },               // NOT
      { ...cleanLeaf('SD-CO'), metadata: { co_author_pending: true } },                    // NOT
      { ...cleanLeaf('SD-ORCH'), sd_type: 'orchestrator' },                                // NOT
    ];
    // Ranker's DB-free claimable set:
    const rankerClaimable = rows.filter((d) => claimableDbFreeReason(d) === null).map((d) => d.sd_key);
    // The worker resolver's DB-free eligibility over the SAME unclaimed/non-in-flight rows:
    const resolverClaimable = rows.filter((d) => classifyDispatchIneligibility(d) === null).map((d) => d.sd_key);
    expect(rankerClaimable).toEqual(['SD-CLEAN-A', 'SD-CLEAN-B']);
    expect(rankerClaimable).toEqual(resolverClaimable); // depths agree — no over-count
  });

  it('module imported without running the DB pass (entrypoint guard)', () => {
    expect(typeof claimableDbFreeReason).toBe('function');
  });
});
