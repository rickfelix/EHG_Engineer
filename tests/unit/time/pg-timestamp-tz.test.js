/**
 * SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001 FR-3 — the regression test that CANNOT pass on a UTC runner.
 *
 * WHY THE TIMEZONE IS PINNED IN-FILE RATHER THAN BY A `TZ=... vitest` PREFIX.
 * The shell form is a NO-OP for Windows developers: cross-env is not installed and npm
 * scripts run through cmd.exe, which does not support `TZ=x cmd` syntax. It would work in
 * CI (ubuntu/bash) and silently do nothing locally — a guard that protects only half the
 * people running it, which is the worst available shape for a test whose entire subject is
 * checks that cannot fail. Mutating process.env.TZ in beforeAll was verified to take effect
 * inside vitest's forks pool without a process restart.
 *
 * AND WHY PINNING MATTERS EVEN THOUGH THIS DEV HOST IS ALREADY UTC-4.
 * The ambient zone here happens to be America/New_York, so an unpinned test could pass for
 * the wrong reason locally and then be meaningless in CI, which runs ubuntu at ambient UTC.
 * The pin is what makes both environments produce the same verdict.
 *
 * THE DEFECT IS INVISIBLE ON A UTC RUNNER. It is a shift by the host's UTC offset; at
 * offset zero there is nothing to see. So a green suite on a UTC box is not evidence for
 * this class, and the FIXED_OFFSET assertions below are what make these tests real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parsePgTimestamp, pgTimestampMs, pgTimestampAgeMs } = require('../../../lib/time/pg-timestamp.cjs');

const TZ = 'America/New_York';
const OFFSET_HOURS = 4; // EDT. The fixtures below sit in July, so DST is in effect.
const NAIVE = '2026-07-29T05:25:20.028';       // as PostgREST returns it: no designator
const TRUE_INSTANT = Date.parse(NAIVE + 'Z');  // what it actually means

let originalTZ;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = TZ;
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('pg-timestamp normalizer under a pinned non-UTC timezone', () => {
  it('the pin is actually in effect — otherwise every assertion below is vacuous', () => {
    // THIS TEST GUARDS THE OTHER TESTS. If the TZ pin silently failed to apply, the naive
    // string would parse as UTC, this expectation would fail, and the suite would tell us
    // the harness is broken rather than quietly reporting a meaningless pass.
    //
    // *** KNOWN LIMIT OF THIS GUARD — IT IS HOST-DEPENDENT, AND IT WAS MEASURED. ***
    // Deleting the process.env.TZ assignment above and re-running:
    //   ambient TZ=UTC (i.e. CI, ubuntu)          -> this test FAILS (0 vs 4), as intended
    //   ambient already America/New_York (dev box) -> ALL 8 STILL PASS, guard silent
    // The guard cannot distinguish "pin executed" from "pin absent, ambient happens to
    // match". It is therefore REAL IN CI, where it matters, and DECORATIVE on an EDT/EST
    // developer machine. So a green local run on such a host is not evidence the pin ran —
    // only CI, or an explicit `TZ=UTC` prefix locally, actually exercises it.
    // Recorded rather than quietly relied upon: a guard whose effectiveness depends on the
    // environment is exactly the kind of half-check this SD exists to stop.
    const localParsed = Date.parse(NAIVE);
    const shiftHours = (localParsed - TRUE_INSTANT) / 3600000;
    expect(shiftHours).toBe(OFFSET_HOURS);
  });

  it('normalizes a naive timestamp to the correct instant', () => {
    expect(pgTimestampMs(NAIVE)).toBe(TRUE_INSTANT);
    expect(parsePgTimestamp(NAIVE).toISOString()).toBe('2026-07-29T05:25:20.028Z');
  });

  it('bare Date.parse gets it WRONG by exactly the host offset — the defect, pinned', () => {
    // Asserting the broken behaviour explicitly. If this ever stops being wrong, the bug
    // was fixed somewhere upstream and this whole SD's premise needs rechecking.
    expect(Date.parse(NAIVE)).not.toBe(TRUE_INSTANT);
    expect(Date.parse(NAIVE) - TRUE_INSTANT).toBe(OFFSET_HOURS * 3600000);
  });

  it('produces a POSITIVE age where bare Date.parse produces a negative one', () => {
    // The live failure shape: a critical QF aged 20 real minutes was ineligible for a
    // 10-minute grace because its computed age was about -220 minutes.
    const nowMs = TRUE_INSTANT + 20 * 60000;

    const brokenAgeMin = (nowMs - Date.parse(NAIVE)) / 60000;
    const fixedAgeMin = pgTimestampAgeMs(NAIVE, nowMs) / 60000;

    expect(brokenAgeMin).toBeCloseTo(-220, 5);
    expect(brokenAgeMin).toBeLessThan(0);
    expect(fixedAgeMin).toBeCloseTo(20, 5);

    // A 10-minute grace: broken fails it, fixed clears it.
    expect(brokenAgeMin >= 10).toBe(false);
    expect(fixedAgeMin >= 10).toBe(true);
  });

  it('does NOT corrupt already-tz-aware input (Z and +HH:MM and +HHMM)', () => {
    // A "just append Z" fix would corrupt these. quick_fixes.not_before,
    // completion_date and quality_checked_at are all TIMESTAMPTZ, so a normalizer that
    // mangled them would create the exact churn this SD forbids.
    expect(pgTimestampMs('2026-07-29T05:25:20.028Z')).toBe(TRUE_INSTANT);
    expect(pgTimestampMs('2026-07-29T01:25:20.028-04:00')).toBe(TRUE_INSTANT);
    expect(pgTimestampMs('2026-07-29T01:25:20.028-0400')).toBe(TRUE_INSTANT);
  });

  it('returns NaN — never 0 — for absent or unparseable input', () => {
    // 0 would be 1970 and would read as an enormous age; NaN keeps existing
    // Number.isFinite guards working instead of inventing a plausible wrong number.
    expect(pgTimestampMs(null)).toBeNaN();
    expect(pgTimestampMs(undefined)).toBeNaN();
    expect(pgTimestampMs('')).toBeNaN();
    expect(pgTimestampAgeMs(null, Date.now())).toBeNaN();
    expect(parsePgTimestamp(null)).toBeNull();
  });

  it('is reachable from CJS via require — the claim four prior passes believed impossible', () => {
    // Executable proof of FR-1's reachability, not an argument about it. The belief that
    // CJS could not reuse the helper is what produced a verbatim duplicate at
    // worker-checkin.cjs:585-587.
    const direct = require('../../../lib/time/pg-timestamp.cjs');
    expect(typeof direct.pgTimestampMs).toBe('function');
    expect(direct.pgTimestampMs(NAIVE)).toBe(TRUE_INSTANT);
  });
});

describe('row-vs-row comparisons are shift-invariant and must not be normalized', () => {
  it('two naive timestamps sort identically before and after normalization', () => {
    // The SD forbids churning these. This test states WHY as an executable fact, so a
    // future sweep that "fixes" a sort has a failing test explaining the mistake.
    const a = '2026-07-29T05:25:20.028';
    const b = '2026-07-29T07:10:00.000';

    const naiveOrder = Math.sign(Date.parse(a) - Date.parse(b));
    const normalizedOrder = Math.sign(pgTimestampMs(a) - pgTimestampMs(b));

    expect(naiveOrder).toBe(normalizedOrder);
    expect(naiveOrder).toBe(-1);
  });
});
