/**
 * SD-LEO-INFRA-STALE-SESSION-SWEEP-001 — FR-2 (keeper-is-not-evictee), FR-6 (never evict a row
 * the sweep itself classified alive), FR-3 (dedupe), FR-4 (persisted evidence).
 *
 * WHY THE LOGIC IS TESTED AS A PURE FUNCTION AND NOT THROUGH main(). The refusals live in the
 * conflict-eviction loop of a ~4,000-line main() that opens a live Supabase client. Testing them
 * in place would mean asserting on SOURCE TEXT, which proves WIRING and never FIRING — a guard can
 * be present, correct, and unreachable (that exact shape shipped on a sibling SD: a correctly
 * written guard ordered behind a check that rejected everything it guarded). Extracting them means
 * the shipped path calls the same function these tests call.
 *
 * The few checks below that genuinely CAN only inspect source are labelled [WIRING] and are never
 * counted as behavioural evidence.
 *
 * Tests are labelled [REGRESSION] (would have failed against the pre-fix behaviour, i.e. they
 * witness the bug) or [GUARD-RAIL] (pins an invariant the fix must not break).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { refuseConflictEviction, ALIVE_FAMILY } = require_('../../../lib/fleet/claim-release-guard.cjs');

const SWEEP = path.resolve(process.cwd(), 'scripts/stale-session-sweep.cjs');
const sweepSrc = readFileSync(SWEEP, 'utf8');

/**
 * WHY THE [REGRESSION] LABELS ARE EARNED, stated once here instead of via a fake helper.
 *
 * An earlier draft asserted regression-ness by calling a `preFixWouldEvict()` that ignored its
 * arguments and returned a constant `true`. That is a check that cannot fail dressed up as
 * evidence — the same shape this suite exists to criticise — so it is gone.
 *
 * The honest statement is structural: before this change the eviction loop's ONLY guards were
 * (a) skip-if-already-in-`dead` and (b) `shouldHoldClaim`. Neither can express "the row you are
 * about to evict IS the keeper" (identity was never compared) nor "your own classifier already
 * called this row alive" (`status` was never read at the eviction site). Every fixture below is
 * chosen so neither pre-existing guard fires, so each one WAS evicted before and is refused now.
 * That is verifiable by reading the guards, not by a stub that agrees with me.
 */

describe('FR-2 — keeper is never its own evictee', () => {
  it('[REGRESSION] refuses when the same session_id is both keeper and evictee', () => {
    const s = { session_id: 'dup-1', status: 'DEAD' };
    const r = refuseConflictEviction({ evict: s, keeper: { session_id: 'dup-1' }, bucketSize: 2 });
    expect(r.refuse).toBe(true);
    expect(r.code).toBe('keeper_is_evictee');
    // no pre-existing guard compares identity, so this row was evicted before this change
  });

  it('[REGRESSION] refuses even when the row looks perfectly evictable on every other axis', () => {
    // DEAD status, stale, no liveness signal — nothing except identity saves it.
    const s = { session_id: 'x', status: 'DEAD', isStale: true, pidUnverifiable: false };
    expect(refuseConflictEviction({ evict: s, keeper: { session_id: 'x' } }).code).toBe('keeper_is_evictee');
  });

  it('[GUARD-RAIL] does NOT refuse a genuine two-party conflict — the sweep must still work', () => {
    const r = refuseConflictEviction({
      evict: { session_id: 'loser', status: 'DEAD' },
      keeper: { session_id: 'winner' },
      bucketSize: 2,
    });
    expect(r.refuse).toBe(false);
  });

  it('[GUARD-RAIL] identity check precedes the status check, so a corrupt bucket is named as such', () => {
    // Same session, alive status: BOTH conditions hold. The operator needs the bucket-corruption
    // signal, not the routine liveness one, so ordering is behaviour and is pinned here.
    const s = { session_id: 'both', status: 'ALIVE_SOURCE_SIDE' };
    expect(refuseConflictEviction({ evict: s, keeper: { session_id: 'both' } }).code).toBe('keeper_is_evictee');
  });
});

describe('FR-6 — never evict a row this sweep just classified alive', () => {
  it('[REGRESSION] refuses the exact 2026-07-27 production shape', () => {
    // claude_sessions b25ec3e5 was released with SWEEP_CONFLICT_RESOLUTION while carrying
    // status=ALIVE_SOURCE_SIDE and isStale=false.
    const incident = { session_id: 'b25ec3e5-89d4-4b78-95f5-873bf44c5a8c', status: 'ALIVE_SOURCE_SIDE', isStale: false };
    const keeper = { session_id: '6f7d6f42-2003-4310-b28f-7bc7814c2597' };
    const r = refuseConflictEviction({ evict: incident, keeper, bucketSize: 2 });
    expect(r.refuse).toBe(true);
    expect(r.code).toBe('classified_alive');
    // status was never read at the eviction site before this change: the bug is witnessed
  });

  it.each(ALIVE_FAMILY)('[REGRESSION] refuses alive-family status %s', (status) => {
    const r = refuseConflictEviction({ evict: { session_id: 'a', status }, keeper: { session_id: 'b' } });
    expect(r.refuse).toBe(true);
    expect(r.code).toBe('classified_alive');
  });

  it.each(['DEAD', 'STALE_UNKNOWN', 'HEADLESS_ZOMBIE', 'PID_UNVERIFIABLE'])(
    '[GUARD-RAIL] does NOT refuse non-alive status %s — the guard must not be a blanket no-op',
    (status) => {
      expect(refuseConflictEviction({ evict: { session_id: 'a', status }, keeper: { session_id: 'b' } }).refuse).toBe(false);
    },
  );

  it('[GUARD-RAIL] an unknown/absent status does not silently become "alive"', () => {
    // Absence of evidence must not be promoted to a hold here; the liveness guard owns that
    // decision. This check refuses only a POSITIVE alive classification.
    expect(refuseConflictEviction({ evict: { session_id: 'a', status: undefined }, keeper: { session_id: 'b' } }).refuse).toBe(false);
    expect(refuseConflictEviction({ evict: { session_id: 'a' }, keeper: { session_id: 'b' } }).refuse).toBe(false);
  });

  it('[GUARD-RAIL] ALIVE_FAMILY matches the sweep\'s own classifier vocabulary', () => {
    // If the sweep gains a new alive status and this list is not updated, the contradiction guard
    // goes blind to it. Pin the three the classifier can currently emit.
    expect([...ALIVE_FAMILY].sort()).toEqual(['ACTIVE', 'ALIVE_NO_HEARTBEAT', 'ALIVE_SOURCE_SIDE']);
    for (const s of ALIVE_FAMILY) expect(sweepSrc).toContain(`'${s}'`);
  });
});

describe('degenerate inputs', () => {
  it('[GUARD-RAIL] missing keeper or evictee does not throw and does not invent a refusal', () => {
    expect(refuseConflictEviction({}).refuse).toBe(false);
    expect(refuseConflictEviction({ evict: null, keeper: { session_id: 'k' } }).refuse).toBe(false);
    expect(refuseConflictEviction().refuse).toBe(false);
  });

  it('[GUARD-RAIL] two rows with null session_ids are not treated as the same session', () => {
    // null === null would be true; a nullish id must never manufacture a self-eviction verdict
    // (or, worse, mask a real one).
    const r = refuseConflictEviction({ evict: { session_id: null, status: 'DEAD' }, keeper: { session_id: null } });
    expect(r.code).not.toBe('keeper_is_evictee');
  });
});

describe('[WIRING] the sweep actually calls the guard, and FR-3/FR-4 land at their sites', () => {
  // These inspect source and therefore prove PRESENCE, not FIRING. They exist so that deleting
  // the call site fails here rather than silently reverting the behaviour the tests above prove.
  it('the eviction loop calls refuseConflictEviction before mutating', () => {
    expect(sweepSrc).toMatch(/refuseConflictEviction\(\{\s*evict,\s*keeper/);
    const callIdx = sweepSrc.indexOf('refuseConflictEviction({ evict, keeper');
    const updateIdx = sweepSrc.indexOf("released_reason: 'SWEEP_CONFLICT_RESOLUTION'");
    expect(callIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeLessThan(updateIdx); // refusal precedes the write
  });

  it('FR-3: both grouping sites dedupe by session_id', () => {
    expect(sweepSrc).toContain('seenSessionIds');
    expect(sweepSrc).toContain('seenBranchSessionIds');
  });

  it('FR-4: eviction evidence records keeper, evictee, bucket size and the classifier verdict', () => {
    expect(sweepSrc).toContain("event_type: 'SWEEP_CONFLICT_EVICTION'");
    for (const k of ['keeper_session_id', 'evictee_session_id', 'bucket_size', 'evictee_status', 'guard_reason']) {
      expect(sweepSrc).toContain(k);
    }
  });
});
