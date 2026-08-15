/**
 * SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001 — formatDriveBreakdown, the per-leg sibling of
 * formatBody. A NEW, separate file (not appended to drive-report-sms.test.js) so the 7
 * byte-pinned formatBody strings in that file are provably untouched by this change — this file
 * imports formatBody too, purely to run that regression check inline.
 */

import { describe, it, expect } from 'vitest';
import { formatDriveBreakdown, formatBody, MAX_BREAKDOWN_CHARS } from '../../../scripts/drive-report-sms.mjs';
import { RATIFIED_LEG_IDS } from '../../../lib/drive-loop/score/drive-score-legs.js';

const FACTS = {
  score: 4,
  possible: 6,
  legs: [
    { id: 'leg1_landed', value: 2 },
    { id: 'leg2_uptake', value: 1 },
    { id: 'leg4_capacity', value: 1 },
  ],
  topLeverLeg: 'leg2_uptake',
};

describe('formatDriveBreakdown — correct rendering', () => {
  it('renders "X/possible = leg value + leg value + ...; top lever: <id>"', () => {
    expect(formatDriveBreakdown(FACTS)).toBe(
      '4/6 = leg1_landed 2 + leg2_uptake 1 + leg4_capacity 1; top lever: leg2_uptake',
    );
  });

  it('renders legs in the order given, not sorted or reordered', () => {
    const reordered = { ...FACTS, legs: [...FACTS.legs].reverse() };
    expect(formatDriveBreakdown(reordered)).toBe(
      '4/6 = leg4_capacity 1 + leg2_uptake 1 + leg1_landed 2; top lever: leg2_uptake',
    );
  });

  it('a single leg still renders correctly', () => {
    expect(formatDriveBreakdown({ score: 2, possible: 2, legs: [{ id: 'leg1_landed', value: 2 }], topLeverLeg: 'leg1_landed' }))
      .toBe('2/2 = leg1_landed 2; top lever: leg1_landed');
  });

  it('a MEASURED zero renders as a real 0, not "unavailable"', () => {
    const facts = { ...FACTS, legs: [{ id: 'leg1_landed', value: 0 }, { id: 'leg2_uptake', value: 1 }] };
    expect(formatDriveBreakdown(facts)).toContain('leg1_landed 0');
    expect(formatDriveBreakdown(facts)).not.toContain('leg1_landed unavailable');
  });
});

describe('formatDriveBreakdown — old-shape-row graceful degradation (an unavailable leg is NEVER 0)', () => {
  it('a leg with value:null renders as "<id> unavailable", never "<id> 0"', () => {
    const facts = {
      score: 3, possible: 6,
      legs: [{ id: 'leg1_landed', value: 2 }, { id: 'leg2_uptake', value: null }, { id: 'leg4_capacity', value: 1 }],
      topLeverLeg: 'leg2_uptake',
    };
    const out = formatDriveBreakdown(facts);
    expect(out).toBe('3/6 = leg1_landed 2 + leg2_uptake unavailable + leg4_capacity 1; top lever: leg2_uptake');
    expect(out).not.toMatch(/leg2_uptake 0/);
  });

  it('a leg with value OMITTED entirely (old-shape row, no per-leg value field at all) also renders unavailable, not 0', () => {
    const facts = {
      score: 2, possible: 6,
      legs: [{ id: 'leg1_landed' }, { id: 'leg2_uptake', value: 2 }, { id: 'leg4_capacity' }],
      topLeverLeg: 'leg1_landed',
    };
    const out = formatDriveBreakdown(facts);
    expect(out).toBe('2/6 = leg1_landed unavailable + leg2_uptake 2 + leg4_capacity unavailable; top lever: leg1_landed');
  });

  it('EVERY leg unavailable does not throw and does not fabricate zeros', () => {
    const facts = {
      score: 0, possible: 6,
      legs: RATIFIED_LEG_IDS.map((id) => ({ id, value: null })),
      topLeverLeg: RATIFIED_LEG_IDS[0],
    };
    const out = formatDriveBreakdown(facts);
    expect(out).not.toMatch(/\d 0\b/); // no leg renders as a bare numeric zero
    for (const id of RATIFIED_LEG_IDS) expect(out).toContain(`${id} unavailable`);
  });
});

describe('formatDriveBreakdown — the closed-set throw for top lever', () => {
  it('throws when topLeverLeg is not a ratified leg id', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, topLeverLeg: 'leg3_never_existed' })).toThrow(/topLeverLeg must be one of/);
  });

  it('refuses a free-text reason in place of a leg id — the whole point is a pointer, not prose', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, topLeverLeg: 'the uptake leg is the biggest gap' })).toThrow(/topLeverLeg must be one of/);
  });

  it('every RATIFIED leg id is accepted', () => {
    for (const id of RATIFIED_LEG_IDS) {
      expect(() => formatDriveBreakdown({ ...FACTS, topLeverLeg: id })).not.toThrow();
    }
  });

  it('rejects a non-string topLeverLeg', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, topLeverLeg: null })).toThrow(/topLeverLeg must be one of/);
    expect(() => formatDriveBreakdown({ ...FACTS, topLeverLeg: 42 })).toThrow(/topLeverLeg must be one of/);
  });
});

describe('formatDriveBreakdown — the closed-set throw applies to leg ids too, not just topLeverLeg', () => {
  it('throws when a leg id is not a ratified leg id (adversarial review finding)', () => {
    const bad = { ...FACTS, legs: [{ id: 'leg3_never_existed', value: 1 }] };
    expect(() => formatDriveBreakdown(bad)).toThrow(/leg id must be one of/);
  });

  it('refuses a free-text reason in place of a leg id — same discipline as topLeverLeg', () => {
    const bad = { ...FACTS, legs: [{ id: 'the uptake leg is the biggest gap', value: 1 }] };
    expect(() => formatDriveBreakdown(bad)).toThrow(/leg id must be one of/);
  });

  it('every RATIFIED leg id is accepted as a leg id', () => {
    for (const id of RATIFIED_LEG_IDS) {
      expect(() => formatDriveBreakdown({ ...FACTS, legs: [{ id, value: 1 }], topLeverLeg: id })).not.toThrow();
    }
  });
});

describe('formatDriveBreakdown — numeric validation throws for every numeric field', () => {
  it('refuses a negative or non-finite score/possible', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, score: -1 })).toThrow(/non-negative/);
    expect(() => formatDriveBreakdown({ ...FACTS, possible: NaN })).toThrow(/non-negative/);
    expect(() => formatDriveBreakdown({ ...FACTS, possible: Infinity })).toThrow(/non-negative/);
  });

  it('refuses a negative or non-finite MEASURED leg value', () => {
    const bad = { ...FACTS, legs: [{ id: 'leg1_landed', value: -1 }] };
    expect(() => formatDriveBreakdown(bad)).toThrow(/leg1_landed value must be a non-negative number/);
    const bad2 = { ...FACTS, legs: [{ id: 'leg1_landed', value: NaN }] };
    expect(() => formatDriveBreakdown(bad2)).toThrow(/non-negative number/);
  });

  it('refuses a leg with a missing or non-string id', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, legs: [{ value: 1 }] })).toThrow(/every leg needs a string id/);
    expect(() => formatDriveBreakdown({ ...FACTS, legs: [{ id: '', value: 1 }] })).toThrow(/every leg needs a string id/);
  });

  it('refuses a non-array / empty legs list', () => {
    expect(() => formatDriveBreakdown({ ...FACTS, legs: [] })).toThrow(/legs must be a non-empty array/);
    expect(() => formatDriveBreakdown({ ...FACTS, legs: 'nope' })).toThrow(/legs must be a non-empty array/);
  });
});

describe('formatDriveBreakdown — own-properties-only (prototype pollution parity with formatBody)', () => {
  it('an inherited value is NOT a computed one', () => {
    Object.prototype.score = 99;         // eslint-disable-line no-extend-native
    Object.prototype.possible = 99;      // eslint-disable-line no-extend-native
    Object.prototype.legs = [{ id: 'leg1_landed', value: 99 }]; // eslint-disable-line no-extend-native
    Object.prototype.topLeverLeg = 'leg1_landed'; // eslint-disable-line no-extend-native
    try {
      expect(() => formatDriveBreakdown()).toThrow(/must be an OWN property/);
      expect(() => formatDriveBreakdown({})).toThrow(/must be an OWN property/);
      expect(formatDriveBreakdown({ ...FACTS })).toBe(
        '4/6 = leg1_landed 2 + leg2_uptake 1 + leg4_capacity 1; top lever: leg2_uptake',
      );
    } finally {
      delete Object.prototype.score;
      delete Object.prototype.possible;
      delete Object.prototype.legs;
      delete Object.prototype.topLeverLeg;
    }
  });

  it('refuses a non-object facts rather than reading properties off it', () => {
    for (const bad of [null, 'TIGHT', 42]) expect(() => formatDriveBreakdown(bad)).toThrow(/must be an object|must be an OWN property/);
  });
});

describe('formatDriveBreakdown — its own length-budget throw', () => {
  it('throws rather than silently truncating when the rendered body exceeds MAX_BREAKDOWN_CHARS', () => {
    // A pathological leg count (well beyond the ratified 3) forces the body past the budget.
    const manyLegs = Array.from({ length: 60 }, (_, i) => ({ id: 'leg1_landed', value: i }));
    expect(() => formatDriveBreakdown({ score: 4, possible: 6, legs: manyLegs, topLeverLeg: 'leg1_landed' }))
      .toThrow(/exceeds the breakdown length budget/);
  });

  it('a realistic 3-leg breakdown stays comfortably under the budget', () => {
    expect(formatDriveBreakdown(FACTS).length).toBeLessThan(MAX_BREAKDOWN_CHARS);
  });

  it('MAX_BREAKDOWN_CHARS is its OWN constant, distinct from formatBody\'s MAX_BODY_CHARS', () => {
    expect(MAX_BREAKDOWN_CHARS).not.toBe(320);
    expect(MAX_BREAKDOWN_CHARS).toBeGreaterThan(320);
  });
});

// ── REGRESSION: formatBody is untouched by this addition ──────────────────────────────────────
// The 7 byte-pinned strings live in tests/unit/scripts/drive-report-sms.test.js,
// tests/unit/cron/drive-report-sms-sweep.test.js, and
// tests/unit/hooks/session-role-orient-adam-branch.test.js — this is not a duplicate of those,
// it is an independent spot-check that formatBody's behavior did not shift when its new sibling
// was added to the same file (shared module-scope constants, shared imports).
describe('REGRESSION — formatBody is unmodified by the formatDriveBreakdown addition', () => {
  it('formatBody still produces its pinned byte-for-byte output', () => {
    const facts = { score: 4, possible: 6, verdict: 'TIGHT', unavailableLegs: 0, unownedBlockers: 0 };
    expect(formatBody(facts)).toBe('Drive 4/6 | capacity TIGHT');
  });
});
