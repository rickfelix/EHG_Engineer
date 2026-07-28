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
    const facts = await resolveSolomonConductFacts(db({ data: [{ id: 1 }, { id: 2 }], error: null }));
    expect(facts.staleOpenAdviceCount).toBe(2);
    const [v] = runSolomonConductProbes(facts);
    expect(v.verdict).toBe(VERDICT.FAIL);
    expect(v.detail).toMatch(/did not close the loop/);
  });

  it('CLEAN: nothing stale resolves to PASS — not unknown', async () => {
    // The load-bearing arm. Without a demonstrated pass, "returns fail on a breach" is satisfied by
    // a probe hardcoded to fail, which would see nothing at all.
    const facts = await resolveSolomonConductFacts(db({ data: [], error: null }));
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

describe('the staleness window is a parameter, not a magic number', () => {
  it('the cutoff honours staleDays and the detail states the window', () => {
    const v = probeAdviceClosure({ staleOpenAdviceCount: 1, staleDays: 30 });
    expect(v.detail).toMatch(/30d/);
    expect(probeAdviceClosure({ staleOpenAdviceCount: 1 }).detail).toMatch(new RegExp(`${DEFAULT_STALE_DAYS}d`));
  });
});
