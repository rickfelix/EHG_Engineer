/**
 * FR-3: Solomon's review can now SEE its subject.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * WHY THE THREE ARMS RUN THROUGH THE RESOLVER. A probe is a pure fact-consumer, so
 * `expect(probe({breach}).verdict).toBe('fail')` tests an if-statement — not whether anything can
 * actually observe Solomon's behaviour. And a FAIL-ONLY assertion is satisfied by a hardcoded fail.
 * It is the pass/fail DELTA, produced by the same resolver reading different live data, that
 * demonstrates the check is wired to reality.
 *
 * The Adam precedent documents this exact hole in its own integration test — "current resolvers
 * leave most facts null => unknown => no fail" — i.e. Adam's resolvers have never been exercised.
 * Cloning that pattern would have reproduced the blindness this SD exists to remove.
 *
 * No real database is touched: supabase is injected.
 */
import { describe, it, expect } from 'vitest';
import {
  probeAdviceClosure, resolveSolomonConductFacts, runSolomonConductProbes, VERDICT, DEFAULT_STALE_DAYS,
} from './conduct-probes.js';
import { CHECK_CLASS } from '../governance/check-class.js';

/** A supabase double whose .select().eq().lt() resolves to `result`. */
function db(result) {
  const q = { select: () => q, eq: () => q, lt: async () => result };
  return { from: () => q };
}
const brokenDb = { from: () => { throw new Error('connection reset'); } };

describe('THE THREE ARMS — the same resolver, three states of the world', () => {
  it('BREACH: stale undecided advice resolves to fail', async () => {
    // FR-3: the probe now asks the server for an exact count (head:true) instead of fetching rows
    // and measuring .length, which PostgREST clamps at 1000. Same intent: 2 stale rows.
    const facts = await resolveSolomonConductFacts(db({ data: null, count: 2, error: null }));
    expect(facts.staleOpenAdviceCount).toBe(2);
    const [v] = runSolomonConductProbes(facts);
    expect(v.verdict).toBe(VERDICT.FAIL);
    expect(v.detail).toMatch(/did not close the loop/);
  });

  it('CLEAN: nothing stale resolves to PASS — not unknown', async () => {
    // The load-bearing arm. Without a demonstrated pass, "returns fail on a breach" is satisfied by
    // a probe hardcoded to fail, which would see nothing at all.
    // FR-3: same shape change. Same intent: zero stale rows.
    const facts = await resolveSolomonConductFacts(db({ data: null, count: 0, error: null }));
    expect(facts.staleOpenAdviceCount).toBe(0);
    const [v] = runSolomonConductProbes(facts);
    expect(v.verdict).toBe(VERDICT.PASS);
  });

  it('UNAVAILABLE: a resolver that cannot answer yields unknown, NEVER pass', async () => {
    // "We could not look" must not render as "we looked and it was fine". This is the SD's thesis:
    // a check that cannot see its subject returns the permissive answer, and the permissive answer
    // is indistinguishable from a passing one.
    for (const client of [brokenDb, null, undefined, db({ data: null, error: { message: 'boom' } })]) {
      const facts = await resolveSolomonConductFacts(client);
      expect(facts.staleOpenAdviceCount).toBeNull();
      const [v] = runSolomonConductProbes(facts);
      expect(v.verdict).toBe(VERDICT.UNKNOWN);
      expect(v.verdict).not.toBe(VERDICT.PASS);
    }
  });
});

describe('zero and null are not the same answer', () => {
  it('0 means "looked and found none"; null means "could not look"', () => {
    // Collapsing these is how a broken query becomes perfect compliance.
    expect(probeAdviceClosure({ staleOpenAdviceCount: 0 }).verdict).toBe(VERDICT.PASS);
    expect(probeAdviceClosure({ staleOpenAdviceCount: null }).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeAdviceClosure({}).verdict).toBe(VERDICT.UNKNOWN);
  });

  it('an unusable count is unknown rather than coerced', () => {
    for (const bad of ['3', NaN, {}, [], true]) {
      expect(probeAdviceClosure({ staleOpenAdviceCount: bad }).verdict).toBe(VERDICT.UNKNOWN);
    }
  });
});

describe('it is a CONDUCT claim, and says so', () => {
  it('every verdict carries check_class=conduct on all three arms', () => {
    // This is the point of FR-3: Solomon's existing review is duty-presence only, so its greens and
    // these greens must not be readable as the same kind of claim.
    for (const facts of [{ staleOpenAdviceCount: 0 }, { staleOpenAdviceCount: 5 }, { staleOpenAdviceCount: null }]) {
      const [v] = runSolomonConductProbes(facts);
      expect(v.check_class).toBe(CHECK_CLASS.CONDUCT);
    }
  });
});

describe('QF-20260912-681: decision_requested admission-scope filter', () => {
  /**
   * A fake query builder that actually APPLIES .eq() predicates against synthetic rows, unlike the
   * canned-result `db()` double above — this is the only way to prove the filter changes the
   * COUNT, not merely that .eq() was called. Matches the QF's own stated verification: "one
   * informational and one decision row older than 7 days asserts a count of 1."
   */
  function realFilterDb(rows) {
    // Each builder call returns a FRESH object carrying its own accumulated filters (closures must
    // reference their own `filters`, not a shared/outer one — the first version of this fake had
    // exactly that bug: .eq() returned a shallow-spread copy whose `lt` still closed over the
    // ORIGINAL (empty) filter list, so it silently filtered on NOTHING and this test's own
    // "does the fix change the count" assertion passed for the wrong reason).
    function builder(filters) {
      return {
        select: () => builder(filters),
        eq: (col, val) => builder([...filters, [col, val]]),
        lt: (col, cutoff) => {
          const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v) && r[col] < cutoff);
          return Promise.resolve({ data: null, count: filtered.length, error: null });
        },
      };
    }
    return { from: () => builder([]) };
  }

  it('an informational send (decision_requested:false) is excluded from the stale count', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = [
      { decision: 'pending', decision_requested: true, created_at: old }, // real, undecided, stale -> counts
      { decision: 'pending', decision_requested: false, created_at: old }, // informational -> excluded
    ];
    const facts = await resolveSolomonConductFacts(realFilterDb(rows));
    expect(facts.staleOpenAdviceCount).toBe(1);
  });

  it('without the filter (pre-fix simulation) both rows would have counted — the fix genuinely changes the answer', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff = new Date().toISOString();
    const rows = [
      { decision: 'pending', decision_requested: true, created_at: old },
      { decision: 'pending', decision_requested: false, created_at: old },
    ];
    // Pre-fix query, reconstructed directly: decision + created_at only, no decision_requested predicate.
    const preFixCount = rows.filter((r) => r.decision === 'pending' && r.created_at < cutoff).length;
    expect(preFixCount).toBe(2); // what the bug reported
    const facts = await resolveSolomonConductFacts(realFilterDb(rows));
    expect(facts.staleOpenAdviceCount).toBe(1); // what the fix reports
  });
});

describe('the staleness window is a parameter, not a magic number', () => {
  it('the cutoff honours staleDays and the detail states the window', () => {
    const v = probeAdviceClosure({ staleOpenAdviceCount: 1, staleDays: 30 });
    expect(v.detail).toMatch(/30d/);
    expect(probeAdviceClosure({ staleOpenAdviceCount: 1 }).detail).toMatch(new RegExp(`${DEFAULT_STALE_DAYS}d`));
  });
});
