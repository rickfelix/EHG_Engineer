/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-3 / TS-5 — the stale-advice watchdog must not saturate.
 *
 * resolveSolomonConductFacts counted stale pending advice with `.select('id')` then `data.length`.
 * PostgREST silently clamps an unpaginated select at 1000 rows, and the ledger passed 1000 some time
 * ago (1100 at time of writing). The probe read true only because its `created_at` cutoff happened
 * to shrink the set below the cap — an accident of the current data, not a property of the query.
 *
 * A watchdog that saturates is worse than none: it reports a stable number while the thing it
 * measures grows past it, and nothing about the output says the number stopped being real.
 *
 * Driven by an INJECTED fake client — no DB, no credentials. The `db` vitest project is disabled in
 * this repo, so a credential-gated test would skip silently and green, which is precisely the
 * invisible-pass shape that let FR-0's phantom-column defect live in the same file's neighbourhood.
 */
import { describe, it, expect } from 'vitest';
import { resolveSolomonConductFacts } from '../../lib/solomon/conduct-probes.js';

/**
 * Fake PostgREST. `head:true` + `count:'exact'` is answered with the true count and NO rows, which
 * is exactly how the real server behaves; a row-fetching caller gets the clamped array instead, so
 * the two strategies are distinguishable.
 */
function fakeClient({ trueCount, rowCap = 1000 }) {
  const seen = { headUsed: null, countMode: null, eqArgs: [] };
  const builder = {
    select(_cols, opts) {
      seen.headUsed = Boolean(opts && opts.head);
      seen.countMode = opts && opts.count ? opts.count : null;
      return builder;
    },
    eq(col, val) { seen.eqArgs.push([col, val]); return builder; },
    lt() {
      const head = seen.headUsed;
      return Promise.resolve(
        head
          ? { data: null, count: trueCount, error: null }
          // The clamp: an unpaginated fetch never returns more than the cap.
          : { data: Array.from({ length: Math.min(trueCount, rowCap) }, (_, i) => ({ id: `r${i}` })), count: null, error: null },
      );
    },
  };
  return { seen, from() { return builder; } };
}

describe('FR-3 — stale-advice count cannot silently saturate', () => {
  it('reports the TRUE count above the 1000-row cap', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL. With `data.length` this reads 1000 and
    // keeps reading 1000 forever, however large the real backlog becomes.
    const c = fakeClient({ trueCount: 4321 });
    return resolveSolomonConductFacts(c).then((facts) => {
      expect(facts.staleOpenAdviceCount).toBe(4321);
    });
  });

  it('asks the SERVER to count and transfers no rows', () => {
    // Pins the mechanism, not just the number: a caller that fetched 4321 rows and measured
    // `.length` would satisfy the assertion above while re-introducing the fragility the moment
    // anything reintroduces a cap.
    const c = fakeClient({ trueCount: 12 });
    return resolveSolomonConductFacts(c).then(() => {
      expect(c.seen.headUsed).toBe(true);
      expect(c.seen.countMode).toBe('exact');
    });
  });

  it('reports null rather than a wrong number when the count is unusable', () => {
    // Fail-closed on the VALUE, not fail-open into a plausible one. A watchdog that invents a
    // number is the failure this SD exists to remove.
    const broken = { from: () => ({ select: () => ({ eq: () => ({ lt: () => Promise.resolve({ count: null, error: { message: 'boom' } }) }) }) }) };
    return resolveSolomonConductFacts(broken).then((facts) => {
      expect(facts.staleOpenAdviceCount).toBeNull();
    });
  });

  it('filters on decision=pending and applies NO expiry filter — the query shape, not just the number', () => {
    // REWRITTEN AFTER REVIEW. The previous version asserted only that a count of 566 came back,
    // which is test 1 with a different number: the fake ignores filter arguments, so deleting the
    // decision filter entirely, or flipping it to 'accepted', both survived it. It claimed to pin
    // "expired rows still count" and pinned nothing.
    //
    // What IS assertable in the unit tier is the query SHAPE, and that half was never blocked on the
    // migration — it simply was not asserted. An expired row keeps decision='pending' (FR-1 put
    // expiry in its own column), so a probe filtering on 'pending' and nothing else still sees it.
    // The DB-behaviour half genuinely is not unit-testable: it needs the applied schema AND the job,
    // and routing it through the db project would skip silently green — the invisible pass this SD
    // exists to remove. It is stated as an apply-time claim rather than faked here.
    const c = fakeClient({ trueCount: 566 });
    return resolveSolomonConductFacts(c).then((facts) => {
      expect(facts.staleOpenAdviceCount).toBe(566);
      expect(c.seen.eqArgs).toContainEqual(['decision', 'pending']);
      const cols = c.seen.eqArgs.map(([col]) => col);
      expect(cols, 'the probe must not filter on an expiry column').not.toContain('judgment_expired_at');
    });
  });
});
