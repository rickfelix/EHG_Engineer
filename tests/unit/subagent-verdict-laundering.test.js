/**
 * SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001.
 *
 * THE DEFECT WAS THAT THE GATE WAS NEVER SHOWN THE VALUE. results-storage.js rewrote
 * MANUAL_REQUIRED and PENDING to WARNING — an ACCEPTING verdict — and sent every
 * unmodelled value there too via `|| 'WARNING'`. So this suite deliberately does NOT
 * assert the mapping in isolation: it feeds the writer's OUTPUT into the gate's REAL
 * classifyVerdict. A mapper-only test passes while the gate stays blind, which is the
 * defect reproduced inside its own fix.
 *
 * MEASURED CONTEXT (all-time, live, at LEAD): 15,602 rows come from this writer;
 * 141 are MANUAL_REQUIRED stored as WARNING; 15 had no verdict at all and were stored as
 * WARNING. The schema has allowed eight verdicts since migration 20260130 — 93
 * MANUAL_REQUIRED and 2,330 PENDING rows prove the widened constraint is applied.
 */
import { describe, it, expect } from 'vitest';
import { mapVerdict, ABSENT_VERDICT } from '../../lib/sub-agent-executor/results-storage.js';
import { classifyVerdict } from '../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

/**
 * QF-20260804-569: this suite's subject is LAUNDERING — a verdict being softened into one the gate
 * ACCEPTS. It previously pinned the exact class name 'reject', which made it brittle to a
 * taxonomy change rather than to a behaviour change: ERROR and PENDING are now classified
 * 'nonevidence' (the run crashed or never finished, so no check was performed), which blocks
 * UNCONDITIONALLY where 'reject' was subject to SUBAGENT_VERDICT_MODE — strictly stronger than
 * what these tests were defending.
 *
 * So assert the PROPERTY these tests actually mean: not accepted, and not fail-open 'unknown'.
 * That survives the taxonomy growing again and still fails if anything is genuinely laundered.
 */
function expectBlocking(verdict, label) {
  const klass = classifyVerdict(verdict);
  expect(['reject', 'nonevidence'], `${label ?? verdict} classified ${klass}`).toContain(klass);
}

/** The eight values valid_verdict permits (migration 20260130). */
const ALLOWED = new Set(['PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS', 'WARNING', 'MANUAL_REQUIRED', 'PENDING', 'ERROR']);

describe('the gate can finally SEE rejecting verdicts (FR-2)', () => {
  it('MANUAL_REQUIRED reaches the gate as REJECT — 141 production rows were laundered here', () => {
    // BEFORE: mapVerdict -> 'WARNING' -> classifyVerdict -> 'accept' -> no warning at all.
    expect(mapVerdict('MANUAL_REQUIRED')).toBe('MANUAL_REQUIRED');
    expectBlocking(mapVerdict('MANUAL_REQUIRED'));
  });

  it('PENDING reaches the gate as REJECT — tested separately because the map treated both identically', () => {
    // Testing only MANUAL_REQUIRED and assuming PENDING followed is exactly how the second
    // one stays broken; the old map sent both to WARNING via two distinct lines.
    expect(mapVerdict('PENDING')).toBe('PENDING');
    expectBlocking(mapVerdict('PENDING'));
  });

  it('ERROR is stored as itself rather than flattened to FAIL', () => {
    // Both reject, so this is not a policy change — it is truthfulness. The old mapping
    // discarded the distinction between "the agent rejected" and "the agent crashed".
    expect(mapVerdict('ERROR')).toBe('ERROR');
    expectBlocking(mapVerdict('ERROR'));
  });

  it('UNKNOWN becomes BLOCKED — not in the eight, so it must translate, and it must reject', () => {
    expect(mapVerdict('UNKNOWN')).toBe('BLOCKED');
    expectBlocking(mapVerdict('UNKNOWN'));
  });
});

describe('the unmodelled fallback no longer means "accepted" (FR-1)', () => {
  it('free text lands on a REJECTING verdict', () => {
    // BEFORE: `|| 'WARNING'` — not-understood silently meant accepted.
    expectBlocking(mapVerdict('NEEDS_HUMAN'));
    expectBlocking(mapVerdict('totally-made-up'));
  });

  it('an agent that returned NOTHING lands on a REJECTING verdict — 15 production rows', () => {
    for (const nothing of [undefined, null, '']) {
      expectBlocking(mapVerdict(nothing), `verdict=${JSON.stringify(nothing)}`);
    }
  });

  it('whatever the fallback produces is still a value the CHECK constraint permits', () => {
    // The constraint forbids free text, so a fallback that passed the raw string through
    // would fail at the database — the row would simply never be written, which is a
    // different and worse failure than the one being fixed.
    for (const weird of ['NEEDS_HUMAN', undefined, null, '', 'PASS ', 'pass', 42, {}]) {
      expect(ALLOWED.has(mapVerdict(weird)), `mapVerdict(${JSON.stringify(weird)})`).toBe(true);
    }
  });

  it('normalizes case and whitespace instead of rejecting on them', () => {
    // FIRST CUT OF THIS FIX GOT THIS WRONG. It left the map case-SENSITIVE and argued the
    // rejecting fallback made that safe. It is safe against LAUNDERING and unsafe against
    // FALSE REJECTION — and live data carries lowercase 'pass' and 'approve-with-conditions'.
    expect(mapVerdict('pass')).toBe('PASS');
    expect(mapVerdict('PASS ')).toBe('PASS');
    expect(mapVerdict('  manual_required  ')).toBe('MANUAL_REQUIRED');
  });
});

describe('REGRESSION GUARD — the 60 live outliers must not become hard failures', () => {
  // MEASURED, NOT IMAGINED. 60 rows carry an original_verdict outside the 9-key map and
  // ALL 60 are stored ACCEPTING today. Sending that family to a rejecting fallback would
  // turn ~30 semantically-passing rows/month into hard handoff failures the moment
  // SUBAGENT_VERDICT_MODE=block is enabled — this SD would have broken the very promotion
  // it exists to enable. Every string below is a real value from that population.
  it.each([
    ['PASS_WITH_CONCERNS', 14], ['CONCERNS', 14], ['PASS_WITH_CONDITIONS', 3],
    ['CONCERNS_DISPOSITIONED', 3], ['CONCERN', 2], ['PASS_WITH_MITIGATIONS', 2],
    ['APPROVED_WITH_CONDITIONS', 2], ['PASS_WITH_CONTRADICTIONS', 1],
    ['PASS_WITH_FINDINGS', 1], ['APPROVE-WITH-CONDITIONS', 1], ['PROCEED_WITH_CONCERNS', 1],
    ['PASS_WITH_RECOMMENDATIONS', 1], ['PROCEED_WITH_MITIGATION', 1],
    ['APPROVE_WITH_HARDENING', 1], ['approve-with-conditions', 1], ['pass', 1],
  ])('%s (x%i live) stays ACCEPTING', (verdict) => {
    expect(classifyVerdict(mapVerdict(verdict))).toBe('accept');
  });

  it('a PROSE verdict beginning "PASS_WITH_CONCERNS —" is accepted by PREFIX, never by substring', () => {
    const prose = 'PASS_WITH_CONCERNS — all three REQUIRED items are functionally closed and runtime-verified';
    expect(classifyVerdict(mapVerdict(prose))).toBe('accept');
  });

  it('OPPOSITE POLARITY: a PROSE verdict beginning "FAIL —" REJECTS, even though it contains the word "pass"', () => {
    // Two such rows exist live and are stored as accepting WARNING today — laundering this
    // change corrects. `includes` matching would read the embedded "pass" and accept them.
    const prose = 'FAIL — 4 of 6 prior REQUIRED items are closed and were re-verified, but the primary sd:next path is still inert';
    expect(mapVerdict(prose)).toBe('FAIL');
    expectBlocking(mapVerdict(prose));
  });

  it('ERROR keeps its tripwire: only genuinely unclassifiable values land there', () => {
    // The whole rationale for ERROR — here and at subagent-evidence-gate.js:57-66 — is that
    // it has zero rows, so its appearance means "a new value needs classifying". Bulk-filling
    // it with PASS_WITH_CONCERNS would have destroyed that property.
    // Both are real live values and NEITHER IS A VERDICT: 'HIGH' is a severity leaked into
    // the column, the other is a findings string. These are precisely the rows a human
    // should look at, so ERROR is the right destination.
    for (const junk of ['HIGH', 'NO_DUPLICATES_FOUND_EXTEND_EXISTING_FILES']) {
      expect(mapVerdict(junk), junk).toBe('ERROR');
      expectBlocking(mapVerdict(junk));
    }
    // And the pass-family does NOT land there — that is the regression guard.
    expect(mapVerdict('PASS_WITH_CONCERNS')).not.toBe('ERROR');
  });

  it('a namespaced verdict resolves on its MEANINGFUL token, in both directions', () => {
    // Prefix-only matching sent both of these to ERROR because their first word is a
    // namespace. Token order still decides, so the BLOCK one rejects and the APPROVED one
    // does not — the same rule, not two special cases.
    expect(mapVerdict('STRATEGY_APPROVED_WITH_REQUIRED_ADDITIONS')).toBe('CONDITIONAL_PASS');
    expect(classifyVerdict(mapVerdict('STRATEGY_APPROVED_WITH_REQUIRED_ADDITIONS'))).toBe('accept');
    expect(mapVerdict('STRATEGY_BLOCK_ALL_ADDITIONS_COMMITTED_TO_EXEC')).toBe('BLOCKED');
    expectBlocking(mapVerdict('STRATEGY_BLOCK_ALL_ADDITIONS_COMMITTED_TO_EXEC'));
  });

  it('only the FIRST THREE tokens are scanned — a verdict announces itself at the front', () => {
    // Scanning further turns classification into keyword-mining over prose, which is how a
    // FAIL that happens to mention "passed" gets read as a pass.
    expect(mapVerdict('SOMETHING UNRELATED ENTIRELY PASS')).toBe('ERROR');
  });
});

describe('OPPOSITE POLARITY — the evidence pipeline still works (FR-3)', () => {
  // 15,602 rows and every future handoff flow through this writer. An over-strict fix
  // halts the fleet immediately and gets reverted under pressure, taking the real fix
  // with it — so this block protects the fix as much as it protects the pipeline.
  it.each([
    ['PASS', 'PASS', 'accept'],
    ['CONDITIONAL_PASS', 'CONDITIONAL_PASS', 'accept'],
    ['WARNING', 'WARNING', 'accept'],
    ['FAIL', 'FAIL', 'reject'],
    ['BLOCKED', 'BLOCKED', 'reject'],
  ])('%s maps to %s and the gate says %s — unchanged from before', (input, stored, verdictClass) => {
    expect(mapVerdict(input)).toBe(stored);
    expect(classifyVerdict(mapVerdict(input))).toBe(verdictClass);
  });

  it('a GENUINE WARNING is still accepted — it must not be swept up with the laundered ones', () => {
    // The fix removes values that were DISGUISED as WARNING. An agent that actually
    // returned WARNING ran to completion and reported non-blocking concerns; breaking
    // that would reject real work.
    expect(mapVerdict('WARNING')).toBe('WARNING');
    expect(classifyVerdict('WARNING')).toBe('accept');
  });
});

describe('absence is recorded as a value, not an omitted key (FR-4)', () => {
  it('the sentinel is exported so audit queries and tests share ONE literal', () => {
    // A query hard-coding the string would drift the moment this changed, and the entire
    // point of the sentinel is that absence stays queryable.
    expect(typeof ABSENT_VERDICT).toBe('string');
    expect(ABSENT_VERDICT.length).toBeGreaterThan(0);
  });

  it('the sentinel is NOT a valid verdict, so it can never be mistaken for one', () => {
    expect(ALLOWED.has(ABSENT_VERDICT)).toBe(false);
    // And if it ever reached the verdict column by accident, it would reject rather than pass.
    expectBlocking(mapVerdict(ABSENT_VERDICT));
  });
});

describe('NEGATION — a negated pass is not a pass (found by review, not by me)', () => {
  // I asked the reviewer directly whether the token scan could be defeated. It could:
  // the negator is not itself a verdict token, so the scan walked past it and resolved on
  // the accepting word behind it. Every string below returned CONDITIONAL_PASS -> accept.
  // Not a regression — the old `|| 'WARNING'` accepted them too — and no live row matches
  // today. But an LLM sub-agent emitting "CANNOT PROCEED" is entirely plausible, and the
  // exposure lands exactly when SUBAGENT_VERDICT_MODE=block flips on.
  it.each([
    'NOT A PASS', 'DID NOT PASS', 'CANNOT PROCEED', 'DO NOT PROCEED',
    'NOT APPROVED', 'NO PASS', 'UNABLE TO PROCEED', 'SHOULD NOT PROCEED',
  ])('%s REJECTS', (verdict) => {
    expectBlocking(mapVerdict(verdict));
  });

  it('OPPOSITE POLARITY: the un-negated forms still ACCEPT — the guard is narrow', () => {
    for (const v of ['A PASS', 'PASSED', 'PROCEED', 'APPROVED', 'PASS_WITH_CONCERNS']) {
      expect(classifyVerdict(mapVerdict(v)), v).toBe('accept');
    }
  });

  it('negation does not flip a REJECTING verdict into acceptance', () => {
    // "NOT FAIL" is odd phrasing and rare; rejecting is the safe direction either way.
    expectBlocking(mapVerdict('NOT FAIL'));
    expectBlocking(mapVerdict('CANNOT BLOCK'));
  });
});
