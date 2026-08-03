// FR-2 — the heal gate resolves thresholds from ONE table.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// The gate imported only the FUNCTIONS from lib/handoff/threshold-resolver.js while keeping its own
// SD_TYPE_THRESHOLDS, so two tables governed one decision and nothing compared them. The drift was
// PARTIAL — feature, security and infrastructure agreed — which is why it survived: any spot-check
// landing on one of those three confirmed the tables matched.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SD_TYPE_THRESHOLDS } from '../../lib/handoff/threshold-resolver.js';

const GATE = path.join(process.cwd(), 'scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js');
const src = () => fs.readFileSync(GATE, 'utf8');

describe('FR-2 — the gate holds no threshold table of its own', () => {
  it('does not DECLARE SD_TYPE_THRESHOLDS, it IMPORTS it', () => {
    const s = src();
    // Assert on the DECLARATION specifically. A bare "does it mention the name" check would pass on
    // the very defect this fixes, since the old file both declared and used the same identifier.
    expect(s).not.toMatch(/(const|let|var)\s+SD_TYPE_THRESHOLDS\s*=/);
    expect(s).toMatch(/import\s*\{[^}]*SD_TYPE_THRESHOLDS[^}]*\}\s*from\s*['"][^'"]*threshold-resolver\.js['"]/);
  });

  it('still USES the table it imports — deleting a table and the lookup together would also pass the check above', () => {
    expect(src()).toMatch(/SD_TYPE_THRESHOLDS\[\s*sdType\s*\]/);
  });
});

describe('FR-2 — the keys that were missing now resolve', () => {
  // The larger live effect is the ABSENCES, not the disagreements: 4 in-flight orchestrator SDs move
  // 85 -> 70 through a missing key, while the four disagreeing types have almost no in-flight
  // population. A blast-radius claim scoped to disagreeing VALUES reports ~zero impact and is wrong.
  it.each(['governance', 'database', 'maintenance', 'protocol', 'orchestrator', '_default'])(
    'resolves %s, which the gate copy lacked entirely', (type) => {
      expect(typeof SD_TYPE_THRESHOLDS[type]).toBe('number');
    });

  it('orchestrator resolves to 70 — the in-flight case, asserted by name not by count', () => {
    expect(SD_TYPE_THRESHOLDS.orchestrator).toBe(70);
  });
});

describe('FR-2 — the canonical table is internally coherent', () => {
  // Deliberately NOT a snapshot of every value: pinning all thirteen would make any future
  // deliberate tuning fail here for the wrong reason. These assert RELATIONSHIPS that must hold
  // whatever the numbers become.
  it('every threshold is a number in 0..100', () => {
    for (const [k, v] of Object.entries(SD_TYPE_THRESHOLDS)) {
      expect(typeof v, k).toBe('number');
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(100);
    }
  });

  it('carries a _default so an unknown sd_type resolves rather than falling through', () => {
    expect(SD_TYPE_THRESHOLDS._default).toBeDefined();
  });

  it('the high-fidelity tier sits strictly above the low tier', () => {
    // A table that collapsed every type to one value would satisfy "is a number" and defeat the
    // point of having types at all.
    expect(SD_TYPE_THRESHOLDS.feature).toBeGreaterThan(SD_TYPE_THRESHOLDS.documentation);
    expect(SD_TYPE_THRESHOLDS.security).toBeGreaterThan(SD_TYPE_THRESHOLDS.maintenance);
  });

  it('distinct types are NOT all identical — the table still discriminates', () => {
    expect(new Set(Object.values(SD_TYPE_THRESHOLDS)).size).toBeGreaterThan(1);
  });
});

// ── FR-3 ──────────────────────────────────────────────────────────────────────
import { isSdHealSnapshot } from '../../scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js';

describe('FR-3 — one selection strategy, and the string shape is a decision not an accident', () => {
  it('the dead containedBy predicate is gone from the live code', () => {
    // Asserted on NON-COMMENT lines only: the explanatory comment names the removed call, and a
    // naive whole-file match would fail on its own documentation.
    const live = src().split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(live).not.toMatch(/\.containedBy\(/);
  });

  it('selects an object snapshot whose mode is sd-heal', () => {
    expect(isSdHealSnapshot({ mode: 'sd-heal', arch_key: 'x', criteria_count: 7 })).toBe(true);
  });

  it('rejects a STRING snapshot rather than letting ?.mode quietly yield undefined', () => {
    // 161 rows store rubric_snapshot as a raw LLM prompt. `'...'?.mode` is undefined, so the old
    // optional-chain excluded them for the right reason by accident — it could not tell a string
    // from an object missing the key.
    expect(isSdHealSnapshot('You are scoring an SD against the vision rubric...')).toBe(false);
    expect(isSdHealSnapshot('')).toBe(false);
  });

  it('rejects null, undefined and arrays', () => {
    for (const v of [null, undefined, [], [{ mode: 'sd-heal' }]]) {
      expect(isSdHealSnapshot(v)).toBe(false);
    }
  });

  it('rejects an object of a DIFFERENT mode — the predicate still discriminates', () => {
    // Both arms in one file: a predicate returning true for everything passes the accept case, and
    // one returning false for everything passes every reject case. Neither survives both.
    expect(isSdHealSnapshot({ mode: 'vision-18dim' })).toBe(false);
    expect(isSdHealSnapshot({ arch_key: 'x' })).toBe(false);
  });
});

describe('FR-3 — where the shape guard is actually LOAD-BEARING', () => {
  // HONEST SCOPE. For a plain string, the old `snapshot?.mode === 'sd-heal'` ALREADY returned false,
  // because `'...'.mode` is undefined in JS. A mutation reverting the explicit typeof check passed
  // every string/array case — so for those inputs the guard is CLARIFYING, not corrective, and
  // claiming otherwise would be claiming a fix that changes no behaviour.
  //
  // It IS load-bearing for a non-plain object carrying the key: an array or boxed String with a
  // `mode` property reads as sd-heal under the old predicate and is rejected under this one. That is
  // the case that makes the guard a guard rather than a comment.
  it('rejects an ARRAY carrying a mode property — the old predicate accepted this', () => {
    const arrayWithMode = Object.assign([], { mode: 'sd-heal' });
    expect(arrayWithMode.mode).toBe('sd-heal');          // the old predicate would have said true
    expect(isSdHealSnapshot(arrayWithMode)).toBe(false); // this one does not
  });

  // A boxed String carrying `mode` WOULD slip through — typeof new String() is 'object' and
  // Array.isArray says no — but that assertion was written, run, and REMOVED rather than fixed
  // around: rubric_snapshot arrives via JSON, and JSON.parse never yields a boxed primitive, so the
  // shape is unreachable from the database. Hardening against it would be coverage of a case this
  // environment cannot deliver, and the passing test would have implied a guarantee the guard does
  // not actually provide against anything real.
});

describe('FR-4 — a narrowing no-op names WHICH no-op it was', () => {
  // Every no-op used to render identically: dynamicAdjustment stayed null and, in the failure case,
  // the reason went to console.debug and vanished. "Not narrowed" and "narrowing FAILED" looked the
  // same — a silent absence reading as a deliberate decision, which is this SD's whole subject.
  const s = () => src();

  it('distinguishes FIVE outcomes, not the three the SD text named', () => {
    for (const outcome of ['skipped_corrective', 'no_dimension_scores', 'no_sd_metadata', 'narrowed', 'no_change']) {
      expect(s()).toContain(`'${outcome}'`);
    }
    expect(s()).toMatch(/outcome:\s*'failed'/);
  });

  it('a FAILURE is warned, not debug-swallowed', () => {
    // The specific regression: console.debug for a failed narrowing. A test asserting only that
    // some warn exists would pass while the failure path stayed on debug, so this pins the pairing.
    expect(s()).toMatch(/console\.warn\([^)]*narrowing FAILED/);
  });

  it('the failure message says the threshold may now be STRICTER than intended', () => {
    // Direction matters: a failed narrowing leaves the UNNARROWED threshold in force, so the gate
    // is harsher than the author meant — the opposite of the fail-open most readers assume.
    expect(s()).toMatch(/stricter than intended/);
  });

  it('skipped_corrective and no_dimension_scores are separate outcomes — a policy decision is not a data defect', () => {
    const src_ = s();
    const policy = src_.indexOf("'skipped_corrective'");
    const defect = src_.indexOf("'no_dimension_scores'");
    expect(policy).toBeGreaterThan(-1);
    expect(defect).toBeGreaterThan(-1);
    expect(policy).not.toBe(defect);
  });
});

describe('FR-5 — scoreAge is labelled advisory instead of reading as a control', () => {
  it('the reported line says it does not gate', () => {
    expect(src()).toMatch(/Score Age:.*ADVISORY.*does not gate/);
  });

  it('scoreAge still participates in ZERO comparisons — the decision was to leave it non-gating', () => {
    // Guards against a later reader "finishing the job" by wiring it in. If age is ever meant to
    // gate, the missing input is a work-changed-since signal, not a comparison here.
    const live = src().split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(live).not.toMatch(/scoreAge\s*[<>]=?/);
    expect(live).not.toMatch(/[<>]=?\s*scoreAge/);
  });
});
