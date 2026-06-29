// SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-B (THE churn fix) — disposition-gated auto-mint.
// CHECK #11 UNDISPOSITIONED_OR_NON_BUILD blocks auto-minting un-reviewed brainstorm items when
// distilled-only mode is on; default OFF keeps legacy behavior. These tests pair the FALSE-POSITIVE
// proofs (a build-dispositioned item, and flag-OFF, still pass) with the RETAINED-TEETH proofs
// (undispositioned + non-build items are blocked when the flag is on).
import { describe, it, expect } from 'vitest';
import {
  evaluateRefillCandidate,
  hasBuildDisposition,
  REFILL_INVALID_REASONS,
} from '../../lib/sourcing-engine/refill-candidate-validity.js';
import { isDistilledOnly, promoteStagedCandidate, selectRefillBatch } from '../../lib/sourcing-engine/refill-auto-promote.js';

// A structurally-VALID staged candidate (passes every pre-existing check) so CHECK #11 is the only
// variable under test. disposition overrides per case.
function validItem(extra = {}) {
  return {
    item_disposition: 'pending',
    promoted_to_sd_key: null,
    title: 'Wire the coordinator pending-proposals gauge into the belt-low forecast path',
    source_type: 'feedback',
    source_id: 'FB-12345',
    ...extra,
  };
}

describe('hasBuildDisposition', () => {
  it('true only for a build disposition (top-level or metadata)', () => {
    expect(hasBuildDisposition({ disposition: 'build' })).toBe(true);
    expect(hasBuildDisposition({ disposition: 'BUILD' })).toBe(true);
    expect(hasBuildDisposition({ metadata: { disposition: 'build' } })).toBe(true);
  });
  it('false for absent / non-build dispositions', () => {
    expect(hasBuildDisposition({})).toBe(false);
    expect(hasBuildDisposition({ disposition: 'defer' })).toBe(false);
    expect(hasBuildDisposition({ disposition: 'decline' })).toBe(false);
    expect(hasBuildDisposition({ disposition: '' })).toBe(false);
    expect(hasBuildDisposition(null)).toBe(false);
  });
});

describe('evaluateRefillCandidate CHECK #11 (FALSE-POSITIVE proofs)', () => {
  it('flag OFF (default): an undispositioned item is STILL valid (legacy behavior preserved)', () => {
    const v = evaluateRefillCandidate(validItem()); // no distilledOnly
    expect(v.valid).toBe(true);
  });
  it('flag ON: a build-dispositioned item passes', () => {
    const v = evaluateRefillCandidate(validItem({ disposition: 'build' }), { distilledOnly: true });
    expect(v.valid).toBe(true);
    expect(v.reason).toBeNull();
  });
  it('flag ON: a build disposition in metadata passes', () => {
    const v = evaluateRefillCandidate(validItem({ metadata: { disposition: 'build' } }), { distilledOnly: true });
    expect(v.valid).toBe(true);
  });
});

describe('evaluateRefillCandidate CHECK #11 (RETAINED-TEETH proofs)', () => {
  it('flag ON: an UNDISPOSITIONED item is blocked', () => {
    const v = evaluateRefillCandidate(validItem(), { distilledOnly: true });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe(REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD);
  });
  it('flag ON: a NON-BUILD (defer) disposition is blocked', () => {
    const v = evaluateRefillCandidate(validItem({ disposition: 'defer' }), { distilledOnly: true });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe(REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD);
  });
  it('lifecycle reasons still fire FIRST (CHECK #11 does not mask a structural failure)', () => {
    // already-promoted should report ALREADY_PROMOTED, not the disposition reason.
    const v = evaluateRefillCandidate(validItem({ promoted_to_sd_key: 'SD-X', disposition: 'defer' }), { distilledOnly: true });
    expect(v.reason).toBe(REFILL_INVALID_REASONS.ALREADY_PROMOTED);
  });
});

describe('isDistilledOnly flag (SD-LEO-INFRA-CORPUS-PROMOTE-ONLY-VIA-DISTILL-001: FAIL-CLOSED by default)', () => {
  it('defaults to TRUE (distilled-only enforced); only an explicit "off" break-glass disables it', () => {
    // chairman-authoritative: raw corpus must NEVER auto-promote — so unset/anything-but-"off" enforces.
    expect(isDistilledOnly({})).toBe(true);                                         // unset -> enforced
    expect(isDistilledOnly({ SOURCING_AUTO_REFILL_DISTILLED_ONLY: 'on' })).toBe(true);
    expect(isDistilledOnly({ SOURCING_AUTO_REFILL_DISTILLED_ONLY: 'true' })).toBe(true);
    expect(isDistilledOnly({ SOURCING_AUTO_REFILL_DISTILLED_ONLY: 'off' })).toBe(false); // explicit escape only
  });
});

describe('FR-2 cron wiring: the batch selector enforces distilled-only by default', () => {
  it('an UNDISTILLED raw-corpus item is excluded from the promote batch while a build-dispositioned one passes', () => {
    const undistilled = validItem({ source_id: 'rw-undistilled', title: 'Track P-Doom calculation methods for AI opportunities' });
    const built = validItem({ source_id: 'rw-built', disposition: 'build', title: 'Wire the pending-proposals gauge into the belt-low forecast path' });
    // the cron now passes distilledOnly: isDistilledOnly() (default true)
    const sel = selectRefillBatch([undistilled, built], { distilledOnly: isDistilledOnly({}) });
    const ids = sel.batch.map((b) => b.source_id);
    expect(ids).toContain('rw-built');
    expect(ids).not.toContain('rw-undistilled');
  });

  it('with /distill off (no build-dispositioned items), the engine promotes NOTHING', () => {
    const rows = [
      validItem({ source_id: 'a', title: 'See how we can use Mercury for banking' }),
      validItem({ source_id: 'b', title: 'Anticipate legal attacks and be prepared' }),
    ];
    const sel = selectRefillBatch(rows, { distilledOnly: isDistilledOnly({}) });
    expect(sel.batch).toHaveLength(0);
  });
});

describe('promoteStagedCandidate disposition guard (per-mint teeth)', () => {
  // A supabase stub that would mint if reached; the guard must short-circuit BEFORE any DB call.
  function mintingSb() {
    return { from() { throw new Error('DB should not be touched when the disposition guard blocks'); } };
  }

  it('flag ON + undispositioned item → refuses to mint (no DB touch), reason UNDISPOSITIONED_OR_NON_BUILD', async () => {
    const out = await promoteStagedCandidate(mintingSb(), { id: 'rw-1', ...validItem() }, { apply: true, distilledOnly: true });
    expect(out.promoted).toBe(false);
    expect(out.reason).toBe(REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD);
  });

  it('flag OFF (default opts) → guard inert (reaches the existence check)', async () => {
    // With distilledOnly omitted and the env unset, the guard is inert; the existence query runs.
    let queried = false;
    const sb = { from() { queried = true; return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ sd_key: 'SD-REFILL-X' }] }) }) }) }; } };
    const out = await promoteStagedCandidate(sb, { id: 'rw-2', ...validItem() }, { apply: true, distilledOnly: false });
    expect(queried).toBe(true);
    expect(out.reason).not.toBe(REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD);
  });
});
