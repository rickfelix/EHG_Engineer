// QF-20260807-251 — the retro quality gate must dock EMPTY FILLER, not the token "nothing".
//
// WHAT THIS TEST CAN AND CANNOT DO, stated up front so nobody reads more into a green run than
// it earns. The dock lives in a plpgsql trigger (public.auto_validate_retrospective_quality),
// and CI has no database, so this exercises the PREDICATE — the regex — and NOT the trigger's
// execution, the score arithmetic, or the publish gate. To stop that gap becoming a drift gap,
// the regex has exactly ONE source of truth: tests/fixtures/qf251-vacuous-regex.json, which the
// migration generator emitted alongside the SQL. The last test here pins that the shipped .sql
// actually contains that exact string, so a mirror that silently diverges fails loudly.
//
// Postgres `~` is POSIX ERE and this asserts with JS RegExp. The pattern deliberately uses only
// constructs the two share — alternation, groups, `?`, a character class, `^`/`$` — so no
// feature in it can mean different things on the two engines.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { vacuousRegex } = JSON.parse(
  readFileSync(resolve(REPO, 'tests/fixtures/qf251-vacuous-regex.json'), 'utf8'),
);
const MIGRATION = resolve(REPO, 'database/migrations/20260808_qf251_retro_quality_vacuous_predicate.sql');

// Mirrors the SQL call site: btrim(lower(item)) ~ '<regex>'
const docks = (item) => new RegExp(vacuousRegex).test(String(item).trim().toLowerCase());

// Leg (a) — the five MEASURED false positives. Verbatim from the banked originals at
// retrospectives.metadata.quality_trigger_false_positives (row c075c90c-7489-4f53-b245-a72e53853e52)
// for Charlie's three; Alpha-2's two as reported in the ticket. These are replayed, not paraphrased.
const CHARLIE_BANKED = [
  'SIX CORRECTIONS. What shipped shares almost nothing with what was ratified at SD creation. That is the headline finding of this SD, not a footnote — the SD was right about the HAZARD and wrong about the REMEDY, repeatedly, and each correction came from a different reviewer.',
  'CORRECTION 3 — THE PLANNED ASSERTION WOULD HAVE BEEN PRINT-ONLY AND COULD NEVER HAVE FAILED THE PROBE. probeTable:463 set res.bound and main():522-530 merely PRINTED it, while main():532 folded ONLY r.code into the exit code. Adding the equality inside assertIngressBoundCannotBind would have changed NOTHING OBSERVABLE. This is the THIRD instance of the detector-nobody-reads defect class in a single arc, and I would have shipped it.',
  'CORRECTION 5 (SECURITY) — THE VACUITY GATE SAT ABOVE THE BASIS CHECK, so definerFnBasis, a pure policy-TEXT read needing ZERO rows, was gated behind a row-count precondition it does not need. A quiet hour therefore swallowed a re-inlined policy and exited 0. MEASURED on live prod by replaying the probe cron window (17 6 * * *, one-hour lookback) over 30 days: 17 OF 30 RUNS (56.7%) WOULD HAVE BEEN VACUOUS AND ASSERTED NOTHING. Because retiring compareCountVisibility was made CONTINGENT on covering the re-inline path, 43% coverage did not satisfy the contingency I had already claimed was met.',
];

const ALPHA2_REPORTED = [
  'the two vocabularies share NOTHING',
  'NOTHING currently expires this state',
];

describe('leg (a): every measured emphatic finding scores UNDOCKED', () => {
  it.each(CHARLIE_BANKED)('Charlie banked specimen: %s', (item) => {
    expect(docks(item), 'emphatic finding still docked').toBe(false);
  });

  it.each(ALPHA2_REPORTED)('Alpha-2 reported specimen: %s', (item) => {
    expect(docks(item), 'emphatic finding still docked').toBe(false);
  });

  it('the OLD substring rule docked all five — proving these are regressions, not new passes', () => {
    // Without this the leg above could pass vacuously against a rule that never fired on them.
    const oldRule = (i) => /no significant/i.test(i) || /nothing/i.test(i);
    for (const item of [...CHARLIE_BANKED, ...ALPHA2_REPORTED]) {
      expect(oldRule(item), 'specimen was NOT docked by the old rule — wrong fixture').toBe(true);
    }
  });

  it('NOTHING-currently-expires-this-state survives a leading token — the case a stem match breaks', () => {
    // A `^nothing` stem predicate looks right and is wrong: a hyphen is a word boundary, so the
    // hyphenated compressed form of this very specimen would match it. Anchoring end-to-end is
    // what makes a leading "NOTHING" safe.
    expect(docks('NOTHING-currently-expires-this-state')).toBe(false);
    expect(docks('NOTHING currently expires this state')).toBe(false);
  });
});

describe('leg (b): genuinely vacuous filler STILL docks (the positive control)', () => {
  const VACUOUS = [
    'nothing', 'Nothing.', 'NOTHING', 'none', 'None.', 'N/A', 'n/a', 'na',
    'nothing to report', 'Nothing to report.', 'nothing to add', 'nothing to note',
    'no comment', 'no significant issues', 'No significant issues.',
    'no major concerns', 'no notable improvements', 'no significant issues identified',
    'no other findings', '  nothing to report  ',
  ];
  it.each(VACUOUS)('docks: %s', (item) => {
    expect(docks(item), 'vacuous filler slipped through — the gate would stop docking').toBe(true);
  });

  it('folds in the %no significant% twin rather than leaving it substring-matched', () => {
    // Kept deliberately: it carried the identical defect.
    expect(docks('no significant issues')).toBe(true);                                  // still filler
    expect(docks('No significant change in latency was observed after the fix.')).toBe(false); // real finding
  });
});

describe('leg (c): gate-fallback — precision must not lose to hedging', () => {
  // validateSDCompletionReadiness falls back to the STORED quality_score when the AI evaluator
  // is unavailable, so any dock delta between a precise and a hedged retro can move a completion
  // decision. Modelled as the dock count the trigger would apply per item.
  const docksApplied = (items) => items.filter(docks).length;

  const precise = [
    'the two vocabularies share NOTHING',
    'NOTHING currently expires this state',
  ];
  const hedged = [
    'there may be some minor areas that could potentially be improved somewhat',
    'a few things could perhaps be tightened up in places',
  ];

  it('a precise empty-set retro is docked no more than its hedged equivalent', () => {
    expect(docksApplied(precise)).toBe(0);
    expect(docksApplied(hedged)).toBe(0);
    expect(docksApplied(precise)).toBeLessThanOrEqual(docksApplied(hedged));
  });

  it('under the OLD rule precision LOST to hedging — the defect this leg exists for', () => {
    const oldRule = (i) => /no significant/i.test(i) || /nothing/i.test(i);
    const oldPrecise = precise.filter(oldRule).length; // 2 → −20
    const oldHedged = hedged.filter(oldRule).length;   // 0
    expect(oldPrecise).toBeGreaterThan(oldHedged);
  });
});

describe('the SQL and this mirror cannot drift', () => {
  it('the shipped migration contains the exact WHOLE predicate this file asserts against', () => {
    // Pins the COMPLETE expression, not just the regex substring. A `toContain(regex)` pin
    // passed a mutation that injected characters INSIDE the quotes ('XX^(n/?a|...') because the
    // regex was still present somewhere — it caught truncation but not prefix/suffix injection,
    // which is nearly the exact corruption that a String.replace `$'` expansion caused while
    // this migration was being generated. Pin the delimiters and the whole line survives.
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain(`btrim(lower(item)) ~ '${vacuousRegex}' THEN`);
  });

  it('the migration declares the predicate EXACTLY ONCE', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect((sql.match(/btrim\(lower\(item\)\) ~ '/g) || []).length).toBe(1);
  });

  it('the restated function body is not duplicated — full-body DDL must carry one copy', () => {
    // The `$'` corruption spliced the tail of the function back into itself and every other
    // assertion here still passed. These landmarks are singular in a correct body.
    const sql = readFileSync(MIGRATION, 'utf8');
    expect((sql.match(/Specificity bonus/g) || []).length).toBe(1);
    expect((sql.match(/CREATE OR REPLACE FUNCTION public\.auto_validate_retrospective_quality/g) || []).length).toBe(1);
    expect((sql.match(/\$function\$/g) || []).length).toBe(2); // open + close, nothing spliced between
  });

  it('the migration no longer contains the substring dock it replaced (comments stripped)', () => {
    // Comments MUST be stripped: the migration documents itself by quoting the old predicate,
    // so a raw scan would match its own explanation and report the defect as still present.
    const sql = readFileSync(MIGRATION, 'utf8').replace(/^\s*--.*$/gm, '');
    expect(sql).not.toContain("ILIKE '%nothing%'");
    expect(sql).not.toContain("ILIKE '%no significant%'");
    expect(sql).toContain('auto_validate_retrospective_quality'); // vacuity: we scanned the real file
  });
});
