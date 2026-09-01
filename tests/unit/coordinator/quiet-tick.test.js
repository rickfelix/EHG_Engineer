/**
 * Unit tests for lib/coordinator/quiet-tick.cjs
 * SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  decideCadence,
  computeLoadedAndQuiet,
  detectSalientDelta,
  runCoresFailSoft,
  computeStateHash,
  shouldSkipHeavyPass,
  MAX_QUIESCENT_PARK_S,
  ACTIVE_MAX_S,
  PROMPT_CACHE_TTL_S,
  DIRECTIVE_WAKE_MIN_S,
  DIRECTIVE_WAKE_MAX_S,
  LOADED_AND_QUIET_MIN_S,
  LOADED_AND_QUIET_MAX_S,
  HEAVY_PASS_NTH_TICK_FLOOR,
} = require('../../../lib/coordinator/quiet-tick.cjs');
const { createHash } = require('node:crypto');

const LOADED_AND_QUIET_TRUE = {
  idleNow: 0,
  rawUnclaimed: 0,
  openQfCount: 0,
  claimableWithVerifyQfCount: 0,
  unactionedDirective: false,
  undeliveredEscalation: false,
};

describe('computeLoadedAndQuiet (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001 FR-7)', () => {
  it('returns true when every clause holds', () => {
    expect(computeLoadedAndQuiet(LOADED_AND_QUIET_TRUE)).toBe(true);
  });

  it('returns false when idleNow > 0 (an idle seat exists)', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, idleNow: 1 })).toBe(false);
  });

  it('returns false when rawUnclaimed > 0 (an unclaimed SD exists)', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, rawUnclaimed: 1 })).toBe(false);
  });

  it('returns false when openQfCount > 0 (an open QF exists)', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, openQfCount: 1 })).toBe(false);
  });

  it('returns false when claimableWithVerifyQfCount > 0', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, claimableWithVerifyQfCount: 1 })).toBe(false);
  });

  it('returns false when unactionedDirective is true', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, unactionedDirective: true })).toBe(false);
  });

  it('returns false when undeliveredEscalation is true', () => {
    expect(computeLoadedAndQuiet({ ...LOADED_AND_QUIET_TRUE, undeliveredEscalation: true })).toBe(false);
  });

  it('returns false when called with no argument, no throw', () => {
    expect(computeLoadedAndQuiet()).toBe(false);
    expect(computeLoadedAndQuiet({})).toBe(false);
  });

  it('is PURE: does not mutate its input', () => {
    const input = { ...LOADED_AND_QUIET_TRUE };
    const snapshot = { ...input };
    computeLoadedAndQuiet(input);
    expect(input).toEqual(snapshot);
  });
});

describe('decideCadence (FR-5/FR-6)', () => {
  it('quiescent park never exceeds the 15-min cap', () => {
    for (const offset of [0, 100, 420, 5000]) {
      const d = decideCadence({ quiescent: true, partyOffsetS: offset });
      expect(d).toBeLessThanOrEqual(MAX_QUIESCENT_PARK_S);
      expect(d).toBeGreaterThan(ACTIVE_MAX_S);
    }
  });

  it('a requested short quiescent park is honored but still capped', () => {
    expect(decideCadence({ quiescent: true, desiredQuiescentParkS: 600 })).toBe(600);
    expect(decideCadence({ quiescent: true, desiredQuiescentParkS: 99999 })).toBe(MAX_QUIESCENT_PARK_S);
  });

  it('active cadence stays in the fast band and strictly below the cache TTL', () => {
    for (const offset of [0, 1, 50, 270, 999]) {
      const d = decideCadence({ quiescent: false, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(180);
      expect(d).toBeLessThanOrEqual(ACTIVE_MAX_S);
      expect(d).toBeLessThan(PROMPT_CACHE_TTL_S);
    }
  });

  it('NEVER returns exactly 300s in any mode (prompt-cache TTL invariant)', () => {
    for (const quiescent of [true, false]) {
      for (let offset = 0; offset <= 1000; offset += 7) {
        for (const desired of [120, 300, 301, 600, 900]) {
          const d = decideCadence({ quiescent, partyOffsetS: offset, desiredQuiescentParkS: desired });
          expect(d).not.toBe(300);
          expect(d).toBeGreaterThan(0);
        }
      }
    }
  });

  it('phasing produces distinct coordinator vs Adam parks in active mode', () => {
    const coord = decideCadence({ quiescent: false, partyOffsetS: 0 });
    const adam = decideCadence({ quiescent: false, partyOffsetS: 60 });
    expect(coord).not.toBe(adam);
  });
});

describe('decideCadence desiredActiveS (QF-20260830-071, burn-lever A3)', () => {
  it('omitted desiredActiveS is byte-identical to today\'s fixed active band (regression)', () => {
    for (const offset of [0, 1, 50, 270, 420, 999]) {
      const withOmitted = decideCadence({ quiescent: false, partyOffsetS: offset });
      const withUndefined = decideCadence({ quiescent: false, partyOffsetS: offset, desiredActiveS: undefined });
      const withZero = decideCadence({ quiescent: false, partyOffsetS: offset, desiredActiveS: 0 });
      expect(withUndefined).toBe(withOmitted);
      expect(withZero).toBe(withOmitted);
      expect(withOmitted).toBeGreaterThanOrEqual(180);
      expect(withOmitted).toBeLessThanOrEqual(ACTIVE_MAX_S);
    }
  });

  it('Adam active tick (desiredActiveS=900, partyOffsetS=420) resolves to ~15 min, never the fixed 3-4.5min band', () => {
    const d = decideCadence({ quiescent: false, partyOffsetS: 420, desiredActiveS: 900 });
    expect(d).toBeGreaterThan(ACTIVE_MAX_S); // strictly past the old fixed band
    expect(d).toBeLessThanOrEqual(900);
    expect(d).toBeGreaterThanOrEqual(900 - 45);
  });

  it('coordinator active tick still resolves inside 180-270 when desiredActiveS is not passed (coordinator-quiet-tick.mjs untouched)', () => {
    for (const offset of [0, 30, 90, 200]) {
      const d = decideCadence({ quiescent: false, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(180);
      expect(d).toBeLessThanOrEqual(270);
    }
  });

  it('hard-wake (directive/escalation) is unchanged by desiredActiveS — 15-45s regardless', () => {
    for (const offset of [0, 50, 420]) {
      const d = decideCadence({ quiescent: false, partyOffsetS: offset, desiredActiveS: 900, hasUnactionedDirective: true });
      expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
      expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
    }
  });

  it('quiescent band is unchanged by desiredActiveS', () => {
    const withoutActive = decideCadence({ quiescent: true, partyOffsetS: 420 });
    const withActive = decideCadence({ quiescent: true, partyOffsetS: 420, desiredActiveS: 900 });
    expect(withActive).toBe(withoutActive);
  });

  it('never returns exactly 300s with desiredActiveS supplied (prompt-cache TTL invariant preserved)', () => {
    for (let offset = 0; offset <= 1000; offset += 11) {
      for (const desiredActiveS of [255, 300, 301, 345, 900]) {
        const d = decideCadence({ quiescent: false, partyOffsetS: offset, desiredActiveS });
        expect(d).not.toBe(300);
        expect(d).toBeGreaterThan(0);
      }
    }
  });

  it('a tiny desiredActiveS is floored at ACTIVE_MIN_S (180), never below it', () => {
    const d = decideCadence({ quiescent: false, partyOffsetS: 0, desiredActiveS: 10 });
    expect(d).toBeGreaterThanOrEqual(180);
  });
});

describe('decideCadence hasUnactionedDirective hard-wake override (SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1)', () => {
  it('overrides a quiescent long park with a short hard-wake delay', () => {
    const d = decideCadence({ quiescent: true, hasUnactionedDirective: true });
    expect(d).toBeLessThan(ACTIVE_MAX_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
  });

  it('overrides the normal active band too — a directive is always faster than plain active', () => {
    const d = decideCadence({ quiescent: false, hasUnactionedDirective: true });
    expect(d).toBeLessThan(180); // strictly below ACTIVE_MIN_S
  });

  it('reproduces the 2026-07-09 incident shape: quiescent + directive pending never approaches the 900s park', () => {
    const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, desiredQuiescentParkS: MAX_QUIESCENT_PARK_S });
    expect(d).toBeLessThan(60);
  });

  it('hasUnactionedDirective=false is byte-identical to the pre-FR-1 behavior (regression-safe default)', () => {
    for (const quiescent of [true, false]) {
      for (const offset of [0, 100, 420]) {
        const withFalse = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective: false });
        const withOmitted = decideCadence({ quiescent, partyOffsetS: offset });
        expect(withFalse).toBe(withOmitted);
      }
    }
  });

  it('phasing spreads directive hard-wake delays across the short band without breaching it', () => {
    for (const offset of [0, 10, 30, 100, 999]) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
      expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
    }
  });

  it('never returns exactly 300s under the directive override either', () => {
    for (let offset = 0; offset <= 100; offset += 3) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, partyOffsetS: offset });
      expect(d).not.toBe(300);
    }
  });
});

describe('decideCadence hasUndeliveredChairmanEscalation hard-park precondition (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H FR-2, FW-3 §6d)', () => {
  it('an undelivered chairman-escalation overrides the quiescent long park with the hard-wake band', () => {
    const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, desiredQuiescentParkS: MAX_QUIESCENT_PARK_S });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('overrides the active band too — an undelivered escalation is always faster than plain active', () => {
    const d = decideCadence({ quiescent: false, hasUndeliveredChairmanEscalation: true });
    expect(d).toBeLessThan(180); // strictly below ACTIVE_MIN_S
  });

  it('BOTH flags true stays inside the hard-wake band across offsets — shared branch, no double-offset drift', () => {
    for (const offset of [0, 10, 30, 100, 420, 999]) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
      expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
      expect(d).not.toBe(300);
    }
  });

  it('escalation flag false/omitted is byte-identical to today across quiescent, active AND directive branches', () => {
    for (const quiescent of [true, false]) {
      for (const hasUnactionedDirective of [true, false]) {
        for (const offset of [0, 100, 420]) {
          const withFalse = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective, hasUndeliveredChairmanEscalation: false });
          const withOmitted = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective });
          expect(withFalse).toBe(withOmitted);
        }
      }
    }
  });

  it("Adam's 420s party offset stays inside the hard-wake band under the escalation override", () => {
    const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: 420 });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('never returns exactly 300s under the escalation override', () => {
    for (let offset = 0; offset <= 100; offset += 3) {
      const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: offset });
      expect(d).not.toBe(300);
    }
  });
});

describe('detectSalientDelta (FR-4)', () => {
  it('first tick is always a delta', () => {
    expect(detectSalientDelta(null, { beltZero: true, openSignalCount: 0 }).changed).toBe(true);
  });

  it('no change => no ping (still-idle is suppressed)', () => {
    const prev = { beltZero: true, openSignalCount: 0, venture1State: 'S17' };
    const cur = { beltZero: true, openSignalCount: 0, venture1State: 'S17' };
    expect(detectSalientDelta(prev, cur).changed).toBe(false);
  });

  it('belt 0<->non-zero transition is a delta', () => {
    expect(detectSalientDelta({ beltZero: true }, { beltZero: false }).fields).toContain('beltZero');
    expect(detectSalientDelta({ beltZero: false }, { beltZero: true }).fields).toContain('beltZero');
  });

  it('a NEW signal (count up) is a delta; draining is not', () => {
    expect(detectSalientDelta({ openSignalCount: 0 }, { openSignalCount: 1 }).changed).toBe(true);
    expect(detectSalientDelta({ openSignalCount: 2 }, { openSignalCount: 1 }).changed).toBe(false);
  });

  it('venture-1 state change is a delta', () => {
    expect(detectSalientDelta({ venture1State: 'S17' }, { venture1State: 'S18' }).fields).toContain('venture1State');
  });
});

describe('runCoresFailSoft (FR-1)', () => {
  it('one core throwing does not abort the tick — others still run', async () => {
    const ran = [];
    const out = await runCoresFailSoft([
      { key: 'a', run: () => { ran.push('a'); return 'done-a'; } },
      { key: 'boom', run: () => { throw new Error('kaboom'); } },
      { key: 'c', run: async () => { ran.push('c'); return 'done-c'; } },
    ]);
    expect(ran).toEqual(['a', 'c']);
    expect(out.failedCount).toBe(1);
    expect(out.ranCount).toBe(3);
    expect(out.results.find((r) => r.key === 'boom').status).toBe('fail');
    expect(out.summary).toContain('boom:fail');
  });

  it('skip=true records a quiescent skip without running', async () => {
    let calls = 0;
    const out = await runCoresFailSoft([
      { key: 'forecast', skip: true, run: () => { calls++; } },
      { key: 'inbox', run: () => 'ok' },
    ]);
    expect(calls).toBe(0);
    expect(out.skippedCount).toBe(1);
    expect(out.results.find((r) => r.key === 'forecast').status).toBe('skipped');
  });

  it('emits a single summary line for the whole tick', async () => {
    const out = await runCoresFailSoft([
      { key: 'x', run: () => 'ok' },
      { key: 'y', run: () => 'ok' },
    ]);
    expect(out.summary).toBe('x:ok y:ok');
  });
});

describe('computeStateHash / shouldSkipHeavyPass (QF-20260829-373, A7 burn-lever)', () => {
  it('is deterministic for the same 4 cheap counts', () => {
    const counts = { maxInboxId: 42, claimsCount: 3, smsUndrainedCount: 0, escalationCount: 0 };
    expect(computeStateHash(counts)).toBe(computeStateHash({ ...counts }));
  });

  it('changes when any single tracked count changes', () => {
    const base = { maxInboxId: 42, claimsCount: 3, smsUndrainedCount: 0, escalationCount: 0 };
    expect(computeStateHash({ ...base, maxInboxId: 43 })).not.toBe(computeStateHash(base));
    expect(computeStateHash({ ...base, claimsCount: 4 })).not.toBe(computeStateHash(base));
    expect(computeStateHash({ ...base, smsUndrainedCount: 1 })).not.toBe(computeStateHash(base));
    expect(computeStateHash({ ...base, escalationCount: 1 })).not.toBe(computeStateHash(base));
  });

  it('returns null for a non-object input (never crashes the caller)', () => {
    expect(computeStateHash(null)).toBeNull();
    expect(computeStateHash(undefined)).toBeNull();
  });

  it('skips only when the hash matches the last one and no other override applies', () => {
    const h = computeStateHash({ maxInboxId: 1, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    expect(shouldSkipHeavyPass({ hash: h, lastHash: h, skipStreak: 0 })).toBe(true);
  });

  it('never skips on the first tick (no lastHash baseline)', () => {
    const h = computeStateHash({ maxInboxId: 1, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    expect(shouldSkipHeavyPass({ hash: h, lastHash: null, skipStreak: 0 })).toBe(false);
  });

  it('never skips when the hash changed (real state delta)', () => {
    const a = computeStateHash({ maxInboxId: 1, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    const b = computeStateHash({ maxInboxId: 2, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    expect(shouldSkipHeavyPass({ hash: b, lastHash: a, skipStreak: 0 })).toBe(false);
  });

  it('BINDING (per Solomon): a hash-computation error ALWAYS forces a full pass, even with a matching hash', () => {
    const h = computeStateHash({ maxInboxId: 1, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    expect(shouldSkipHeavyPass({ hash: h, lastHash: h, skipStreak: 0, hashError: true })).toBe(false);
  });

  it('a null/undefined hash (fail-open equivalent of an error) never skips', () => {
    expect(shouldSkipHeavyPass({ hash: null, lastHash: 'whatever', skipStreak: 0 })).toBe(false);
  });

  it('the Nth-tick safety floor forces a full pass once skipStreak reaches the floor', () => {
    const h = computeStateHash({ maxInboxId: 1, claimsCount: 0, smsUndrainedCount: 0, escalationCount: 0 });
    // skipStreak counts CONSECUTIVE prior skips; at floor-1 the next tick would be the Nth, so it must NOT skip.
    expect(shouldSkipHeavyPass({ hash: h, lastHash: h, skipStreak: HEAVY_PASS_NTH_TICK_FLOOR - 1 })).toBe(false);
    expect(shouldSkipHeavyPass({ hash: h, lastHash: h, skipStreak: HEAVY_PASS_NTH_TICK_FLOOR - 2 })).toBe(true);
  });
});

describe('decideCadence loadedAndQuiet branch (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 FR-2/FR-4)', () => {
  it('resolves the [540,660] band for every phase offset, never 300 (TS-1)', () => {
    for (let offset = 0; offset <= 1000; offset += 13) {
      const d = decideCadence({ quiescent: false, partyOffsetS: offset, loadedAndQuiet: true });
      expect(d).toBeGreaterThanOrEqual(LOADED_AND_QUIET_MIN_S);
      expect(d).toBeLessThanOrEqual(LOADED_AND_QUIET_MAX_S);
      expect(d).not.toBe(PROMPT_CACHE_TTL_S);
    }
  });

  it('band separation: loaded-and-quiet floor is strictly above the ACTIVE ceiling', () => {
    expect(LOADED_AND_QUIET_MIN_S).toBeGreaterThan(ACTIVE_MAX_S);
  });

  it('band cap: loaded-and-quiet ceiling is strictly below the quiescent cap', () => {
    expect(LOADED_AND_QUIET_MAX_S).toBeLessThan(MAX_QUIESCENT_PARK_S);
  });

  it('an open unclaimed row (loadedAndQuiet=false) forces the ACTIVE band even though every other condition would qualify (TS-2, the regression guard the SD text explicitly calls for)', () => {
    // Caller computed loadedAndQuiet=false because rawUnclaimed>0 or openQfCount>0 — decideCadence
    // itself never re-derives the predicate, it only trusts the boolean it is handed.
    const d = decideCadence({ quiescent: false, partyOffsetS: 0, loadedAndQuiet: false });
    expect(d).toBeGreaterThanOrEqual(180);
    expect(d).toBeLessThanOrEqual(ACTIVE_MAX_S);
  });

  it('hard-wake beats loaded-and-quiet: hasUnactionedDirective=true still yields the 15-45s band (TS-4, branch precedence)', () => {
    const d = decideCadence({ quiescent: false, partyOffsetS: 0, loadedAndQuiet: true, hasUnactionedDirective: true });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('hard-wake via undeliveredEscalation also beats loaded-and-quiet', () => {
    const d = decideCadence({ quiescent: false, partyOffsetS: 0, loadedAndQuiet: true, hasUndeliveredChairmanEscalation: true });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('quiescent beats loaded-and-quiet: quiescent=true still yields the existing quiescent value regardless of loadedAndQuiet', () => {
    const withoutLoaded = decideCadence({ quiescent: true, partyOffsetS: 0 });
    const withLoaded = decideCadence({ quiescent: true, partyOffsetS: 0, loadedAndQuiet: true });
    expect(withLoaded).toBe(withoutLoaded);
  });

  it('loadedAndQuiet omitted/false/undefined is byte-identical to today\'s 3-branch output for every existing fixture', () => {
    for (const offset of [0, 1, 50, 270, 420, 999]) {
      const baseline = decideCadence({ quiescent: false, partyOffsetS: offset });
      const withFalse = decideCadence({ quiescent: false, partyOffsetS: offset, loadedAndQuiet: false });
      const withUndefined = decideCadence({ quiescent: false, partyOffsetS: offset, loadedAndQuiet: undefined });
      expect(withFalse).toBe(baseline);
      expect(withUndefined).toBe(baseline);
    }
  });

  it('golden-baseline regression: the pre-change digest is unchanged when loadedAndQuiet is omitted (FR-4 AC-4, TESTING evidence 4b0ec75d)', () => {
    // Same iteration order the TESTING sub-agent used to compute the pre-change digest against
    // the UNMODIFIED module (sub_agent_execution_results id 4b0ec75d-6408-4e8d-af3b-c7228a0c4995),
    // so this hash is not self-referential — it was fixed BEFORE this branch existed.
    const QUIESCENT = [true, false];
    const PARTY_OFFSETS = [0, 1, 15, 45, 60, 90, 180, 270, 420, 600, 999];
    const DESIRED_QUIESCENT = [undefined, 120, 300, 600, 900];
    const DESIRED_ACTIVE = [undefined, 0, 255, 300, 900];
    const DIRECTIVES = [false, true];
    const ESCALATIONS = [false, true];
    const values = [];
    for (const quiescent of QUIESCENT) {
      for (const partyOffsetS of PARTY_OFFSETS) {
        for (const desiredQuiescentParkS of DESIRED_QUIESCENT) {
          for (const desiredActiveS of DESIRED_ACTIVE) {
            for (const hasUnactionedDirective of DIRECTIVES) {
              for (const hasUndeliveredChairmanEscalation of ESCALATIONS) {
                values.push(decideCadence({
                  quiescent, partyOffsetS, desiredQuiescentParkS, desiredActiveS,
                  hasUnactionedDirective, hasUndeliveredChairmanEscalation,
                }));
              }
            }
          }
        }
      }
    }
    expect(values.length).toBe(2200);
    const digest = createHash('sha256').update(values.join(',')).digest('hex');
    expect(digest).toBe('adf594d5971a40e4d3702d4eb5500d6b34ac81f10ad968853144dd1cb00ba81a');
  });
});
