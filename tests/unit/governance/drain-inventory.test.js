/**
 * SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001 — drain inventory core.
 *
 * The load-bearing property is TS-2: age is measured on the DRAIN, not on the detector firing.
 * A bare expect(age).toBeGreaterThan(0) passes identically for a 1-minute and a 51-day reading —
 * it survives deleting the drain logic entirely — so every age assertion here carries a negative
 * control (exact value AND separation from the newest-write reading).
 *
 * Pure tier by necessity, not preference: the `db` vitest project resolves to ZERO files
 * (DESIGNATED_NON_PROD_REFS is intentionally empty), so a DB-tier test would never execute and its
 * green would be indistinguishable from having no coverage. No supabase import, no dotenv.
 */
import { describe, it, expect } from 'vitest';
import {
  VERDICT, FAILING_VERDICTS, isFailing,
  computeOldestUndrainedAge, classifyStructural, classifyObserved,
  assertThresholdBelowRetention, exitCodeFor, buildInventoryRow,
} from '../../../lib/governance/drain-inventory.js';
import { DRAIN_DESCRIPTORS, GAUGE_REGISTRY } from '../../../lib/governance/gauge-registry.js';

const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms) => ({ created_at: new Date(NOW - ms).toISOString() });

describe('computeOldestUndrainedAge — age is measured on the DRAIN, not the detector (TS-2)', () => {
  it('reports the OLDEST undrained row, not the newest write', () => {
    // The scenario the SD exists for: a detector that just fired over a long-undrained backlog.
    // Fixture is deliberately NEWEST-FIRST. Ordered oldest-first, a rows[0] implementation would
    // be accidentally correct and this test would pass while the drain logic was broken — a
    // mutation run confirmed exactly that blind spot before this ordering was fixed.
    const { oldestAgeMs, count } = computeOldestUndrainedAge([ago(60_000), ago(51 * DAY)], NOW);

    expect(count).toBe(2);
    expect(oldestAgeMs).toBe(51 * DAY);                  // exact — not merely "> 0"
    // NEGATIVE CONTROL: must not be anywhere near the 1-minute newest-write reading. This is the
    // assertion that fails if the implementation reports the freshest row instead of the oldest.
    expect(oldestAgeMs).toBeGreaterThan(60_000 * 100);
  });

  it('is order-independent — a rows[0] implementation cannot pass (TS-11)', () => {
    const oldestFirst = [ago(51 * DAY), ago(2 * DAY), ago(60_000)];
    const newestFirst = [...oldestFirst].reverse();
    const shuffled = [ago(2 * DAY), ago(51 * DAY), ago(60_000)];

    const a = computeOldestUndrainedAge(oldestFirst, NOW);
    const b = computeOldestUndrainedAge(newestFirst, NOW);
    const c = computeOldestUndrainedAge(shuffled, NOW);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.oldestAgeMs).toBe(51 * DAY);
  });

  it('counts an unparsable timestamp instead of silently dropping it', () => {
    // Dropping it would shrink the population and read as a healthier drain than reality.
    const r = computeOldestUndrainedAge([{ created_at: 'not-a-date' }, ago(3 * DAY)], NOW);
    expect(r.count).toBe(2);
    expect(r.unparsable).toBe(1);
    expect(r.oldestAgeMs).toBe(3 * DAY);
  });

  it('returns a null age (never 0) for an empty drain, so empty is not confused with fresh', () => {
    const r = computeOldestUndrainedAge([], NOW);
    expect(r.count).toBe(0);
    expect(r.oldestAgeMs).toBeNull();
  });

  it('never returns a negative age for a clock-skewed future timestamp', () => {
    expect(computeOldestUndrainedAge([ago(-5 * DAY)], NOW).oldestAgeMs).toBe(0);
  });
});

describe('structural verdicts are computed with ZERO IO (provenance split)', () => {
  it('flags a missing consumer as NO_CONSUMER (TS-14)', () => {
    expect(classifyStructural({ closingPath: 'x' })).toBe(VERDICT.NO_CONSUMER);
  });

  it('flags a missing closing path as NO_CLOSING_PATH — HARDENING 1 (TS-3)', () => {
    expect(classifyStructural({ consumer: 'someone' })).toBe(VERDICT.NO_CLOSING_PATH);
  });

  it('treats an absent/!object descriptor as UNDECLARED, never as healthy', () => {
    expect(classifyStructural(undefined)).toBe(VERDICT.UNDECLARED);
    expect(classifyStructural(null)).toBe(VERDICT.UNDECLARED);
  });

  it('classifies unkeyable work as MEASURED_ELSEWHERE, distinct from a finding (TS-7)', () => {
    const v = classifyStructural({ measuredBy: 'consult-reply catch rate' });
    expect(v).toBe(VERDICT.MEASURED_ELSEWHERE);
    // The whole point: unkeyable work must NEVER be counted as neglect.
    expect(isFailing(v)).toBe(false);
  });

  it('returns null (needs a read) only when consumer AND closingPath are both present', () => {
    expect(classifyStructural({ consumer: 'c', closingPath: 'p' })).toBeNull();
  });

  it('yields identical structural verdicts whether or not a reading is available', () => {
    const d = { closingPath: 'x' }; // no consumer
    expect(classifyObserved(d, { noData: true, reason: 'db down' })).toBe(VERDICT.NO_CONSUMER);
    expect(classifyObserved(d, { count: 0, closingPathUses: 5 })).toBe(VERDICT.NO_CONSUMER);
    expect(classifyStructural(d)).toBe(VERDICT.NO_CONSUMER);
  });
});

describe('observed verdicts', () => {
  const sound = { consumer: 'c', closingPath: 'p' };

  it('PASSes a sound descriptor with an exercised closing path (TS-1)', () => {
    expect(classifyObserved(sound, { count: 3, closingPathUses: 12 })).toBe(VERDICT.PASS);
  });

  it('distinguishes a closing path that EXISTS but was NEVER used (TS-4)', () => {
    // The invariant_gauge_finding case: 4,235 findings, zero dispositions ever written.
    const v = classifyObserved(sound, { count: 4235, closingPathUses: 0 });
    expect(v).toBe(VERDICT.CLOSING_PATH_UNEXERCISED);
    expect(v).not.toBe(VERDICT.PASS);
    expect(v).not.toBe(VERDICT.NO_CLOSING_PATH); // not the same as having no path at all
  });

  it('does not report UNEXERCISED when there is nothing outstanding to close', () => {
    expect(classifyObserved(sound, { count: 0, closingPathUses: 0 })).toBe(VERDICT.PASS);
  });

  it('reports UNAVAILABLE — never PASS — when the read fails (TS-5)', () => {
    // An unchecked error must not manufacture a clean bill of health.
    for (const reading of [undefined, null, { noData: true, reason: 'query failed' }]) {
      const v = classifyObserved(sound, reading);
      expect(v).toBe(VERDICT.UNAVAILABLE);
      expect(v).not.toBe(VERDICT.PASS);
    }
  });

  it('does not count UNAVAILABLE as a finding either — unmeasured is not unhealthy', () => {
    expect(isFailing(VERDICT.UNAVAILABLE)).toBe(false);
  });
});

describe('evidence floor — the alarm must not clear by retention (TS-6)', () => {
  it('refuses when the staleness threshold meets or exceeds retention', () => {
    expect(assertThresholdBelowRetention(30 * DAY, 30 * DAY)).toMatch(/retention/);
    expect(assertThresholdBelowRetention(60 * DAY, 30 * DAY)).toMatch(/retention/);
  });
  it('allows a threshold safely below retention', () => {
    expect(assertThresholdBelowRetention(7 * DAY, 30 * DAY)).toBeNull();
  });
});

describe('exit code contract (TS-17)', () => {
  it('exits non-zero when ANY entry fails, so the inventory cannot be green while carrying a finding', () => {
    expect(exitCodeFor([VERDICT.PASS, VERDICT.NO_CONSUMER])).toBe(1);
    expect(exitCodeFor([VERDICT.PASS, VERDICT.NO_CLOSING_PATH])).toBe(1);
    expect(exitCodeFor([VERDICT.UNDECLARED])).toBe(1);
  });
  it('exits zero for healthy, unkeyable, unexercised and unmeasurable entries', () => {
    expect(exitCodeFor([
      VERDICT.PASS, VERDICT.MEASURED_ELSEWHERE, VERDICT.CLOSING_PATH_UNEXERCISED, VERDICT.UNAVAILABLE,
    ])).toBe(0);
  });
  it('FAILING_VERDICTS is exactly the three structural findings', () => {
    expect([...FAILING_VERDICTS].sort()).toEqual(
      [VERDICT.NO_CONSUMER, VERDICT.NO_CLOSING_PATH, VERDICT.UNDECLARED].sort());
  });
});

describe('buildInventoryRow surfaces the declared contract fields', () => {
  it('carries predicate, shape contract and skew onto the row', () => {
    const row = buildInventoryRow('x', {
      consumer: 'c', closingPath: 'p', predicate: 'status in (new, triaged)',
      shapeContract: 'reader keys on reason_supplied', timestampSkew: 'naive, ~4h young',
    }, { count: 2, oldestAgeMs: 3 * DAY, closingPathUses: 1 });

    expect(row.verdict).toBe(VERDICT.PASS);
    expect(row.failing).toBe(false);
    expect(row.predicate).toBe('status in (new, triaged)');
    expect(row.shapeContract).toMatch(/reason_supplied/);
    expect(row.timestampSkew).toMatch(/4h/);
    expect(row.oldestAgeMs).toBe(3 * DAY);
  });

  it('with no reading at all, falls back to the structural verdict rather than inventing health', () => {
    expect(buildInventoryRow('y', { consumer: 'c', closingPath: 'p' }).verdict).toBe(VERDICT.UNAVAILABLE);
    expect(buildInventoryRow('z', { closingPath: 'p' }).verdict).toBe(VERDICT.NO_CONSUMER);
  });
});

describe('DRAIN_DESCRIPTORS — the populated inventory discriminates (FR-4)', () => {
  const verdictOf = (id) => classifyStructural(DRAIN_DESCRIPTORS[id]);

  it('flags the confirmed write-only sinks as NO_CONSUMER', () => {
    expect(verdictOf('relay-drop')).toBe(VERDICT.NO_CONSUMER);
    expect(verdictOf('wind-down-survey')).toBe(VERDICT.NO_CONSUMER);
    expect(verdictOf('feedback-sla-breach')).toBe(VERDICT.NO_CONSUMER);
    expect(verdictOf('quick-fixes-stranded')).toBe(VERDICT.NO_CONSUMER);
  });

  it('FAILS a table that cannot express DONE even though it HAS a consumer (HARDENING 1)', () => {
    // adam_adherence_ledger has a real reader, so a consumer-only check would call it healthy.
    // It has no status column at all, so a verdict=fail row can never be marked addressed.
    expect(DRAIN_DESCRIPTORS['adam-adherence-ledger'].consumer).toBeTruthy();
    expect(verdictOf('adam-adherence-ledger')).toBe(VERDICT.NO_CLOSING_PATH);
    expect(isFailing(verdictOf('adam-adherence-ledger'))).toBe(true);
  });

  it('FAILS durable output that is not even in the database', () => {
    expect(verdictOf('worktree-reaper-refusals')).toBe(VERDICT.NO_CONSUMER);
    expect(DRAIN_DESCRIPTORS['worktree-reaper-refusals'].accumulationSignal).toMatch(/undrained/i);
  });

  it('PASSes the model entry — proving the check discriminates rather than failing everything', () => {
    // Without this control, an implementation that failed EVERY entry would look correct.
    expect(verdictOf('solomon-advice-outcome-ledger')).toBeNull(); // structurally sound → needs a read
    expect(classifyObserved(DRAIN_DESCRIPTORS['solomon-advice-outcome-ledger'],
      { count: 848, closingPathUses: 53 })).toBe(VERDICT.PASS);
  });

  it('treats unkeyable work as MEASURED_ELSEWHERE with a named instrument, never as neglect', () => {
    const d = DRAIN_DESCRIPTORS['solomon-consult-replies'];
    expect(verdictOf('solomon-consult-replies')).toBe(VERDICT.MEASURED_ELSEWHERE);
    expect(d.measuredBy).toBeTruthy();
    // The guard: the instrument must not be a manufactured artifact.
    expect(d.measuredBy).toMatch(/NOT an SD\/QF row|NOT a queue count/i);
  });

  it('records the shape contract where writer and reader disagree', () => {
    expect(DRAIN_DESCRIPTORS['roadmap-link-exception'].shapeContract).toMatch(/reason_supplied/);
  });

  it('declares naive-timestamp skew on affected sources (TS-16)', () => {
    expect(DRAIN_DESCRIPTORS['quick-fixes-stranded'].timestampSkew).toMatch(/naive/i);
  });

  it('every descriptor names a predicate or is explicitly unkeyable', () => {
    for (const [id, d] of Object.entries(DRAIN_DESCRIPTORS)) {
      const named = Boolean(d.predicate) || d.source?.kind === 'unkeyable';
      expect(named, `${id} must name its predicate (owed vs merely delivered)`).toBe(true);
    }
  });

  it('the inventory as populated FAILS overall — the findings are real, not decorative', () => {
    const verdicts = Object.keys(DRAIN_DESCRIPTORS).map(verdictOf).filter((v) => v !== null);
    expect(exitCodeFor(verdicts)).toBe(1);
    expect(verdicts.filter(isFailing).length).toBeGreaterThanOrEqual(6);
  });
});

describe('additive-only: GAUGE_REGISTRY is untouched (TS-15)', () => {
  it('registry entries did not gain drain fields', () => {
    for (const entry of GAUGE_REGISTRY) {
      expect(entry.drain).toBeUndefined();
      expect(entry.detectorFn === null || typeof entry.detectorFn === 'string').toBe(true);
    }
  });

  it('a descriptor may exist for a sink that is NOT a registry entry', () => {
    const ids = new Set(GAUGE_REGISTRY.map((e) => e.id));
    expect(ids.has('wind-down-survey')).toBe(false);
    expect(DRAIN_DESCRIPTORS['wind-down-survey']).toBeTruthy();
  });

  it('relay-drop is BOTH a registered gauge and an undrained sink — registration is not drainage', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'relay-drop');
    expect(entry?.ownerRole).toBe('coordinator');       // a trip owner exists
    expect(DRAIN_DESCRIPTORS['relay-drop'].consumer).toBeUndefined(); // yet nobody drains the row
    expect(classifyStructural(DRAIN_DESCRIPTORS['relay-drop'])).toBe(VERDICT.NO_CONSUMER);
  });
});
