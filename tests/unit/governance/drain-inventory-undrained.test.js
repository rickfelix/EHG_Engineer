/**
 * SD-LEO-INFRA-DRAIN-INVENTORY-CANNOT-001 — UNDRAINED, the first OBSERVED failing verdict.
 *
 * Before this change every member of FAILING_VERDICTS was STRUCTURAL (zero IO, computed from the
 * descriptor alone) while every verdict requiring a READ was non-failing. THE FAILING SET AND THE
 * DATA-REACHABLE SET WERE DISJOINT, so no amount of undrained data could fail the inventory. Live
 * proof: invariant-gauge-finding carried 5,417 rows aged ~36 days and read CLOSING_PATH_UNEXERCISED.
 *
 * THE ACCEPT CASE IS ASSERTED FIRST. A predicate stuck at "failing" would satisfy every rejection
 * test below while breaking the tool for every healthy queue — so the pass case is the control and
 * it leads.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES here, so an integration-typed
 * test would SKIP AND REPORT GREEN.
 */

import { describe, it, expect } from 'vitest';
import {
  VERDICT,
  FAILING_VERDICTS,
  isFailing,
  classifyObserved,
  exceedsBacklogThreshold,
  DEFAULT_BACKLOG_COUNT,
  DEFAULT_BACKLOG_AGE_MS,
} from '../../../lib/governance/drain-inventory.js';

/** A structurally sound descriptor: has a consumer and a closing path, so nothing structural fires. */
const SOUND = Object.freeze({ consumer: 'some-consumer', closingPath: 'the row is dispositioned' });
/** A reading of a healthy queue: shallow, recent, and its closing path is in use. */
const HEALTHY = Object.freeze({ count: 3, oldestAgeMs: 60_000, closingPathUses: 12 });

describe('[CONTROL, asserted first] a healthy queue still PASSES', () => {
  it('returns PASS for a sound descriptor with a shallow, recent, exercised queue', () => {
    // If this fails, every assertion below is meaningless: a predicate stuck at UNDRAINED would
    // "detect" everything, including queues that are fine.
    expect(classifyObserved(SOUND, HEALTHY)).toBe(VERDICT.PASS);
    expect(isFailing(VERDICT.PASS)).toBe(false);
  });

  it('exceedsBacklogThreshold is FALSE for a healthy reading', () => {
    expect(exceedsBacklogThreshold(SOUND, HEALTHY)).toBe(false);
  });

  it('a count just BELOW the threshold still passes (the boundary is not off by one)', () => {
    const justUnder = { ...HEALTHY, count: DEFAULT_BACKLOG_COUNT - 1 };
    expect(exceedsBacklogThreshold(SOUND, justUnder)).toBe(false);
    expect(classifyObserved(SOUND, justUnder)).toBe(VERDICT.PASS);
  });
});

describe('UNDRAINED fires on data — the gap this SD closes', () => {
  it('[THE FIX] a deep queue returns UNDRAINED and UNDRAINED is FAILING', () => {
    const deep = { count: 5417, oldestAgeMs: 3_113_766_440, closingPathUses: 0 };
    expect(classifyObserved(SOUND, deep)).toBe(VERDICT.UNDRAINED);
    expect(isFailing(VERDICT.UNDRAINED)).toBe(true);
  });

  it('an ANCIENT but shallow queue also returns UNDRAINED (either dimension suffices)', () => {
    // Requiring BOTH dimensions would let a two-row queue a year old pass simply for being small.
    const ancient = { count: 2, oldestAgeMs: DEFAULT_BACKLOG_AGE_MS + 1, closingPathUses: 5 };
    expect(exceedsBacklogThreshold(SOUND, ancient)).toBe(true);
    expect(classifyObserved(SOUND, ancient)).toBe(VERDICT.UNDRAINED);
  });

  it('fires at exactly the threshold, not one past it', () => {
    expect(exceedsBacklogThreshold(SOUND, { count: DEFAULT_BACKLOG_COUNT, closingPathUses: 1 })).toBe(true);
  });

  it('honours a per-descriptor threshold override instead of forcing the global default', () => {
    const loose = { ...SOUND, backlogCountThreshold: 10_000 };
    expect(exceedsBacklogThreshold(loose, { count: 5417, closingPathUses: 1 })).toBe(false);
    const strict = { ...SOUND, backlogCountThreshold: 2 };
    expect(exceedsBacklogThreshold(strict, { count: 3, closingPathUses: 1 })).toBe(true);
  });

  it('[ORDERING IS LOAD-BEARING] a deep queue whose closing path was NEVER exercised reports UNDRAINED, not CLOSING_PATH_UNEXERCISED', () => {
    // This is the exact live shape of invariant-gauge-finding: 5,417 rows AND closingPathUses 0.
    // If the backlog check were placed after the closing-path branch, this descriptor would return
    // CLOSING_PATH_UNEXERCISED (non-failing) and the one queue that motivated the SD would still
    // read green while the fix appeared to ship. This test pins the order.
    const both = { count: 5417, oldestAgeMs: 3_113_766_440, closingPathUses: 0 };
    expect(classifyObserved(SOUND, both)).toBe(VERDICT.UNDRAINED);
  });

  it('a shallow queue with an unexercised path still reports CLOSING_PATH_UNEXERCISED', () => {
    // The closing-path branch must survive: ordering moved it, it did not delete it.
    const shallowUnexercised = { count: 3, oldestAgeMs: 60_000, closingPathUses: 0 };
    expect(classifyObserved(SOUND, shallowUnexercised)).toBe(VERDICT.CLOSING_PATH_UNEXERCISED);
  });
});

describe('the constraints this fix must not break', () => {
  it('[TS-3] UNAVAILABLE stays NON-FAILING — could-not-measure is never a failure', () => {
    // A read that failed tells us nothing about drainage. Rendering it as a finding would trade a
    // silent gap for a noisy one and teach readers to ignore the tool.
    expect(classifyObserved(SOUND, { noData: true })).toBe(VERDICT.UNAVAILABLE);
    expect(isFailing(VERDICT.UNAVAILABLE)).toBe(false);
    expect(FAILING_VERDICTS).not.toContain(VERDICT.UNAVAILABLE);
  });

  it('[TS-5] a STRUCTURAL defect still wins over a large backlog', () => {
    // Provenance ordering: a descriptor with no consumer is broken regardless of queue depth, and
    // must report the structural fact rather than being reclassified as merely backed up.
    const noConsumer = { closingPath: 'x' };
    expect(classifyObserved(noConsumer, { count: 99_999, closingPathUses: 0 })).toBe(VERDICT.NO_CONSUMER);
    const noPath = { consumer: 'x' };
    expect(classifyObserved(noPath, { count: 99_999, closingPathUses: 0 })).toBe(VERDICT.NO_CLOSING_PATH);
  });

  it('[TS-4] every PRE-EXISTING verdict keeps its failing status, asserted per verdict', () => {
    // Additivity is asserted, not assumed — a change to this list is the kind of thing that passes
    // review by looking small.
    expect(isFailing(VERDICT.NO_CONSUMER)).toBe(true);
    expect(isFailing(VERDICT.NO_CLOSING_PATH)).toBe(true);
    expect(isFailing(VERDICT.UNDECLARED)).toBe(true);
    expect(isFailing(VERDICT.PASS)).toBe(false);
    expect(isFailing(VERDICT.CLOSING_PATH_UNEXERCISED)).toBe(false);
    expect(isFailing(VERDICT.MEASURED_ELSEWHERE)).toBe(false);
    expect(isFailing(VERDICT.UNAVAILABLE)).toBe(false);
  });

  it('[THE POINT] FAILING_VERDICTS now contains an OBSERVED verdict, so the sets intersect', () => {
    const STRUCTURAL = [VERDICT.UNDECLARED, VERDICT.NO_CONSUMER, VERDICT.NO_CLOSING_PATH, VERDICT.MEASURED_ELSEWHERE];
    const OBSERVED = [VERDICT.PASS, VERDICT.CLOSING_PATH_UNEXERCISED, VERDICT.UNAVAILABLE, VERDICT.UNDRAINED];
    const observedFailing = FAILING_VERDICTS.filter((v) => OBSERVED.includes(v));
    expect(observedFailing).toEqual([VERDICT.UNDRAINED]);
    // And the structural members are untouched.
    expect(FAILING_VERDICTS.filter((v) => STRUCTURAL.includes(v)).sort()).toEqual(
      [VERDICT.NO_CONSUMER, VERDICT.NO_CLOSING_PATH, VERDICT.UNDECLARED].sort()
    );
  });
});
