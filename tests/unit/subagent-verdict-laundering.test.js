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

/** The eight values valid_verdict permits (migration 20260130). */
const ALLOWED = new Set(['PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS', 'WARNING', 'MANUAL_REQUIRED', 'PENDING', 'ERROR']);

describe('the gate can finally SEE rejecting verdicts (FR-2)', () => {
  it('MANUAL_REQUIRED reaches the gate as REJECT — 141 production rows were laundered here', () => {
    // BEFORE: mapVerdict -> 'WARNING' -> classifyVerdict -> 'accept' -> no warning at all.
    expect(mapVerdict('MANUAL_REQUIRED')).toBe('MANUAL_REQUIRED');
    expect(classifyVerdict(mapVerdict('MANUAL_REQUIRED'))).toBe('reject');
  });

  it('PENDING reaches the gate as REJECT — tested separately because the map treated both identically', () => {
    // Testing only MANUAL_REQUIRED and assuming PENDING followed is exactly how the second
    // one stays broken; the old map sent both to WARNING via two distinct lines.
    expect(mapVerdict('PENDING')).toBe('PENDING');
    expect(classifyVerdict(mapVerdict('PENDING'))).toBe('reject');
  });

  it('ERROR is stored as itself rather than flattened to FAIL', () => {
    // Both reject, so this is not a policy change — it is truthfulness. The old mapping
    // discarded the distinction between "the agent rejected" and "the agent crashed".
    expect(mapVerdict('ERROR')).toBe('ERROR');
    expect(classifyVerdict(mapVerdict('ERROR'))).toBe('reject');
  });

  it('UNKNOWN becomes BLOCKED — not in the eight, so it must translate, and it must reject', () => {
    expect(mapVerdict('UNKNOWN')).toBe('BLOCKED');
    expect(classifyVerdict(mapVerdict('UNKNOWN'))).toBe('reject');
  });
});

describe('the unmodelled fallback no longer means "accepted" (FR-1)', () => {
  it('free text lands on a REJECTING verdict', () => {
    // BEFORE: `|| 'WARNING'` — not-understood silently meant accepted.
    expect(classifyVerdict(mapVerdict('NEEDS_HUMAN'))).toBe('reject');
    expect(classifyVerdict(mapVerdict('totally-made-up'))).toBe('reject');
  });

  it('an agent that returned NOTHING lands on a REJECTING verdict — 15 production rows', () => {
    for (const nothing of [undefined, null, '']) {
      expect(classifyVerdict(mapVerdict(nothing)), `verdict=${JSON.stringify(nothing)}`).toBe('reject');
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

  it('is case- and whitespace-SENSITIVE, and that is safe because the fallback rejects', () => {
    // 'pass' and 'PASS ' do not match the map. Under the old fallback they became WARNING
    // (accepted); now they reject, so a casing bug fails loudly instead of silently passing.
    expect(classifyVerdict(mapVerdict('pass'))).toBe('reject');
    expect(classifyVerdict(mapVerdict('PASS '))).toBe('reject');
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
    expect(classifyVerdict(mapVerdict(ABSENT_VERDICT))).toBe('reject');
  });
});
