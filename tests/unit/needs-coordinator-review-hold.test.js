/**
 * SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001 (FR-3) — enforce the needs_coordinator_review hold on
 * BOTH acquisition paths. Non-mocked: the REAL classifyDispatchIneligibility / baselinedCandidateEligible
 * (self-claim) and assertSdDispatchable (directed) run; only the DB seam is a small in-memory stub.
 * Removing the gate axis makes these fail (the SD becomes claimable/dispatchable) — anti test-masking.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility, baselinedCandidateEligible } = require('../../lib/fleet/claim-eligibility.cjs');
const { assertSdDispatchable } = require('../../lib/coordinator/dispatch.cjs');

// Minimal chainable supabase stub: from(t).select().eq().maybeSingle() resolves a single seeded row.
function makeSb(rowByKey) {
  return {
    from() {
      let key = null;
      const b = {
        select() { return b; },
        eq(_col, val) { key = val; return b; },
        in() { return b; },
        async maybeSingle() { return { data: rowByKey[key] || null, error: null }; },
      };
      return b;
    },
  };
}
// A supabase stub whose SD lookup THROWS (transient error) — for the directed-path fail-open assertion.
function makeThrowingSb() {
  return { from() { const b = { select() { return b; }, eq() { return b; }, async maybeSingle() { throw new Error('db hiccup'); } }; return b; } };
}

const reviewPending = (key) => ({ sd_key: key, status: 'draft', sd_type: 'infrastructure', metadata: { needs_coordinator_review: true }, dependencies: [] });
const cleared = (key) => ({ sd_key: key, status: 'draft', sd_type: 'infrastructure', metadata: { needs_coordinator_review: false }, dependencies: [] });

describe('FR-1: classifyDispatchIneligibility needs_coordinator_review axis', () => {
  it("returns 'needs_coordinator_review' for a review-pending SD", () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { needs_coordinator_review: true } })).toBe('needs_coordinator_review');
  });
  it('returns null when the flag is false / absent', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { needs_coordinator_review: false } })).toBeNull();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: {} })).toBeNull();
  });
  it('is strict === true (a string "true" is NOT a hold)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { needs_coordinator_review: 'true' } })).toBeNull();
  });
  it('the hold wins even when the SD is fleet_critical (surfaced-then-excluded composition)', () => {
    // The SELF-CLAIM-WINDOW fix surfaces a fleet_critical SD into the pool, but it still routes through
    // this classifier — so a fleet_critical + review-pending SD is excluded (the hold wins).
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { fleet_critical: true, needs_coordinator_review: true } })).toBe('needs_coordinator_review');
  });
});

describe('FR-1: self-claim path (baselinedCandidateEligible) excludes a review-pending SD', () => {
  it('is NOT eligible while review-pending, and becomes eligible once cleared', async () => {
    const held = await baselinedCandidateEligible(makeSb({ 'SD-HOLD-1': reviewPending('SD-HOLD-1') }), 'SD-HOLD-1', { cwd: process.cwd() });
    expect(held).toBe(false);
    const ok = await baselinedCandidateEligible(makeSb({ 'SD-HOLD-1': cleared('SD-HOLD-1') }), 'SD-HOLD-1', { cwd: process.cwd() });
    expect(ok).toBe(true); // the clear IS the dispatch authorization
  });
  it('a fleet_critical + review-pending SD is still excluded on the self-claim path', async () => {
    const row = { sd_key: 'SD-FC-HOLD', status: 'draft', sd_type: 'infrastructure', metadata: { fleet_critical: true, needs_coordinator_review: true }, dependencies: [] };
    expect(await baselinedCandidateEligible(makeSb({ 'SD-FC-HOLD': row }), 'SD-FC-HOLD', { cwd: process.cwd() })).toBe(false);
  });
});

describe('FR-2: directed-assign path (assertSdDispatchable) refuses a review-pending SD', () => {
  const assignment = (sdKey) => ({ message_type: 'WORK_ASSIGNMENT', target_sd: sdKey, payload: {} });

  it('throws DISPATCH_SD_REVIEW_PENDING for a review-pending SD', async () => {
    const sb = makeSb({ 'SD-HOLD-2': reviewPending('SD-HOLD-2') });
    await expect(assertSdDispatchable(sb, assignment('SD-HOLD-2'), { warn() {}, error() {} }))
      .rejects.toMatchObject({ code: 'DISPATCH_SD_REVIEW_PENDING' });
  });
  it('dispatches normally once the flag is cleared', async () => {
    const sb = makeSb({ 'SD-HOLD-2': cleared('SD-HOLD-2') });
    await expect(assertSdDispatchable(sb, assignment('SD-HOLD-2'), { warn() {}, error() {} })).resolves.toBeUndefined();
  });
  it('FAILS OPEN on a transient lookup error (never wedges dispatch)', async () => {
    await expect(assertSdDispatchable(makeThrowingSb(), assignment('SD-HOLD-2'), { warn() {}, error() {} })).resolves.toBeUndefined();
  });
  it('does not review-gate a QF (the flag is an SD governance axis)', async () => {
    const sb = makeSb({ 'QF-20260630-001': { status: 'open' } });
    await expect(assertSdDispatchable(sb, assignment('QF-20260630-001'), { warn() {}, error() {} })).resolves.toBeUndefined();
  });
});
